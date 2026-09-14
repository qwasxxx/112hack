export const API_VERSION = 'v1';
export const REALTIME_PROTOCOL_VERSION = 'v1';
export const REALTIME_NAMESPACE = '/realtime';

export const HealthStatus = {
  ok: 'ok',
  degraded: 'degraded',
  down: 'down',
} as const;

export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export interface HealthResponse {
  status: HealthStatus;
  service: 'api';
  version: string;
  uptimeSec: number;
}

export interface ReadyCheck {
  name: string;
  status: HealthStatus;
}

export interface ReadyResponse {
  status: HealthStatus;
  checks: ReadyCheck[];
}
