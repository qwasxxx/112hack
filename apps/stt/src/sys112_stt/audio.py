from __future__ import annotations

from dataclasses import dataclass


def pcm_s16le_to_float32(chunk: bytes) -> list[float]:
    if len(chunk) < 2:
        return []
    if len(chunk) % 2:
        chunk = chunk[:-1]
    samples: list[float] = []
    for i in range(0, len(chunk), 2):
        value = int.from_bytes(chunk[i : i + 2], "little", signed=True)
        samples.append(value / 32768.0)
    return samples


@dataclass
class Phrase:
    text: str
    start: float
    end: float
