from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sys112_stt.config import STT_MODE, STT_MODEL_DIR
from sys112_stt.engine import create_session, load_recognizer, model_files_present

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
    return {
        "status": "ok" if ready else "degraded",
        "stt": "ready" if ready else stt_status,
        "model": "t-one",
        "local": True,
        "mode": STT_MODE,
        "model_present": model_files_present(STT_MODEL_DIR),
    }


@app.websocket("/ws/stt")
async def stt_socket(ws: WebSocket) -> None:
    await ws.accept()
    session = create_session(recognizer, stt_status)
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
                    for event in session.finish():
                        await ws.send_json(event)
                    break
                continue
            data = message.get("bytes")
            if not started or not data:
                continue
            for event in session.accept_pcm(data):
                await ws.send_json(event)
    except WebSocketDisconnect:
        session.finish()
    except Exception:
        logger.exception("stt session failed")
        try:
            await ws.send_json({"type": "error", "message": "Ошибка распознавания."})
        except Exception:
            pass
