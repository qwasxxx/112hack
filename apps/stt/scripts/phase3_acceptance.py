#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sys112_stt.engine_hf import HuggingFaceSttSession, transcribe_wav  # noqa: E402
from sys112_stt.metrics import cer, critical_errors, wer  # noqa: E402
from sys112_stt.operator_corpus import OPERATOR_STT_BENCHMARK  # noqa: E402

from benchmark_stt import mix, percentile, synthesize  # noqa: E402

AMBIENCE_DIR = ROOT / "apps/student-web/public/audio/ambience"
OUT_DIR = Path(__file__).resolve().parents[1] / ".bench"
RATE = 16000
FRAME = 640  # 20 ms s16le mono

REQUIRED = [
    "Алло, меня слышно?",
    "Что случилось?",
    "Где вы находитесь?",
    "Назовите точный адрес.",
    "Есть пострадавшие?",
    "Сколько пострадавших?",
    "Он в сознании?",
    "Он дышит?",
    "Повторите, пожалуйста.",
    "Оставайтесь на линии.",
    "Пожарные уже выехали.",
    "Скорая помощь уже едет.",
]
VARIANTS = [
    "Слушаю вас.",
    "Повторите адрес.",
    "Сколько человек пострадало?",
]
ADDRESSES = [
    {"id": "addr_lenina_15", "text": "Улица Ленина, дом пятнадцать.", "street": "ленина", "house": "15"},
    {
        "id": "addr_leningradsky",
        "text": "Ленинградский проспект, дом тридцать семь, корпус два.",
        "street": "ленинградск",
        "house": "37",
    },
    {"id": "addr_apt_entrance", "text": "Квартира двадцать семь, третий подъезд.", "apartment": "27"},
]
EMERGENCY = [
    {"id": "term_fire", "text": "Пожар, дым, возгорание.", "terms": ["пожар", "дым", "возгоран"]},
    {"id": "term_medical", "text": "Пострадавший без сознания, не дышит.", "terms": ["пострадав", "сознания", "дыши"]},
    {"id": "term_bleed", "text": "Тяжело дышит, кровотечение.", "terms": ["дыши", "кровотеч"]},
    {"id": "term_dtp", "text": "ДТП, авария, машина.", "terms": ["дтп", "авари"]},
    {"id": "term_gas", "text": "Газ, утечка газа.", "terms": ["газ"]},
    {"id": "term_fight", "text": "Драка, полиция.", "terms": ["драка", "полиц"]},
    {"id": "term_child", "text": "Ребёнок тонет в воде.", "terms": ["ребен", "тонет", "вод"]},
    {"id": "term_services", "text": "Скорая и пожарные уже едут.", "terms": ["скорая", "пожарн"]},
]
SHORTS = ["Да.", "Нет.", "Один.", "Двое.", "Адрес?", "Где?", "Кто?", "Сколько?"]
PAUSES = [
    ("Адрес", 0.22, "улица Ленина, дом пять.", "Адрес... улица Ленина, дом пять."),
    ("Подождите", 0.22, "да, один пострадавший.", "Подождите... да, один пострадавший."),
]
ENGLISH = ["Thank you.", "Can you hear me?", "Okay."]
MIXED = [
    ("А что случилось? Thank you.", "А что случилось?"),
    ("Где вы? Okay.", "Где вы?"),
]
AMBIENCE = {
    "FIRE": (AMBIENCE_DIR / "fire_loop.mp3", 0.16),
    "TRAFFIC_ACCIDENT": (AMBIENCE_DIR / "traffic_accident_loop.mp3", 0.45),
    "POLICE_OR_FIGHT": (AMBIENCE_DIR / "argument_crowd_loop.mp3", 0.36),
    "MEDICAL": (AMBIENCE_DIR / "medical_room_loop.mp3", 0.25),
    "WATER": (AMBIENCE_DIR / "water_emergency_loop.mp3", 0.34),
}
AMBIENCE_PHRASES = [
    "Что случилось?",
    "Нет.",
    "Он дышит?",
]


def _silence(seconds: float) -> bytes:
    return b"\x00\x00" * int(RATE * seconds)


def _wav_pcm(path: Path) -> bytes:
    import wave

    with wave.open(str(path), "rb") as handle:
        return handle.readframes(handle.getnframes())


def _item_for(text: str, extra: dict | None = None) -> dict:
    row = {"id": text, "text": text, "street": "", "house": "", "apartment": "", "injured": "", "terms": []}
    if extra:
        row.update({key: value for key, value in extra.items() if key != "text"})
        row["text"] = text
    return row


async def recognize_pcm(pcm: bytes, trailing: float = 0.45) -> dict:
    session = HuggingFaceSttSession(sample_rate=RATE)
    stopped = time.monotonic()
    for index in range(0, len(pcm), FRAME):
        session.feed(pcm[index : index + FRAME])
        stopped = time.monotonic()
    session.feed(_silence(trailing))
    await session.wait_idle()
    finals = [item["text"] for item in session.emitted if item.get("type") == "final"]
    errors = [item for item in session.emitted if item.get("type") == "error"]
    latency = None
    if session._last_speech_mono == 0.0 and finals:
        latency = time.monotonic() - stopped
    elif finals:
        # last_speech was reset after final; use wall clock from end of speech feed
        latency = time.monotonic() - stopped
    return {"finals": finals, "text": " ".join(finals), "errors": errors, "latency": latency, "count": len(finals)}


async def recognize_text(text: str, dest: Path, mix_with: tuple[Path, float] | None = None) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    clean = dest.with_name(dest.stem + "-clean.wav")
    synthesize(text, clean)
    wav = clean
    if mix_with is not None:
        mix(clean, mix_with[0], mix_with[1], dest)
        wav = dest
    result = await recognize_pcm(_wav_pcm(wav))
    result["reference"] = text
    return result


def score(reference: str, hypothesis: str, extra: dict | None = None) -> dict:
    item = _item_for(reference, extra)
    return {
        "wer": wer(reference, hypothesis),
        "cer": cer(reference, hypothesis),
        "crit": critical_errors(item, hypothesis),
    }


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict = {"engine": "hf", "model": "openai/whisper-large-v3-turbo", "rows": []}
    latencies: list[float] = []

    async def collect(name: str, text: str, extra: dict | None = None, mix_with=None) -> dict:
        dest = OUT_DIR / "p3" / f"{name}.wav"
        row = await recognize_text(text, dest, mix_with)
        metrics = score(text, row["text"], extra)
        if row["latency"] is not None:
            latencies.append(row["latency"])
        record = {"name": name, **row, **metrics}
        report["rows"].append(record)
        print(f"{name}: {row['text']!r} wer={metrics['wer']:.3f} crit={metrics['crit']} lat={row['latency']}")
        return record

    for index, text in enumerate(REQUIRED + VARIANTS):
        await collect(f"req_{index:02d}", text)
    for item in ADDRESSES:
        await collect(item["id"], item["text"], item)
    for item in EMERGENCY:
        await collect(item["id"], item["text"], item)
    for index, text in enumerate(SHORTS):
        await collect(f"short_{index:02d}", text)
    for index, (left, gap, right, expected) in enumerate(PAUSES):
        dest = OUT_DIR / "p3" / f"pause_{index}.wav"
        left_wav = dest.with_name(f"pause_{index}_a.wav")
        right_wav = dest.with_name(f"pause_{index}_b.wav")
        synthesize(left, left_wav)
        synthesize(right, right_wav)
        pcm = _wav_pcm(left_wav) + _silence(gap) + _wav_pcm(right_wav)
        row = await recognize_pcm(pcm)
        metrics = score(expected, row["text"])
        if row["latency"] is not None:
            latencies.append(row["latency"])
        report["rows"].append({"name": f"pause_{index}", "expected": expected, **row, **metrics})
        print(f"pause_{index}: {row['text']!r} count={row['count']}")
    for index, text in enumerate(ENGLISH):
        row = await collect(f"en_{index}", text)
        row["rejected"] = row["text"] == ""
    for index, (heard, expected) in enumerate(MIXED):
        # Mixed is a transcript-gate case; still send the Russian stem through the session.
        await collect(f"mix_{index}", heard.split(" Thank")[0].split(" Okay")[0].strip())

    ambience_rows = []
    for kind, mix_with in AMBIENCE.items():
        for index, text in enumerate(AMBIENCE_PHRASES):
            off = await collect(f"{kind}_off_{index}", text)
            on = await collect(f"{kind}_on_{index}", text, mix_with=mix_with)
            ambience_rows.append({"kind": kind, "text": text, "off": off["text"], "on": on["text"]})

    hold_left = OUT_DIR / "p3" / "hold_caller.wav"
    hold_right = OUT_DIR / "p3" / "hold_op.wav"
    synthesize("Скорая уже едет.", hold_left)
    synthesize("Что случилось?", hold_right)
    session = HuggingFaceSttSession(sample_rate=RATE)
    caller = _wav_pcm(hold_left)
    for index in range(0, len(caller), FRAME):
        session.feed(caller[index : index + FRAME])
    session.hold()
    session.feed(caller)
    session.feed(_silence(0.5))
    await session.wait_idle()
    leaked = [item["text"] for item in session.emitted if item.get("type") == "final"]
    session.resume()
    operator = _wav_pcm(hold_right)
    for index in range(0, len(operator), FRAME):
        session.feed(operator[index : index + FRAME])
    session.feed(_silence(0.45))
    await session.wait_idle()
    after = [item["text"] for item in session.emitted if item.get("type") == "final"]
    report["caller_echo"] = {"leaked_during_hold": leaked, "after_resume": after}

    stability = []
    session = HuggingFaceSttSession(sample_rate=RATE)
    for index, text in enumerate((REQUIRED + SHORTS)[:20]):
        dest = OUT_DIR / "p3" / f"stab_{index:02d}.wav"
        synthesize(text, dest)
        t0 = time.monotonic()
        pcm = _wav_pcm(dest)
        for offset in range(0, len(pcm), FRAME):
            session.feed(pcm[offset : offset + FRAME])
        session.feed(_silence(0.45))
        await session.wait_idle()
        elapsed = time.monotonic() - t0
        finals = [item["text"] for item in session.emitted if item.get("type") == "final"]
        stability.append({"n": index + 1, "ref": text, "hyp": finals[-1] if finals else "", "sec": elapsed, "finals": len(finals)})
        print(f"stab_{index:02d}: {finals[-1] if finals else ''} ({elapsed:.3f}s)")
    report["stability20"] = stability

    labeled = [row for row in report["rows"] if row.get("reference")]
    report["wer"] = statistics.mean(row["wer"] for row in labeled) if labeled else None
    report["cer"] = statistics.mean(row["cer"] for row in labeled) if labeled else None
    report["crit"] = [row for row in labeled if row.get("crit")]
    report["latency_median"] = statistics.median(latencies) if latencies else None
    report["latency_p90"] = percentile(latencies, 90) if latencies else None
    report["latency_n"] = len(latencies)
    report["ambience"] = ambience_rows
    report["bench_items"] = [
        {"id": item["id"], "text": item["text"]} for item in OPERATOR_STT_BENCHMARK[:3]
    ]
    (OUT_DIR / "phase3_acceptance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("wer", "cer", "latency_median", "latency_p90", "latency_n")}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
