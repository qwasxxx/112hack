from __future__ import annotations

import asyncio
import logging
import struct
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from sys112_tts.engine import engine
from sys112_tts.voices import resolve_role

logger = logging.getLogger("sys112_tts")
logging.basicConfig(level=logging.INFO, format="%(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        engine.load()
        logger.info("[TTS] Silero v5_5_ru engine ready")
    except Exception:
        logger.exception("[TTS] Silero load failed")
        engine.status = "not_ready"
    yield


app = FastAPI(title="sys112-tts", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1)
    role: Literal["victim", "operator"] | str | None = None
    emotion: str | None = None
    voice_id: str | None = None
    conversation_role: str | None = None
    ambient_type: str | None = None
    random_sfx: bool = False
    gender: str | None = None
    play: bool = False


@app.get("/health")
def health() -> dict[str, Any]:
    return engine.health()


def _frame(chunk: bytes) -> bytes:
    return struct.pack("<I", len(chunk)) + chunk


@app.post("/api/v1/tts/synthesize")
async def synthesize(body: SynthesizeRequest) -> StreamingResponse:
    started = time.perf_counter()
    role = resolve_role(body.role, body.conversation_role, body.voice_id)
    try:
        first = await asyncio.to_thread(
            engine.synthesize_role,
            body.text,
            role,
            body.play,
            body.emotion,
            body.voice_id,
            body.gender,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("[TTS] Synthesis failed")
        raise HTTPException(status_code=500, detail="Speech synthesis failed") from None

    tta_ms = (time.perf_counter() - started) * 1000
    logger.info("[TTS] Time-To-Audio %.1fms http_first_chunk bytes=%s role=%s", tta_ms, len(first), role)

    async def generate():
        yield _frame(first)
        yield struct.pack("<I", 0)

    return StreamingResponse(
        generate(),
        media_type="application/octet-stream",
        headers={
            "X-TTS-Stream": "1",
            "X-TTS-TTA-MS": f"{tta_ms:.1f}",
            "X-TTS-Role": role,
            "Cache-Control": "no-store",
        },
    )
