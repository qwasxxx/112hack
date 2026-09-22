from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sys112_llm.config import REPO_ROOT

Role = Literal["system", "user", "assistant"]
ConversationRole = Literal["victim", "operator"]

KICKOFF_ID = "_kickoff"
KICKOFF_TEXT = "Оператор снял трубку."
TEACHER_NUDGE_TEXT = "Оператор молчит. Заявитель говорит по указанию преподавателя."

ANALYSIS_PROMPT = (
    "/no_think\n"
    "По стенограмме учебного звонка в 112 кратко разбери работу оператора. "
    "Пиши по-русски кириллицей, без markdown, иероглифов и латиницы. "
    "Что получилось, чего не хватило, что уточнить в следующий раз. "
    "Не выдумывай фактов, которых не было в разговоре. "
    "Если заявитель сам назвал суть в начале (пожар, возгорание, ДТП, газ) — не пиши, что оператор не спросил «что случилось»."
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
    "Если заявитель в первой реплике уже назвал суть (пожар, возгорание, ДТП, газ и т.п.) — это не ошибка оператора: не пиши в comment и recommendations, что не спросили «что случилось».\n"
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
- Если спросили «как вас зовут» / имя: назови только имя из контекста. Если в контексте написано, что ты мама/отец и имени нет — скажи «я мама» / «я отец». Никогда не выдумывай Свету, Марию и любые ФИО.
- Как давно это произошло: если в контексте нет времени — скажи «Только что». Не выдумывай часы, полчаса и калечные слова вроде «получика».
- Если оператор не спрашивает, а говорит, что услышал, направляет помощь, службы выезжают, оставайтесь на линии — ответь как живой человек: «хорошо», «скорее», «жду». Никогда не говори «не вижу», «не слышу», «не знаю» на такие фразы.
- Если оператор молчит — одной фразой напомни, что нужна помощь. Сам опрос не веди.

Факты:
- Адрес, имена, телефоны, возраст, этаж, число людей и что произошло — только из блока «Контекст сценария».
- Если в контексте «освещение» или «фонари» — это свет, не пожар. Не говори про квартиру, дым и пламя, если их нет в контексте.
- Если спросили адрес — назови адрес из контекста своими словами. Не говори «не знаю», если адрес в контексте есть.
- Если спросили конкретный факт, которого в контексте нет — «не знаю». Не выдумывай улицы, этажи, имена, телефоны, службы, цифры и время.
- Говори только обычные русские слова. Не коверкай и не сливай слова.

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

_BLANK_SIGHT = re.compile(
    r"^(?:я\s+)?(?:не\s+(?:слышу|вижу|знаю)|непонятно)(?:\s*[,.!]+\s*(?:не\s+(?:слышу|вижу|знаю))*)*[.!]?\s*$",
    re.IGNORECASE,
)
_OPERATOR_ASKS = re.compile(
    r"\?|где|куда|какой|какая|какие|какое|кто|кому|чей|чья|сколько|адрес|телефон|этаж|квартир|"
    r"подъезд|корпус|имя|фио|как\s+вас|пострадав|ранен|горит|что\s+(?:там|случилось|произошло)|"
    r"есть\s+ли|назовите|уточните|повторите",
    re.IGNORECASE,
)
_ASK_NAME = re.compile(r"как вас зовут|ваше имя|как зовут|представьтесь|кто вы\b", re.IGNORECASE)
_ASK_ADDRESS = re.compile(
    r"адрес|где (?:это|вы|находи|происход)|куда ехать|какая улица|какой дом|где случилось",
    re.IGNORECASE,
)
_ASK_WHAT = re.compile(
    r"что (?:там |случилось|произошло|горит)|какой (?:пожар|вызов)",
    re.IGNORECASE,
)
_ASK_PHONE = re.compile(
    r"телефон|номер|сотов|мобильн|перезвон|для связи",
    re.IGNORECASE,
)
_EXTRA_STOP = frozenset(
    "только если спросили назови назовите адрес кто звонит что случилось пострадавший билет ситуация контекст сценария".split()
)
_ASK_WHEN = re.compile(
    r"как давно|давно ли|сколько времени|когда (?:это )?(?:начал|произош|случил|начал)",
    re.IGNORECASE,
)
_HAS_TIME = re.compile(r"только что|минут|час\b|секунд|сейчас происходит|только нача", re.IGNORECASE)
_WORD = re.compile(r"[а-яё]{4,}", re.IGNORECASE)
_OK_WORDS = frozenset(
    """
    алло помогите пожалуйста хорошо ладно жду скорее спасибо да нет сейчас сразу
    только что уже еще ещё там здесь тут около после перед рядом горит дым пожар
    газ вода кровь человек люди женщина мужчина ребенок ребёнок сосед соседи
    дом улица квартира этаж подъезд двор контейнер мусор машина водитель
    адрес телефон имя не знаю вижу слышу понял поняла происходит случилось
    произошло началось выезжают едут помощь скорая полиция пожарные
    находится кажется примерно напротив точно точный помню недалеко вообще
    области города улицы комбинат комбинате комбинатом
    пламя балкон окно крыша подвал запах гарь дымит взорвался упал лежит
    кричит задыхается сознание мчс автобус трамвай метро мост шоссе проспект
    перекресток перекрёсток пострадал пострадавшие никого муж жену дочь сын
    мать отец бабушка дедушка скорее быстрее остаюсь линии частный
    многоквартирный мусорного контейнера
    """.split()
)


def _known_word(word: str, extra_words: set[str]) -> bool:
    if word in _OK_WORDS or word in extra_words:
        return True
    if len(word) < 5:
        return True
    stem = word[:5]
    pool = extra_words | _OK_WORDS
    return any(item.startswith(stem) or stem.startswith(item[:5]) for item in pool if len(item) >= 5)


def reply_has_garbage(text: str, extra: str = "") -> bool:
    extra_words = {item.replace("ё", "е") for item in _WORD.findall((extra or "").lower().replace("ё", "е"))}
    for raw in _WORD.findall(text.lower().replace("ё", "е")):
        if not _known_word(raw, extra_words):
            return True
    return False


def _norm_words(text: str) -> list[str]:
    return _WORD.findall((text or "").lower().replace("ё", "е"))


def field_from_extra(extra: str, label: str) -> str:
    match = re.search(rf"{label}[^:\n]*:\s*(.+)", extra or "", re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).strip().split("\n")[0].strip()


def reply_uses_ticket_facts(text: str, extra: str) -> bool:
    extra_words = {
        item
        for item in _norm_words(extra)
        if item not in _EXTRA_STOP and item not in _OK_WORDS and len(item) >= 5
    }
    if not extra_words:
        return False
    hits = 0
    for word in _norm_words(text):
        if _known_word(word, extra_words) and any(
            item.startswith(word[:5]) or word.startswith(item[:5]) for item in extra_words if len(item) >= 5
        ):
            hits += 1
            if hits >= 2:
                return True
    return False


def fact_for_question(operator_text: str, extra: str) -> str:
    if _ASK_ADDRESS.search(operator_text or ""):
        return field_from_extra(extra, "АДРЕС")
    if _ASK_PHONE.search(operator_text or ""):
        return field_from_extra(extra, "ТЕЛЕФОН")
    if _ASK_WHAT.search(operator_text or ""):
        return field_from_extra(extra, "ЧТО СЛУЧИЛОСЬ")
    return ""


def repair_caller_name(reply: str, operator_text: str, extra: str) -> str:
    if not _ASK_NAME.search(operator_text or ""):
        return ""
    extra_l = (extra or "").lower()
    if "мама" in extra_l and re.search(r"имени заявителя нет|не выдумывай", extra_l):
        if re.search(r"\bмама\b", reply, re.IGNORECASE) and not re.search(
            r"зовут\s+[а-яё]{3,}", reply, re.IGNORECASE
        ):
            return ""
        return "Я мама."
    if "отец" in extra_l and re.search(r"имени", extra_l):
        return "Я отец."
    return ""


def repair_topic_shift(reply: str, extra: str) -> str:
    extra_l = (extra or "").lower()
    if "освещен" in extra_l and re.search(r"пожар|квартир|пламя|\bдым\b", reply, re.IGNORECASE):
        what = field_from_extra(extra, "ЧТО СЛУЧИЛОСЬ")
        if what:
            return what.split(".")[0].strip() + "."
    if "квартир" not in extra_l and re.search(r"квартир", reply, re.IGNORECASE):
        what = field_from_extra(extra, "ЧТО СЛУЧИЛОСЬ")
        if what:
            return what.split(".")[0].strip() + "."
    return ""


def last_user_text(session: CallSession) -> str:
    for item in reversed(session.messages):
        if item.role == "user":
            return item.content
    return ""


def repair_victim_reply(
    reply: str,
    operator_text: str,
    role: ConversationRole,
    extra: str = "",
) -> str:
    text = (reply or "").strip()
    if role != "victim" or not text:
        return text
    op = operator_text or ""
    garbage = reply_has_garbage(text, extra)
    blank = bool(_BLANK_SIGHT.match(text))
    grounded = reply_uses_ticket_facts(text, extra)
    when = bool(_ASK_WHEN.search(op))
    if when and (garbage or blank or not _HAS_TIME.search(extra or "")):
        return "Только что."
    named = repair_caller_name(text, op, extra)
    if named:
        return named
    shifted = repair_topic_shift(text, extra)
    if shifted:
        return shifted
    ticket_fact = fact_for_question(op, extra)
    if ticket_fact and (blank or garbage or not grounded):
        return ticket_fact
    if grounded:
        return text
    if blank or garbage:
        if _OPERATOR_ASKS.search(op) or when:
            return "Не знаю."
        return "Хорошо, жду."
    return text


def session_scenario_extra(session: CallSession) -> str:
    if not session.messages or session.messages[0].role != "system":
        return ""
    return _scenario_extra(session.messages[0].content, locked_system_prompt(session.conversation_role))


_INTERVENTION_HINTS = {
    "set_emotional_state": "С этой реплики говори панически, зло или растерянно — как в указании. Короче, сбивчиво. Адрес, ФИО и телефон из билета не меняй. Сейчас скажи одну фразу в новом тоне.",
    "add_circumstance": "Появилось новое обстоятельство из указания преподавателя. Сейчас скажи его вслух одной фразой. Старые факты билета оставь.",
    "inject_event": "Прямо сейчас внезапное событие из указания. Скажи об этом сам, рвано, можно «алло». Новые факты только из указания, адрес и ФИО билета не выдумывай заново.",
    "reveal_fact": "Теперь можно назвать точный факт из контекста сценария, если оператор спрашивает.",
    "conceal_fact": "Пока не называй точный адрес и ФИО, пока оператор не переспросит дважды.",
    "adjust_difficulty": "Путай адрес и детали, пока оператор спокойно не уточнит. Факты билета не заменяй на другие.",
    "force_state": "Фаза сценария сменилась по указанию преподавателя. Держись новой обстановки. Эталонные адрес, телефон и ФИО не ломай, если указание их не меняет.",
    "end_call": "Разговор пора заканчивать. Коротко попрощайся, новых фактов не добавляй.",
}

_SPEAK_NOW = frozenset(
    {"set_emotional_state", "add_circumstance", "inject_event", "force_state", "adjust_difficulty"}
)


def should_speak_intervention(command: str) -> bool:
    return command in _SPEAK_NOW


def apply_teacher_intervention(session: CallSession, command: str, note: str = "") -> str:
    hint = _INTERVENTION_HINTS.get(command, "Следуй указанию преподавателя.")
    extra_note = " ".join((note or "").split()).strip()
    line = f"{hint} {extra_note}".strip() if extra_note else hint
    extra = session_scenario_extra(session)
    extra = f"{extra}\nУКАЗАНИЕ ПРЕПОДАВАТЕЛЯ: {line}".strip()
    if session.messages and session.messages[0].role == "system":
        session.messages[0].content = build_system_prompt(session.conversation_role, extra)
    return line


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
    emitted: bool = False

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
        if item.content in {KICKOFF_TEXT, TEACHER_NUDGE_TEXT}:
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
