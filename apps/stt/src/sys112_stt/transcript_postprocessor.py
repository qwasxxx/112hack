from __future__ import annotations


def normalize_transcript(text: str) -> str:
    return " ".join(text.split()).strip()


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
