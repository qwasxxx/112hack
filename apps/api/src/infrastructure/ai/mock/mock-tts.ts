import { Injectable } from '@nestjs/common';
import type { TextToSpeechPort } from '../../../ports';

@Injectable()
export class MockTextToSpeech implements TextToSpeechPort {
  async synthesize(input: { text: string }): Promise<{ audio: Buffer; mimeType: string }> {
    return { audio: Buffer.from(input.text), mimeType: 'application/octet-stream' };
  }
}
