from __future__ import annotations

import asyncio

import sys112_stt.engine_hf as engine_hf
from sys112_stt.engine_hf import transcribe_wav


class FakeResponse:
    def __init__(self, status: int, body: object, text: str = "") -> None:
        self.status_code = status
        self._body = body
        self.text = text

    def json(self) -> object:
        return self._body


class FakeClient:
    def __init__(self, plan: list[FakeResponse]) -> None:
        self.plan = list(plan)
        self.calls: list[dict] = []
        self.is_closed = False

    async def post(self, url, headers=None, json=None, content=None, timeout=None):
        self.calls.append({"json": json, "content": content})
        if not self.plan:
            return FakeResponse(500, {}, "empty plan")
        return self.plan.pop(0)

    async def aclose(self) -> None:
        self.is_closed = True


def setup_function() -> None:
    engine_hf._http = None


def test_every_request_forces_russian_transcription(monkeypatch):
    monkeypatch.setattr(engine_hf, "HF_TOKEN", "test-token")
    client = FakeClient([FakeResponse(200, {"text": "да"}), FakeResponse(200, {"text": "нет"})])
    engine_hf._http = client

    async def run():
        first = await transcribe_wav(b"RIFF" + b"\x00" * 40)
        second = await transcribe_wav(b"RIFF" + b"\x00" * 40)
        return first, second

    assert asyncio.run(run()) == ("да", "нет")
    assert len(client.calls) == 2
    for call in client.calls:
        assert call["content"] is None
        kwargs = call["json"]["parameters"]["generate_kwargs"]
        assert kwargs == {"language": "ru", "task": "transcribe"}
        assert "language" not in call["json"]["parameters"]
        assert "task" not in call["json"]["parameters"]


def test_error_raises_without_second_request(monkeypatch):
    monkeypatch.setattr(engine_hf, "HF_TOKEN", "test-token")
    client = FakeClient([FakeResponse(400, {}, "bad")])
    engine_hf._http = client

    async def run():
        try:
            await transcribe_wav(b"RIFF" + b"\x00" * 40)
        except engine_hf.HfSttError as exc:
            return exc.status
        return None

    assert asyncio.run(run()) == 400
    assert len(client.calls) == 1


def test_h_failed_request_does_not_poison_next(monkeypatch):
    monkeypatch.setattr(engine_hf, "HF_TOKEN", "test-token")
    client = FakeClient([FakeResponse(500, {}, "boom"), FakeResponse(200, {"text": "адрес"})])
    engine_hf._http = client

    async def run():
        try:
            await transcribe_wav(b"RIFF" + b"\x00" * 40)
        except engine_hf.HfSttError:
            pass
        return await transcribe_wav(b"RIFF" + b"\x00" * 40)

    assert asyncio.run(run()) == "адрес"
    assert engine_hf._http is client
    assert client.is_closed is False
