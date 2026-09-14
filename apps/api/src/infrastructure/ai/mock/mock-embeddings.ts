import { Injectable } from '@nestjs/common';
import type { EmbeddingsPort } from '../../../ports';

@Injectable()
export class MockEmbeddings implements EmbeddingsPort {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(8).fill(0);
      vector[0] = text.length;
      return vector;
    });
  }
}
