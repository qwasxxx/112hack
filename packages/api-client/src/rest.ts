import type { HealthResponse, ReadyResponse } from '@sys112/shared-types';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<HealthResponse> {
    return this.getJson('/api/v1/health');
  }

  async ready(): Promise<ReadyResponse> {
    return this.getJson('/api/v1/ready');
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiClientError(`HTTP ${response.status} ${path}`, response.status, body);
    }
    return body as T;
  }
}
