import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';

@Controller('api/v1/admin')
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly admin: AdminService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('status')
  status() {
    return this.admin.status();
  }

  @Get('audit')
  auditLog() {
    return this.admin.listAudit();
  }

  @Get('backup/status')
  backupStatus() {
    return this.admin.backupStatus();
  }

  @Post('backup')
  async backup() {
    const snapshot = await this.admin.backup();
    await this.audit.append({
      action: 'backup_created',
      entityType: 'backup',
      entityId: snapshot.at,
      payload: { userCount: snapshot.users.length, lessonCount: snapshot.lessons.length },
    });
    return snapshot;
  }

  @Post('services/:id/:action')
  async toggle(@Param('id') id: string, @Param('action') action: string) {
    const result = await this.admin.control(id, action);
    await this.audit.append({
      action: action === 'start' ? 'service_started' : 'service_stopped',
      entityType: 'service',
      entityId: id,
      payload: result,
    });
    return result;
  }
}
