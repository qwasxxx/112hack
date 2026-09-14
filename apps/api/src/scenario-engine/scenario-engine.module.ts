import { Module } from '@nestjs/common';
import { ScenarioEngine } from './scenario-engine';

@Module({
  providers: [ScenarioEngine],
  exports: [ScenarioEngine],
})
export class ScenarioEngineModule {}
