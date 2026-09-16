import { parseLlmEvent, type LlmEvent } from './llm-protocol';

export type LlmStream = {
  start(): Promise<void>;
  kickoff(): void;
  sendUserFinal(id: string, text: string): void;
  analyze(text?: string): void;
  stop(): Promise<void>;
};

export function createLlmStream(options: {
  callId: string;
  conversationRole: 'victim' | 'operator';
  systemPrompt?: string;
  lessonId?: string;
  onEvent: (event: LlmEvent) => void;
  onError: (message: string) => void;
}): LlmStream {
  let socket: WebSocket | undefined;
  let started = false;
  let stopped = false;

  async function assertHealth(): Promise<void> {
    try {
      const response = await fetch('/llm-health');
      if (!response.ok) {
        throw new Error('Сервис диалога недоступен.');
      }
      const body = (await response.json()) as { status?: string };
      if (body.status === 'loading') {
        throw new Error('Локальная модель ещё загружается. Повторите звонок через минуту.');
      }
      if (body.status !== 'ready') {
        throw new Error('Локальная модель Qwen недоступна.');
      }
    } catch (error) {
      if (error instanceof Error && /модель|диалог/i.test(error.message)) {
        throw error;
      }
      throw new Error('Сервис диалога недоступен.');
    }
  }

  async function start(): Promise<void> {
    if (started) {
      return;
    }
    stopped = false;
    await assertHealth();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/llm`);
    await new Promise<void>((resolve, reject) => {
      if (!socket) {
        reject(new Error('no socket'));
        return;
      }
      const timer = window.setTimeout(() => reject(new Error('Сервис диалога не отвечает.')), 8000);
      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            type: 'start',
            call_id: options.callId,
            conversation_role: options.conversationRole,
            system_prompt: options.systemPrompt,
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
          resolve();
          const live = socket;
          if (!live) {
            return;
          }
          live.onmessage = (next) => {
            if (typeof next.data !== 'string') {
              return;
            }
            const parsed = parseLlmEvent(next.data);
            if (parsed?.type === 'error') {
              options.onError(parsed.message);
              return;
            }
            if (parsed) {
              options.onEvent(parsed);
            }
          };
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

  function sendJson(payload: Record<string, unknown>) {
    if (!socket || socket.readyState !== WebSocket.OPEN || stopped) {
      return;
    }
    socket.send(JSON.stringify(payload));
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
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      started = false;
      return;
    }
    const open = socket;
    open.send(JSON.stringify({ type: 'stop' }));
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        open.close();
        resolve();
      }, 800);
      const previous = open.onmessage;
      open.onmessage = (message) => {
        previous?.call(open, message);
        window.clearTimeout(timer);
        open.close();
        resolve();
      };
    });
    started = false;
    socket = undefined;
  }

  return { start, kickoff, sendUserFinal, analyze, stop };
}
