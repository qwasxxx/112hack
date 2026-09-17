# ARM-112 classifier dataset

**Source of truth:** `Классификатор_происшествий_v_046_11_ДТУ_15_11_2024_искл_пожар_задымление.xlsx`, sheet `Лист1`.

Do not parse the XLSX in the browser. Build-time dump:

1. `classifier-v046.json` — full Лист1 copy (`c01`…`c90`, `_row`, `_groupCode`).
2. `classifier-runtime.json` — compact runtime projection used by the simulator.

Regenerate:

```bash
python3 apps/student-web/scripts/generate-classifier-runtime.py
```

Each runtime record keeps `row` (xlsx row) and `n` (column `Номер` / `c05`). Service cells keep source column key (`c15`…).

Relations implemented in code are only:

- group → 112-Признак.1/2/3 → итоговый тип → Главная служба
- non-empty service columns except `нет реагирования` and always-copy administrative blocks
- column-header conditions (НД, УЛ, ПП, Пострадавшие, газификация, …)
- ARM screenshot short names where the spreadsheet block is the same service (101/МВД/СМП/МОСГАЗ/…)
