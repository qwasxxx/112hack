#!/usr/bin/env python3
"""Build compact ARM-112 classifier runtime JSON from the spreadsheet dump.

Source of truth: Классификатор_происшествий_v_046_*.xlsx / Лист1
This script does not invent relations. It copies sheet/row/column lineage.

Usage:
  python3 apps/student-web/scripts/generate-classifier-runtime.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DUMP = ROOT / "src/features/arm112-simulator/data/classifier-v046.json"
OUT = ROOT / "src/features/arm112-simulator/data/classifier-runtime.json"

NO_RESPONSE = re.compile(r"^\s*нет\s+реагирования\s*$", re.I)
CARD_COPY = re.compile(r"^\s*карт[оч]{1,3}ка\s*-?\s*11[23]\s*$", re.I)

# ARM screenshot short names, only when a spreadsheet block/label identifies the same service.
DISPLAY_RULES = [
    ("label_prefix", "Служба 101", "Служба 101", "xlsx c15/c16 label «Служба 101»"),
    ("parent", "Классификатор МВД", "Служба 102", "xlsx «Классификатор МВД»; ARM screenshot footer «Служба 102»"),
    ("parent", "Классификатор СМП", "Служба 103", "xlsx «Классификатор СМП»; ARM screenshot modal «Служба 103 (...)»"),
    ("parent", "Классификатор МОСГАЗ", "Служба 104", "xlsx «Классификатор МОСГАЗ»; ARM screenshot «Служба 104»"),
    ("parent", "ЦЭМП", "ЦЭМП", "xlsx parentBlock ЦЭМП"),
    ("label", "ЦОДД", "ЦОДД", "xlsx column ЦОДД"),
    ("parent", "Мослифт", "Мослифт", "xlsx parentBlock Мослифт"),
    ("parent", "Деп. ЖКХ", "Деп. ЖКХ", "xlsx parentBlock Деп. ЖКХ"),
    ("parent", "Гор. Хозяйство", "Деп. ЖКХ", "xlsx Гор. Хозяйство; ARM screenshot chip Деп. ЖКХ"),
    ("parent", "Департамент РБиПК", "Мос.Без.", "xlsx Департамент РБиПК; ARM screenshot Мос.Без."),
    ("label", "Дежурная служба АРМ-112", "Мос.Без.", "xlsx Дежурная служба АРМ-112; ARM screenshot Мос.Без."),
    ("parent", "ФСБ", "ФСБ", "xlsx Классификатор ФСБ; ARM screenshot modal ФСБ"),
    ("parent", "ОДС ПСЦ", "ОДС ПСЦ", "xlsx column ОДС ПСЦ"),
    ("label", "МГПСС", "МГПСС", "xlsx column МГПСС"),
]

# Главная служба codes as they appear in c14 → classifier parent block in the same workbook.
MAIN_SERVICE_BLOCK = {
    "MCHS": "Классификатор МЧС",
    "Police": "Классификатор МВД",
    "AMBULANCE": "Классификатор СМП",
    "MOSGAZ": "Классификатор МОСГАЗ",
    "MOSLIFT": "Мослифт",
    "AUTOROADS": "Автомобильные дороги",
    "MOSVODOCANAL": "Мосводоканал",
    "METRO": "Метро",
    "OEK": "ОЭК",
    "MOSGORTRANS": "Мосгортранс",
    "MOESK": "МОЭСК",
    "MOEK": "МОЭК",
    "MZD": "РЖД",
    "MGTS": "МГТС",
    "MOSVODOSTOK": "Мосводосток",
    "MOSCOLLECTOR": "Москоллектор",
    "GORMOST": "ГОРМОСТ",
    "GKH": "Гор. Хозяйство",
    "ZODD": "ЦОДД",
    "MSPPN": "МСППН",
    "DepEco": "Департамент ППиООС",
    "ZEMP": "ЦЭМП",
    "Dep.tszn": "ОД Департамент ТСЗН",
}

# Administrative copy-only blocks: cell is almost always «карточка-112» on every row.
SKIP_ALWAYS_COPY_PARENTS = {
    "ГКУ НТУ",
    "ФСО",
    "Аппарат МЭРА",
    "Территориальные ОИВ",
    "Территориальные ОИВ    ТиНАО",
    "Департамент культуры",
    "ДГП",
}


def cell_kind(value: str) -> str:
    if NO_RESPONSE.match(value):
        return "no-response"
    if CARD_COPY.match(value):
        return "card-copy"
    return "dispatch"


def condition_of(label: str, header3: str) -> str:
    text = f"{label} {header3}"
    low = text.lower()
    if "нет доступа" in low and "не выбран" in low:
        return "default"
    if "нд" in low and "не выбран" in low:
        return "default"
    if "другие признаки не выбраны" in low or "признаки не выбраны" in low or "признак не выбран" in low:
        return "default"
    if "нет доступа" in low or "признак нд" in low:
        return "ND"
    if "угроза людям" in low or "признак ул" in low:
        return "UL"
    if "погибш" in low or "признак пп" in low:
        return "PP"
    if "пострадавшие не на месте" in low:
        return "not-on-scene"
    if "выбран признак пострадавшие" in low:
        return "victims"
    if "пострадавшие не выбран" in low:
        return "default"
    if "выбран признак правонарушение" in low:
        return "offense"
    if "газификация" in low:
        return "gasification"
    if "перекрытие" in low:
        return "road-blocked"
    return "unconditioned"


def display_name(col: dict) -> tuple[str, str]:
    label = col["label"].replace("\n", " ").strip()
    parent = col["parentBlock"].replace("\n", " ").strip()
    for kind, needle, name, source in DISPLAY_RULES:
        if kind == "label_prefix" and label.startswith(needle):
            return name, source
        if kind == "label" and needle in label:
            return name, source
        if kind == "parent" and parent.startswith(needle):
            return name, source
    short = parent or label
    short = re.sub(r"\s+", " ", short)
    if len(short) > 48:
        short = short[:45] + "…"
    return short, "xlsx parentBlock/label"


def main() -> None:
    data = json.loads(DUMP.read_text(encoding="utf-8"))
    columns = data["columns"]
    service_cols = []
    for col in columns:
        if col["index"] < 15:
            continue
        parent = col["parentBlock"].replace("\n", " ").strip()
        if any(parent.startswith(skip) for skip in SKIP_ALWAYS_COPY_PARENTS):
            continue
        name, src = display_name(col)
        service_cols.append(
            {
                "key": col["key"],
                "index": col["index"],
                "label": col["label"].replace("\n", " ").strip(),
                "parentBlock": parent,
                "headerRow3": col.get("headerRow3") or "",
                "displayName": name,
                "displayNameSource": src,
                "condition": condition_of(col["label"], col.get("headerRow3") or ""),
            }
        )

    records = []
    for rec in data["records"]:
        p1 = rec.get("c07")
        hidden = p1 == "Не отображается оператору 112"
        sv = []
        for col in service_cols:
            raw = rec.get(col["key"])
            if raw is None or str(raw).strip() == "":
                continue
            value = str(raw).strip()
            kind = cell_kind(value)
            if kind == "no-response":
                continue
            if kind == "card-copy":
                # Keep card-copy only for ARM-visible operational chips.
                if col["displayName"] not in {
                    "Служба 101",
                    "Служба 102",
                    "Служба 103",
                    "Служба 104",
                    "ЦЭМП",
                    "ЦОДД",
                    "Мослифт",
                    "Деп. ЖКХ",
                    "Мос.Без.",
                    "ФСБ",
                }:
                    continue
            item = {"c": col["key"], "v": value, "k": "n" if kind == "card-copy" else "d"}
            sv.append(item)
        row = {
            "row": rec["_row"],
            "n": rec.get("c05"),
            "g": rec.get("_groupCode"),
            "p1": p1,
            "t": rec.get("c11"),
            "m": rec.get("c14"),
            "sv": sv,
        }
        if rec.get("c08"):
            row["p2"] = rec["c08"]
        if rec.get("c09"):
            row["p3"] = rec["c09"]
        if rec.get("c10"):
            row["x"] = rec["c10"]
        if rec.get("c13"):
            row["sc"] = rec["c13"]
        if hidden:
            row["hidden"] = True
        records.append(row)

    payload = {
        "source": {
            "file": data["sourceFile"],
            "sheet": data["sourceSheet"],
            "version": data["sourceVersion"],
            "dumpFile": "classifier-v046.json",
            "note": "Runtime projection of Лист1. Values are copied; empty cells omitted. Service cells skip «нет реагирования» and always-copy administrative blocks.",
        },
        "groups": data["groups"],
        "serviceColumns": service_cols,
        "mainServiceBlocks": MAIN_SERVICE_BLOCK,
        "records": records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} bytes={OUT.stat().st_size} records={len(records)} serviceCols={len(service_cols)}")


if __name__ == "__main__":
    main()
