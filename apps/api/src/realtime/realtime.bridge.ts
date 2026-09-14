import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TOKENS } from '../common/tokens';
import type { EventBusPort } from '../ports';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeBridge implements OnModuleInit {
  private readonly logger = new Logger(RealtimeBridge.name);

  constructor(
    @Inject(TOKENS.EVENT_BUS) private readonly events: EventBusPort,
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    this.events.subscribe((event) => {
      this.gateway.broadcast(event);
    });
    this.logger.log('Realtime bridge subscribed to in-process event bus');
  }
}
