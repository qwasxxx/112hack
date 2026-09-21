import type { CompletedResult } from '../domain/entities';

const NORM_SEC = 30;

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function grammarText(item: CompletedResult): string {
  return item.mistakes
    .filter((mistake) => mistake.code === 'grammar' || /грамм|капс|препинания|пробел|опечатк|строчн/i.test(mistake.description))
    .map((mistake) => mistake.description)
    .join('; ');
}

function timerSec(item: CompletedResult): number {
  return item.cardTimerSeconds ?? item.durationSec;
}

function timerLimit(item: CompletedResult): number {
  return item.cardTimerLimitSec ?? NORM_SEC;
}

function reportRow(item: CompletedResult): Array<string | number> {
  const fact = timerSec(item);
  const limit = timerLimit(item);
  return [
    item.student.name,
    item.scenarioTitle,
    item.category,
    item.completedAt,
    item.automaticScore,
    item.expertScore,
    item.finalScore,
    item.passed ? 'зачёт' : 'незачёт',
    item.mistakes.length,
    fact,
    limit,
    fact - limit,
    item.cardTimerExceeded || fact > limit ? 'превышен' : 'в норме',
    grammarText(item) || '—',
    item.mistakes.map((mistake) => mistake.description).join('; '),
    item.teacherComment,
  ];
}

const HEADER = [
  'Обучающийся',
  'Сценарий',
  'Категория',
  'Дата',
  'Авто',
  'Эксперт',
  'Итог',
  'Зачёт',
  'Ошибки',
  'Секунд факт',
  'Норматив сек',
  'Отклонение сек',
  'Таймер',
  'Грамматика',
  'Замечания',
  'Комментарий',
];

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadResultsCsv(results: CompletedResult[]): void {
  const rows = results.map((item) => reportRow(item).map((cell) => csvCell(cell)).join(';'));
  downloadBlob(
    new Blob([`\uFEFF${[HEADER.join(';'), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' }),
    `sys112-group-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadResultsXlsx(results: CompletedResult[]): void {
  const rows = [HEADER, ...results.map((item) => reportRow(item).map(String))];
  const bytes = buildXlsx(rows);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(
    new Blob([copy], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `sys112-group-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function openPrint(title: string, body: string): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
  if (!popup) {
    return;
  }
  popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;padding:36px;color:#16324f}
h1{font-size:22px;margin:0 0 8px}
p,li{margin:6px 0;line-height:1.45}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{border:1px solid #c5d0da;padding:6px 8px;text-align:left}
.box{margin-top:20px;padding:16px;border:1px solid #c5d0da}
b{font-size:26px}
</style></head><body>${body}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export function printGroupReport(results: CompletedResult[]): void {
  const avg = results.length
    ? Math.round(results.reduce((sum, item) => sum + item.finalScore, 0) / results.length)
    : 0;
  const passed = results.filter((item) => item.passed).length;
  const rows = results
    .map((item) => {
      const fact = timerSec(item);
      const limit = timerLimit(item);
      const grammar = grammarText(item) || '—';
      return `<tr><td>${item.student.name}</td><td>${item.scenarioTitle}</td><td>${item.finalScore}%</td><td>${item.passed ? 'зачёт' : 'незачёт'}</td><td>${fact} с / ${limit} с</td><td>${grammar}</td></tr>`;
    })
    .join('');
  openPrint(
    'Отчёт группы',
    `<h1>Отчёт учебной группы</h1>
<p>Учебный комплекс Системы-112. Локальный контур, PostgreSQL.</p>
<p>Попыток: ${results.length}. Зачётов: ${passed}. Средний балл: ${avg}%. Норматив заполнения карточки: ${NORM_SEC} сек.</p>
<table><thead><tr><th>Обучающийся</th><th>Сценарий</th><th>Итог</th><th>Результат</th><th>Время / норматив</th><th>Грамматика</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

export function printResultCertificate(result: CompletedResult): void {
  const when = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(result.completedAt));
  const fact = timerSec(result);
  const limit = timerLimit(result);
  const grammar = grammarText(result);
  const mistakes = result.mistakes.map((item) => `<li>${item.description}</li>`).join('');
  openPrint(
    `Справка ${result.scenarioTitle}`,
    `<h1>Учебный комплекс Системы-112</h1>
<p>Справка о результате занятия. Документ для обучающегося, не государственный сертификат.</p>
<div class="box">
<p>${result.category}</p>
<p><b>${result.passed ? 'Зачёт' : 'Незачёт'} · ${result.finalScore} из 100</b></p>
<p>${result.scenarioTitle}</p>
<p>Обучающийся: ${result.student.name}</p>
<p>${when}</p>
<p>Автоматическая оценка ${result.automaticScore}%, экспертная ${result.expertScore}%</p>
<p>Время заполнения ${fact} сек, норматив ${limit} сек, отклонение ${fact - limit} сек.</p>
${grammar ? `<p>Грамматика: ${grammar}</p>` : ''}
${result.teacherComment ? `<p>${result.teacherComment}</p>` : ''}
</div>
${mistakes ? `<h2>Замечания</h2><ul>${mistakes}</ul>` : ''}`,
  );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const localBlob = concat(locals);
  const centralBlob = concat(centrals);
  const end = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBlob.length),
    u32(localBlob.length),
    u16(0),
  ]);
  return concat([localBlob, centralBlob, end]);
}

function buildXlsx(rows: string[][]): Uint8Array {
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((cell, col) => {
            const ref = `${colName(col)}${rowIndex + 1}`;
            return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  const files = [
    {
      name: '[Content_Types].xml',
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Отчёт" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
      ),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows}</sheetData>
</worksheet>`,
      ),
    },
  ];
  return zipStore(files);
}
