import { Module } from '@nestjs/common';
import { RealtimeBridge } from './realtime.bridge';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, RealtimeBridge],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
