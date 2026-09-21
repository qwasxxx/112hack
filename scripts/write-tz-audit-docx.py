from pathlib import Path
import zipfile

PARAS = """ТЗ ДГОЧСиПБ — анализ реализации sys112-trainer
Дата: 21.09.2026

Этот файл — сверка официального ТЗ (ТЗ_ДГОЧСиПБ_финал_01092026ГСИ.docx) с учебным комплексом. Это не замена ТЗ заказчика.

1. Что было в конструкторе билета
Поле «Описание» брало не текст из PDF, а короткую подпись каталога: «Тренировка оператора 112. … Обстановку выясняете на линии».
Из PDF в систему легло другое поле — полная обстановка билета (situation) и адрес. Пример 1.1: «Возгорание мусорного контейнера, пострадавших нет, Сидоров Иван Сергеевич, 916-126-34-71» плюс длинный адрес.
Системный промпт Qwen собирается из situation, адреса, телефона и роли заявителя. Короткая строка в форму не входила.
Сейчас конструктор показывает полный текст билета, адрес, несколько служб сразу, первую фразу заявителя, классификатор и живой эталон.

2. SIP / VoIP — сейчас не делать
SIP — протокол, которым IP-телефон и АТС договариваются о звонке. VoIP — голос по сети.
Настоящий контур: Asterisk или FreeSWITCH, номера, трубки, задержка до 150 мс.
В ТЗ рядом стоит программная эмуляция IP-телефона. Она уже есть: входящий вызов в браузере, микрофон, распознавание, голос заявителя.
Настоящий SIP — недели работы и отдельное железо. Для хакатона не нужно. Если заказчик на защите попросит — отдельный этап, не смешивать с текущим демо.

3. TLS — сейчас не делать
TLS это HTTPS. Нужен, когда трафик идёт по чужой сети.
Стенд на localhost / учебная локалка без интернета. Самоподписанный сертификат даст красное предупреждение и сломает демо.
Если комплекс поставят в класс на несколько машин — тогда сертификат учебного центра и HTTPS. Это инфраструктура, не код тренажёра.

4. RAG / PDF в нейросеть
Не подключаем. RAG дописывает куски документов в промпт, модель не ускоряется, на CPU Qwen 4B отвечает медленнее и может смешать методичку с фактами билета.

5. Excel
Сделан настоящий файл .xlsx, плюс CSV и печать отчёта.

6. Статус блоков ТЗ
Закрыто: эмуляция АРМ-112, звонок, SMS, ДДС, эталон и таймер 30 сек, роли, Postgres, назначения, живое наблюдение, отчёты, бэкап JSON, изоляция результатов, категории занятия, конструктор билета.
Слабо / позже: пакетный импорт файла сценариев, архив WAV звонка, презентация pptx, стоп Docker из админки, 20 одновременных LLM на одном CPU.
Сознательно не делаем сейчас: Asterisk/SIP, HTTPS, RAG, кластер, генерация билетов второй нейросетью.

7. Как проверить конструктор
Войти petrov / 112, Сценарии, открыть конструктор. Должна быть полная обстановка из PDF, адрес, несколько служб. Сохранить. Во второй вкладке smirnova / 112 — тот же билет с обновлённым текстом.
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

outs = [
    Path(r"C:\Users\H O N O R\Downloads\ТЗ_анализ_sys112_21092026.docx"),
    Path(r"C:\Users\H O N O R\sys112-trainer\docs\ТЗ_анализ_sys112_21092026.docx"),
]
for out in outs:
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w") as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    print(out, out.stat().st_size)
