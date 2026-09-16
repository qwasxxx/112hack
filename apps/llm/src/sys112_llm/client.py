from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator

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


def strip_reasoning(text: str) -> str:
    cleaned = _THINK.sub("", text)
    cleaned = re.sub(r"</?think>", "", cleaned, flags=re.IGNORECASE)
    return " ".join(cleaned.split()).strip()


def sanitize_speech(text: str) -> str:
    cleaned = _FOREIGN.sub(" ", strip_reasoning(text))
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    return " ".join(cleaned.split()).strip()


class LlamaClient:
    def __init__(self, base_url: str = LLM_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    async def ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/v1/models")
                return response.status_code == 200
        except Exception:
            return False

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        payload = {
            "model": LLM_MODEL_NAME,
            "messages": messages,
            "stream": True,
            "temperature": LLM_TEMPERATURE,
            "top_p": LLM_TOP_P,
            "top_k": LLM_TOP_K,
            "max_tokens": LLM_MAX_TOKENS if max_tokens is None else max_tokens,
            "repeat_penalty": LLM_REPEAT_PENALTY,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SEC) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
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
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    piece = delta.get("content") or ""
                    if piece:
                        yield piece
