from __future__ import annotations

import re

_CYR_LETTER = re.compile(r"[А-Яа-яЁё]")
_LAT_LETTER = re.compile(r"[A-Za-z]")
_OTHER_LETTER = re.compile(r"[^\W\d_А-Яа-яЁёA-Za-z]")
_DIGIT = re.compile(r"\d")
_SEGMENT = re.compile(r"[^,.;:!?…]+[,.;:!?…]*|[,.;:!?…]+")
_TAIL_PUNCT = re.compile(r"[.!?…]+$")
_HOMOGLYPHS = str.maketrans("AaBCcEeHKkMOoPpTXxy", "АаВСсЕеНКкМОоРрТХху")
_FOREIGN = re.compile(r"[^\W\d_А-Яа-яЁё]")


def normalize_transcript(text: str) -> str:
    return " ".join(text.split()).strip()


def _only_homoglyphs(token: str) -> bool:
    return all(char.translate(_HOMOGLYPHS) != char for char in _LAT_LETTER.findall(token))


def _russian_token(token: str) -> str:
    if not _FOREIGN.search(token):
        return token
    cyr = len(_CYR_LETTER.findall(token))
    foreign = len(_FOREIGN.findall(token))
    digits = bool(_DIGIT.search(token))
    repairable = _only_homoglyphs(token) and not _OTHER_LETTER.search(token)
    if repairable and (cyr or digits or foreign == 1):
        return token.translate(_HOMOGLYPHS)
    if digits or cyr > foreign:
        return _FOREIGN.sub("", token)
    tail = _TAIL_PUNCT.search(token)
    return tail.group(0) if tail else ""


def _russian_segment(segment: str) -> str:
    if not _FOREIGN.search(segment):
        return segment
    if not _CYR_LETTER.search(segment):
        return ""
    lead = " " if segment[:1].isspace() else ""
    return lead + " ".join(_russian_token(token) for token in segment.split())


def gate_russian_operator_text(text: str) -> str:
    raw = normalize_transcript(text or "")
    if not _FOREIGN.search(raw):
        return raw if _CYR_LETTER.search(raw) or _DIGIT.search(raw) else ""
    spoken = normalize_transcript("".join(_russian_segment(part) for part in _SEGMENT.findall(raw)))
    spoken = re.sub(r"\s+([,.;:!?…])", r"\1", spoken)
    spoken = re.sub(r"([,;:])(?:\s*[,;:])+", r"\1", spoken)
    spoken = re.sub(r"[,;:]\s*([.!?…])", r"\1", spoken)
    spoken = re.sub(r"^[-–—,.;:!?…\s]+", "", spoken)
    spoken = re.sub(r"[-–—,;:\s]+$", "", spoken).strip()
    if not _CYR_LETTER.search(spoken) and not _DIGIT.search(spoken):
        return ""
    return spoken


# Proven fire-ambience near-misses for one-word operator answers only.
_SHORT_REPAIRS = {
    "низ": "Нет",
    "неж": "Нет",
    "нэт": "Нет",
    "нетт": "Нет",
    "неа": "Нет",
    "даа": "Да",
}


def repair_short_operator_answer(text: str) -> str:
    raw = normalize_transcript(text or "")
    if not raw:
        return raw
    punct = raw[-1] if raw[-1:] in ".!?" else ""
    core = raw[:-1].rstrip() if punct else raw
    tokens = core.split()
    if len(tokens) != 1:
        return raw
    fixed = _SHORT_REPAIRS.get(tokens[0].lower().replace("ё", "е"))
    if not fixed:
        return raw
    return fixed + punct


def polish_operator_transcript(text: str) -> str:
    return repair_short_operator_answer(gate_russian_operator_text(normalize_transcript(text)))


def stable_prefix(text: str, timestamps: list[float] | None, audio_seconds: float, delay: float) -> str:
    text = normalize_transcript(text)
    if not text:
        return ""
    words = text.split()
    cutoff = audio_seconds - delay
    if timestamps:
        aligned = timestamps[-len(words) :] if len(timestamps) >= len(words) else timestamps
        if len(aligned) == len(words):
            kept = [word for word, stamp in zip(words, aligned) if stamp <= cutoff]
            return " ".join(kept)
    if audio_seconds < delay:
        return ""
    if len(words) == 1:
        return ""
    hold = 2 if len(words) >= 4 else 1
    return " ".join(words[:-hold])
