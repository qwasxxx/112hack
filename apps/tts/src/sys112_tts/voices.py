from __future__ import annotations

from typing import Any

from sys112_tts.config import TTS_OPERATOR_SPEAKER, TTS_VICTIM_SPEAKER

SILERO_MODEL_ID = "v5_5_ru"
SILERO_LANGUAGE = "ru"

CHARACTERS: dict[str, dict[str, Any]] = {
    "operator": {
        "name": "Диспетчер 112",
        "mode": "theory",
        "speakers": {"male": "aidar", "female": "xenia"},
        "default_speaker": TTS_OPERATOR_SPEAKER or "aidar",
        "rate": 1.0,
        "pitch": "medium",
        "style": "calm",
    },
    "victim": {
        "name": "Пострадавший / Заявитель",
        "mode": "training",
        "speakers": {"female": "xenia", "male": "eugene"},
        "default_speaker": TTS_VICTIM_SPEAKER or "xenia",
        "rate": 1.12,
        "pitch": "medium",
        "style": "anxious",
    },
}

PROFILES: dict[str, dict[str, float | str]] = {
    "operator_calm": {
        "role": "operator",
        "speaker": CHARACTERS["operator"]["default_speaker"],
        "speed": 1.0,
        "pitch": "medium",
    },
    "victim_panic": {
        "role": "victim",
        "speaker": "xenia",
        "speed": 1.12,
        "pitch": "medium",
    },
    "victim_scared": {
        "role": "victim",
        "speaker": "eugene",
        "speed": 1.08,
        "pitch": "medium",
    },
}

_SPEAKERS = {
    "aidar": {"role": "victim", "gender": "male", "speed": 1.1, "pitch": "medium"},
    "xenia": {"role": "victim", "gender": "female", "speed": 1.12, "pitch": "medium"},
    "kseniya": {"role": "victim", "gender": "female", "speed": 1.12, "pitch": "medium"},
    "baya": {"role": "victim", "gender": "female", "speed": 1.1, "pitch": "medium"},
    "eugene": {"role": "victim", "gender": "male", "speed": 1.08, "pitch": "medium"},
}

_PITCHES = {"x-low", "low", "medium", "high", "x-high"}

_ROLE_OPERATOR = {
    "operator",
    "dispatcher",
    "диспетчер",
    "диспетчер_112",
    "theory",
    "теория",
    "operator_calm",
}
_ROLE_VICTIM = {
    "victim",
    "caller",
    "patient",
    "заявитель",
    "пострадавший",
    "training",
    "тренировка",
    "victim_panic",
    "victim_scared",
}
_SCARED = {"scared", "crying", "panic_crying", "victim_scared", "quiet"}
_CALM = {"calm", "operator_calm", "neutral"}
_PANIC = {"panic", "panic_high", "victim_panic", "fear"}
_FEMALE = {"female", "жен", "женский", "xenia", "kseniya", "baya"}
_MALE = {"male", "муж", "мужской", "aidar", "eugene"}


def _norm(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", "_").replace(" ", "_")


def resolve_role(role: str | None = None, conversation_role: str | None = None, voice_id: str | None = None) -> str:
    for raw in (role, conversation_role):
        key = _norm(raw)
        if key in _ROLE_OPERATOR:
            return "operator"
        if key in _ROLE_VICTIM or key in _SPEAKERS:
            return "victim"
    voice = _norm(voice_id)
    if voice in _ROLE_OPERATOR:
        return "operator"
    return "victim"


def resolve_speaker(role: str, gender: str | None = None, voice_id: str | None = None) -> str:
    voice = _norm(voice_id)
    if voice in _SPEAKERS:
        return voice
    character = CHARACTERS[role if role in CHARACTERS else "victim"]
    speakers: dict[str, str] = character["speakers"]
    gender_key = _norm(gender)
    if gender_key in _FEMALE:
        return speakers.get("female") or character["default_speaker"]
    if gender_key in _MALE:
        return speakers.get("male") or character["default_speaker"]
    default = str(character["default_speaker"])
    if default in speakers.values():
        return default
    return next(iter(speakers.values()))


def resolve_profile(
    role: str | None = None,
    emotion: str | None = None,
    conversation_role: str | None = None,
    voice_id: str | None = None,
    gender: str | None = None,
    pitch: str | None = None,
    speed: float | None = None,
) -> dict[str, float | str]:
    voice = _norm(voice_id)
    emo = _norm(emotion)
    if voice in PROFILES:
        profile = dict(PROFILES[voice])
    elif emo in PROFILES:
        profile = dict(PROFILES[emo])
    else:
        role_key = resolve_role(role, conversation_role, voice_id)
        if emo in _SCARED or (role_key == "victim" and emo in _CALM):
            profile = dict(PROFILES["victim_scared"])
        elif role_key == "operator" or emo in _CALM:
            profile = dict(PROFILES["operator_calm"])
        else:
            profile = dict(PROFILES["victim_panic"])
    role_key = str(profile.get("role") or resolve_role(role, conversation_role, voice_id))
    if role in CHARACTERS:
        role_key = role if role in {"operator", "victim"} else role_key
        if _norm(role) in _ROLE_OPERATOR:
            role_key = "operator"
        elif _norm(role) in _ROLE_VICTIM:
            role_key = "victim"
    speaker = resolve_speaker(role_key, gender, voice_id if voice in _SPEAKERS else None)
    rate = float(speed) if speed is not None else float(profile.get("speed") or CHARACTERS[role_key]["rate"])
    pitch_key = _norm(pitch)
    tone = pitch_key if pitch_key in _PITCHES else str(profile.get("pitch") or CHARACTERS[role_key]["pitch"])
    return {
        "role": role_key,
        "speaker": speaker,
        "speed": rate,
        "pitch": tone,
        "name": CHARACTERS[role_key]["name"],
        "style": CHARACTERS[role_key]["style"],
    }


def resolve_voice_id(voice_id: str | None, emotion: str | None = None) -> str:
    return str(resolve_profile(voice_id=voice_id, emotion=emotion)["speaker"])


def list_voice_ids() -> list[str]:
    return ["victim_panic", "victim_scared", "operator_calm", "aidar", "baya", "eugene", "kseniya", "xenia"]
