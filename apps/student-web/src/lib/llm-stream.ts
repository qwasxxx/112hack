import { parseLlmEvent, type LlmEvent } from './llm-protocol';

export type LlmStream = {
  start(): Promise<void>;
  kickoff(): void;
  sendUserFinal(id: string, text: string): void;
  analyze(text?: string): void;
  stop(): Promise<void>;
};

function llmSocketUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'ws://127.0.0.1:8091/ws/llm';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/llm`;
}

export function createLlmStream(options: {
  callId: string;
  conversationRole: 'victim' | 'operator';
  systemPrompt?: string;
  opening?: string;
  lessonId?: string;
  onEvent: (event: LlmEvent) => void;
  onError: (message: string) => void;
}): LlmStream {
  let socket: WebSocket | undefined;
  let started = false;
  let stopped = false;
  const queue: Record<string, unknown>[] = [];

  function flushQueue() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (queue.length) {
      socket.send(JSON.stringify(queue.shift()));
    }
  }

  function sendJson(payload: Record<string, unknown>) {
    if (stopped) {
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      queue.push(payload);
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function listen(live: WebSocket) {
    live.onmessage = (message) => {
      if (typeof message.data !== 'string') {
        return;
      }
      const parsed = parseLlmEvent(message.data);
      if (parsed?.type === 'error') {
        options.onError(parsed.message);
        return;
      }
      if (parsed) {
        options.onEvent(parsed);
      }
    };
  }

  async function start(): Promise<void> {
    if (started || stopped) {
      return;
    }
    socket = new WebSocket(llmSocketUrl());
    await new Promise<void>((resolve, reject) => {
      if (!socket) {
        reject(new Error('no socket'));
        return;
      }
      const timer = window.setTimeout(() => reject(new Error('Сервис диалога не отвечает.')), 6000);
      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            type: 'start',
            call_id: options.callId,
            conversation_role: options.conversationRole,
            system_prompt: options.systemPrompt,
            opening: options.opening,
            lesson_id: options.lessonId,
          }),
        );
      };
      socket.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Сервис диалога недоступен.'));
      };
      socket.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          return;
        }
        const event = parseLlmEvent(message.data);
        if (!event) {
          return;
        }
        if (event.type === 'ready') {
          window.clearTimeout(timer);
          started = true;
          if (socket) {
            listen(socket);
          }
          flushQueue();
          resolve();
          return;
        }
        if (event.type === 'error') {
          window.clearTimeout(timer);
          options.onError(event.message);
          reject(new Error(event.message));
        }
      };
    });
  }

  function sendUserFinal(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    sendJson({ type: 'user_final', id, text: trimmed });
  }

  function kickoff() {
    sendJson({ type: 'kickoff' });
  }

  function analyze(text?: string) {
    const payload: Record<string, unknown> = { type: 'analyze' };
    const trimmed = text?.trim();
    if (trimmed) {
      payload.id = crypto.randomUUID();
      payload.text = trimmed;
    }
    sendJson(payload);
  }

  async function stop(): Promise<void> {
    if (stopped) {
      return;
    }
    stopped = true;
    queue.length = 0;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      started = false;
      return;
    }
    const open = socket;
    try {
      open.send(JSON.stringify({ type: 'stop' }));
    } catch {
      undefined;
    }
    open.close();
    started = false;
    socket = undefined;
  }

  return { start, kickoff, sendUserFinal, analyze, stop };
}
