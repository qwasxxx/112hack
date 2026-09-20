import type { LessonFinding } from './types';

export function inspectOperatorText(field: string, text: string, opts?: { minChars?: number }): LessonFinding[] {
  const value = text.trim();
  const minChars = opts?.minChars ?? 0;
  if (!value) {
    return [];
  }
  const findings: LessonFinding[] = [];
  if (minChars > 0 && value.length < minChars) {
    findings.push({
      code: 'text-short',
      field,
      message: `Слишком коротко для поля (${value.length} симв.)`,
      severity: 'warning',
    });
  }
  if (!/[а-яё]/i.test(value) && /[a-z]/i.test(value)) {
    findings.push({
      code: 'text-not-ru',
      field,
      message: 'Текст без кириллицы — в карточке пишут по-русски',
      severity: 'error',
    });
  }
  if (/[!]{3,}|[?]{3,}|\.{4,}/.test(value)) {
    findings.push({
      code: 'text-punct',
      field,
      message: 'Лишняя пунктуация',
      severity: 'warning',
    });
  }
  const letters = value.replace(/[^а-яёa-z]/gi, '');
  if (letters.length >= 12 && letters === letters.toUpperCase()) {
    findings.push({
      code: 'text-caps',
      field,
      message: 'Не пишите описание целиком заглавными',
      severity: 'warning',
    });
  }
  if (/,[^\s\d]|:[^\s]|;[^\s]/.test(value)) {
    findings.push({
      code: 'text-space',
      field,
      message: 'Нет пробела после знака препинания',
      severity: 'warning',
    });
  }
  if (/(.)\1{5,}/.test(value)) {
    findings.push({
      code: 'text-repeat',
      field,
      message: 'Повтор символов — как опечатка или срыв ввода',
      severity: 'warning',
    });
  }
  return findings;
}
