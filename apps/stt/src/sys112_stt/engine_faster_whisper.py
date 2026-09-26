from __future__ import annotations

import asyncio
import io
import logging
import struct
import threading
import wave
from typing import Any

from sys112_stt.config import (
    STT_FW_BEAM_SIZE,
    STT_FW_COMPUTE_TYPE,
    STT_FW_DEVICE,
    STT_FW_MODEL,
    STT_FW_THREADS,
    STT_HF_LANGUAGE,
    STT_HF_TASK,
    WHISPER_SAMPLE_RATE,
)
from sys112_stt.audio import pcm_s16le_to_float32, resample_float32
from sys112_stt.transcript_postprocessor import normalize_transcript

logger = logging.getLogger("sys112_stt")

_model: Any | None = None
_model_lock = threading.Lock()
_load_count = 0


class FasterWhisperError(RuntimeError):
    pass


def _wav_to_float32(wav: bytes) -> list[float]:
    with wave.open(io.BytesIO(wav), "rb") as handle:
        channels = handle.getnchannels()
        rate = handle.getframerate()
        width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise FasterWhisperError("expected pcm16 wav")
    samples = pcm_s16le_to_float32(frames)
    if channels > 1:
        mono: list[float] = []
        for index in range(0, len(samples) - channels + 1, channels):
            window = samples[index : index + channels]
            mono.append(sum(window) / len(window))
        samples = mono
    if rate != WHISPER_SAMPLE_RATE:
        samples = resample_float32(samples, rate, WHISPER_SAMPLE_RATE)
    return samples


def model_loaded() -> bool:
    return _model is not None


def load_count() -> int:
    return _load_count


def load_model() -> Any:
    global _model, _load_count
    with _model_lock:
        if _model is not None:
            return _model
        from faster_whisper import WhisperModel

        device = STT_FW_DEVICE
        compute = STT_FW_COMPUTE_TYPE
        if device == "cuda":
            try:
                import ctranslate2

                if ctranslate2.get_cuda_device_count() <= 0:
                    device = "cpu"
                    compute = "int8"
                    logger.warning("no CUDA device, faster-whisper using cpu/int8")
            except Exception:
                device = "cpu"
                compute = "int8"
        logger.info(
            "loading faster-whisper model=%s device=%s compute=%s threads=%s",
            STT_FW_MODEL,
            device,
            compute,
            STT_FW_THREADS,
        )
        _model = WhisperModel(
            STT_FW_MODEL,
            device=device,
            compute_type=compute,
            cpu_threads=STT_FW_THREADS,
        )
        _load_count += 1
        return _model


def close_model() -> None:
    global _model, _load_count
    with _model_lock:
        _model = None
        _load_count = 0


def transcribe_wav_sync(wav: bytes) -> str:
    import numpy as np

    model = load_model()
    audio = np.asarray(_wav_to_float32(wav), dtype=np.float32)
    if audio.size == 0:
        return ""
    with _model_lock:
        segments, _info = model.transcribe(
            audio,
            language=STT_HF_LANGUAGE,
            task=STT_HF_TASK,
            beam_size=STT_FW_BEAM_SIZE,
            vad_filter=False,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text for segment in segments)
    return normalize_transcript(text)


async def transcribe_wav(wav: bytes, timeout: float | None = None) -> str:
    worker = asyncio.to_thread(transcribe_wav_sync, wav)
    if timeout is None:
        return await worker
    return await asyncio.wait_for(worker, timeout=timeout)


def last_transcribe_kwargs() -> dict[str, Any]:
    return {
        "language": STT_HF_LANGUAGE,
        "task": STT_HF_TASK,
        "beam_size": STT_FW_BEAM_SIZE,
        "sample_rate": WHISPER_SAMPLE_RATE,
    }


def pcm16_wav(pcm: bytes, sample_rate: int) -> bytes:
    if len(pcm) % 2:
        pcm = pcm[:-1]
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(pcm),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        len(pcm),
    )
    return header + pcm
