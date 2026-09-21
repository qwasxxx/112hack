import type { CompletedResult } from '../domain/entities';

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadResultsCsv(results: CompletedResult[]): void {
  const header = [
    'Обучающийся',
    'Сценарий',
    'Категория',
    'Дата',
    'Авто',
    'Эксперт',
    'Итог',
    'Зачёт',
    'Ошибки',
    'Секунд',
    'Комментарий',
  ];
  const rows = results.map((item) =>
    [
      item.student.name,
      item.scenarioTitle,
      item.category,
      item.completedAt,
      item.automaticScore,
      item.expertScore,
      item.finalScore,
      item.passed ? 'зачёт' : 'незачёт',
      item.mistakes.length,
      item.durationSec,
      item.teacherComment,
    ]
      .map((cell) => csvCell(cell))
      .join(';'),
  );
  const blob = new Blob([`\uFEFF${[header.join(';'), ...rows].join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sys112-group-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
    .map(
      (item) =>
        `<tr><td>${item.student.name}</td><td>${item.scenarioTitle}</td><td>${item.finalScore}%</td><td>${item.passed ? 'зачёт' : 'незачёт'}</td><td>${item.durationSec} с</td></tr>`,
    )
    .join('');
  openPrint(
    'Отчёт группы',
    `<h1>Отчёт учебной группы</h1>
<p>Учебный комплекс Системы-112. Локальный контур, без серверной БД.</p>
<p>Попыток: ${results.length}. Зачётов: ${passed}. Средний балл: ${avg}%</p>
<table><thead><tr><th>Обучающийся</th><th>Сценарий</th><th>Итог</th><th>Результат</th><th>Время</th></tr></thead><tbody>${rows}</tbody></table>`,
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
${result.teacherComment ? `<p>${result.teacherComment}</p>` : ''}
</div>`,
  );
}
