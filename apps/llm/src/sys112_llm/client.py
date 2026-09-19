from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator, Callable

import httpx

from sys112_llm.config import (
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MODEL_NAME,
    LLM_REPEAT_PENALTY,
    LLM_TEMPERATURE,
    LLM_TIMEOUT_SEC,
    LLM_TOP_K,
    LLM_TOP_P,
)

logger = logging.getLogger("sys112_llm")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FOREIGN = re.compile(
    r"(?:[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF"
    r"\uFF00-\uFFEF\u1100-\u11FF]|[A-Za-z])+"
)
_ABBREV = (
    (re.compile(r"\bSTR\b", re.IGNORECASE), "строение"),
    (re.compile(r"\bKM\b", re.IGNORECASE), "километр"),
    (re.compile(r"\bST\b"), "станция"),
    (re.compile(r"\bСТ\.(?=\s|$|\d)", re.IGNORECASE), "станция"),
    (re.compile(r"\bст\.(?=\s|$|\d)", re.IGNORECASE), "станция"),
    (re.compile(r"\bстр\.?(?=\s|$|\d|,)", re.IGNORECASE), "строение"),
    (re.compile(r"\bкм\.?(?=\s|$|\d|,)", re.IGNORECASE), "километр"),
    (re.compile(r"\bкорп\.?(?=\s|$|\d|,)", re.IGNORECASE), "корпус"),
    (re.compile(r"\bкв\.(?=\s|$|\d)", re.IGNORECASE), "квартира"),
    (re.compile(r"\bул\.(?=\s|$|\d)", re.IGNORECASE), "улица"),
    (re.compile(r"\bпер\.(?=\s|$|\d)", re.IGNORECASE), "переулок"),
    (re.compile(r"\bд\.(?=\s*\d)", re.IGNORECASE), "дом"),
    (re.compile(r"([а-яёА-ЯЁ])(\d)"), r"\1 \2"),
)


def strip_reasoning(text: str) -> str:
    cleaned = _THINK.sub("", text)
    cleaned = re.sub(r"</?think>", "", cleaned, flags=re.IGNORECASE)
    return " ".join(cleaned.split()).strip()


def expand_speech_abbreviations(text: str) -> str:
    expanded = text
    for pattern, word in _ABBREV:
        expanded = pattern.sub(word, expanded)
    return expanded


def sanitize_speech(text: str) -> str:
    cleaned = expand_speech_abbreviations(strip_reasoning(text))
    without_cjk = re.sub(
        r"[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF"
        r"\uFF00-\uFFEF\u1100-\u11FF]+",
        " ",
        cleaned,
    )
    cyrillic = _FOREIGN.sub(" ", without_cjk)
    cyrillic = re.sub(r"\s+([,.;:!?])", r"\1", cyrillic)
    spoken = " ".join(cyrillic.split()).strip()
    if spoken:
        return spoken
    return " ".join(without_cjk.split()).strip()


class LlamaClient:
    def __init__(self, base_url: str = LLM_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def _chat_payload(
        self,
        messages: list[dict[str, str]],
        *,
        stream: bool,
        max_tokens: int,
    ) -> dict:
        return {
            "model": LLM_MODEL_NAME,
            "messages": messages,
            "stream": stream,
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "top_k": LLM_TOP_K,
            "max_tokens": max_tokens,
            "repeat_penalty": LLM_REPEAT_PENALTY,
            "cache_prompt": True,
            "stop": ["\n\n", "Оператор:", "Заявитель:"],
            "chat_template_kwargs": {"enable_thinking": False},
            "enable_thinking": False,
            "reasoning_effort": "low",
        }

    async def ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/v1/models")
                return response.status_code == 200
        except Exception:
            return False

    async def prefetch_chat(self, messages: list[dict[str, str]]) -> None:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SEC) as http:
            response = None
            for tokens in (0, 1):
                payload = self._chat_payload(messages, stream=False, max_tokens=tokens)
                response = await http.post(
                    f"{self.base_url}/v1/chat/completions",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                if response.status_code != 400:
                    break
            if response is None:
                return
            response.raise_for_status()
            data = response.json()
            timings = data.get("timings") or {}
            if timings:
                logger.info(
                    "[LLM] warmup prompt %sms / %s tok",
                    round(float(timings.get("prompt_ms") or 0)),
                    timings.get("prompt_n"),
                )

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        max_tokens: int | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> AsyncIterator[str]:
        payload = self._chat_payload(
            messages,
            stream=True,
            max_tokens=LLM_MAX_TOKENS if max_tokens is None else max_tokens,
        )
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SEC) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if should_stop and should_stop():
                        return
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data = line[5:].strip()
                    else:
                        data = line.strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    timings = chunk.get("timings")
                    if timings:
                        logger.info(
                            "[LLM] prompt %sms / %s tok, decode %sms / %s tok",
                            round(float(timings.get("prompt_ms") or 0)),
                            timings.get("prompt_n"),
                            round(float(timings.get("predicted_ms") or 0)),
                            timings.get("predicted_n"),
                        )
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    piece = delta.get("content") or ""
                    if piece:
                        yield piece
