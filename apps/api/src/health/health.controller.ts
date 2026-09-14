import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse, ReadyResponse } from '@sys112/shared-types';
import { DatabaseService } from '../infrastructure/database/database.service';

const startedAt = Date.now();

@Controller('api/v1')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      version: '0.0.1',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    };
  }

  @Get('ready')
  async ready(): Promise<ReadyResponse> {
    const dbUp = this.database.status === 'connected' ? await this.database.ping() : false;
    const dbStatus = this.database.status === 'disabled' ? 'degraded' : dbUp ? 'ok' : 'down';
    const status = dbStatus === 'down' ? 'degraded' : 'ok';
    return {
      status,
      checks: [
        { name: 'database', status: dbStatus },
        { name: 'realtime', status: 'ok' },
        { name: 'ai_adapters', status: 'ok' },
      ],
    };
  }
}
