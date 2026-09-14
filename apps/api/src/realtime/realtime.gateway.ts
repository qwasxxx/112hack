import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  REALTIME_NAMESPACE,
  REALTIME_PROTOCOL_VERSION,
  realtimeCommandSchema,
  type RealtimeEvent,
} from '@sys112/shared-types';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    const event = {
      type: 'ConnectionEstablished' as const,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      payload: {
        connectionId: client.id,
        protocolVersion: REALTIME_PROTOCOL_VERSION,
      },
    } satisfies Extract<RealtimeEvent, { type: 'ConnectionEstablished' }>;
    client.emit('event', event);
    this.logger.debug(`connected ${client.id}`);
  }

  @SubscribeMessage('command')
  handleCommand(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): void {
    const parsed = realtimeCommandSchema.safeParse(body);
    if (!parsed.success) {
      client.emit('event', {
        type: 'ConnectionEstablished',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: { connectionId: client.id, protocolVersion: REALTIME_PROTOCOL_VERSION },
      });
      return;
    }

    if (parsed.data.type === 'Ping') {
      client.emit('event', {
        type: 'ConnectionEstablished',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: { connectionId: client.id, protocolVersion: REALTIME_PROTOCOL_VERSION },
      });
      return;
    }

    if (parsed.data.type === 'JoinCall') {
      void client.join(`call:${parsed.data.callId}`);
    }

    if (parsed.data.type === 'LeaveCall') {
      void client.leave(`call:${parsed.data.callId}`);
    }
  }

  broadcast(event: unknown): void {
    const typed = event as RealtimeEvent;
    if (typed && 'callId' in typed && typed.callId) {
      this.server.to(`call:${typed.callId}`).emit('event', typed);
      return;
    }
    this.server.emit('event', event);
  }
}
