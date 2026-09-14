import { Injectable } from '@nestjs/common';
import type { LanguageModelPort } from '../../../ports';

@Injectable()
export class MockLanguageModel implements LanguageModelPort {
  async complete(): Promise<{ text: string }> {
    return { text: '{"utterance":"Алло, мне нужна помощь.","revealedFactIds":[]}' };
  }
}
