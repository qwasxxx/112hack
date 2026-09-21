import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database/database.service';

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async append(entry: {
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (this.database.status !== 'connected') {
      return;
    }
    const sql = this.database.requireSql();
    await sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, payload)
      VALUES (
        ${entry.actorId ?? null},
        ${entry.action},
        ${entry.entityType},
        ${entry.entityId},
        ${JSON.stringify(entry.payload ?? {})}::jsonb
      )
    `;
  }
}
