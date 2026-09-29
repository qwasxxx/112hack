from __future__ import annotations

import asyncio
import logging
import re
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sys112_llm.client import LlamaClient, sanitize_speech
from sys112_llm.config import (
    LLM_ANALYSIS_MAX_TOKENS,
    LLM_BASE_URL,
    LLM_MODE,
    LLM_MODEL_NAME,
    LLM_PROVIDER,
    LLM_RUNTIME,
)
from sys112_llm.conversation import (
    KICKOFF_ID,
    KICKOFF_TEXT,
    TEACHER_NUDGE_TEXT,
    CallSession,
    ConversationManager,
    analysis_messages,
    apply_teacher_intervention,
    call_score_messages,
    PRESENCE_INTENTS,
    generation_messages,
    TEACHER_NUDGE_TEXT,
    last_user_text,
    breaks_character,
    leaves_role,
    presence_cue,
    presence_spoken,
    remembered_reply,
    repair_victim_reply,
    speaks_as_dispatcher,
    bare_greeting,
    session_scenario_extra,
    should_speak_intervention,
)
from sys112_llm.score_json import parse_score_json
from sys112_llm.think import ThinkFilter
from sys112_llm.ticket_gen import draft_from_payload, generate_ticket, normalize_services

logger = logging.getLogger("sys112_llm")
logging.basicConfig(level=logging.INFO, format="%(message)s")

manager = ConversationManager()
client = LlamaClient()
boot_task: asyncio.Task[None] | None = None
llm_status = "not_ready"
paused = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global llm_status, boot_task
    if LLM_MODE == "mock":
        llm_status = "mock"
        logger.info("[LLM] Mock mode")
        yield
        return

    llm_status = "loading"
    logger.info("[LLM] Connecting %s", LLM_BASE_URL)

    async def boot() -> None:
        global llm_status
        try:
            deadline = asyncio.get_running_loop().time() + 300
            while True:
                if await client.ready():
                    llm_status = "ready"
                    logger.info("[LLM] Model ready (%s)", LLM_BASE_URL)
                    return
                if asyncio.get_running_loop().time() >= deadline:
                    break
                await asyncio.sleep(2)
            raise RuntimeError(f"LLM provider not ready at {LLM_BASE_URL}")
        except Exception:
            logger.exception("[LLM] Model loading failed")
            llm_status = "not_ready"

    boot_task = asyncio.create_task(boot())
    yield
    if boot_task is not None and not boot_task.done():
        boot_task.cancel()
        try:
            await boot_task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="sys112-llm", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def health_payload() -> dict[str, Any]:
    status = "stopped" if paused else ("ready" if llm_status in {"ready", "mock"} else llm_status)
    return {
        "status": status,
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL_NAME,
        "runtime": LLM_RUNTIME,
        "mode": LLM_MODE,
        "local": False,
    }


@app.get("/health")
@app.get("/api/llm/health")
def health() -> dict[str, Any]:
    return health_payload()


@app.post("/control/stop")
@app.post("/api/llm/control/stop")
async def control_stop() -> dict[str, bool]:
    global paused
    paused = True
    logger.info("llm paused")
    return {"ok": True}


@app.post("/control/start")
@app.post("/api/llm/control/start")
async def control_start() -> dict[str, bool]:
    global paused
    paused = False
    logger.info("llm resumed status=%s", llm_status)
    return {"ok": True}


@app.post("/warmup")
@app.post("/api/llm/warmup")
async def warmup_prompt(payload: dict[str, Any]) -> dict[str, str]:
    if LLM_MODE == "mock" or llm_status == "mock":
        return {"status": "mock"}
    if llm_status != "ready":
        return {"status": llm_status}
    role = payload.get("conversation_role") or "victim"
    if role not in {"victim", "operator", "service", "chief", "crew", "enroute", "desk"}:
        role = "victim"
    extra = payload.get("system_prompt")
    opening = payload.get("opening")
    scratch = ConversationManager()
    session = scratch.create(
        "_warmup",
        role,
        extra if isinstance(extra, str) else None,
        opening if isinstance(opening, str) else None,
    )
    try:
        await client.prefetch_chat(session.to_openai())
    except Exception:
        logger.exception("[LLM] Prompt warmup failed")
        return {"status": "error"}
    return {"status": "warm"}


@app.post("/score-call")
@app.post("/api/llm/score-call")
async def score_call(payload: dict[str, Any]) -> dict[str, Any]:
    transcript = str(payload.get("transcript") or "")
    facts = str(payload.get("facts") or "")
    card = str(payload.get("card") or "")
    rules = str(payload.get("rules") or "")
    messages = call_score_messages(transcript, facts, card, rules)
    if LLM_MODE == "mock" or llm_status == "mock":
        return {"politeness": 12, "comment": "Разбор в учебном режиме без модели.", "recommendations": [], "source": "mock"}
    if llm_status != "ready":
        return {
            "politeness": 12,
            "comment": "Модель недоступна, оценка разговора по правилам.",
            "recommendations": [],
            "source": "rules",
        }
    try:
        raw = await client.complete_chat(
            messages,
            max_tokens=420,
            temperature=0.2,
            think=False,
            timeout_sec=8,
        )
    except Exception:
        logger.exception("[LLM] Call score failed")
        return {
            "politeness": 12,
            "comment": "Не удалось получить комментарий модели.",
            "recommendations": [],
            "source": "rules",
        }
    parsed = parse_score_json(raw)
    parsed["source"] = f"{LLM_PROVIDER}:{LLM_MODEL_NAME}"
    return parsed


@app.post("/generate-ticket")
@app.post("/api/llm/generate-ticket")
async def generate_ticket_endpoint(payload: dict[str, Any]) -> dict[str, Any]:
    services = normalize_services(payload.get("services") or payload.get("categories") or [])
    note = str(payload.get("note") or payload.get("hint") or "")
    draft = draft_from_payload(payload)
    mock = LLM_MODE == "mock" or llm_status == "mock"
    ready = llm_status == "ready"
    if not mock and llm_status != "ready":
        return {
            "ok": False,
            "message": "Локальная модель Qwen ещё не готова.",
            "code": "llm_not_ready",
        }
    try:
        ticket = await generate_ticket(
            client, services=services, note=note, mock=mock, ready=ready, draft=draft
        )
    except Exception:
        logger.exception("[LLM] Ticket generation failed")
        return {"ok": False, "message": "Не удалось собрать билет. Повторите или заполните вручную."}
    return {"ok": True, **ticket}


@app.websocket("/ws/llm")
async def llm_socket(ws: WebSocket) -> None:
    await ws.accept()
    call_id = ""
    gen_task: asyncio.Task[None] | None = None
    try:
        while True:
            payload = await ws.receive_json()
            kind = payload.get("type")
            if paused:
                await ws.send_json(
                    {"type": "error", "message": "Диалоговый модуль остановлен.", "code": "stopped"}
                )
                continue
            if kind == "start":
                call_id = str(payload.get("call_id") or uuid.uuid4())
                role = payload.get("conversation_role") or "victim"
                if role not in {"victim", "operator", "service", "chief", "crew", "enroute", "desk"}:
                    role = "victim"
                if llm_status == "loading":
                    await ws.send_json(
                        {
                            "type": "error",
                            "message": "Локальная модель ещё загружается.",
                            "code": "llm_loading",
                        }
                    )
                    continue
                if llm_status == "not_ready":
                    await ws.send_json(
                        {
                            "type": "error",
                            "message": "Локальная модель Qwen не запущена.",
                            "code": "llm_not_ready",
                        }
                    )
                    continue
                opening = payload.get("opening")
                session = manager.create(
                    call_id,
                    role,
                    payload.get("system_prompt"),
                    opening if isinstance(opening, str) else None,
                )
                logger.info("[LLM] Call session created")
                await ws.send_json({"type": "ready", "call_id": call_id, "llm": llm_status})
                asyncio.create_task(_warmup(session.call_id))
                continue
            if kind == "kickoff":
                if not call_id:
                    continue
                session = manager.get(call_id)
                if session is None or session.closed or session.busy:
                    continue
                if any(item.role != "system" for item in session.messages):
                    continue
                if manager.accept_user(call_id, KICKOFF_TEXT, KICKOFF_ID) is None:
                    continue
                gen_task = asyncio.create_task(_reply_until_idle(call_id, ws))
                continue
            if kind == "analyze":
                if not call_id:
                    await ws.send_json({"type": "error", "message": "Сессия звонка не создана."})
                    continue
                session = manager.get(call_id)
                if session is None:
                    await ws.send_json({"type": "error", "message": "Сессия звонка закрыта."})
                    continue
                leftover = str(payload.get("text") or "").strip()
                leftover_id = str(payload.get("id") or uuid.uuid4())
                while session.busy:
                    await asyncio.sleep(0.05)
                    session = manager.get(call_id)
                    if session is None:
                        await ws.send_json({"type": "error", "message": "Сессия звонка закрыта."})
                        break
                else:
                    if leftover:
                        manager.accept_user(call_id, leftover, leftover_id)
                    session.busy = True
                    logger.info("[LLM] Analyzing call")
                    try:
                        full = await _generate(
                            analysis_messages(session),
                            ws,
                            "analysis_partial",
                            LLM_ANALYSIS_MAX_TOKENS,
                        )
                    except Exception:
                        logger.exception("[LLM] Analysis failed")
                        session.busy = False
                        await ws.send_json({"type": "error", "message": "Не удалось разобрать разговор."})
                        continue
                    session.busy = False
                    await ws.send_json({"type": "analysis_final", "text": full or "Разбор недоступен."})
                    logger.info("[LLM] Analysis complete")
                continue
            if kind == "intervention":
                current = manager.get(call_id) if call_id else None
                if current is None or current.closed:
                    await ws.send_json(
                        {
                            "type": "intervention_ack",
                            "accepted": False,
                            "code": "no_session",
                        }
                    )
                    continue
                command = str(payload.get("command") or payload.get("type") or "")
                note = str(payload.get("note") or payload.get("text") or "")
                detail = apply_teacher_intervention(current, command, note)
                await ws.send_json(
                    {
                        "type": "intervention_ack",
                        "accepted": True,
                        "command": command,
                        "detail": detail,
                    }
                )
                if current.conversation_role in {"victim", "service", "chief", "crew", "enroute", "desk"} and should_speak_intervention(command):
                    nudge_id = f"nudge-{uuid.uuid4()}"
                    if current.busy:
                        current.pending = [(nudge_id, TEACHER_NUDGE_TEXT)]
                        current.cancel.set()
                    elif manager.accept_user(call_id, TEACHER_NUDGE_TEXT, nudge_id) is not None:
                        gen_task = asyncio.create_task(_reply_until_idle(call_id, ws))
                continue
            if kind == "cancel_presence":
                live = manager.get(call_id) if call_id else None
                if live and live.presence:
                    live.cancel.set()
                continue
            if kind == "presence":
                if not call_id:
                    continue
                current = manager.get(call_id)
                if current is None or current.closed or current.busy:
                    continue
                intent = str(payload.get("intent") or "")
                if intent not in PRESENCE_INTENTS:
                    continue
                current.presence = True
                current.presence_intent = intent
                gen_task = asyncio.create_task(_reply_until_idle(call_id, ws))
                continue
            if kind == "user_final":
                if not call_id:
                    await ws.send_json({"type": "error", "message": "Сессия звонка не создана."})
                    continue
                current = manager.get(call_id)
                if current is None or current.closed:
                    await ws.send_json({"type": "error", "message": "Сессия звонка закрыта."})
                    continue
                message_id = str(payload.get("id") or uuid.uuid4())
                text = str(payload.get("text") or "")
                if current.busy:
                    current.pending = [(message_id, text)]
                    if not current.emitted or current.presence:
                        current.cancel.set()
                    continue
                session = manager.accept_user(call_id, text, message_id)
                if session is None:
                    continue
                gen_task = asyncio.create_task(_reply_until_idle(call_id, ws))
                continue
            if kind == "stop":
                live = manager.get(call_id)
                if live:
                    live.cancel.set()
                if gen_task and not gen_task.done():
                    await asyncio.sleep(0)
                manager.close(call_id)
                logger.info("[LLM] Call session closed")
                await ws.send_json({"type": "session_closed", "call_id": call_id})
                break
    except WebSocketDisconnect:
        live = manager.get(call_id) if call_id else None
        if live:
            live.cancel.set()
        if call_id:
            manager.close(call_id)
            logger.info("[LLM] Call session closed")
    except Exception:
        logger.exception("[LLM] session failed")
        try:
            await ws.send_json({"type": "error", "message": "Ошибка диалога."})
        except Exception:
            pass


async def _warmup(call_id: str) -> None:
    session = manager.get(call_id)
    if session is None or session.closed or LLM_MODE == "mock" or llm_status == "mock":
        return
    try:
        await client.prefetch_chat(session.to_openai())
        logger.info("[LLM] Prompt cache warmed")
    except Exception:
        logger.exception("[LLM] Prompt warmup failed")


def _with_extra_instruction(messages: list[dict[str, str]], extra: str) -> list[dict[str, str]]:
    note = " ".join(extra.split()).strip()
    copied = [dict(item) for item in messages]
    if not note:
        return copied
    if copied and copied[0].get("role") == "system":
        copied[0]["content"] = f"{copied[0].get('content') or ''}\n\n{note}"
        return copied
    copied.append({"role": "user", "content": note})
    return copied


async def _reply_until_idle(call_id: str, ws: WebSocket) -> None:
    while True:
        session = manager.get(call_id)
        if session is None or session.closed:
            return
        session.busy = True
        session.cancel.clear()
        session.emitted = False
        session.streamed = ""
        session.generation += 1
        gen_id = session.generation
        logger.info("[LLM] Generating response presence=%s", int(session.presence))
        try:
            if session.presence and session.conversation_role == "victim":
                full = presence_spoken(session.presence_intent, "")
            else:
                messages = generation_messages(session)
                if session.presence and messages:
                    messages = _with_extra_instruction(
                        messages,
                        presence_cue(session.presence_intent, session.conversation_role),
                    )
                full = await _generate(messages, ws, session=session, gen_id=gen_id)
            if session.conversation_role == "victim" and full and leaves_role(full) and not session.presence:
                nudged = _with_extra_instruction(
                    generation_messages(session),
                    "Предыдущая попытка была не голосом заявителя. "
                    "Скажи одну короткую фразу человека, который сам звонит за помощью.",
                )
                full = await _generate(nudged, ws, session=session, gen_id=gen_id)
        except WebSocketDisconnect:
            session.busy = False
            logger.info("[LLM] Client left during generation")
            return
        except Exception:
            logger.exception("[LLM] Generation failed")
            session.busy = False
            session.presence = False
            session.presence_intent = ""
            try:
                await ws.send_json({"type": "error", "message": "Не удалось получить ответ модели."})
            except Exception:
                return
            if not session.pending:
                return
            message_id, text = session.pending.pop(0)
            session.pending.clear()
            if manager.accept_user(call_id, text, message_id) is None:
                return
            continue
        aborted = full is None or (session.cancel.is_set() and (not session.emitted or session.presence))
        if aborted:
            if not session.presence:
                manager.drop_unanswered_user(call_id)
            session.busy = False
            session.presence = False
            session.presence_intent = ""
            logger.info("[LLM] Generation cancelled")
            try:
                await ws.send_json({"type": "generation_cancelled", "gen": gen_id})
            except Exception:
                return
            if not session.pending:
                return
            message_id, text = session.pending.pop(0)
            session.pending.clear()
            if manager.accept_user(call_id, text, message_id) is None:
                return
            continue
        if full:
            if session.conversation_role == "service" and breaks_character(full):
                full = "Повторите адрес и суть."
            elif session.conversation_role == "chief" and breaks_character(full):
                full = "Доклад принял."
            elif session.conversation_role == "crew" and breaks_character(full):
                full = "Бригада на месте. Докладываю по карточке."
            elif session.conversation_role == "enroute" and breaks_character(full):
                full = "Наряд выехал. Повторите, что уточнить: номер, адрес или время."
            elif session.conversation_role == "desk" and breaks_character(full):
                full = "Карточка у нас. Сообщение об ошибке принял, поправим."
            elif breaks_character(full) and session.conversation_role != "victim":
                full = "Назовите адрес, где это происходит."
            elif session.conversation_role == "victim" and not session.presence:
                raw = full
                full = repair_victim_reply(
                    raw,
                    last_user_text(session),
                    session.conversation_role,
                    session_scenario_extra(session),
                )
                if speaks_as_dispatcher(raw) or (bare_greeting(last_user_text(session)) and full != raw):
                    session.streamed = ""
            if session.presence:
                full = presence_spoken(session.presence_intent, full)
            full = remembered_reply(session.streamed, full)
            manager.append_assistant(call_id, full)
            await ws.send_json(
                {
                    "type": "assistant_final",
                    "text": full,
                    "gen": gen_id,
                    "purpose": "presence" if session.presence else "dialogue",
                }
            )
            logger.info("[LLM] Response complete")
        else:
            await ws.send_json({"type": "assistant_final", "text": "", "gen": gen_id})
            logger.warning("[LLM] Empty response")
        session.busy = False
        session.presence = False
        session.presence_intent = ""
        if not session.pending:
            return
        message_id, text = session.pending.pop(0)
        session.pending.clear()
        if manager.accept_user(call_id, text, message_id) is None:
            return
        continue


async def _generate(
    messages: list[dict[str, str]],
    ws: WebSocket,
    partial_type: str = "assistant_partial",
    max_tokens: int | None = None,
    session: CallSession | None = None,
    gen_id: int = 0,
) -> str | None:
    live = session

    def stopped() -> bool:
        return bool(live and live.cancel.is_set())

    if LLM_MODE == "mock" or llm_status == "mock":
        if stopped():
            return None
        text = (
            "Адрес назван. Дальше стоит уточнить, есть ли пострадавшие."
            if partial_type == "analysis_partial"
            else "Назовите адрес, где это происходит."
        )
        if live is not None and partial_type == "assistant_partial":
            live.emitted = True
        await ws.send_json({"type": partial_type, "text": text, "gen": gen_id})
        return text
    filter_ = ThinkFilter()
    visible = ""
    last_sent = ""
    async for piece in client.stream_chat(
        messages,
        max_tokens=max_tokens,
        should_stop=stopped,
        conversation=partial_type == "assistant_partial",
    ):
        if stopped():
            break
        chunk = filter_.feed(piece)
        if not chunk:
            continue
        visible += chunk
        spoken = sanitize_speech(visible)
        if not spoken or spoken == last_sent or breaks_character(spoken):
            continue
        if live is not None and live.conversation_role == "victim" and leaves_role(spoken):
            continue
        if not re.search(r"[.!?…]$", spoken) and len(spoken) < 36:
            continue
        if live is not None and partial_type == "assistant_partial" and live.conversation_role == "victim":
            operator_line = last_user_text(live)
            fixed = repair_victim_reply(
                spoken,
                operator_line,
                "victim",
                session_scenario_extra(live),
            )
            if fixed != spoken:
                continue
        if live is not None and live.presence and partial_type == "assistant_partial":
            continue
        if live is not None and partial_type == "assistant_partial":
            live.emitted = True
            live.streamed = spoken
        await ws.send_json(
            {
                "type": partial_type,
                "text": spoken,
                "gen": gen_id,
                "purpose": "presence" if live is not None and live.presence else "dialogue",
            }
        )
        last_sent = spoken
    if stopped() and not last_sent:
        return None
    leftover = filter_.feed("")
    if leftover:
        visible += leftover
    return sanitize_speech(visible) or last_sent
