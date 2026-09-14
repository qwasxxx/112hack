import { Injectable } from '@nestjs/common';
import type { EventBusPort } from '../../ports';

@Injectable()
export class InProcessEventBus implements EventBusPort {
  private readonly handlers = new Set<(event: unknown) => void>();

  async publish(event: unknown): Promise<void> {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  subscribe(handler: (event: unknown) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
