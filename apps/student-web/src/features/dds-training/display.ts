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
      title: text,
      okrug: /тао|троицк/i.test(paren[1]) ? 'Троицкий административный округ' : paren[1],
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
  if (/пожар|горит|плам|дым|возгоран|контейн|мусор/.test(t) || services.includes('fire')) {
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
