from __future__ import annotations

import re
import unicodedata

_WORD = re.compile(r"[а-яё0-9]+", re.IGNORECASE)
_DIGIT = re.compile(r"\d+")

_WORD_NUM = {
    "ноль": "0",
    "один": "1",
    "одна": "1",
    "два": "2",
    "две": "2",
    "три": "3",
    "четыре": "4",
    "пять": "5",
    "шесть": "6",
    "семь": "7",
    "восемь": "8",
    "девять": "9",
    "десять": "10",
    "одиннадцать": "11",
    "двенадцать": "12",
    "тринадцать": "13",
    "четырнадцать": "14",
    "пятнадцать": "15",
    "шестнадцать": "16",
    "семнадцать": "17",
    "восемнадцать": "18",
    "девятнадцать": "19",
    "двадцать": "20",
    "двадцатьодин": "21",
    "двадцатьпять": "25",
    "двадцатьсемь": "27",
}


def fold_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", text or "").lower().replace("ё", "е")
    value = re.sub(r"[^\wа-яе0-9]+", " ", value, flags=re.IGNORECASE)
    return " ".join(value.split())


def words(text: str) -> list[str]:
    return _WORD.findall(fold_text(text))


def _levenshtein(left: list[str], right: list[str]) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    prev = list(range(len(right) + 1))
    for i, a in enumerate(left, start=1):
        cur = [i]
        for j, b in enumerate(right, start=1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if a == b else 1)
            cur.append(min(ins, delete, sub))
        prev = cur
    return prev[-1]


def wer(reference: str, hypothesis: str) -> float:
    ref = words(reference)
    hyp = words(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return _levenshtein(ref, hyp) / len(ref)


def cer(reference: str, hypothesis: str) -> float:
    ref = list(fold_text(reference).replace(" ", ""))
    hyp = list(fold_text(hypothesis).replace(" ", ""))
    if not ref:
        return 0.0 if not hyp else 1.0
    return _levenshtein(ref, hyp) / len(ref)


def _normalize_number(token: str) -> str:
    compact = token.replace(" ", "")
    mapped = _WORD_NUM.get(compact, compact)
    digits = "".join(_DIGIT.findall(mapped))
    return digits or mapped


def critical_errors(item: dict, hypothesis: str) -> list[str]:
    hyp = fold_text(hypothesis)
    refs = fold_text(str(item.get("text") or ""))
    found: list[str] = []
    street = fold_text(str(item.get("street") or ""))
    if street and street not in hyp:
        found.append("wrong_street")
    house = str(item.get("house") or "")
    if house:
        if _normalize_number(house) not in "".join(_DIGIT.findall(hyp)) and fold_text(house) not in hyp:
            # word form in hyp
            word_ok = any(_normalize_number(token) == house for token in hyp.split())
            if not word_ok:
                found.append("wrong_house")
    apartment = str(item.get("apartment") or "")
    if apartment:
        word_ok = apartment in "".join(_DIGIT.findall(hyp)) or any(
            _normalize_number(token) == apartment for token in hyp.split()
        )
        if not word_ok:
            found.append("wrong_apartment")
    injured = str(item.get("injured") or "")
    if injured == "none":
        if "нет" not in hyp and "отсутств" not in hyp:
            found.append("injured_negation")
        if re.search(r"\bесть пострадав", hyp) and "нет" in refs:
            found.append("есть_vs_нет")
    if injured == "yes":
        if "нет" in hyp and "есть" not in hyp:
            found.append("есть_vs_нет")
    if injured.isdigit() and injured not in "".join(_DIGIT.findall(hyp)):
        word_ok = any(_normalize_number(token) == injured for token in hyp.split())
        if not word_ok:
            found.append("wrong_victim_count")
    if "есть пострадав" in refs and "нет пострадав" in hyp:
        found.append("есть_vs_нет")
    if "пострадавших нет" in refs and re.search(r"есть пострадав", hyp):
        found.append("есть_vs_нет")
    for term in item.get("terms") or []:
        needle = fold_text(str(term))
        if needle and needle not in hyp:
            found.append(f"missing_term:{needle}")
    return list(dict.fromkeys(found))
