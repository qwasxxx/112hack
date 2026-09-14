import { Injectable } from '@nestjs/common';
import type { EvaluationModelPort } from '../../../ports';

@Injectable()
export class MockEvaluationModel implements EvaluationModelPort {
  async evaluate(): Promise<{ json: unknown; rawText: string }> {
    return { json: { placeholder: true }, rawText: '{}' };
  }
}
