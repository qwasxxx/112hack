import { parseLlmEvent, type LlmEvent } from './llm-protocol';

export type LlmStream = {
  start(): Promise<void>;
  kickoff(): void;
  sendUserFinal(id: string, text: string): void;
  analyze(text?: string): void;
  stop(): Promise<void>;
};

function llmSocketUrl(): string {
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
    live.onclose = () => {
      if (!stopped && started) {
        options.onError('Связь с моделью оборвалась.');
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
      let settled = false;
      const timer = window.setTimeout(() => finish(() => reject(new Error('Сервис диалога не отвечает.'))), 20000);
      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        fn();
      };
      socket.onopen = () => {
        if (stopped) {
          socket?.close();
          finish(() => reject(new Error('stopped')));
          return;
        }
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
        if (stopped) {
          finish(() => reject(new Error('stopped')));
          return;
        }
        finish(() => reject(new Error('Сервис диалога недоступен.')));
      };
      socket.onclose = () => {
        if (settled) {
          return;
        }
        if (stopped) {
          finish(() => reject(new Error('stopped')));
          return;
        }
        finish(() => reject(new Error('Сервис диалога недоступен.')));
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
          started = true;
          if (socket) {
            listen(socket);
          }
          flushQueue();
          finish(() => resolve());
          return;
        }
        if (event.type === 'error') {
          options.onError(event.message);
          finish(() => reject(new Error(event.message)));
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
    const open = socket;
    started = false;
    socket = undefined;
    if (!open) {
      return;
    }
    try {
      if (open.readyState === WebSocket.OPEN) {
        open.send(JSON.stringify({ type: 'stop' }));
      }
    } catch {
      undefined;
    }
    try {
      open.close();
    } catch {
      undefined;
    }
  }

  return { start, kickoff, sendUserFinal, analyze, stop };
}

export function warmupLesson(options: {
  conversationRole: 'victim' | 'operator';
  systemPrompt?: string;
  opening?: string;
}): void {
  void fetch('/api/llm/warmup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_role: options.conversationRole,
      system_prompt: options.systemPrompt,
      opening: options.opening,
    }),
  }).catch(() => undefined);
}
