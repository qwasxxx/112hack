from __future__ import annotations

import json
import re
from typing import Any


def _unescape(value: str) -> str:
    return value.replace("\\n", " ").replace('\\"', '"').replace("\\\\", "\\").strip()


def parse_score_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    data: dict[str, Any] | None = None
    if match:
        try:
            loaded = json.loads(match.group(0))
            if isinstance(loaded, dict):
                data = loaded
        except json.JSONDecodeError:
            data = None
    if data is None and text.startswith("{"):
        politeness_m = re.search(r'"politeness"\s*:\s*(\d+)', text)
        comment_m = re.search(r'"comment"\s*:\s*"((?:\\.|[^"\\])*)', text)
        recs: list[str] = []
        rec_block = re.search(r'"recommendations"\s*:\s*\[([\s\S]*)', text)
        if rec_block:
            for item in re.findall(r'"((?:\\.|[^"\\])*)"', rec_block.group(1)):
                cleaned = _unescape(item)
                if cleaned and not cleaned.startswith("{"):
                    recs.append(cleaned)
                if len(recs) >= 3:
                    break
        data = {
            "politeness": int(politeness_m.group(1)) if politeness_m else 12,
            "comment": _unescape(comment_m.group(1)) if comment_m else "",
            "recommendations": recs,
        }
    if data is None:
        plain = text[:400]
        if plain.startswith("{") or '"politeness"' in plain:
            plain = ""
        return {"politeness": 12, "comment": plain, "recommendations": []}
    try:
        politeness_n = int(data.get("politeness"))
    except (TypeError, ValueError):
        politeness_n = 12
    comment = str(data.get("comment") or "").strip()
    if comment.startswith("{") or '"politeness"' in comment:
        nested_comment = re.search(r'"comment"\s*:\s*"((?:\\.|[^"\\])*)', comment)
        comment = _unescape(nested_comment.group(1)) if nested_comment else ""
    recs = data.get("recommendations") or []
    if isinstance(recs, str):
        recs = [recs]
    recommendations = [str(item).strip() for item in recs if str(item).strip() and not str(item).strip().startswith("{")][:3]
    return {
        "politeness": max(4, min(15, politeness_n)),
        "comment": comment[:600],
        "recommendations": recommendations,
    }
