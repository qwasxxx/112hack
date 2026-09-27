from __future__ import annotations

import asyncio
import inspect
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sys112_stt.config import (
    HF_STT_MODES,
    STT_ENGINE,
    STT_FALLBACK,
    STT_FW_MODEL,
    STT_HF_MODEL,
    STT_MODE,
    STT_MODEL_DIR,
    STT_WIRE_SAMPLE_RATE,
)
from sys112_stt.engine import create_session, load_recognizer, model_files_present
from sys112_stt.engine_hf import access_message

logger = logging.getLogger("sys112_stt")

recognizer = None
stt_status = "not_ready"
paused = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global recognizer, stt_status
    recognizer, stt_status = load_recognizer()
    if STT_ENGINE == "hf" or STT_FALLBACK == "hf" or STT_MODE in HF_STT_MODES:
        from sys112_stt.engine_hf import close_http_client, open_http_client, warm_http_client

        open_http_client()
        await warm_http_client()
    logger.info("stt status=%s mode=%s engine=%s model=%s", stt_status, STT_MODE, STT_ENGINE, STT_MODEL_DIR)
    yield
    if STT_ENGINE == "faster_whisper":
        from sys112_stt.engine_faster_whisper import close_model

        close_model()
    if STT_ENGINE == "hf" or STT_FALLBACK == "hf" or STT_MODE in HF_STT_MODES:
        from sys112_stt.engine_hf import close_http_client

        await close_http_client()


app = FastAPI(title="sys112-stt", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    ready = stt_status == "ready" and not paused
    local_whisper = STT_ENGINE == "faster_whisper"
    remote = STT_ENGINE == "hf" or (STT_MODE in HF_STT_MODES and not local_whisper)
    model = STT_FW_MODEL if local_whisper else (STT_HF_MODEL if remote else "t-one")
    return {
        "status": "stopped" if paused else ("ok" if ready else "degraded"),
        "stt": "stopped" if paused else ("ready" if ready else stt_status),
        "model": model,
        "engine": STT_ENGINE,
        "local": not remote,
        "mode": STT_MODE,
        "model_present": True if remote or local_whisper else model_files_present(STT_MODEL_DIR),
    }


@app.post("/control/stop")
async def control_stop() -> dict[str, bool]:
    global paused
    paused = True
    logger.info("stt paused")
    return {"ok": True}


@app.post("/control/start")
async def control_start() -> dict[str, bool]:
    global paused
    paused = False
    logger.info("stt resumed status=%s", stt_status)
    return {"ok": True}


@app.websocket("/ws/stt")
async def stt_socket(ws: WebSocket) -> None:
    await ws.accept()
    if paused:
        await ws.send_json({"type": "error", "message": "Распознавание остановлено.", "code": "stopped"})
        await ws.close()
        return
    session = create_session(recognizer, stt_status)
    if getattr(session, "remote", False):
        await _remote_stt(ws, session)
        return
    session_id = str(uuid.uuid4())
    started = False
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text") is not None:
                payload = json.loads(message["text"])
                kind = payload.get("type")
                if kind == "start":
                    if STT_MODE in HF_STT_MODES and stt_status != "ready":
                        await ws.send_json(
                            {
                                "type": "error",
                                "message": access_message(401),
                                "code": "model_not_ready",
                            }
                        )
                        continue
                    if session.mock and STT_MODE != "mock":
                        await ws.send_json(
                            {
                                "type": "error",
                                "message": "Распознавание речи не готово.",
                                "code": "model_not_ready",
                            }
                        )
                        continue
                    started = True
                    await ws.send_json(
                        {"type": "ready", "session_id": session_id, "stt": stt_status, "sample_rate": STT_WIRE_SAMPLE_RATE}
                    )
                    continue
                if kind == "hold":
                    holder = getattr(session, "hold", None)
                    if holder is not None:
                        holder()
                    continue
                if kind == "resume":
                    resumer = getattr(session, "resume", None)
                    if resumer is not None:
                        resumer()
                    continue
                if kind == "stop":
                    for event in await _as_events(session.finish()):
                        await ws.send_json(event)
                    break
                continue
            data = message.get("bytes")
            if not started or not data:
                continue
            for event in await _as_events(session.accept_pcm(data)):
                await ws.send_json(event)
    except WebSocketDisconnect:
        await _as_events(session.finish())
    except Exception:
        logger.exception("stt session failed")
        try:
            await ws.send_json({"type": "error", "message": "Не расслышал. Повторите фразу."})
        except Exception:
            pass


async def _remote_stt(ws: WebSocket, session: Any) -> None:
    session_id = str(uuid.uuid4())
    if hasattr(session, "session_id"):
        session.session_id = session_id
    started = False

    async def write() -> None:
        try:
            while True:
                event = await session.queue.get()
                if event is None:
                    return
                await ws.send_json(event)
        except Exception:
            return

    writer = asyncio.create_task(write())
    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text") is not None:
                payload = json.loads(message["text"])
                kind = payload.get("type")
                if kind == "start":
                    if stt_status != "ready":
                        await ws.send_json(
                            {"type": "error", "message": access_message(401), "code": "model_not_ready"}
                        )
                        continue
                    started = True
                    await ws.send_json(
                        {"type": "ready", "session_id": session_id, "stt": stt_status, "sample_rate": STT_WIRE_SAMPLE_RATE}
                    )
                    continue
                if kind == "hold":
                    holder = getattr(session, "hold", None)
                    if holder is not None:
                        holder()
                    continue
                if kind == "resume":
                    resumer = getattr(session, "resume", None)
                    if resumer is not None:
                        resumer()
                    continue
                if kind == "stop":
                    break
                continue
            data = message.get("bytes")
            if started and data:
                session.feed(data)
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await asyncio.wait_for(session.finish(), timeout=18)
        except asyncio.TimeoutError:
            logger.warning("stt finish timed out session=%s", session_id)
            abort = getattr(session, "abort", None)
            if abort is not None:
                await abort()
        except Exception:
            logger.exception("stt session finish failed session=%s", session_id)
            abort = getattr(session, "abort", None)
            if abort is not None:
                await abort()
        await session.queue.put(None)
        await writer


async def _as_events(value: Any) -> list[dict[str, Any]]:
    if inspect.isawaitable(value):
        value = await value
    return list(value or [])
