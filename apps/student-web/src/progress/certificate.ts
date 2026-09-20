import type { LessonRecord } from './types';

const MODE: Record<LessonRecord['mode'], string> = {
  training: 'Тренировка оператора 112',
  exam: 'Аттестация оператора 112',
  dds: 'Проверка карточки ДДС',
};

export function printLessonCertificate(record: LessonRecord, operatorName: string) {
  const when = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(record.completedAt));
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Справка ${record.scenarioCode}</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;padding:48px;color:#16324f}
h1{font-size:22px;margin:0 0 8px}
p{margin:6px 0;line-height:1.45}
.box{margin-top:24px;padding:20px;border:1px solid #c5d0da}
b{font-size:28px}
</style></head><body>
<h1>Учебный комплекс Системы-112</h1>
<p>Справка о результате занятия. Документ для обучающегося, не государственный сертификат.</p>
<div class="box">
<p>${MODE[record.mode]}</p>
<p><b>${record.passed ? 'Зачёт' : 'Незачёт'} · ${record.score} из 100</b></p>
<p>${record.scenarioCode} · ${record.scenarioTitle}</p>
<p>Обучающийся: ${operatorName}</p>
<p>${when}</p>
<p>${record.summary}</p>
</div>
</body></html>`;
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!popup) {
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}
