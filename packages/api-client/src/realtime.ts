import { io, type Socket } from 'socket.io-client';
import {
  REALTIME_NAMESPACE,
  realtimeCommandSchema,
  realtimeEventSchema,
  type RealtimeCommand,
  type RealtimeEvent,
} from '@sys112/shared-types';

export type RealtimeHandler = (event: RealtimeEvent) => void;

export class RealtimeClient {
  private socket: Socket | undefined;
  private readonly handlers = new Set<RealtimeHandler>();

  constructor(private readonly baseUrl: string) {}

  connect(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(`${this.baseUrl}${REALTIME_NAMESPACE}`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('event', (raw: unknown) => {
      const parsed = realtimeEventSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      for (const handler of this.handlers) {
        handler(parsed.data);
      }
    });
  }

  onEvent(handler: RealtimeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  send(command: RealtimeCommand): void {
    const parsed = realtimeCommandSchema.parse(command);
    this.socket?.emit('command', parsed);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
