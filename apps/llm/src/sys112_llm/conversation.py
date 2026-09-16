from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sys112_llm.config import REPO_ROOT

Role = Literal["system", "user", "assistant"]
ConversationRole = Literal["victim", "operator"]

DEFAULT_PROMPTS: dict[ConversationRole, str] = {
    "victim": (
        "/no_think\n"
        "Ты участник телефонного разговора: звонишь в 112. "
        "Говори по-русски, как в живом звонке. "
        "Смотри на все предыдущие реплики этого разговора и не повторяйся."
    ),
    "operator": (
        "/no_think\n"
        "Ты участник телефонного разговора: тебе звонят в 112. "
        "Говори по-русски, как в живом звонке. "
        "Смотри на все предыдущие реплики этого разговора и не повторяйся."
    ),
}


@dataclass
class ChatMessage:
    role: Role
    content: str


@dataclass
class CallSession:
    call_id: str
    conversation_role: ConversationRole
    messages: list[ChatMessage] = field(default_factory=list)
    seen_ids: set[str] = field(default_factory=set)
    closed: bool = False
    busy: bool = False
    pending: list[tuple[str, str]] = field(default_factory=list)

    def to_openai(self) -> list[dict[str, str]]:
        return [{"role": item.role, "content": item.content} for item in self.messages]


class ConversationManager:
    def __init__(self) -> None:
        self._sessions: dict[str, CallSession] = {}

    def create(
        self,
        call_id: str,
        conversation_role: ConversationRole = "victim",
        system_prompt: str | None = None,
    ) -> CallSession:
        prompt = (system_prompt or "").strip() or DEFAULT_PROMPTS[conversation_role]
        if "/no_think" not in prompt:
            prompt = "/no_think\n" + prompt
        session = CallSession(call_id=call_id, conversation_role=conversation_role)
        session.messages.append(ChatMessage(role="system", content=prompt))
        self._sessions[call_id] = session
        return session

    def get(self, call_id: str) -> CallSession | None:
        return self._sessions.get(call_id)

    def close(self, call_id: str) -> CallSession | None:
        session = self._sessions.pop(call_id, None)
        if session:
            session.closed = True
            session.busy = False
            session.pending.clear()
            try:
                _save_transcript(session)
            except Exception:
                pass
        return session

    def accept_user(self, call_id: str, text: str, message_id: str) -> CallSession | None:
        session = self._sessions.get(call_id)
        if session is None or session.closed:
            return None
        cleaned = " ".join(text.split()).strip()
        if not cleaned:
            return None
        if message_id in session.seen_ids:
            return None
        session.seen_ids.add(message_id)
        session.messages.append(ChatMessage(role="user", content=cleaned))
        return session

    def append_assistant(self, call_id: str, text: str) -> None:
        session = self._sessions.get(call_id)
        if session is None or session.closed:
            return
        cleaned = text.strip()
        if not cleaned:
            return
        session.messages.append(ChatMessage(role="assistant", content=cleaned))


def _save_transcript(session: CallSession) -> None:
    folder = REPO_ROOT / "data" / "llm-sessions"
    folder.mkdir(parents=True, exist_ok=True)
    payload = {
        "call_id": session.call_id,
        "conversation_role": session.conversation_role,
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "messages": session.to_openai(),
    }
    path = folder / f"{session.call_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
