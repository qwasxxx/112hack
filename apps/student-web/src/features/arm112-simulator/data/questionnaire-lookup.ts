import {
  EVIDENCED_QUESTIONNAIRES,
  type EvidencedQuestionnaire,
} from './evidenced-questionnaires';

export function questionnaireForType(type: string): EvidencedQuestionnaire | undefined {
  const normalized = type.replace(/^Происшествие\s+/u, '').replace(/^П:\s*/u, '').trim();
  if (normalized === '101') {
    return EVIDENCED_QUESTIONNAIRES.find((item) => item.title === 'Происшествие 101' && item.source.includes('112ГСИ'));
  }
  if (normalized === '104') {
    return EVIDENCED_QUESTIONNAIRES.find((item) => item.title === 'Происшествие 104');
  }
  if (normalized === '103') {
    return EVIDENCED_QUESTIONNAIRES.find((item) => item.title === 'Происшествие 103');
  }
  if (normalized === 'Взрыв') {
    return EVIDENCED_QUESTIONNAIRES.find((item) => item.title === 'П: Взрыв');
  }
  return undefined;
}

export function displayTypeTitle(type: string): string {
  if (/^\d+$/.test(type)) {
    return `Происшествие ${type}`;
  }
  if (type === 'Взрыв') {
    return 'П: Взрыв';
  }
  return type;
}
