from __future__ import annotations

PROFILES: dict[str, dict[str, float | str]] = {
    "victim_panic": {"speaker": "kseniya", "speed": 1.0, "pitch": "medium"},
    "victim_scared": {"speaker": "baya", "speed": 1.0, "pitch": "medium"},
    "operator_calm": {"speaker": "aidar", "speed": 1.0, "pitch": "medium"},
}

_ROLE_OPERATOR = {
    "operator",
    "dispatcher",
    "aidar",
    "eugene",
    "dmitry",
    "ru_ru_dmitryneural",
}
_ROLE_VICTIM = {"victim", "caller", "patient"}
_SCARED = {"scared", "crying", "panic_crying", "victim_scared", "quiet"}
_CALM = {"calm", "operator_calm", "neutral"}
_PANIC = {"panic", "panic_high", "victim_panic", "fear"}


def resolve_profile(
    role: str | None = None,
    emotion: str | None = None,
    conversation_role: str | None = None,
    voice_id: str | None = None,
) -> dict[str, float | str]:
    role_key = (role or conversation_role or "").strip().lower().replace("-", "_")
    emo = (emotion or "").strip().lower().replace("-", "_")
    voice = (voice_id or "").strip().lower().replace("-", "_")
    if voice in PROFILES:
        return dict(PROFILES[voice])
    if emo in PROFILES:
        return dict(PROFILES[emo])
    if role_key in _ROLE_OPERATOR or voice in _ROLE_OPERATOR:
        return dict(PROFILES["operator_calm"])
    if emo in _SCARED or (role_key in _ROLE_VICTIM and emo in _CALM):
        return dict(PROFILES["victim_scared"])
    if emo in _PANIC or role_key in _ROLE_VICTIM:
        return dict(PROFILES["victim_panic"])
    if emo in _CALM:
        return dict(PROFILES["operator_calm"])
    return dict(PROFILES["victim_panic"])


def list_voice_ids() -> list[str]:
    return ["victim_panic", "victim_scared", "operator_calm"]
