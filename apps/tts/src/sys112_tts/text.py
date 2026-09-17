from __future__ import annotations

import re

from num2words import num2words

_STRIP = re.compile(r"[^\w\s.,!?;:\-—–…ёЁ+]", re.UNICODE)
_SPACES = re.compile(r"\s+")
_SENTENCE = re.compile(r"(?<=[.!?…])\s+")
_TIME = re.compile(r"\b(\d{1,2}):(\d{2})\b")
_NUMBER = re.compile(r"\d+")

_ABBREVS = (
    (re.compile(r"\bт\.?\s*д\.", re.IGNORECASE), "так далее"),
    (re.compile(r"\bт\.?\s*п\.", re.IGNORECASE), "тому подобное"),
    (re.compile(r"\bул\.", re.IGNORECASE), "улица"),
    (re.compile(r"\bкв\.", re.IGNORECASE), "квартира"),
    (re.compile(r"(?:^|(?<=\s))д\.", re.IGNORECASE), "дом"),
)


def _ru_number(value: int) -> str:
    return num2words(value, lang="ru")


def _expand_time(match: re.Match[str]) -> str:
    hours = _ru_number(int(match.group(1)))
    minutes = _ru_number(int(match.group(2)))
    return f"{hours} {minutes}"


def _expand_number(match: re.Match[str]) -> str:
    raw = match.group(0)
    try:
        return _ru_number(int(raw))
    except (TypeError, ValueError):
        return raw


def expand_speech_text(text: str) -> str:
    cleaned = (text or "").replace("\u00a0", " ").replace("…", ".")
    for pattern, replacement in _ABBREVS:
        cleaned = pattern.sub(replacement, cleaned)
    cleaned = _TIME.sub(_expand_time, cleaned)
    cleaned = _NUMBER.sub(_expand_number, cleaned)
    return cleaned


def normalize_text(text: str) -> str:
    cleaned = expand_speech_text(text)
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
