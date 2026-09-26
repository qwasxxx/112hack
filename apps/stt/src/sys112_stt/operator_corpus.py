from __future__ import annotations

from typing import TypedDict

OPERATOR_STT_CORPUS = [
    "Алло, меня слышно?",
    "Что случилось?",
    "Где вы находитесь?",
    "Назовите точный адрес.",
    "Есть пострадавшие?",
    "Сколько пострадавших?",
    "Он в сознании?",
    "Он дышит?",
    "Повторите, пожалуйста.",
    "Улица Ленина, дом пятнадцать.",
    "Скорая уже едет.",
    "Пожарные выехали.",
    "Оставайтесь на линии.",
    "Да.",
    "Нет.",
    "Один.",
    "Двое.",
    "Адрес?",
    "Где?",
    "Кто?",
    "Сколько?",
    "112",
    "дом 15",
    "квартира 27",
    "МЧС",
    "ДТП",
    "Улица Ленина, дом пять.",
    "Адрес... улица Ленина, дом пять.",
]

OPERATOR_STT_REJECTED = [
    "Thank you",
    "Okay",
    "Can you hear me?",
    "Hello",
]

OPERATOR_STT_MIXED = [
    ("А что случилось? Thank you.", "А что случилось?"),
    ("Сколько пострадавших? Okay.", "Сколько пострадавших?"),
    ("Где вы? Okay.", "Где вы?"),
]


class BenchItem(TypedDict):
    id: str
    text: str
    tags: list[str]
    street: str
    house: str
    apartment: str
    injured: str
    terms: list[str]


def _item(
    item_id: str,
    text: str,
    tags: list[str],
    *,
    street: str = "",
    house: str = "",
    apartment: str = "",
    injured: str = "",
    terms: list[str] | None = None,
) -> BenchItem:
    return {
        "id": item_id,
        "text": text,
        "tags": tags,
        "street": street,
        "house": house,
        "apartment": apartment,
        "injured": injured,
        "terms": terms or [],
    }


# Phase 1 phrases plus Moscow / emergency terminology from AGS tickets.
OPERATOR_STT_BENCHMARK: list[BenchItem] = [
    _item("short_da", "Да.", ["short", "clean"]),
    _item("short_net", "Нет.", ["short", "clean", "negation"]),
    _item("short_odin", "Один.", ["short", "clean", "number"], injured="1"),
    _item("short_dvoe", "Двое.", ["short", "clean", "number"], injured="2"),
    _item("short_gde", "Где?", ["short", "clean"]),
    _item("short_kto", "Кто?", ["short", "clean"]),
    _item("short_skolko", "Сколько?", ["short", "clean"]),
    _item("short_address_q", "Адрес?", ["short", "clean"]),
    _item("short_112", "112", ["short", "clean", "number"]),
    _item("short_mchs", "МЧС", ["short", "clean"], terms=["мчс"]),
    _item("short_dtp", "ДТП", ["short", "clean"], terms=["дтп"]),
    _item("q_what", "Что случилось?", ["short", "clean"]),
    _item("q_where", "Где вы находитесь?", ["short", "clean"]),
    _item("q_injured", "Есть пострадавшие?", ["short", "clean", "medical"], injured="ask", terms=["пострадавши"]),
    _item("q_injured_count", "Сколько пострадавших?", ["short", "clean", "medical"], injured="ask"),
    _item("q_conscious", "Он в сознании?", ["short", "clean", "medical"], terms=["сознани"]),
    _item("q_breathes", "Он дышит?", ["short", "clean", "medical"], terms=["дыши"]),
    _item("q_repeat", "Повторите, пожалуйста.", ["short", "clean"]),
    _item("ack_stay", "Оставайтесь на линии.", ["short", "clean"]),
    _item("svc_ambulance", "Скорая уже едет.", ["short", "clean", "medical"], terms=["скорая"]),
    _item("svc_fire", "Пожарные выехали.", ["short", "clean", "fire"], terms=["пожарн"]),
    _item("addr_lenina_15", "Улица Ленина, дом пятнадцать.", ["long", "clean", "address"], street="ленина", house="15"),
    _item("addr_lenina_5", "Улица Ленина, дом пять.", ["long", "clean", "address"], street="ленина", house="5"),
    _item(
        "addr_leningradsky",
        "Ленинградский проспект, дом тридцать семь, корпус два.",
        ["long", "clean", "address"],
        street="ленинградск",
        house="37",
    ),
    _item(
        "addr_apt_entrance",
        "Квартира двадцать семь, третий подъезд.",
        ["long", "clean", "address"],
        apartment="27",
    ),
    _item("addr_house_apt", "дом 15, квартира 27", ["short", "clean", "address", "number"], house="15", apartment="27"),
    _item(
        "addr_berzarina",
        "Москва, улица Берзарина, дом 21, корпус 1, квартира 68.",
        ["long", "clean", "address"],
        street="берзарина",
        house="21",
        apartment="68",
    ),
    _item(
        "addr_leontiev",
        "Москва, Леонтьевский переулок, дом 16, строение 1.",
        ["long", "clean", "address"],
        street="леонтьевск",
        house="16",
    ),
    _item(
        "addr_tsyurupy",
        "Москва, улица Цюрупы, дом 12, корпус 6.",
        ["long", "clean", "address"],
        street="цюрупы",
        house="12",
    ),
    _item(
        "addr_zhukova",
        "Проспект Маршала Жукова, дом 20, корпус 2, квартира 57.",
        ["long", "clean", "address"],
        street="жукова",
        house="20",
        apartment="57",
    ),
    _item(
        "addr_kirovograd",
        "Улица Кировоградская, дом 15.",
        ["long", "clean", "address"],
        street="кировоград",
        house="15",
    ),
    _item("fire_open", "Горит балкон, открытое пламя.", ["fire", "clean"], terms=["горит", "пламя"]),
    _item("fire_smoke", "Задымление мусоропровода, открытого пламени нет.", ["fire", "clean", "negation"], terms=["задымлен"]),
    _item("fire_none_injured", "Пожар, пострадавших нет.", ["fire", "clean", "negation"], injured="none", terms=["пожар"]),
    _item("traffic_dtp", "ДТП, водитель заблокирован.", ["traffic", "clean"], terms=["дтп"]),
    _item("traffic_five", "Пять пострадавших с травмами.", ["traffic", "clean", "medical"], injured="5", terms=["пострадавши"]),
    _item("gas_smell", "Пахнет газом, не включайте свет.", ["gas", "clean"], terms=["газ"]),
    _item("gas_pipe", "Свистит газовая труба на вводе в дом.", ["gas", "clean"], terms=["газ"]),
    _item("water_drown", "Тонет человек, кричит о помощи.", ["water", "clean"], terms=["тонет"]),
    _item("med_unconscious", "Женщина без сознания, не дышит.", ["medical", "clean", "negation"], terms=["сознания", "дыши"]),
    _item("neg_no_injured", "Пострадавших нет.", ["short", "clean", "negation"], injured="none"),
    _item("neg_has_injured", "Есть пострадавшие.", ["short", "clean"], injured="yes", terms=["пострадавши"]),
]


AMBIENCE_SUBSET_IDS = [
    "short_da",
    "short_net",
    "q_injured",
    "neg_no_injured",
    "neg_has_injured",
    "addr_lenina_15",
    "addr_berzarina",
    "fire_open",
    "traffic_dtp",
    "gas_smell",
    "svc_ambulance",
    "q_breathes",
]
