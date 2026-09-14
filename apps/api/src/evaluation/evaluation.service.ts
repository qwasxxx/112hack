import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '../common/tokens';
import type { EvaluationModelPort, JobQueuePort } from '../ports';

@Injectable()
export class EvaluationService {
  constructor(
    @Inject(TOKENS.EVALUATION_MODEL) private readonly model: EvaluationModelPort,
    @Inject(TOKENS.JOB_QUEUE) private readonly jobs: JobQueuePort,
  ) {}

  async queue(callId: string): Promise<{ jobId: string }> {
    return this.jobs.enqueue('evaluation', { callId });
  }
}
