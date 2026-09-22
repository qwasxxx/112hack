import type { ServiceKind, TrainingScenario } from '../../data/scenarios';

export const SERVICE_CODE: Record<ServiceKind, string> = {
  fire: '101',
  police: '102',
  ambulance: '103',
  gas: '104',
};

export function serviceCode(kind: ServiceKind): string {
  return SERVICE_CODE[kind];
}

export function serviceChipLabel(kind: ServiceKind): string {
  return `Служба ${SERVICE_CODE[kind]}`;
}

export function primaryServiceCode(services: ServiceKind[], fallback: ServiceKind = 'police'): string {
  return SERVICE_CODE[services[0] ?? fallback];
}

export function splitDdsAddress(line: string): { title: string; okrug: string } {
  const text = line.replace(/\s+/g, ' ').trim();
  const paren = text.match(/\(([^)]+)\)/);
  if (paren) {
    return {
      title: text.startsWith('Россия') ? text : text,
      okrug: /тао|троицк|вороновск/i.test(paren[1]) ? 'Троицкий административный округ' : paren[1],
    };
  }
  if (/вороновск|тинао|тиао|\bтао\b|троицк/i.test(text)) {
    return {
      title: text.startsWith('Россия') ? text : text,
      okrug: 'Троицкий административный округ',
    };
  }
  if (/москва/i.test(text)) {
    return { title: text.startsWith('Россия') ? text : `Россия, ${text}`, okrug: 'город Москва' };
  }
  return { title: text, okrug: '' };
}

export function ddsTags(description: string, address: string, injured: string, services: ServiceKind[]): string {
  const t = `${description} ${address}`.toLowerCase();
  const parts: string[] = [];
  const house = /дом|кварт|подъезд|этаж|подвал|балкон|мусоропровод/.test(t);
  const street = /улиц|шоссе|мкад|мост|набереж|проезд|перекрёст|перекрест/.test(t);
  if (house) {
    parts.push('Дом');
  } else if (street) {
    parts.push('Улица');
  }
  if ((/пожар|плам|дым|возгоран|контейн|мусор/.test(t) || services.includes('fire')) && !/уличн[а-яё]*\s+освещен/.test(t)) {
    parts.push(house ? 'Открытое пламя / Дым (дом)' : 'Открытое пламя');
    if (/гари|дым/.test(t)) {
      parts.push(house ? 'Запах гари (дом)' : 'Запах гари');
    }
  }
  if (/газ/.test(t) || services.includes('gas')) {
    parts.push(house ? 'Запах газа в помещении' : 'Запах газа вне помещения');
  }
  if (/многокварт|кварт/.test(t)) {
    parts.push('Дом многоквартирный');
  } else if (/частн|ч\/дом/.test(t)) {
    parts.push('Дом частный');
  }
  if (/кварт/.test(t)) {
    parts.push('квартира');
  }
  if (injured === 'Есть' || /угроз|пострад/.test(t)) {
    parts.push('Есть угроза людям');
  }
  if (/газ/.test(t) || services.includes('gas') || (services.includes('fire') && house)) {
    parts.push('Есть газификация');
  }
  return parts.length ? `${parts.join(' . ')} .` : description;
}

export function ddsClassLabel(scenario: TrainingScenario, description: string, services: ServiceKind[]): string {
  const t = `${description} ${scenario.situation ?? ''}`.toLowerCase();
  if (/уличн[а-яё]*\s+освещен/.test(t)) {
    return 'уличное освещение';
  }
  if (services.includes('fire') && /кварт/.test(t)) {
    return 'пожар: квартира';
  }
  if (services.includes('fire') && /мусор|контейн/.test(t)) {
    return 'пожар: мусор';
  }
  if (services.includes('fire')) {
    return 'пожар';
  }
  if (services.includes('gas')) {
    return 'запах газа';
  }
  if (services.includes('ambulance')) {
    return 'медицинская помощь';
  }
  return scenario.title || 'происшествие';
}

const CLASS_LINE: Record<string, string> = {
  'пожар: квартира': 'Пожар в квартире',
  'пожар: мусор': 'Пожар / задымление',
  пожар: 'Пожар',
  'уличное освещение': 'Горит уличное освещение',
  'запах газа': 'Запах газа',
  'медицинская помощь': 'Медицинский вызов',
};

export function journalIncidentLine(title: string, classifierClass: string): string {
  if (CLASS_LINE[classifierClass]) {
    return CLASS_LINE[classifierClass];
  }
  const cut = title.replace(/^Билет\s+[\d.]+\s*[—–-]\s*/u, '').trim();
  return cut || title;
}

export function attractedMunicipalNames(scenario: TrainingScenario, address: string): string[] {
  const t = `${scenario.situation ?? ''} ${scenario.title} ${address}`.toLowerCase();
  const names: string[] = [];
  if (scenario.services.includes('fire') || /пожар|дым|жкх|мусор|задым/.test(t)) {
    names.push('Деп. ЖКХ');
  }
  if (scenario.services.includes('ambulance') || /пострад|травм|скор/.test(t)) {
    names.push('ЦЭМП');
  }
  if (scenario.services.includes('police') || /дтп|улиц|дорог|шоссе|мкад/.test(t)) {
    names.push('ЦОДД');
  }
  names.push('Мос.Без.');
  if (/дом|кварт|лифт|подъезд/.test(t)) {
    names.push('Мослифт');
  }
  if (/школ|детск|образован/.test(t)) {
    names.push('Деп. Обр.');
  }
  names.push('ОАТИ');
  const okrug = okrugFromAddress(address);
  if (okrug) {
    names.push(okrug);
  }
  const district = districtFromAddress(address);
  if (district) {
    names.push(district);
  }
  return [...new Set(names)];
}

export function ownChipLabel(workplace: string, address: string): string {
  return districtFromAddress(address) ?? workplace.replace(/^ДДС\s+/u, '');
}

export function journalTypeCode(
  scenario: TrainingScenario,
  services: ServiceKind[],
  classifierClass: string,
): string {
  const t = `${scenario.title} ${scenario.situation ?? ''} ${classifierClass}`.toLowerCase();
  if (/дтп/.test(t)) {
    return 'ДТП';
  }
  return primaryServiceCode(services.length ? services : scenario.services);
}

export function districtFromAddress(address: string): string | undefined {
  const t = address.toLowerCase();
  if (/вороновск/.test(t)) {
    return 'Поселение Вороновское';
  }
  if (/щукин/.test(t)) {
    return 'Поселение Щукино';
  }
  if (/тиао|тинао|троицк|новомосков/.test(t) || /\bтао\b/.test(t)) {
    return 'Поселение ТиНАО';
  }
  if (/сзао|северо-запад/.test(t)) {
    return 'Поселение СЗАО';
  }
  return undefined;
}

export function okrugFromAddress(address: string): string | undefined {
  const t = address.toLowerCase();
  if (/вороновск|тиао|тинао|\bтао\b|троицк/.test(t)) {
    return 'Поселение ТиНАО';
  }
  return undefined;
}

export function serviceChipPhone(shortLabel: string): string | undefined {
  if (shortLabel === 'Служба 101' || shortLabel === '101') {
    return '101';
  }
  if (shortLabel === 'Служба 102' || shortLabel === '102') {
    return '102';
  }
  if (shortLabel === 'Служба 103' || shortLabel === '103') {
    return '103';
  }
  if (shortLabel === 'Служба 104' || shortLabel === '104') {
    return '104';
  }
  if (shortLabel.startsWith('Поселение') || shortLabel.startsWith('ДДС')) {
    return '+7 (495) 197-89-81';
  }
  return undefined;
}
