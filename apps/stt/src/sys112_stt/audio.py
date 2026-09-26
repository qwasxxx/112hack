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


def resample_float32(samples: list[float], src_rate: int, dst_rate: int) -> list[float]:
    if not samples or src_rate <= 0 or dst_rate <= 0 or src_rate == dst_rate:
        return list(samples)
    step = src_rate / dst_rate
    out_len = int(len(samples) / step)
    if out_len <= 0:
        return []
    out: list[float] = []
    pos = 0.0
    last = len(samples) - 1
    for _ in range(out_len):
        index = int(pos)
        if index >= last:
            out.append(samples[last])
            pos += step
            continue
        if step >= 1.5:
            end = min(len(samples), int(pos + step) + 1)
            window = samples[index:end]
            out.append(sum(window) / len(window) if window else 0.0)
        else:
            frac = pos - index
            left = samples[index]
            right = samples[index + 1]
            out.append(left + (right - left) * frac)
        pos += step
    return out


def resample_pcm_s16le(chunk: bytes, src_rate: int, dst_rate: int) -> bytes:
    samples = resample_float32(pcm_s16le_to_float32(chunk), src_rate, dst_rate)
    out = bytearray()
    for value in samples:
        clipped = max(-1.0, min(1.0, value))
        pcm = int(clipped * 32767) if clipped >= 0 else int(clipped * 32768)
        pcm = max(-32768, min(32767, pcm))
        out += pcm.to_bytes(2, "little", signed=True)
    return bytes(out)


@dataclass
class Phrase:
    text: str
    start: float
    end: float
