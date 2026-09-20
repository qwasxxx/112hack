import type { LessonRecord } from './types';

export function historyRecommendations(records: LessonRecord[]): string[] {
  const recent = records.slice(0, 8);
  if (recent.length === 0) {
    return ['Пройдите тренировку, экзамен или карточку ДДС — сюда запишется оценка, время и ошибки.'];
  }
  const recs: string[] = [];
  const timerHits = recent.filter((item) => item.cardTimerExceeded).length;
  if (timerHits >= 2) {
    recs.push('На последних занятиях срывается норматив 30 секунд. Сначала обязательные поля, потом уточнения.');
  }
  const classMiss = recent.filter((item) => item.findings.some((row) => row.code.startsWith('classifier'))).length;
  if (classMiss >= 2) {
    recs.push('Частая ошибка — классификатор. Сверяйте признаки с тем, что сказал заявитель, не с догадкой.');
  }
  const serviceMiss = recent.filter((item) => item.findings.some((row) => row.code.includes('services'))).length;
  if (serviceMiss >= 2) {
    recs.push('Службы: не хватает нужных или уходят лишние. Это главный критерий передачи в ДДС.');
  }
  const askMiss = recent.filter((item) => item.findings.some((row) => row.code.startsWith('ask-'))).length;
  if (askMiss >= 2) {
    recs.push('На линии часто пропускают адрес, суть или пострадавших. Держите четыре коротких вопроса.');
  }
  const addrMiss = recent.filter((item) => item.findings.some((row) => row.code.startsWith('address'))).length;
  if (addrMiss >= 2) {
    recs.push('Адрес с линии часто не попадает в поля улица/дом. Повторите адрес вслух и сразу внесите.');
  }
  const failRate = recent.filter((item) => !item.passed).length / recent.length;
  if (failRate >= 0.5 && recs.length === 0) {
    recs.push('Больше половины последних попыток ниже порога. Разберите поля из «замечаний» и повторите тот же билет.');
  }
  const examFail = recent.filter((item) => item.mode === 'exam' && !item.passed).length;
  if (examFail >= 1) {
    recs.push('На экзамене порог 80 и нельзя пропускать эталонные службы. Сначала закройте обязательные поля карточки.');
  }
  if (recs.length === 0) {
    recs.push('Последние попытки в нормативе. Дальше — более сложные билеты и скорость набора.');
  }
  return recs.slice(0, 4);
}

export function progressStats(records: LessonRecord[]) {
  const total = records.length;
  const passed = records.filter((item) => item.passed).length;
  const avg = total === 0 ? 0 : Math.round(records.reduce((sum, item) => sum + item.score, 0) / total);
  const last = records[0];
  return { total, passed, avg, last };
}
