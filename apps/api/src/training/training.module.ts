import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ScenarioEngineModule } from '../scenario-engine/scenario-engine.module';
import { CallOrchestrator } from './call-orchestrator';
import { InterventionService } from './intervention.service';
import { TrainingController } from './training.controller';

@Module({
  imports: [ScenarioEngineModule, AuditModule],
  controllers: [TrainingController],
  providers: [CallOrchestrator, InterventionService],
  exports: [CallOrchestrator, InterventionService],
})
export class TrainingModule {}
