from __future__ import annotations

PROFILES: dict[str, dict[str, float | str]] = {
    "victim_panic": {"speaker": "kseniya", "speed": 1.35},
    "victim_scared": {"speaker": "xenia", "speed": 0.9},
    "operator_calm": {"speaker": "aidar", "speed": 1.0},
}

_ROLE_OPERATOR = {"operator", "dispatcher", "aidar", "eugene", "dmitry", "ru-ru-dmitryneural"}
_SCARED = {"scared", "crying", "panic_crying", "victim_scared", "quiet"}
_CALM = {"calm", "operator_calm", "neutral"}


def resolve_profile(
    role: str | None = None,
    emotion: str | None = None,
    conversation_role: str | None = None,
    voice_id: str | None = None,
) -> dict[str, float | str]:
    role_key = (role or conversation_role or "").strip().lower().replace("-", "_")
    emo = (emotion or "").strip().lower().replace("-", "_")
    voice = (voice_id or "").strip().lower().replace("-", "_")
    if role_key in _ROLE_OPERATOR or voice in _ROLE_OPERATOR or emo in _CALM:
        return dict(PROFILES["operator_calm"])
    if emo in _SCARED:
        return dict(PROFILES["victim_scared"])
    if emo in PROFILES:
        return dict(PROFILES[emo])
    return dict(PROFILES["victim_panic"])


def list_voice_ids() -> list[str]:
    return ["victim_panic", "victim_scared", "operator_calm"]
