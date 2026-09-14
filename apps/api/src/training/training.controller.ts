import { Controller, Get, Inject } from '@nestjs/common';
import { CallOrchestrator } from './call-orchestrator';

@Controller('api/v1/training')
export class TrainingController {
  constructor(@Inject(CallOrchestrator) private readonly orchestrator: CallOrchestrator) {}

  @Get('pipeline')
  pipeline() {
    return { steps: this.orchestrator.getPipelineSteps() };
  }
}
