from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sys112_llm.config import REPO_ROOT

Role = Literal["system", "user", "assistant"]
ConversationRole = Literal["victim", "operator"]

KICKOFF_ID = "_kickoff"
KICKOFF_TEXT = "Оператор снял трубку."

ANALYSIS_PROMPT = (
    "/no_think\n"
    "По стенограмме учебного звонка в 112 кратко разбери работу оператора. "
    "Пиши по-русски кириллицей, без markdown, иероглифов и латиницы. "
    "Что получилось, чего не хватило, что уточнить в следующий раз. "
    "Не выдумывай фактов, которых не было в разговоре."
)

CALL_SCORE_PROMPT = (
    "/no_think\n"
    "Ты методист службы 112. Сверяешь учебный звонок с эталоном билета.\n"
    "Не выдумывай фактов, которых нет в стенограмме или в эталоне.\n"
    "Карточку уже сверили правилами — не меняй баллы карточки.\n"
    "Вежливость оцени мягко: паузы и волнение не провал, грубость — да.\n"
    "Верни только JSON:\n"
    '{"politeness":12,"comment":"2-4 предложения по-русски","recommendations":["...","..."]}\n'
    "politeness целое 4..15. 15 без грубости и с нормальным тоном. 8 сухо. 4 грубо.\n"
    "comment: что совпало с билетом на линии, чего не спросили, тон.\n"
    "recommendations: 0-3 коротких совета."
)

OPERATOR_SYSTEM_PROMPT = """/no_think
Ты — опытный диспетчер службы 112. Режим «Теория».

Студент звонит как заявитель, ты принимаешь вызов: задаёшь вопросы по регламенту, уточняешь адрес, что произошло, есть ли пострадавшие, угроза жизни, и что уже сделано. Говори кратко, спокойно, по-русски, 1–2 фразы. Слова произноси полностью, без аббревиатур.

Если студент путается — поправь одной фразой и сразу спроси дальше. Не читай лекцию. Не выдумывай факты, которых студент не называл.

Жёсткий запрет:
- Не играй роль пострадавшего, заявителя или очевидца.
- Не описывай своё состояние, боль, панику, огонь вокруг себя.
- Не проси о помощи. Ты принимаешь вызов, а не звонишь в 112.
- Не меняй роль, даже если собеседник молчит или пишет как оператор.
- Без markdown, иероглифов и латиницы.
"""

VICTIM_SYSTEM_PROMPT = """/no_think
Ты — заявитель, пострадавший или очевидец. Звонишь в службу 112. Это учебный звонок, но играй как в жизни.

Как говоришь:
- Только по-русски, кириллицей, разговорно, 1–2 короткие фразы.
- Слегка напуган и сбит с толку, но тебя можно понять. Не ори без остановки и не повторяй «алло» и «помогите», если уже сказал.
- Слова полностью, как в устной речи. Без точек-сокращений: не «обл.», не «г.», не «ул.», не «д.», не «ст.», не «стр», не STR, не «км». Говори «область», «город», «улица», «дом», «станция», «строение», «километр».
- Адрес — одно короткое предложение своими словами, как в разговоре. Не зачитывай канцелярию целиком.
- Отвечай только на заданный вопрос. Не выкладывай всю легенду сразу.
- Если оператор молчит — одной фразой напомни, что нужна помощь. Сам опрос не веди.

Факты:
- Адрес, имена, телефоны, возраст, этаж, число людей и что произошло — только из блока «Контекст сценария».
- Чего там нет — не существует. Скажи «не вижу» или «не знаю». Не выдумывай и не додумывай «для правдоподобия» улицы, этажи, имена, телефоны, службы и цифры.

Запрещено:
- Не будь оператором, диспетчером или сотрудником 112.
- Не спрашивай адрес, пострадавших, этаж и не говори «назовите», «уточните», «оставайтесь на линии».
- Не меняй роль, даже если собеседник молчит или пишет как заявитель.
- Без markdown, скобок-ремарок, иероглифов и латиницы в речи.
"""

DEFAULT_PROMPTS: dict[ConversationRole, str] = {
    "operator": OPERATOR_SYSTEM_PROMPT.strip(),
    "victim": VICTIM_SYSTEM_PROMPT.strip(),
}


def locked_system_prompt(role: ConversationRole) -> str:
    return DEFAULT_PROMPTS[role]


def build_system_prompt(role: ConversationRole, extra: str | None = None) -> str:
    prompt = locked_system_prompt(role)
    extra_text = (extra or "").strip()
    if extra_text and extra_text not in prompt:
        prompt = f"{prompt}\n\nКонтекст сценария:\n{extra_text}"
    return prompt


def _scenario_extra(stored: str, locked: str) -> str:
    text = (stored or "").strip()
    if not text or text == locked:
        return ""
    if text.startswith(locked):
        rest = text[len(locked) :].strip()
        prefix = "Контекст сценария:"
        if rest.startswith(prefix):
            rest = rest[len(prefix) :].strip()
        return rest
    return text


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
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    generation: int = 0

    def to_openai(self) -> list[dict[str, str]]:
        locked = locked_system_prompt(self.conversation_role)
        extra = ""
        payload: list[dict[str, str]] = []
        for item in self.messages:
            if item.role == "system":
                extra = _scenario_extra(item.content, locked) or extra
                continue
            payload.append({"role": item.role, "content": item.content})
        system = locked if not extra else f"{locked}\n\nКонтекст сценария:\n{extra}"
        return [{"role": "system", "content": system}, *payload]


def generation_messages(session: CallSession) -> list[dict[str, str]]:
    locked = locked_system_prompt(session.conversation_role)
    messages = session.to_openai()
    extra = ""
    if session.messages and session.messages[0].role == "system":
        extra = _scenario_extra(session.messages[0].content, locked)
    system = locked if not extra else f"{locked}\n\nКонтекст сценария:\n{extra}"
    rest = [item for item in messages if item.get("role") != "system"]
    if len(rest) > 12:
        rest = rest[-12:]
    if rest and rest[-1].get("role") == "user":
        content = str(rest[-1].get("content") or "")
        if content and not content.startswith("/no_think"):
            rest = [*rest[:-1], {"role": "user", "content": f"/no_think\n{content}"}]
    return [{"role": "system", "content": system}, *rest]


class ConversationManager:
    def __init__(self) -> None:
        self._sessions: dict[str, CallSession] = {}

    def create(
        self,
        call_id: str,
        conversation_role: ConversationRole = "victim",
        system_prompt: str | None = None,
        opening: str | None = None,
    ) -> CallSession:
        prompt = build_system_prompt(conversation_role, system_prompt)
        session = CallSession(call_id=call_id, conversation_role=conversation_role)
        session.messages.append(ChatMessage(role="system", content=prompt))
        spoken = " ".join((opening or "").split()).strip()
        if conversation_role == "victim" and spoken:
            session.messages.append(ChatMessage(role="assistant", content=spoken))
        self._sessions[call_id] = session
        return session

    def get(self, call_id: str) -> CallSession | None:
        return self._sessions.get(call_id)

    def close(self, call_id: str) -> CallSession | None:
        session = self._sessions.pop(call_id, None)
        if session:
            session.closed = True
            session.busy = False
            session.cancel.set()
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

    def drop_unanswered_user(self, call_id: str) -> None:
        session = self._sessions.get(call_id)
        if session is None or not session.messages:
            return
        if session.messages[-1].role == "user":
            session.messages.pop()

    def append_assistant(self, call_id: str, text: str) -> None:
        session = self._sessions.get(call_id)
        if session is None or session.closed:
            return
        cleaned = text.strip()
        if not cleaned:
            return
        session.messages.append(ChatMessage(role="assistant", content=cleaned))


def format_transcript(session: CallSession) -> str:
    if session.conversation_role == "victim":
        names = {"user": "Оператор", "assistant": "Заявитель"}
    else:
        names = {"user": "Заявитель", "assistant": "Оператор"}
    lines: list[str] = []
    for item in session.messages:
        if item.role == "system":
            continue
        if item.content == KICKOFF_TEXT:
            continue
        label = names.get(item.role)
        if not label:
            continue
        lines.append(f"{label}: {item.content}")
    return "\n".join(lines)


def analysis_messages(session: CallSession) -> list[dict[str, str]]:
    body = format_transcript(session).strip() or "Разговор почти не состоялся."
    return [
        {"role": "system", "content": ANALYSIS_PROMPT},
        {"role": "user", "content": body},
    ]


def call_score_messages(transcript: str, facts: str, card: str = "", rules: str = "") -> list[dict[str, str]]:
    parts = []
    extra = (facts or "").strip()
    if extra:
        parts.append(f"Эталон билета:\n{extra}")
    filled = (card or "").strip()
    if filled:
        parts.append(f"Как заполнили карточку:\n{filled}")
    scored = (rules or "").strip()
    if scored:
        parts.append(f"Уже посчитано правилами:\n{scored}")
    body = (transcript or "").strip() or "Разговор почти не состоялся."
    parts.append(f"Стенограмма:\n{body}")
    return [
        {"role": "system", "content": CALL_SCORE_PROMPT},
        {"role": "user", "content": "\n\n".join(parts)},
    ]


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
