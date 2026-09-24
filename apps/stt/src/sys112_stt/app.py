from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sys112_stt.config import HF_STT_MODES, STT_HF_MODEL, STT_MODE, STT_MODEL_DIR
from sys112_stt.engine import create_session, load_recognizer, model_files_present
from sys112_stt.engine_hf import access_message

logger = logging.getLogger("sys112_stt")

recognizer = None
stt_status = "not_ready"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global recognizer, stt_status
    recognizer, stt_status = load_recognizer()
    logger.info("stt status=%s mode=%s model=%s", stt_status, STT_MODE, STT_MODEL_DIR)
    yield


app = FastAPI(title="sys112-stt", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    ready = stt_status == "ready"
    remote = STT_MODE in HF_STT_MODES
    return {
        "status": "ok" if ready else "degraded",
        "stt": "ready" if ready else stt_status,
        "model": STT_HF_MODEL if remote else "t-one",
        "local": not remote,
        "mode": STT_MODE,
        "model_present": True if remote else model_files_present(STT_MODEL_DIR),
    }


@app.post("/control/stop")
async def control_stop() -> dict[str, bool]:
    asyncio.get_event_loop().call_later(0.2, lambda: os._exit(0))
    return {"ok": True}


@app.websocket("/ws/stt")
async def stt_socket(ws: WebSocket) -> None:
    await ws.accept()
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
                                "message": "Локальная модель T-one не загружена. Скачайте модель и перезапустите STT.",
                                "code": "model_not_ready",
                            }
                        )
                        continue
                    started = True
                    await ws.send_json(
                        {"type": "ready", "session_id": session_id, "stt": stt_status, "sample_rate": 8000}
                    )
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
                        {"type": "ready", "session_id": session_id, "stt": stt_status, "sample_rate": 8000}
                    )
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
        await session.finish()
        await session.queue.put(None)
        await writer


async def _as_events(value: Any) -> list[dict[str, Any]]:
    if inspect.isawaitable(value):
        value = await value
    return list(value or [])
