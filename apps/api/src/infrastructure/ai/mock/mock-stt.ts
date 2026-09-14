import { Injectable } from '@nestjs/common';
import type { SpeechToTextPort } from '../../../ports';

@Injectable()
export class MockSpeechToText implements SpeechToTextPort {
  async transcribe(): Promise<{ text: string; isFinal: true }> {
    return { text: '', isFinal: true };
  }
}
