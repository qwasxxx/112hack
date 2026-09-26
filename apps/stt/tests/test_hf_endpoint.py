from __future__ import annotations

import asyncio
import math
import time

from sys112_stt.engine_hf import HfSttError, HuggingFaceSttSession


def _tone(seconds: float, amplitude: int = 9000, rate: int = 8000) -> bytes:
    count = int(rate * seconds)
    out = bytearray()
    for index in range(count):
        value = int(amplitude * math.sin(2 * math.pi * 220 * index / rate))
        out += int(max(-32767, min(32767, value))).to_bytes(2, "little", signed=True)
    return bytes(out)


def _silence(seconds: float, rate: int = 8000) -> bytes:
    return b"\x00\x00" * int(rate * seconds)


def _finals(events: list[dict]) -> list[str]:
    return [item["text"] for item in events if item.get("type") == "final"]


def test_a_short_speech_plus_silence_emits_one_final():
    async def fake(_wav: bytes) -> str:
        return "адрес"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.45)))
        events.extend(await session.accept_pcm(_silence(0.55)))
        return events, session

    events, session = asyncio.run(run())
    assert _finals(events) == ["адрес"]
    assert session.in_speech is False


def test_b_short_natural_pause_does_not_split():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        return "улица ленина дом двадцать"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.45)))
        events.extend(await session.accept_pcm(_silence(0.22)))
        events.extend(await session.accept_pcm(_tone(0.45)))
        events.extend(await session.accept_pcm(_silence(0.55)))
        return events

    events = asyncio.run(run())
    assert _finals(events) == ["улица ленина дом двадцать"]
    assert calls["n"] == 1


def test_c_very_short_answer_is_valid_speech():
    async def fake(_wav: bytes) -> str:
        return "да"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.16)))
        events.extend(await session.accept_pcm(_silence(0.55)))
        return events

    events = asyncio.run(run())
    assert _finals(events) == ["да"]


def test_d_stale_partial_does_not_block_or_overwrite_final():
    order: list[str] = []
    partial_started = asyncio.Event()

    async def fake(_wav: bytes) -> str:
        if not order:
            order.append("partial-start")
            partial_started.set()
            await asyncio.sleep(2.0)
            order.append("partial-end")
            return "устаревший частичный"
        order.append("final")
        return "полный адрес"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.wait_for(partial_started.wait(), 1.0)
        session.feed(_silence(0.5))
        t0 = time.monotonic()
        await asyncio.wait_for(session.wait_idle(), 1.5)
        elapsed = time.monotonic() - t0
        return session, elapsed

    session, elapsed = asyncio.run(run())
    assert elapsed < 0.25
    assert "partial-end" not in order
    assert "final" in order
    assert _finals(session.emitted) == ["полный адрес"]
    later_partial = [item for item in session.emitted if item.get("type") == "partial" and item.get("text") == "устаревший частичный"]
    assert later_partial == []


def test_e_stop_cancels_pending_request():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            await asyncio.sleep(30)
            return "частичный"
        return "финал"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.05)
        events = await asyncio.wait_for(session.finish(), 2.0)
        pending = session._task is not None and not session._task.done()
        return events, pending, session

    events, pending, session = asyncio.run(run())
    assert pending is False
    assert session._closed is True
    assert any(item.get("type") == "session_complete" for item in events)
    assert _finals(events) == ["финал"]


def test_e_abort_during_pending_leaves_no_task():
    async def fake(_wav: bytes) -> str:
        await asyncio.sleep(30)
        return "нет"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.05)
        await asyncio.wait_for(session.abort(), 1.0)
        return session._task is not None and not session._task.done(), session._closed

    pending, closed = asyncio.run(run())
    assert pending is False
    assert closed is True


def test_f_sequential_utterances_do_not_leak_state():
    texts = iter(["адрес", "что случилось"])

    async def fake(_wav: bytes) -> str:
        return next(texts)

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        await session.accept_pcm(_tone(0.5))
        await session.accept_pcm(_silence(0.55))
        leaked = {
            "in_speech": session.in_speech,
            "last_partial": session.last_partial,
            "speech": bytes(session.speech),
            "loud_bytes": session.loud_bytes,
        }
        await session.accept_pcm(_tone(0.6))
        await session.accept_pcm(_silence(0.55))
        return session, leaked

    session, leaked = asyncio.run(run())
    assert leaked["in_speech"] is False
    assert leaked["last_partial"] == ""
    assert leaked["speech"] == b""
    assert leaked["loud_bytes"] == 0
    assert _finals(session.emitted) == ["адрес", "что случилось"]
    assert session.in_speech is False
    assert session.last_partial == ""
    assert session.loud_bytes == 0


def test_true_silence_finalizes_short_answer_quickly():
    async def fake(_wav: bytes) -> str:
        return "да"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        events = []
        events.extend(await session.accept_pcm(_tone(0.2)))
        events.extend(await session.accept_pcm(_silence(0.30)))
        return events

    events = asyncio.run(run())
    assert _finals(events) == ["да"]


def test_g_persistent_session_handles_sequential_utterances():
    texts = iter(["да", "нет"])
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        return next(texts)

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        first = []
        first.extend(await session.accept_pcm(_tone(0.2)))
        first.extend(await session.accept_pcm(_silence(0.32)))
        second = []
        second.extend(await session.accept_pcm(_tone(0.25)))
        second.extend(await session.accept_pcm(_silence(0.32)))
        return first, second, session

    first, second, session = asyncio.run(run())
    assert _finals(first) == ["да"]
    assert _finals(second) == ["нет"]
    assert calls["n"] == 2
    assert session._failed is False


def test_i_late_partial_from_old_utt_is_ignored():
    order: list[str] = []

    async def fake(_wav: bytes) -> str:
        if not order:
            order.append("slow")
            await asyncio.sleep(0.2)
            return "старый"
        order.append("fast")
        return "новый"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.02)
        session._force_final = True
        session._kick()
        await session.wait_idle()
        return session

    session = asyncio.run(run())
    assert "старый" not in _finals(session.emitted) or _finals(session.emitted)[-1] != "старый"
    late_partial = [
        item for item in session.emitted if item.get("type") == "partial" and item.get("text") == "старый"
    ]
    assert late_partial == []


def test_b_slow_partial_cancel_does_not_block_final():
    order: list[str] = []
    partial_started = asyncio.Event()

    async def fake(_wav: bytes) -> str:
        if not order:
            order.append("partial-start")
            partial_started.set()
            try:
                await asyncio.sleep(2.0)
            except asyncio.CancelledError:
                await asyncio.sleep(0.35)
                order.append("partial-cancel-slow")
                raise
            order.append("partial-end")
            return "устаревший частичный"
        order.append("final")
        return "полный адрес"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.wait_for(partial_started.wait(), 1.0)
        session.feed(_silence(0.5))
        t0 = time.monotonic()
        await asyncio.wait_for(session.wait_idle(), 1.5)
        elapsed = time.monotonic() - t0
        return session, elapsed

    session, elapsed = asyncio.run(run())
    assert elapsed < 0.25
    assert "final" in order
    assert _finals(session.emitted) == ["полный адрес"]


def test_hold_drops_in_flight_and_blocks_caller_leak():
    async def fake(_wav: bytes) -> str:
        return "Что случилось?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(0.45))
        session.hold()
        leaked = await session.accept_pcm(_tone(0.45) + _silence(0.55))
        session.resume()
        after = []
        after.extend(await session.accept_pcm(_tone(0.5)))
        after.extend(await session.accept_pcm(_silence(0.55)))
        return leaked, after, session

    leaked, after, session = asyncio.run(run())
    assert _finals(leaked) == []
    assert _finals(after) == ["Что случилось?"]
    assert session._failed is False
    assert session.in_speech is False


def test_hold_wait_idle_does_not_block_on_inflight():
    async def fake(_wav: bytes) -> str:
        await asyncio.sleep(30)
        return "эхо"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.05)
        session.hold()
        started = time.monotonic()
        await asyncio.wait_for(session.wait_idle(), 1.0)
        return time.monotonic() - started, session

    elapsed, session = asyncio.run(run())
    assert elapsed < 0.6
    assert _finals(session.emitted) == []
    assert session._held is True


def test_timeout_recovers_for_next_russian_turn():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise HfSttError(504, "stt timeout")
        return "Адрес?"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        first = []
        first.extend(await session.accept_pcm(_tone(0.4)))
        first.extend(await session.accept_pcm(_silence(0.55)))
        second = []
        second.extend(await session.accept_pcm(_tone(0.4)))
        second.extend(await session.accept_pcm(_silence(0.55)))
        return first, second, session

    first, second, session = asyncio.run(run())
    assert _finals(first) == []
    assert any(item.get("type") == "error" and item.get("code") == "stt_timeout" for item in first)
    assert _finals(second) == ["Адрес?"]
    assert session._failed is False


def test_twenty_turns_do_not_leak_or_duplicate():
    phrases = [f"фраза {index}" for index in range(1, 21)]
    texts = iter(phrases)

    async def fake(_wav: bytes) -> str:
        return next(texts)

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        for _ in phrases:
            await session.accept_pcm(_tone(0.22))
            await session.accept_pcm(_silence(0.40))
        return session

    session = asyncio.run(run())
    assert _finals(session.emitted) == phrases
    assert session.in_speech is False
    assert session._failed is False
    assert session.last_partial == ""


def test_failed_partial_does_not_destroy_session():
    calls = {"n": 0}

    async def fake(_wav: bytes) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("partial boom")
        return "повторите адрес"

    async def run():
        session = HuggingFaceSttSession(transcribe=fake, sample_rate=8000)
        session.feed(_tone(1.2))
        await asyncio.sleep(0.05)
        session.feed(_silence(0.5))
        await session.wait_idle()
        return session

    session = asyncio.run(run())
    assert session._failed is False
    assert _finals(session.emitted) == ["повторите адрес"]
