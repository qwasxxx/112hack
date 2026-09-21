import { SERVICE_LABEL, type ServiceKind } from '../data/scenarios';

export type GeneratedTicket = {
  situation: string;
  address: string;
  opening: string;
  services: ServiceKind[];
  caller: string;
  phone: string;
  source: string;
};

export type TicketDraftInput = {
  services: ServiceKind[];
  note?: string;
  title?: string;
  situation?: string;
  address?: string;
  opening?: string;
  caller?: string;
  classifier?: string;
  difficulty?: string;
};

const ALLOWED: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];

const SERVICE_HINTS: Array<{ id: ServiceKind; pattern: RegExp }> = [
  { id: 'fire', pattern: /пожар|задымл|огонь|горит|возгоран|пламя|торф/i },
  { id: 'gas', pattern: /\bгаз\b|запах газа|утечк/i },
  { id: 'ambulance', pattern: /скорая|без сознания|инфаркт|инсульт|ранен|кровотеч|медицин/i },
  { id: 'police', pattern: /\bдтп\b|драка|кража|ограбл|полиц|убийств|розыск|избиен/i },
];

const STOPWORDS = new Set(['этот', 'этой', 'этом', 'билет', 'когда', 'после', 'звонит']);

export function inferServices(...parts: Array<string | undefined>): ServiceKind[] {
  const text = parts.filter(Boolean).join(' ');
  return SERVICE_HINTS.filter((item) => item.pattern.test(text)).map((item) => item.id);
}

function titleKeywords(title: string): string[] {
  return (title.toLowerCase().match(/[а-яё]{4,}/g) ?? []).filter((word) => !STOPWORDS.has(word));
}

export function ticketMatchesTitle(ticket: Pick<GeneratedTicket, 'situation' | 'opening'>, title?: string): boolean {
  const keys = titleKeywords(title ?? '');
  if (!keys.length) {
    return true;
  }
  const blob = `${ticket.situation} ${ticket.opening}`.toLowerCase();
  const hits = keys.filter((word) => blob.includes(word)).length;
  const need = keys.length === 1 ? 1 : Math.max(2, Math.ceil(keys.length / 2));
  return hits >= Math.min(need, keys.length);
}

function keep(current: string | undefined, fallback: string): string {
  return current?.trim() || fallback;
}

export function synthesizeTicket(input: TicketDraftInput, services: ServiceKind[]): GeneratedTicket {
  const title = input.title?.trim() || '';
  const low = title.toLowerCase();
  const chosen = services.length ? services : inferServices(title, input.note) ;
  const kinds = chosen.length ? chosen : (['police'] as ServiceKind[]);
  const caller = keep(input.caller, 'Козлов Андрей Петрович');
  const phone = '9162401188';
  let address = keep(input.address, 'Москва, ул. Берзарина, дом 21, корп. 1');
  if (!input.address?.trim() && /лес|лесопарк|роща/.test(low)) {
    address = 'Москва, лесопарк Кузьминки, близ ул. Головачёва';
  }
  let opening = keep(input.opening, title ? `${title}, помогите` : 'Помогите, приезжайте');
  if (!input.opening?.trim() && low.startsWith('драка')) {
    const place = title.slice(5).trim() || 'здесь';
    opening = `${place.charAt(0).toUpperCase()}${place.slice(1)} дерутся, вызовите полицию`;
  } else if (!input.opening?.trim() && /пожар/.test(low)) {
    opening = `${title}, помогите, горит`;
  }
  const detail = /драка/.test(low)
    ? 'несколько человек бьют друг друга руками, пострадавших уточняет'
    : /пожар|задым/.test(low)
      ? 'видно дым и открытое горение, пострадавших на месте не видит'
      : 'происшествие продолжается, пострадавших уточняет';
  const situation = keep(
    input.situation,
    title ? `${title}. ${detail}. Звонит ${caller}, 916-240-11-88. Служб на месте нет.` : `${detail}. Звонит ${caller}, 916-240-11-88`,
  );
  return { situation, address, opening, services: kinds, caller, phone, source: 'local' };
}

export async function generateTicket(
  input: TicketDraftInput,
): Promise<{ ok: true; ticket: GeneratedTicket } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 25000);
  const inferred = inferServices(input.title, input.situation, input.opening, input.note);
  const services = inferred.length ? inferred : input.services;
  try {
    const response = await fetch('/api/llm/generate-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        services,
        note: input.note?.trim() || '',
        title: input.title?.trim() || '',
        situation: input.situation?.trim() || '',
        address: input.address?.trim() || '',
        opening: input.opening?.trim() || '',
        caller: input.caller?.trim() || '',
        classifier: input.classifier?.trim() || '',
        difficulty: input.difficulty?.trim() || '',
      }),
      signal: controller.signal,
    });
    const body = (await response.json()) as {
      ok?: unknown;
      message?: unknown;
      situation?: unknown;
      address?: unknown;
      opening?: unknown;
      services?: unknown;
      caller?: unknown;
      phone?: unknown;
      source?: unknown;
    };
    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        message: typeof body.message === 'string' ? body.message : 'Модель не ответила.',
      };
    }
    const parsedServices = Array.isArray(body.services)
      ? body.services.filter((item): item is ServiceKind => ALLOWED.includes(item as ServiceKind))
      : services;
    const ticket: GeneratedTicket = {
      situation: typeof body.situation === 'string' ? body.situation.trim() : '',
      address: typeof body.address === 'string' ? body.address.trim() : '',
      opening: typeof body.opening === 'string' ? body.opening.trim() : '',
      services: parsedServices.length ? parsedServices : services,
      caller: typeof body.caller === 'string' ? body.caller.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      source: typeof body.source === 'string' ? body.source : 'local',
    };
    if (!ticket.situation || !ticket.address || !ticketMatchesTitle(ticket, input.title)) {
      return { ok: true, ticket: synthesizeTicket(input, ticket.services.length ? ticket.services : services) };
    }
    return { ok: true, ticket };
  } catch {
    if (input.title?.trim()) {
      return { ok: true, ticket: synthesizeTicket(input, services) };
    }
    return { ok: false, message: 'Нет связи с Qwen. Проверьте, что модель запущена.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export function ticketTitle(ticket: GeneratedTicket, existing?: string): string {
  const kept = existing?.trim();
  if (kept) {
    return kept;
  }
  const core = ticket.situation.split(',')[0]?.trim() ?? '';
  if (core) {
    return core.slice(0, 72);
  }
  const labels = ticket.services.map((item) => SERVICE_LABEL[item]).join(', ');
  return labels || 'Новый билет';
}
