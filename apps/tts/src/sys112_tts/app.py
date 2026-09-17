from __future__ import annotations

import logging
import struct
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from sys112_tts.engine import engine

logger = logging.getLogger("sys112_tts")
logging.basicConfig(level=logging.INFO, format="%(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        engine.load()
        logger.info("[TTS] Silero local engine ready")
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
    role: str | None = None
    emotion: str | None = None
    voice_id: str | None = None
    conversation_role: str | None = None
    ambient_type: str | None = None
    random_sfx: bool = False


@app.get("/health")
def health() -> dict[str, Any]:
    return engine.health()


def _frame(chunk: bytes) -> bytes:
    return struct.pack("<I", len(chunk)) + chunk


@app.post("/api/v1/tts/synthesize")
async def synthesize(body: SynthesizeRequest) -> StreamingResponse:
    stream = engine.synthesize_stream(
        body.text,
        body.voice_id,
        body.emotion,
        body.conversation_role,
        body.ambient_type,
        body.random_sfx,
        body.role,
    )
    try:
        first = await stream.__anext__()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StopAsyncIteration as exc:
        raise HTTPException(status_code=500, detail="TTS returned empty audio") from exc
    except Exception:
        logger.exception("[TTS] Synthesis failed")
        raise HTTPException(status_code=500, detail="Speech synthesis failed") from None

    async def generate():
        yield _frame(first)
        try:
            async for chunk in stream:
                if chunk:
                    yield _frame(chunk)
        except Exception:
            logger.exception("[TTS] Stream chunk failed")
        yield struct.pack("<I", 0)

    return StreamingResponse(
        generate(),
        media_type="application/octet-stream",
        headers={"X-TTS-Stream": "1", "Cache-Control": "no-store"},
    )
