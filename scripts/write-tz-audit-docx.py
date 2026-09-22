from pathlib import Path
import zipfile

PARAS = r"""ТЗ ДГОЧСиПБ — анализ реализации sys112-trainer
Дата: 22.09.2026
Источник: ТЗ_ДГОЧСиПБ_финал_01092026ГСИ.docx (Telegram Desktop). Репозиторий github.com/qwasxxx/112hack. Это сверка с кодом, не замена ТЗ.

Легенда: ГОТОВО / ЧАСТИЧНО / СЛАБО / НЕ ДЕЛАЕМ СЕЙЧАС. С 21.09 закрыты генерация билетов той же Qwen, все 96 билетов АГС в назначениях, эталон освещения (не пожар квартиры).

1. Назначение и границы
ГОТОВО. Локальный тренажёр оператора 112 и ДДС: АРМ-карточка, звонок, оценка по эталону, преподаватель, админ. Не обрабатывает реальные вызовы, не подменяет боевую систему-112, без внешней сети.
ЧАСТИЧНО. «Удалённый контроль» = тот же origin в локальной сети (http://localhost:5173), не отдельный контур филиалов.

2. Общие требования
ГОТОВО. Эмуляция АРМ-112, входящий вызов, роли, тайминг 30 сек по умолчанию, оценка по эталону, статистика, Postgres, JSON-бэкап из админки, визуал карточки как у ГБУ 112.
ЧАСТИЧНО. VoIP — браузерный микрофон + STT T-one + Qwen + Silero TTS, не SIP/Asterisk. «Защита каналов» на localhost без TLS.
НЕ ДЕЛАЕМ СЕЙЧАС. Настоящая IP-телефония, HTTPS.

3. Опциональные
ГОТОВО. Excel/CSV/печать отчёта, внутренний REST (Nest :3000 + LLM :8091), аналитика преподавателя (ошибки группы, тепловая сводка).
ЧАСТИЧНО. Адаптив: десктоп основной, планшет терпим, телефон не целевой. Пакетный импорт файла сценариев нет — конструктор и нейросеть по одному билету.
СЛАБО. Мобильная вёрстка под ТЗ «обязательно удобно на мобиле» на финале могут придраться.

4. Производительность
ГОТОВО. UI карточки и кабинета отвечают быстро. Буфер сессии в браузере, Postgres на хосте :5435 или в Docker.
СЛАБО. 20 одновременных голосовых сессий на одном CPU с Qwen3-4B n_ctx 2048 не выдержат. 100 пользователей UI — да, LLM — нет. VoIP 150 мс к SIP не относится. Кластер/HA нет, один compose.
НЕ ДЕЛАЕМ СЕЙЧАС. Горизонтальный кластер, 20 параллельных LLM.

5. Интерфейс
ГОТОВО. Русский язык, одна стилистика student/teacher/admin на :5173, роли не видят чужие экраны.

6. Администратор
ГОТОВО. Учётки, роли, блок, живой статус STT/Qwen/TTS/API/Postgres, JSON-бэкап, журнал audit_log, без правок оценок занятия.
ЧАСТИЧНО. Старт/стоп сервисов — индикация и сообщение, не docker compose down из UI. SIP в админке всегда «выкл». Настройки SIP/кластера/политик безопасности — заглушки.
СЛАБО. Остановка Docker из админки, графики нагрузки сервера, хранение логов 6 месяцев политикой.

7. Преподаватель
ГОТОВО. Каталог 96 билетов АГС + конструктор с полным situation из PDF. Генерация билета нейросетью POST /api/llm/generate-ticket (та же Qwen, не вторая модель). Утверждение эталона, назначение группе, категории занятия (пожар / скорая / полиция / газ / ДДС-лента), таймер, порог зачёта, живое наблюдение, отчёт Excel/CSV/печать, комментарий (coach note), инсайты по ошибкам.
ЧАСТИЧНО. «Коррекция эталона комментарием в нейросеть» — поле note у генерации и правка эталона руками; отдельного цикла «комментарий → автоперегенерация уже сохранённого» нет. Пакетное обновление методички файлом нет.

8. Обучающийся
ГОТОВО. Только назначенные билеты (после миграции — все 96, не 8). АРМ-112, звонок, SMS, ДДС принимает карточки 112. Таймер, оценка, разбор ошибок, свой прогресс. Не видит чужие результаты, не правит сценарии.
ЧАСТИЧНО. Справочная база = методичка в UI, не полный RAG по PDF.

9. Нефункциональные
ГОТОВО. RBAC, аудит, Postgres 16, Chrome, Docker Linux + Windows Docker Desktop, инструкции README / scripts/up.ps1.
ЧАСТИЧНО. TLS внутри контура нет. Авторестарт — Docker restart policy, не полноценный failover. Журналы есть, срок 6 месяцев не квотируется.
НЕ ДЕЛАЕМ СЕЙЧАС. TLS/SSL, SIP-сервер, кластер.

10. Сценарий «настройка среды»
ГОТОВО. Вход petrov, категории, генерация/выбор билетов, эталон (классификатор, службы, адрес, обстановка), предпросмотр, правка, назначение профильных лент ДДС.
ЧАСТИЧНО. «Обучение загрузкой материалов в базу» — JSON/конструктор, не загрузка PDF в индекс. Принудительная грамматика после ручной правки — грамматика считается в оценке ученика, отдельной кнопки «проверить эталон» нет.

11. Сценарий «карточки АРМ-112»
ГОТОВО. Старт занятия, имитация звонка, заполнение карточки, отчёт: действия, ошибки, время, норматив, грамматика.

12. Сценарий «действия с карточками» (ДДС)
ГОТОВО. Роль ДДС берёт уже заполненные карточки 112 (и смешанно учебные). Ответ текстом в карточку, следующая карточка, отчёт.

13. Источники данных
ГОТОВО. Памятка АРМ-112 в UI, классификатор в эталоне, 96 билетов из PDF/JSON АГС (1–32 × три варианта).
НЕ ДЕЛАЕМ. Боевая БД 112, журналы заказчика.

14. Форматы
ГОТОВО. JSON сценарии и API, SQL/Postgres, CSV и XLSX отчёты, PDF/печать справки, WAV на линии TTS (синтез, не архив звонка).
СЛАБО. Архив записи звонка ученика WAV/MP3 на диск. XML-конфиги — JSON. Государственный сертификат PDF нет, есть печатная справка занятия.

15. Требования к решению
ГОТОВО. Открытый код без обфускации, README, docker compose up --build, список стека, архитектура в docs. Локальный контур. 149-ФЗ / 152-ФЗ: учебные ФИО, пароль 112, БД не публиковать.

16. Презентация и сдача
СЛАБО. pptx/pdf питча нет. Репозиторий есть. Прототип: http://localhost:5173. Этот файл — сопроводительная сверка.
Нужно к защите: презентация, ссылка на репо, этот анализ, живое демо.

17. Что изменилось с 21.09.2026
Генерация билетов нейросетью — сделана. Раньше в сверке стояло «не делаем второй сетью». Сейчас та же Qwen3-4B, эндпоинт /api/llm/generate-ticket, панель у преподавателя (тема, службы, комментарий). Mock, если LLM выключен.
Все 96 билетов АГС назначены. Раньше DEMO_COUNT=8 прятал 88 штук. Миграция localStorage и SQL 0004_all_ags_tickets.sql / seed 0002.
Эталон «горит уличное освещение» (билет 32.3): классификатор 14030203 ОЭК, службы пустые, тема «Уличное освещение». Не 1050101 «пожар в квартире». Старый поиск по латинице не видел слово «уличное». Службы считаются только из обстановки, не из адреса. Пустые службы: штраф за вызов пожарных.

18. Оценка карточки (ИИ + эталон)
ГОТОВО. 112: карточка 50 + разговор 50, зачёт ≥70, экзамен ≥80. ДДС: 100 за обработку карточки. Сравнение полей с эталоном, грамматика, тайминг, классификатор, службы. Qwen ведёт заявителя по фактам билета, не выдумывает пожар на освещении.
ЧАСТИЧНО. «Прогнозирование» экспертизы = оценка vs эталон, не ML-прогноз нагрузки инфраструктуры.

19. Сознательно не делаем (как договаривались)
SIP / Asterisk / трубки. TLS/HTTPS на localhost. RAG PDF в промпт (раздувает n_ctx 2048 и смешивает методичку с фактами). Вторая нейросеть. Публикация Postgres.

20. Осталось до защиты
Презентация pptx. По желанию: выгрузка WAV звонка, пакетный импорт сценариев, стоп compose из админки. Не обещать жюри 20 параллельных голосовых сессий на одном CPU.

21. Как открыть демо
Docker: docker compose up --build → http://localhost:5173
Учётки: smirnova ученик, petrov преподаватель, volkova админ, пароль 112. Не открывать teacher-web :5174.
Проверка генерации: petrov → Сценарии → сгенерировать билет.
Проверка 96: ученик видит полный каталог, не 8 штук.
Проверка освещения: билет 32.3, эталон 14030203, в разговоре не должно быть «пожар в квартире».
""".strip().split("\n")


def xml_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def paragraph(text: str, style: str | None = None) -> str:
    if not text:
        return "<w:p/>"
    esc = xml_escape(text)
    if style:
        return (
            f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>'
            f'<w:r><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>'
        )
    return f'<w:p><w:r><w:t xml:space="preserve">{esc}</w:t></w:r></w:p>'


body: list[str] = []
for line in PARAS:
    raw = line.strip()
    if not raw:
        body.append("<w:p/>")
    elif raw.startswith("ТЗ ДГОЧСиПБ"):
        body.append(paragraph(raw, "Title"))
    elif len(raw) > 2 and raw[0].isdigit() and raw[1] == ".":
        body.append(paragraph(raw, "Heading1"))
    else:
        body.append(paragraph(raw))

document = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:body>"
    + "".join(body)
    + "<w:sectPr/></w:body></w:document>"
)

files = {
    "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>""",
    "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""",
    "word/_rels/document.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""",
    "word/styles.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>""",
    "word/document.xml": document,
}

txt = "\n".join(PARAS) + "\n"
txt_paths = [
    Path(r"C:\Users\H O N O R\sys112-trainer\docs\ТЗ_анализ_sys112_22092026.txt"),
    Path(r"C:\Users\H O N O R\sys112-trainer\docs\TZ-audit-sys112-22092026.txt"),
    Path(r"C:\Users\H O N O R\Downloads\ТЗ_анализ_sys112_22092026.txt"),
]
docx_paths = [
    Path(r"C:\Users\H O N O R\Downloads\ТЗ_анализ_sys112_22092026.docx"),
    Path(r"C:\Users\H O N O R\sys112-trainer\docs\ТЗ_анализ_sys112_22092026.docx"),
    Path(r"C:\Users\H O N O R\sys112-trainer\docs\TZ-audit-sys112-22092026.docx"),
]
for out in txt_paths:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(txt, encoding="utf-8")
    print("txt", out, out.stat().st_size)
for out in docx_paths:
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    print("docx", out, out.stat().st_size)
