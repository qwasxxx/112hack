from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from sys112_llm.config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_SCORE_MODEL

logger = logging.getLogger("sys112_llm")


async def openai_score(messages: list[dict[str, str]]) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0), trust_env=False) as http:
        raw = await _chat(http, messages)
    if not raw:
        return None
    parsed = parse_score_json(raw)
    parsed["source"] = f"openai:{OPENAI_SCORE_MODEL}"
    return parsed


async def _chat(http: httpx.AsyncClient, messages: list[dict[str, str]]) -> str | None:
    payload = {
        "model": OPENAI_SCORE_MODEL,
        "temperature": 0.2,
        "max_tokens": 220,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }
    try:
        response = await http.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            json=payload,
            headers=_headers(),
        )
        response.raise_for_status()
        data = response.json()
    except Exception:
        logger.exception("[LLM] OpenAI chat failed")
        return None
    return str((data.get("choices") or [{}])[0].get("message", {}).get("content") or "")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }


def parse_score_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {"politeness": 12, "comment": text[:400] if text else "", "recommendations": []}
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {"politeness": 12, "comment": text[:400], "recommendations": []}
    try:
        politeness_n = int(data.get("politeness"))
    except (TypeError, ValueError):
        politeness_n = 12
    comment = str(data.get("comment") or "").strip()
    recs = data.get("recommendations") or []
    if isinstance(recs, str):
        recs = [recs]
    recommendations = [str(item).strip() for item in recs if str(item).strip()][:3]
    return {
        "politeness": max(4, min(15, politeness_n)),
        "comment": comment[:600],
        "recommendations": recommendations,
    }
