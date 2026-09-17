from __future__ import annotations

import re

_STRIP = re.compile(r"[^\w\s.,!?;:\-—–…ёЁ+]", re.UNICODE)
_SPACES = re.compile(r"\s+")
_SENTENCE = re.compile(r"(?<=[.!?…])\s+")


def normalize_text(text: str) -> str:
    cleaned = (text or "").replace("\u00a0", " ").replace("…", ".")
    cleaned = _STRIP.sub(" ", cleaned)
    cleaned = _SPACES.sub(" ", cleaned).strip()
    if not cleaned:
        return ""
    if cleaned[-1] not in ".!?":
        cleaned += "."
    return cleaned


def split_sentences(text: str, max_chars: int = 280) -> list[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []
    parts = [item.strip() for item in _SENTENCE.split(cleaned) if item.strip()]
    result: list[str] = []
    for part in parts:
        if len(part) <= max_chars:
            result.append(part)
        else:
            result.extend(_split_long(part, max_chars))
    return result or [cleaned]


def _split_long(text: str, limit: int = 280) -> list[str]:
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for word in words:
        extra = len(word) + (1 if current else 0)
        if current and size + extra > limit:
            piece = " ".join(current)
            if piece[-1] not in ".!?":
                piece += "."
            chunks.append(piece)
            current = [word]
            size = len(word)
        else:
            current.append(word)
            size += extra
    if current:
        piece = " ".join(current)
        if piece[-1] not in ".!?":
            piece += "."
        chunks.append(piece)
    return chunks
