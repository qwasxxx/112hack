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
Верни ТОЛЬКО один JSON, без markdown и без пояснений:
{"situation":"...","address":"...","opening":"...","services":["police"],"caller":"...","phone":"9161234567"}

Жёсткие правила:
- Тема билета = название и уже заполненные поля. Нельзя менять происшествие.
- Если название «драка в лесу» — situation и opening только про драку в лесу. Нельзя писать ДТП, водителя, проспект, скорость.
- Если название «пожар в лесу» — только про огонь/дым в лесу.
- Непустые поля преподавателя копируй дословно.
- situation: 2–3 коротких предложения: что случилось, ориентир на месте, кто звонит (ФИО), телефон, пострадавшие, что уже сделано.
- address: Москва и конкретное место, уместное для названия.
- opening: первая фраза заявителя про то же событие.
- services только из fire, ambulance, police, gas.
- phone — 10 цифр, начинается с 9.
Пиши по-русски, как в реальном билете АГС."""

_SERVICE_HINTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("fire", re.compile(r"пожар|задымл|огонь|горит|возгоран|пламя|торф")),
    ("gas", re.compile(r"\bгаз\b|запах газа|утечк")),
    ("ambulance", re.compile(r"скорая|без сознания|инфаркт|инсульт|ранен|кровотеч|медицин")),
    ("police", re.compile(r"\bдтп\b|драка|кража|ограбл|полиц|убийств|розыск|избиен")),
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
        r"двор|подъезд|квартир",
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
    return normalize_services(requested) or ["police"]


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


def _detail_for(title: str, services: list[str]) -> str:
    text = title.lower().replace("ё", "е")
    if "драка" in text or "изби" in text:
        return "двое или трое бьют человека у тропы, крики, ножей не видно, крови не замечает, просит полицию"
    if "дтп" in text or "авари" in text:
        return "столкнулись две машины, одна на обочине, есть ли пострадавшие — уточняет, проезд затруднён"
    if "краж" in text or "ограб" in text:
        return "незнакомые люди убегают, имущество уносят, пострадавших не видит, направление — к выходу"
    if "пожар" in text or "задым" in text or "fire" in services:
        return "открытое горение и густой дым, ветер на деревья, людей рядом не видит, тушить нечем"
    if "газ" in text or "gas" in services:
        return "сильный запах газа, плиту закрыли, окна открывают, людей выводят на лестницу"
    if "ambulance" in services:
        return "человек без сознания, дышит, вокруг собираются люди, что случилось до этого не видел"
    return "происшествие продолжается, пострадавших уточняет, служб на месте нет"


def _opening_for(title: str, services: list[str]) -> str:
    core = re.sub(r"\s+", " ", title).strip().rstrip(".")
    low = core.lower()
    if low.startswith("драка"):
        rest = core[5:].strip(" ,")
        place = rest or "здесь"
        return f"{place[0].upper() + place[1:] if place else 'Здесь'} дерутся, вызовите полицию"
    if "пожар" in low or "задым" in low:
        return f"{core}, помогите, горит"
    if "дтп" in low:
        return "ДТП, есть пострадавшие, приезжайте"
    if "газ" in low:
        return "Пахнет газом, помогите"
    if "police" in services:
        return f"{core}, вызовите полицию"
    return f"{core}, помогите"


def synthesize_from_draft(services: list[str], note: str, draft: dict[str, str] | None = None) -> dict[str, Any]:
    locked = draft or {}
    title = (locked.get("title") or "").strip()
    wanted = services or ["police"]
    seed = title or note or "билет"
    caller_name, phone = _seed_pick(seed, _CALLERS)
    caller = locked.get("caller") or caller_name
    phone = _normalize_phone(locked.get("phone") or phone)
    address = locked.get("address") or _address_for(title, seed)
    opening = locked.get("opening") or (_opening_for(title, wanted) if title else "Помогите, приезжайте")
    if locked.get("situation"):
        situation = locked["situation"]
    elif title:
        extra = f" {note.strip()}" if note.strip() else ""
        situation = (
            f"{title}. {_detail_for(title, wanted)}. "
            f"Звонит {caller}, {_pretty_phone(phone)}. Служб на месте нет.{extra}"
        ).strip()
    else:
        situation = f"{_detail_for('', wanted)}, звонит {caller}, {_pretty_phone(phone)}"
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
    if draft.get("address") and draft["address"].lower() not in str(parsed.get("address") or "").lower():
        return False
    if draft.get("situation") and draft["situation"] != parsed.get("situation"):
        return False
    return True


def align_ticket_to_title(parsed: dict[str, Any], draft: dict[str, str], wanted: list[str], note: str) -> dict[str, Any]:
    merged = merge_locked(parsed, draft)
    if ticket_matches_draft(merged, draft):
        inferred = infer_services_from_text(draft.get("title") or "", draft.get("situation") or "", note)
        if inferred:
            merged["services"] = inferred
        return merged
    return synthesize_from_draft(wanted, note, draft)


def build_messages(services: list[str], note: str, draft: dict[str, str] | None = None) -> list[dict[str, str]]:
    locked = draft or {}
    title = locked.get("title") or ""
    hint = note.strip()[:240]
    labels = ", ".join(SERVICE_RU[item] for item in services) if services else "по названию"
    skeleton = {
        "situation": locked.get("situation") or "",
        "address": locked.get("address") or "",
        "opening": locked.get("opening") or "",
        "services": services or ["police"],
        "caller": locked.get("caller") or "",
        "phone": "",
    }
    lines = ["/no_think"]
    if title:
        lines.append(f"Название билета (это и есть происшествие): {title}.")
        lines.append("situation и opening обязаны быть про это название. Чужую тему выдумывать нельзя.")
    lines.append(f"Службы: {labels}.")
    if "дтп" not in title.lower() and "police" in services:
        lines.append("Это не ДТП, если в названии нет слова ДТП.")
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
    messages = build_messages(wanted, note, locked)
    try:
        raw = await client.complete_chat(
            messages,
            max_tokens=360,
            temperature=0.55,
            think=False,
            timeout_sec=18.0,
        )
        parsed = parse_ticket_json(raw, wanted, locked)
    except Exception:
        parsed = None
    if parsed is None:
        return synthesize_from_draft(wanted, note, locked)
    return align_ticket_to_title(parsed, locked, wanted, note)
