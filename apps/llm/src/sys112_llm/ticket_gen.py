from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from sys112_llm.client import LlamaClient, strip_reasoning

SERVICES = ("fire", "ambulance", "police", "gas")
SERVICE_RU = {
    "fire": "пожар",
    "ambulance": "скорая",
    "police": "полиция",
    "gas": "газ",
}

_TICKET_PROMPT = """Ты методист АГС службы 112 Москвы. Составляешь учебный билет оператора.
Верни ТОЛЬКО один JSON, одной строкой, без markdown:
{"situation":"...","address":"...","opening":"...","services":["ambulance"],"caller":"...","phone":"9161234567"}

Тема билета — название. Детали (что видит заявитель, пострадавшие, что уже сделано) придумай сам под ЭТО название.
Не копируй чужие сюжеты. Нельзя добавлять пожар, дым, ДТП, драку, газ, если этого нет в названии и заполненных полях.
Непустые поля преподавателя копируй дословно. Пустые заполни.

situation: 2–3 коротких предложения: событие из названия, ориентир, ФИО заявителя, телефон, пострадавшие, службы на месте.
address: Москва, место уместное для названия.
opening: первая фраза заявителя про то же событие.
services: только fire, ambulance, police, gas — по смыслу названия, не по шаблону.
phone: 10 цифр, начинается с 9.
Пиши по-русски, как в реальном билете АГС."""

_SERVICE_HINTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("fire", re.compile(r"пожар|задымл|огонь|горит|возгоран|пламя|торф")),
    ("gas", re.compile(r"\bгаз\b|запах газа|утечк")),
    ("ambulance", re.compile(
        r"скорая|без сознания|инфаркт|инсульт|ранен|кровотеч|медицин|"
        r"выпал|упал|паден|из окна|с этажа|не дышит|потерял сознание"
    )),
    ("police", re.compile(r"\bдтп\b|драка|кража|ограбл|полиц|убийств|розыск|избиен")),
)

_OFFTOPIC = (
    (re.compile(r"пожар|горен|густой дым|тушить|пламя|задымл|огонь|горит"), re.compile(r"пожар|задым|огонь|горит|пламя|торф")),
    (re.compile(r"\bдтп\b|водитель потерял|варшавск"), re.compile(r"дтп|авари|водитель")),
    (re.compile(r"дерут|драка"), re.compile(r"драка|избиен")),
    (re.compile(r"\bгаз\b|запах газа"), re.compile(r"\bгаз\b|утечк")),
)

_STOPWORDS = {
    "этот",
    "этой",
    "этом",
    "билет",
    "когда",
    "после",
    "между",
    "около",
    "если",
    "или",
    "для",
    "при",
    "без",
    "над",
    "под",
    "звонит",
}

_CALLERS = (
    ("Козлов Андрей Петрович", "9162401188"),
    ("Морозова Елена Викторовна", "9165512034"),
    ("Савельев Игорь Николаевич", "9167734091"),
    ("Петрова Анна Сергеевна", "9163201122"),
    ("Иванов Пётр Иванович", "9161263471"),
    ("Сидорова Мария Алексеевна", "9168975623"),
    ("Орлов Дмитрий Васильевич", "9164587702"),
    ("Кузнецова Ольга Игоревна", "9166348890"),
)

_PLACE_ADDRESSES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        r"лес|лесопарк|роща|бор",
        (
            "Москва, лесопарк Кузьминки, близ ул. Головачёва",
            "Москва, Битцевский лес, вход со стороны Балаклавского проспекта",
            "Москва, национальный парк Лосиный Остров, Яузская аллея",
            "Москва, Серебряный Бор, Таманская улица, у пляжа",
        ),
    ),
    (
        r"мкад",
        (
            "Москва, МКАД, 47 километр, внешняя сторона",
            "Москва, МКАД, 21 километр, внутренняя сторона",
        ),
    ),
    (
        r"двор|подъезд|квартир|окно|этаж",
        (
            "Москва, ул. Народного Ополчения, дом 22, корп. 1, под. 2",
            "Москва, Бульвар Маршала Рокоссовского, дом 25, двор",
        ),
    ),
    (
        r"метро|станци",
        (
            "Москва, станция метро Щёлковская, вестибюль",
            "Москва, станция метро Выхино, выход к Вешняковской",
        ),
    ),
)

_DEFAULT_ADDRESSES = (
    "Москва, ул. Берзарина, дом 21, корп. 1",
    "Москва, ул. Грина, дом 11, двор",
    "Москва, Коломенская набережная, дом 18",
    "Москва, ул. Смольная, дом 15, корп. 3",
)


def normalize_services(raw: Any) -> list[str]:
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.replace(",", " ").split()]
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key in {"пожар", "fire", "пожарные"}:
            key = "fire"
        elif key in {"медицина", "скорая", "ambulance"}:
            key = "ambulance"
        elif key in {"полиция", "дтп", "police"}:
            key = "police"
        elif key in {"газ", "gas", "газовая"}:
            key = "gas"
        if key in SERVICES and key not in out:
            out.append(key)
    return out


def infer_services_from_text(*parts: str) -> list[str]:
    text = " ".join(str(part) for part in parts if part).lower().replace("ё", "е")
    found: list[str] = []
    for key, pattern in _SERVICE_HINTS:
        if pattern.search(text) and key not in found:
            found.append(key)
    return found


def resolve_services(requested: Any, draft: dict[str, str] | None, note: str = "") -> list[str]:
    locked = draft or {}
    inferred = infer_services_from_text(
        locked.get("title") or "",
        locked.get("situation") or "",
        locked.get("opening") or "",
        note,
    )
    if inferred:
        return inferred
    requested_norm = normalize_services(requested)
    if (locked.get("title") or "").strip():
        return []
    return requested_norm or ["police"]


def title_keywords(title: str) -> list[str]:
    words = re.findall(r"[а-яё]{4,}", (title or "").lower().replace("ё", "е"))
    return [word for word in words if word not in _STOPWORDS]


def title_reflected(text: str, title: str) -> bool:
    keys = title_keywords(title)
    if not keys:
        return True
    blob = (text or "").lower().replace("ё", "е")
    hits = sum(1 for word in keys if word in blob)
    need = 1 if len(keys) == 1 else max(2, (len(keys) + 1) // 2)
    return hits >= min(need, len(keys))


def situation_on_topic(text: str, title: str) -> bool:
    blob = f"{text} {title}".lower().replace("ё", "е")
    title_l = (title or "").lower().replace("ё", "е")
    for junk, allowed in _OFFTOPIC:
        if junk.search(blob) and not allowed.search(title_l):
            return False
    return True


def draft_from_payload(payload: dict[str, Any] | None) -> dict[str, str]:
    data = payload or {}
    return {
        "title": str(data.get("title") or "").strip()[:180],
        "situation": str(data.get("situation") or data.get("description") or "").strip()[:500],
        "address": str(data.get("address") or data.get("location") or "").strip()[:300],
        "opening": str(data.get("opening") or data.get("callerOpening") or "").strip()[:180],
        "caller": str(data.get("caller") or "").strip()[:80],
        "classifier": str(data.get("classifier") or data.get("classifierNumber") or "").strip()[:24],
        "difficulty": str(data.get("difficulty") or "").strip()[:40],
    }


def _pretty_phone(phone: str) -> str:
    if len(phone) == 10:
        return f"{phone[0:3]}-{phone[3:6]}-{phone[6:8]}-{phone[8:10]}"
    return phone


def _normalize_phone(raw: Any) -> str:
    phone = re.sub(r"\D", "", str(raw or ""))
    if len(phone) == 11 and phone.startswith("8"):
        phone = "7" + phone[1:]
    if len(phone) == 11 and phone.startswith("7"):
        phone = phone[1:]
    if len(phone) > 10:
        phone = phone[-10:]
    return phone if len(phone) == 10 and phone.startswith("9") else phone


def parse_ticket_json(raw: str, fallback_services: list[str], draft: dict[str, str] | None = None) -> dict[str, Any]:
    text = strip_reasoning(raw or "")
    match = re.search(r"\{.*\}", text, re.DOTALL)
    data: dict[str, Any] = {}
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = {}
    locked = draft or {}
    services = normalize_services(data.get("services")) or list(fallback_services)
    if not services:
        services = ["police"]
    situation = str(locked.get("situation") or data.get("situation") or "").strip()
    address = str(locked.get("address") or data.get("address") or "").strip()
    opening = str(locked.get("opening") or data.get("opening") or "").strip()
    caller = str(locked.get("caller") or data.get("caller") or "").strip()
    phone = _normalize_phone(data.get("phone"))
    if phone and phone not in re.sub(r"\D", "", situation):
        situation = f"{situation}, {_pretty_phone(phone)}".strip(", ")
    if not situation:
        title = locked.get("title") or ""
        if title:
            situation = title
        else:
            raise ValueError("empty situation")
    if not address:
        raise ValueError("empty address")
    if "москв" not in address.lower():
        address = f"Москва, {address}"
    if not opening:
        opening = (locked.get("title") or situation).split(",")[0][:80]
    return {
        "situation": situation[:720],
        "address": address[:300],
        "opening": opening[:180],
        "services": services,
        "caller": caller[:80],
        "phone": phone,
        "source": "local",
    }


def _seed_pick(seed: str, items: tuple[Any, ...] | list[Any]) -> Any:
    digest = hashlib.md5(seed.encode("utf-8")).hexdigest()
    return items[int(digest, 16) % len(items)]


def _address_for(title: str, seed: str) -> str:
    blob = title.lower()
    for pattern, options in _PLACE_ADDRESSES:
        if re.search(pattern, blob, re.IGNORECASE):
            return _seed_pick(seed, options)
    return _seed_pick(seed, _DEFAULT_ADDRESSES)


def synthesize_from_draft(services: list[str], note: str, draft: dict[str, str] | None = None) -> dict[str, Any]:
    locked = draft or {}
    title = (locked.get("title") or "").strip()
    wanted = resolve_services(services, locked, note)
    seed = title or note or "билет"
    caller_name, phone = _seed_pick(seed, _CALLERS)
    caller = locked.get("caller") or caller_name
    phone = _normalize_phone(locked.get("phone") or phone)
    address = locked.get("address") or _address_for(title, seed)
    core = re.sub(r"\s+", " ", title).strip().rstrip(".")
    opening = locked.get("opening") or (f"{core}, помогите" if core else "Помогите, приезжайте")
    if locked.get("situation"):
        situation = locked["situation"]
    elif title:
        extra = f" {note.strip()}" if note.strip() else ""
        situation = f"{title}. Звонит {caller}, {_pretty_phone(phone)}. Служб на месте нет.{extra}".strip()
    else:
        label = SERVICE_RU.get(wanted[0], "112") if wanted else "112"
        situation = f"Вызов: {label}. Звонит {caller}, {_pretty_phone(phone)}"
    if phone and phone not in re.sub(r"\D", "", situation):
        situation = f"{situation}, {_pretty_phone(phone)}"
    return {
        "situation": situation[:720],
        "address": address[:300],
        "opening": opening[:180],
        "services": wanted,
        "caller": caller[:80],
        "phone": phone,
        "source": "mock",
    }


def mock_ticket(services: list[str], note: str, draft: dict[str, str] | None = None) -> dict[str, Any]:
    return synthesize_from_draft(services, note, draft)


def merge_locked(parsed: dict[str, Any], draft: dict[str, str]) -> dict[str, Any]:
    out = dict(parsed)
    if draft.get("situation"):
        out["situation"] = draft["situation"]
    if draft.get("address"):
        out["address"] = draft["address"]
    if draft.get("opening"):
        out["opening"] = draft["opening"]
    if draft.get("caller"):
        out["caller"] = draft["caller"]
    return out


def ticket_matches_draft(parsed: dict[str, Any], draft: dict[str, str]) -> bool:
    title = (draft.get("title") or "").strip()
    blob = f"{parsed.get('situation') or ''} {parsed.get('opening') or ''}"
    if title and not title_reflected(blob, title):
        return False
    if title and not situation_on_topic(blob, title):
        return False
    if draft.get("address") and draft["address"].lower() not in str(parsed.get("address") or "").lower():
        return False
    if draft.get("situation") and draft["situation"] != parsed.get("situation"):
        return False
    return True


def _finalize_ticket(parsed: dict[str, Any], draft: dict[str, str], wanted: list[str], note: str) -> dict[str, Any]:
    merged = merge_locked(parsed, draft)
    inferred = infer_services_from_text(
        draft.get("title") or "",
        merged.get("situation") or "",
        merged.get("opening") or "",
        note,
    )
    if inferred:
        merged["services"] = inferred
    elif wanted:
        merged["services"] = wanted
    merged["source"] = "local"
    return merged


def align_ticket_to_title(parsed: dict[str, Any], draft: dict[str, str], wanted: list[str], note: str) -> dict[str, Any]:
    merged = merge_locked(parsed, draft)
    if ticket_matches_draft(merged, draft):
        return _finalize_ticket(merged, draft, wanted, note)
    return synthesize_from_draft(wanted, note, draft)


def build_messages(services: list[str], note: str, draft: dict[str, str] | None = None) -> list[dict[str, str]]:
    locked = draft or {}
    title = locked.get("title") or ""
    hint = note.strip()[:240]
    skeleton = {
        "situation": locked.get("situation") or "",
        "address": locked.get("address") or "",
        "opening": locked.get("opening") or "",
        "services": services,
        "caller": locked.get("caller") or "",
        "phone": "",
    }
    lines = ["/no_think"]
    if title:
        lines.append(f"Название билета (это и есть происшествие): {title}.")
        lines.append("Придумай правдоподобные детали только про это название. Чужую тему выдумывать нельзя.")
    if services:
        labels = ", ".join(SERVICE_RU[item] for item in services)
        lines.append(f"Службы по смыслу названия: {labels}. Не подменяй ими сюжет.")
    else:
        lines.append("Службы подбери сам по названию: fire, ambulance, police, gas.")
    if locked.get("difficulty"):
        lines.append(f"Сложность: {locked['difficulty']}.")
    labels_ru = {
        "situation": "суть",
        "address": "адрес",
        "opening": "первая фраза",
        "caller": "заявитель",
        "phone": "телефон",
    }
    filled = [labels_ru[key] for key in ("situation", "address", "opening", "caller") if locked.get(key)]
    empty = [labels_ru[key] for key in ("situation", "address", "opening", "caller", "phone") if not locked.get(key)]
    if filled:
        lines.append("Уже заполнено, копируй дословно: " + ", ".join(filled) + ".")
    if empty:
        lines.append("Придумай только пустые поля: " + ", ".join(empty) + ".")
    if hint:
        lines.append(f"Указание преподавателя: {hint}.")
    lines.append("Каркас JSON, пустые строки заполни:")
    lines.append(json.dumps(skeleton, ensure_ascii=False))
    return [
        {"role": "system", "content": _TICKET_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]


def build_repair_messages(
    bad: dict[str, Any],
    services: list[str],
    note: str,
    draft: dict[str, str],
) -> list[dict[str, str]]:
    title = (draft.get("title") or "").strip()
    lines = [
        "/no_think",
        f"Название билета: {title}.",
        "Ты сменил тему. Это ошибка. Верни новый JSON строго про название.",
        "Нельзя писать пожар, дым, горение, ДТП, водителя, драку, газ — если этого нет в названии.",
        f"Твой прошлый situation: {str(bad.get('situation') or '')[:280]}",
        f"Твой прошлый opening: {str(bad.get('opening') or '')[:120]}",
    ]
    if note.strip():
        lines.append(f"Указание преподавателя: {note.strip()[:240]}.")
    lines.append("Верни один JSON, одной строкой.")
    return [
        {"role": "system", "content": _TICKET_PROMPT},
        {"role": "user", "content": "\n".join(lines)},
    ]


async def _complete_ticket(
    client: LlamaClient,
    messages: list[dict[str, str]],
    wanted: list[str],
    locked: dict[str, str],
    *,
    timeout_sec: float,
) -> dict[str, Any] | None:
    try:
        raw = await client.complete_chat(
            messages,
            max_tokens=400,
            temperature=0.6,
            think=False,
            timeout_sec=timeout_sec,
        )
        return parse_ticket_json(raw, wanted, locked)
    except Exception:
        return None


async def generate_ticket(
    client: LlamaClient,
    *,
    services: list[str],
    note: str,
    mock: bool,
    ready: bool,
    draft: dict[str, str] | None = None,
) -> dict[str, Any]:
    locked = draft or {}
    wanted = resolve_services(services, locked, note)
    if mock or not ready:
        return synthesize_from_draft(wanted, note, locked)
    parsed = await _complete_ticket(
        client,
        build_messages(wanted, note, locked),
        wanted,
        locked,
        timeout_sec=22.0,
    )
    if parsed and ticket_matches_draft(merge_locked(parsed, locked), locked):
        return _finalize_ticket(parsed, locked, wanted, note)
    if parsed and locked.get("title"):
        repaired = await _complete_ticket(
            client,
            build_repair_messages(parsed, wanted, note, locked),
            wanted,
            locked,
            timeout_sec=14.0,
        )
        if repaired and ticket_matches_draft(merge_locked(repaired, locked), locked):
            return _finalize_ticket(repaired, locked, wanted, note)
    return synthesize_from_draft(wanted, note, locked)
