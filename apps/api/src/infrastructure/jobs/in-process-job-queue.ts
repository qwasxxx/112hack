import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JobName, JobQueuePort } from '../../ports';

@Injectable()
export class InProcessJobQueue implements JobQueuePort {
  async enqueue(name: JobName, payload: Record<string, unknown>): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    setTimeout(() => {
      void name;
      void payload;
    }, 0);
    return { jobId };
  }
}
