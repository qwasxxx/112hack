import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  async append(_entry: {
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    return;
  }
}
