import asyncio
import math
import time

import pytest

from sys112_stt.config import STT_HF_LANGUAGE, STT_HF_MODEL, STT_HF_TASK
from sys112_stt.engine import SttSession
from sys112_stt.engine_hf import HuggingFaceSttSession, _asr_payload, clean_transcript
from sys112_stt.transcript_postprocessor import gate_russian_operator_text, repair_short_operator_answer

UNCHANGED = [
    "Что случилось?",
    "Есть пострадавшие?",
    "Улица Ленина, дом 15.",
    "Квартира 27.",
    "Да",
    "Нет",
    "112",
    "МЧС",
    "Адрес?",
    "Повторите.",
    "Дом 15, корпус 2, квартира 7.",
    "Позвоните по номеру 8-900-123-45-67.",
    "В 10:30 было 2,5 метра.",
    "Проспект Мира, д. 5/2, кв. 14",
]

REJECTED = [
    "Thank you",
    "Thank you.",
    "Can you hear me?",
    "Okay",
    "Hello",
    "you",
    "yes",
    "no",
    "please",
    "sorry",
    "What happened?",
    "I'm so sorry, please call me back.",
    "Call 112 now.",
    "Guten Tag",
    "Ça va?",
]

MIXED = [
    ("А что случилось? Thank you.", "А что случилось?"),
    ("А что случилось? Thank you", "А что случилось?"),
    ("Сколько пострадавших? Okay.", "Сколько пострадавших?"),
    ("Okay. Сколько пострадавших?", "Сколько пострадавших?"),
    ("Hello, что случилось?", "что случилось?"),
    ("Улица Ленина, дом 15. Can you hear me?", "Улица Ленина, дом 15."),
    ("Что случилось thank you?", "Что случилось?"),
    ("Дом 15, apartment 3.", "Дом 15"),
    ("Где вы? Okay.", "Где вы?"),
]


@pytest.mark.parametrize("phrase", UNCHANGED)
def test_russian_is_accepted_unchanged(phrase):
    assert gate_russian_operator_text(phrase) == phrase
    assert clean_transcript(phrase) == phrase


@pytest.mark.parametrize("phrase", REJECTED)
def test_foreign_speech_is_rejected(phrase):
    assert gate_russian_operator_text(phrase) == ""
    assert clean_transcript(phrase) == ""


@pytest.mark.parametrize(("heard", "expected"), MIXED)
def test_mixed_keeps_only_russian(heard, expected):
    assert gate_russian_operator_text(heard) == expected
    assert clean_transcript(heard) == expected


def test_phonetic_english_and_crowd_hallucinations_are_rejected():
    assert clean_transcript("Сэньтью.") == ""
    assert clean_transcript("Thank you") == ""
    assert clean_transcript("Фондюши.") == ""
    assert clean_transcript("Он дышит?") == "Он дышит?"


def test_short_fire_near_misses_repair_to_net():
    assert repair_short_operator_answer("Низ.") == "Нет."
    assert repair_short_operator_answer("Неж") == "Нет"
    assert clean_transcript("Низ.") == "Нет."
    assert clean_transcript("Неж") == "Нет"
    assert clean_transcript("Газ") == "Газ"
    assert clean_transcript("Да") == "Да"


def test_english_is_not_transliterated_or_translated():
    for heard in ("Thank you", "Hello", "Can you hear me?"):
        assert clean_transcript(heard) == ""
    assert "сэнк" not in clean_transcript("А что случилось? Thank you.").lower()


def test_latin_homoglyphs_inside_russian_are_repaired_not_dropped():
    assert gate_russian_operator_text("Мocква, улица Ленина") == "Москва, улица Ленина"
    assert gate_russian_operator_text("A что случилось? Thank you") == "А что случилось?"
    assert gate_russian_operator_text("Квартира 15B") == "Квартира 15В"


def test_whisper_is_forced_to_russian_transcription():
    assert STT_HF_MODEL == "openai/whisper-large-v3-turbo"
    assert STT_HF_TASK == "transcribe"
    assert STT_HF_LANGUAGE == "ru"
    params = _asr_payload(b"\x00\x00")["parameters"]
    assert "language" not in params
    assert "task" not in params
    assert params["generate_kwargs"] == {"language": "ru", "task": "transcribe"}


def test_gate_is_fast():
    phrases = UNCHANGED + REJECTED + [item[0] for item in MIXED]
    started = time.perf_counter()
    for _ in range(200):
        for phrase in phrases:
            clean_transcript(phrase)
    per_call_ms = (time.perf_counter() - started) * 1000 / (200 * len(phrases))
    assert per_call_ms < 0.2


def test_final_commit_drops_english_and_keeps_russian():
    class Dummy:
        def reset(self, _stream):
            return None

        def timestamps(self, _stream):
            return [0.1, 0.4]

    session = SttSession(recognizer=Dummy(), stream=object(), mock=False)
    assert session._commit_final("Can you hear me?") == []
    events = session._commit_final("Да")
    assert events[0]["type"] == "final"
    assert events[0]["text"] == "Да"
    mixed = session._commit_final("А что случилось? Thank you")
    assert mixed[0]["text"] == "А что случилось?"


def _tone(seconds: float, amplitude: int = 9000, rate: int = 8000) -> bytes:
    out = bytearray()
    for index in range(int(rate * seconds)):
        value = int(amplitude * math.sin(2 * math.pi * 220 * index / rate))
        out += value.to_bytes(2, "little", signed=True)
    return bytes(out)


def _silence(seconds: float, rate: int = 8000) -> bytes:
    return b"\x00\x00" * int(rate * seconds)


def _ambience(seconds: float, amplitude: int = 600, rate: int = 8000, seed: int = 7) -> bytes:
    import random

    rng = random.Random(seed)
    out = bytearray()
    for _ in range(int(rate * seconds)):
        out += rng.randint(-amplitude, amplitude).to_bytes(2, "little", signed=True)
    return bytes(out)


def _frames(data: bytes, size: int = 320):
    for index in range(0, len(data), size):
        yield data[index : index + size]


def test_computer_ambience_is_not_heard_but_operator_is():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        return "Что случилось?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        for frame in _frames(_ambience(5.0)):
            session.feed(frame)
            await session.wait_idle()
        ambience_calls = calls["n"]
        speech = bytearray()
        noise = _ambience(0.06, seed=11)
        for _ in range(6):
            speech += _tone(0.15) + noise
        for frame in _frames(bytes(speech) + _ambience(0.8, seed=13)):
            session.feed(frame)
            await session.wait_idle()
        return ambience_calls, session.emitted

    ambience_calls, events = asyncio.run(run())
    assert ambience_calls == 0
    assert [item["text"] for item in events if item["type"] == "final"] == ["Что случилось?"]


def test_english_only_utterance_emits_nothing():
    async def fake(_wav: bytes) -> str:
        return " Can you hear me?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(1.3)))
        events.extend(await session.accept_pcm(_silence(0.6)))
        events.extend(await session.finish())
        return events

    events = asyncio.run(run())
    assert [item for item in events if item["type"] in ("partial", "final")] == []
    complete = [item for item in events if item["type"] == "session_complete"]
    assert complete and complete[-1]["text"] == ""


def test_mixed_utterance_final_is_clean_russian():
    async def fake(_wav: bytes) -> str:
        return " А что случилось? Thank you."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.5)))
        events.extend(await session.accept_pcm(_silence(0.6)))
        return events

    events = asyncio.run(run())
    assert [item["text"] for item in events if item["type"] == "final"] == ["А что случилось?"]


def test_stale_english_partial_never_survives_russian_final():
    partial_started = asyncio.Event()
    release_partial = asyncio.Event()
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            partial_started.set()
            await release_partial.wait()
            return " Thank you. Can you hear me?"
        return " Что случилось?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.wait_for(partial_started.wait(), 1.0)
        session.feed(_silence(0.5))
        await asyncio.wait_for(session.wait_idle(), 1.0)
        release_partial.set()
        await asyncio.sleep(0.05)
        await session.finish()
        return session.emitted

    events = asyncio.run(run())
    texts = [item["text"] for item in events if item["type"] in ("partial", "final")]
    assert texts == ["Что случилось?"]
    assert events[-1]["type"] == "session_complete"
    assert events[-1]["text"] == "Что случилось?"
    assert all("Thank" not in str(item.get("text", "")) for item in events)
