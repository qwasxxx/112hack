import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './catalog/catalog.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ProgressModule } from './progress/progress.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ScenarioEngineModule } from './scenario-engine/scenario-engine.module';
import { TrainingModule } from './training/training.module';

@Module({
  imports: [
    InfrastructureModule,
    HealthModule,
    IdentityModule,
    CatalogModule,
    ScenarioEngineModule,
    TrainingModule,
    EvaluationModule,
    KnowledgeModule,
    RealtimeModule,
    AuditModule,
    ProgressModule,
  ],
})
export class AppModule {}
