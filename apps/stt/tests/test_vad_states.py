from __future__ import annotations

import asyncio
import math

from sys112_stt.engine_hf import HuggingFaceSttSession


def _tone(seconds: float, amplitude: int = 9000, rate: int = 16000) -> bytes:
    count = int(rate * seconds)
    out = bytearray()
    for index in range(count):
        value = int(amplitude * math.sin(2 * math.pi * 220 * index / rate))
        out += int(max(-32767, min(32767, value))).to_bytes(2, "little", signed=True)
    return bytes(out)


def _silence(seconds: float, rate: int = 16000) -> bytes:
    return b"\x00\x00" * int(rate * seconds)


def _finals(events: list[dict]) -> list[str]:
    return [item["text"] for item in events if item.get("type") == "final"]


def test_quiet_speech_opens_the_gate():
    async def fake(_wav: bytes) -> str:
        return "Да."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        await session.accept_pcm(_tone(0.4, amplitude=260))
        return session.in_speech or bool(_finals(session.emitted))

    assert asyncio.run(run()) is True


def test_room_hum_does_not_open_the_gate():
    async def fake(_wav: bytes) -> str:
        return "Да."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        await session.accept_pcm(_tone(1.2, amplitude=40))
        return session.in_speech, _finals(session.emitted)

    speaking, finals = asyncio.run(run())
    assert speaking is False
    assert finals == []


def test_16k_short_answers_finalize():
    async def fake(_wav: bytes) -> str:
        return "Да."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.18)))
        events.extend(await session.accept_pcm(_silence(0.32)))
        return events, session

    events, session = asyncio.run(run())
    assert _finals(events) == ["Да."]
    assert session.in_speech is False


def test_hesitation_is_not_split():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        return "Адрес... улица Ленина, дом пять."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.4)))
        events.extend(await session.accept_pcm(_silence(0.22)))
        events.extend(await session.accept_pcm(_tone(0.5)))
        events.extend(await session.accept_pcm(_silence(0.55)))
        return events

    events = asyncio.run(run())
    assert _finals(events) == ["Адрес... улица Ленина, дом пять."]
    assert calls["n"] == 1


def test_vad_idle_speech_silence_idle():
    async def fake(_wav: bytes) -> str:
        return "Нет."

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        assert session.in_speech is False
        await session.accept_pcm(_tone(0.3))
        assert session.in_speech is True
        await session.accept_pcm(_silence(0.55))
        assert session.in_speech is False
        return session

    session = asyncio.run(run())
    assert _finals(session.emitted) == ["Нет."]


def test_duplicate_final_is_not_emitted_twice():
    async def fake(_wav: bytes) -> str:
        return "Адрес?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        await session.accept_pcm(_tone(0.4))
        await session.accept_pcm(_silence(0.5))
        session._utt_id = 1
        session._finalized_utt = 1
        session.in_speech = True
        session.loud_bytes = int(16000 * 0.4) * 2
        session.speech = bytearray(_tone(0.4))
        session._force_final = True
        session._kick()
        await session.wait_idle()
        return session

    session = asyncio.run(run())
    assert _finals(session.emitted) == ["Адрес?"]


def test_abort_drops_in_flight_result():
    async def fake(_wav: bytes) -> str:
        await asyncio.sleep(0.2)
        return "Hello"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=16000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.03)
        await session.abort()
        return session

    session = asyncio.run(run())
    assert session._closed is True
    assert _finals(session.emitted) == []
    assert all(item.get("type") != "partial" for item in session.emitted)
