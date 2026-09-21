import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';

@Module({
  imports: [AuditModule],
  controllers: [IdentityController, AdminController],
  providers: [IdentityService, AdminService],
  exports: [IdentityService],
})
export class IdentityModule {}
