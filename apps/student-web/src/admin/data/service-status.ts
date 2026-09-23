import type { ServiceRecord } from './admin';

export type ConnectionStatus = 'ok' | 'bad' | 'pending';
export type ServiceViewState = 'running' | 'stopped' | 'checking' | 'error';
export type ServiceTone = 'ok' | 'warn' | 'bad' | 'off';

export type LiveHealth = {
  api: ConnectionStatus;
  realtime: ConnectionStatus;
  dbLive: boolean;
  busyIds?: ReadonlySet<ServiceRecord['id']>;
};

export function resolveServiceView(service: ServiceRecord, live: LiveHealth): ServiceViewState {
  if (live.busyIds?.has(service.id)) {
    return 'checking';
  }
  if (!service.running) {
    return 'stopped';
  }
  if (service.id === 'api') {
    if (live.api === 'pending') {
      return 'checking';
    }
    if (live.api === 'bad') {
      return 'error';
    }
  }
  if (service.id === 'realtime') {
    if (live.realtime === 'pending') {
      return 'checking';
    }
    if (live.realtime === 'bad') {
      return 'error';
    }
  }
  if (service.id === 'postgres' && !live.dbLive) {
    return 'error';
  }
  if ((service.id === 'stt' || service.id === 'llm' || service.id === 'tts') && service.ready === false) {
    return 'checking';
  }
  return 'running';
}

export function serviceStatusLabel(state: ServiceViewState, note?: string): string {
  if (state === 'running') {
    return 'Работает';
  }
  if (state === 'stopped') {
    return 'Остановлен';
  }
  if (state === 'checking') {
    return note?.includes('загрузка') ? 'Загрузка модели' : 'Проверка';
  }
  return 'Нет связи';
}

export function serviceActionLabel(state: ServiceViewState): string {
  if (state === 'checking') {
    return 'Проверка';
  }
  if (state === 'stopped') {
    return 'Запустить';
  }
  return 'Остановить';
}

export function serviceActionDisabled(state: ServiceViewState): boolean {
  return state === 'checking';
}

export function serviceTone(state: ServiceViewState): ServiceTone {
  if (state === 'running') {
    return 'ok';
  }
  if (state === 'checking') {
    return 'warn';
  }
  if (state === 'stopped') {
    return 'off';
  }
  return 'bad';
}

export function serviceActionDanger(state: ServiceViewState): boolean {
  return state === 'running' || state === 'error';
}
