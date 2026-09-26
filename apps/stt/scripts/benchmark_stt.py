#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sys112_stt.engine_hf import transcribe_wav as transcribe_hf  # noqa: E402
from sys112_stt.metrics import cer, critical_errors, wer  # noqa: E402
from sys112_stt.operator_corpus import AMBIENCE_SUBSET_IDS, OPERATOR_STT_BENCHMARK  # noqa: E402
from sys112_stt.transcript_postprocessor import gate_russian_operator_text  # noqa: E402

AMBIENCE_DIR = ROOT / "apps/student-web/public/audio/ambience"
WAV_DIR = ROOT / "apps/student-web/public/ambience"
OUT_DIR = Path(__file__).resolve().parents[1] / ".bench"

CONDITIONS = {
    "clean": None,
    "laptop": (WAV_DIR / "room_tone.wav", 0.12),
    "fire": (AMBIENCE_DIR / "fire_loop.mp3", 0.16),
    "traffic": (AMBIENCE_DIR / "traffic_accident_loop.mp3", 0.45),
    "crowd": (AMBIENCE_DIR / "argument_crowd_loop.mp3", 0.36),
}


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def synthesize(text: str, dest: Path) -> None:
    aiff = dest.with_suffix(".aiff")
    _run(["say", "-v", "Milena", "-r", "165", "-o", str(aiff), text])
    _run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", str(aiff), str(dest)])
    aiff.unlink(missing_ok=True)


def _load_audio(path: Path, sample_rate: int = 16000) -> list[float]:
    import av
    import numpy as np

    container = av.open(str(path))
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=sample_rate)
    chunks: list[np.ndarray] = []
    for frame in container.decode(audio=0):
        resampled = resampler.resample(frame)
        if resampled is None:
            continue
        frames = resampled if isinstance(resampled, list) else [resampled]
        for item in frames:
            chunks.append(np.frombuffer(item.to_ndarray().tobytes(), dtype=np.int16).astype(np.float32) / 32768.0)
    leftover = resampler.resample(None)
    if leftover:
        frames = leftover if isinstance(leftover, list) else [leftover]
        for item in frames:
            chunks.append(np.frombuffer(item.to_ndarray().tobytes(), dtype=np.int16).astype(np.float32) / 32768.0)
    if not chunks:
        return []
    return np.concatenate(chunks).tolist()


def _write_wav(path: Path, samples: list[float], sample_rate: int = 16000) -> None:
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        raw = bytearray()
        for value in samples:
            clipped = max(-1.0, min(1.0, value))
            pcm = int(clipped * 32767) if clipped >= 0 else int(clipped * 32768)
            raw += max(-32768, min(32767, pcm)).to_bytes(2, "little", signed=True)
        handle.writeframes(bytes(raw))


def mix(speech: Path, ambience: Path, gain: float, dest: Path) -> None:
    speech_samples = _load_audio(speech)
    amb_samples = _load_audio(ambience)
    if not speech_samples:
        raise RuntimeError(f"empty speech {speech}")
    if not amb_samples:
        _write_wav(dest, speech_samples)
        return
    mixed: list[float] = []
    amb_len = len(amb_samples)
    for index, sample in enumerate(speech_samples):
        noise = amb_samples[index % amb_len] * gain
        mixed.append(max(-1.0, min(1.0, sample + noise)))
    _write_wav(dest, mixed)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = min(len(ordered) - 1, max(0, round((p / 100) * (len(ordered) - 1))))
    return ordered[index]


async def recognize(engine: str, wav: bytes) -> tuple[str, float]:
    if engine == "hf":
        started = time.monotonic()
        text = await transcribe_hf(wav)
        return text, time.monotonic() - started
    from sys112_stt.engine_faster_whisper import transcribe_wav as transcribe_local

    started = time.monotonic()
    text = await transcribe_local(wav)
    return text, time.monotonic() - started


def summarize(rows: list[dict]) -> dict:
    wers = [row["wer"] for row in rows]
    cers = [row["cer"] for row in rows]
    lats = [row["latency_s"] for row in rows]
    crit = [row for row in rows if row["critical"]]
    return {
        "n": len(rows),
        "wer_mean": round(sum(wers) / len(wers), 4) if wers else None,
        "cer_mean": round(sum(cers) / len(cers), 4) if cers else None,
        "critical_rate": round(len(crit) / len(rows), 4) if rows else None,
        "latency_s_median": round(statistics.median(lats), 3) if lats else None,
        "latency_s_p90": round(percentile(lats, 90), 3) if lats else None,
        "critical_n": len(crit),
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engines", default="hf,faster_whisper")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    engines = [item.strip() for item in args.engines.split(",") if item.strip()]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = list(OPERATOR_STT_BENCHMARK)
    if args.limit:
        items = items[: args.limit]
    subset = {item["id"] for item in items if item["id"] in AMBIENCE_SUBSET_IDS}

    jobs: list[tuple[dict, str, Path]] = []
    for item in items:
        clean = OUT_DIR / f"{item['id']}_clean.wav"
        if not clean.exists():
            synthesize(item["text"], clean)
        jobs.append((item, "clean", clean))
        if item["id"] not in subset:
            continue
        for name, mix_spec in CONDITIONS.items():
            if name == "clean" or mix_spec is None:
                continue
            src, gain = mix_spec
            if not src.exists():
                continue
            dest = OUT_DIR / f"{item['id']}_{name}.wav"
            if not dest.exists():
                mix(clean, src, gain, dest)
            jobs.append((item, name, dest))

    results: dict[str, list[dict]] = {engine: [] for engine in engines}
    errors: dict[str, list[str]] = {engine: [] for engine in engines}
    cold: dict[str, float | None] = {engine: None for engine in engines}
    load_s: dict[str, float | None] = {engine: None for engine in engines}

    if "faster_whisper" in engines:
        from sys112_stt.engine_faster_whisper import load_model

        started = time.monotonic()
        load_model()
        load_s["faster_whisper"] = round(time.monotonic() - started, 3)
        print(f"faster_whisper_model_load_s {load_s['faster_whisper']}", flush=True)

    for engine in engines:
        first = True
        for item, condition, path in jobs:
            wav = path.read_bytes()
            try:
                raw, latency = await recognize(engine, wav)
            except Exception as exc:
                errors[engine].append(f"{item['id']}/{condition}: {exc}")
                continue
            if first:
                cold[engine] = latency
                first = False
            gated = gate_russian_operator_text(raw)
            row = {
                "id": item["id"],
                "condition": condition,
                "reference": item["text"],
                "raw": raw,
                "hypothesis": gated,
                "wer": round(wer(item["text"], gated), 4),
                "cer": round(cer(item["text"], gated), 4),
                "critical": critical_errors(item, gated),
                "latency_s": round(latency, 3),
                "tags": item["tags"],
            }
            results[engine].append(row)
            print(
                f"{engine:15} {condition:8} {item['id']:18} wer={row['wer']:.2f} lat={row['latency_s']:.2f} {gated}",
                flush=True,
            )

    report = {
        "engines": engines,
        "cold_s": cold,
        "model_load_s": load_s,
        "errors": errors,
        "summary": {},
        "by_condition": {},
        "rows": results,
    }
    for engine, rows in results.items():
        report["summary"][engine] = summarize(rows)
        report["by_condition"][engine] = {}
        conditions = sorted({row["condition"] for row in rows})
        for condition in conditions:
            report["by_condition"][engine][condition] = summarize(
                [row for row in rows if row["condition"] == condition]
            )
        shorts = [row for row in rows if "short" in row["tags"]]
        longs = [row for row in rows if "long" in row["tags"]]
        report["by_condition"][engine]["short"] = summarize(shorts)
        report["by_condition"][engine]["long"] = summarize(longs)
        warm = [row["latency_s"] for row in rows[1:]]
        report["summary"][engine]["warm_latency_s_median"] = round(statistics.median(warm), 3) if warm else None

    out = OUT_DIR / "benchmark_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "cold_s": cold, "model_load_s": load_s, "errors": errors}, ensure_ascii=False, indent=2))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
