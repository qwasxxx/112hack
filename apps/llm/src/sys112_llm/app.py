from __future__ import annotations

import asyncio
import logging
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
    ConversationManager,
    analysis_messages,
    generation_messages,
)
from sys112_llm.runtime import model_present
from sys112_llm.think import ThinkFilter

logger = logging.getLogger("sys112_llm")
logging.basicConfig(level=logging.INFO, format="%(message)s")

manager = ConversationManager()
client = LlamaClient()
llama_process = None
boot_task: asyncio.Task[None] | None = None
llm_status = "not_ready"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global llama_process, llm_status, boot_task
    if LLM_MODE == "mock":
        llm_status = "mock"
        logger.info("[LLM] Mock mode")
        yield
        return

    llm_status = "loading"
    logger.info("[LLM] Loading model...")

    async def boot() -> None:
        global llama_process, llm_status
        try:
            if await client.ready():
                llm_status = "ready"
                logger.info("[LLM] Model ready (external server %s)", LLM_BASE_URL)
                return
            from sys112_llm.runtime import start_llama_process

            llama_process = await asyncio.to_thread(start_llama_process)
            llm_status = "ready"
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
    if llama_process is not None:
        llama_process.terminate()
        try:
            llama_process.wait(timeout=8)
        except Exception:
            llama_process.kill()
        llama_process = None


app = FastAPI(title="sys112-llm", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def health_payload() -> dict[str, Any]:
    status = "ready" if llm_status in {"ready", "mock"} else llm_status
    return {
        "status": status,
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL_NAME,
        "runtime": LLM_RUNTIME,
        "mode": LLM_MODE,
        "local": True,
        "model_present": model_present(),
    }


@app.get("/health")
@app.get("/api/llm/health")
def health() -> dict[str, Any]:
    return health_payload()


@app.websocket("/ws/llm")
async def llm_socket(ws: WebSocket) -> None:
    await ws.accept()
    call_id = ""
    try:
        while True:
            payload = await ws.receive_json()
            kind = payload.get("type")
            if kind == "start":
                call_id = str(payload.get("call_id") or uuid.uuid4())
                role = payload.get("conversation_role") or "victim"
                if role not in {"victim", "operator"}:
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
                manager.create(call_id, role, payload.get("system_prompt"))
                logger.info("[LLM] Call session created")
                await ws.send_json({"type": "ready", "call_id": call_id, "llm": llm_status})
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
                await _reply_until_idle(call_id, ws)
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
                await ws.send_json(
                    {
                        "type": "intervention_ack",
                        "accepted": False,
                        "code": "not_implemented",
                    }
                )
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
                    current.pending.append((message_id, text))
                    continue
                session = manager.accept_user(call_id, text, message_id)
                if session is None:
                    continue
                await _reply_until_idle(call_id, ws)
                continue
            if kind == "stop":
                manager.close(call_id)
                logger.info("[LLM] Call session closed")
                await ws.send_json({"type": "session_closed", "call_id": call_id})
                break
    except WebSocketDisconnect:
        if call_id:
            manager.close(call_id)
            logger.info("[LLM] Call session closed")
    except Exception:
        logger.exception("[LLM] session failed")
        try:
            await ws.send_json({"type": "error", "message": "Ошибка диалога."})
        except Exception:
            pass


async def _reply_until_idle(call_id: str, ws: WebSocket) -> None:
    while True:
        session = manager.get(call_id)
        if session is None or session.closed:
            return
        session.busy = True
        logger.info("[LLM] User transcript received")
        logger.info("[LLM] Generating response")
        try:
            full = await _generate(generation_messages(session), ws)
        except Exception:
            logger.exception("[LLM] Generation failed")
            await ws.send_json({"type": "error", "message": "Не удалось получить ответ модели."})
            session.busy = False
            return
        if full:
            manager.append_assistant(call_id, full)
            await ws.send_json({"type": "assistant_final", "text": full})
            logger.info("[LLM] Response complete")
        session.busy = False
        if not session.pending:
            return
        message_id, text = session.pending.pop(0)
        if manager.accept_user(call_id, text, message_id) is None:
            continue


async def _generate(
    messages: list[dict[str, str]],
    ws: WebSocket,
    partial_type: str = "assistant_partial",
    max_tokens: int | None = None,
) -> str:
    if LLM_MODE == "mock" or llm_status == "mock":
        text = (
            "Адрес назван. Дальше стоит уточнить, есть ли пострадавшие."
            if partial_type == "analysis_partial"
            else "Назовите адрес, где это происходит."
        )
        await ws.send_json({"type": partial_type, "text": text})
        return text
    filter_ = ThinkFilter()
    visible = ""
    async for piece in client.stream_chat(messages, max_tokens=max_tokens):
        chunk = filter_.feed(piece)
        if not chunk:
            continue
        visible += chunk
        await ws.send_json({"type": partial_type, "text": sanitize_speech(visible)})
    return sanitize_speech(visible)
