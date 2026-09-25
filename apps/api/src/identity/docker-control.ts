import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ControllableService = 'stt' | 'llm' | 'tts' | 'postgres' | 'api' | 'realtime';

const MAP: Record<
  ControllableService,
  { names: string[]; compose: string[]; health?: string; stopHttp?: string; allowStop: boolean }
> = {
  stt: {
    names: ['sys112-stt'],
    compose: ['stt'],
    health: process.env.STT_HEALTH_URL || 'http://127.0.0.1:8090/health',
    stopHttp: 'http://127.0.0.1:8090/control/stop',
    allowStop: true,
  },
  llm: {
    names: ['sys112-llm'],
    compose: ['llm'],
    health: process.env.LLM_HEALTH_URL || 'http://127.0.0.1:8091/health',
    stopHttp: 'http://127.0.0.1:8091/control/stop',
    allowStop: true,
  },
  tts: {
    names: ['sys112-tts'],
    compose: ['tts'],
    health: process.env.TTS_HEALTH_URL || 'http://127.0.0.1:8092/health',
    stopHttp: 'http://127.0.0.1:8092/control/stop',
    allowStop: true,
  },
  postgres: {
    names: ['sys112-postgres'],
    compose: ['postgres'],
    allowStop: false,
  },
  api: {
    names: ['sys112-api'],
    compose: ['api'],
    allowStop: false,
  },
  realtime: {
    names: ['sys112-api'],
    compose: ['api'],
    allowStop: false,
  },
};

function sockPath(): string | null {
  const fromEnv = process.env.DOCKER_SOCK;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  if (existsSync('/var/run/docker.sock')) {
    return '/var/run/docker.sock';
  }
  return null;
}

function dockerRequest(method: string, path: string): Promise<{ status: number; body: string }> {
  const socketPath = sockPath() ?? '\\\\.\\pipe\\docker_engine';
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path,
        method,
        headers: { Host: 'localhost', 'Content-Length': 0 },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function dockerCli(args: string[]): Promise<boolean> {
  try {
    await execFileAsync('docker', args, { timeout: 25000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function containersByName(names: string[]): Promise<string[]> {
  try {
    const { body, status } = await dockerRequest('GET', '/containers/json?all=true');
    if (status < 200 || status >= 300) {
      return [];
    }
    const list = JSON.parse(body) as Array<{ Id: string; Names?: string[] }>;
    const wanted = new Set(names);
    return list
      .filter((item) => (item.Names ?? []).some((name) => wanted.has(name.replace(/^\//, ''))))
      .map((item) => item.Id);
  } catch {
    return [];
  }
}

async function engineAction(ids: string[], action: 'start' | 'stop'): Promise<boolean> {
  let any = false;
  for (const id of ids) {
    try {
      const { status } = await dockerRequest('POST', `/containers/${id}/${action}?t=8`);
      if (status >= 200 && status < 300) {
        any = true;
      }
    } catch {
      undefined;
    }
  }
  return any;
}

async function httpStop(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function controlService(
  id: ControllableService,
  action: 'start' | 'stop',
): Promise<{ ok: boolean; message: string }> {
  const spec = MAP[id];
  if (!spec) {
    return { ok: false, message: 'Неизвестный сервис' };
  }
  if (action === 'stop' && !spec.allowStop) {
    return { ok: false, message: 'Этот слой нельзя гасить из админки — остановится весь контур' };
  }

  const ids = await containersByName(spec.names);
  if (ids.length) {
    const ok = await engineAction(ids, action);
    if (ok) {
      return { ok: true, message: action === 'start' ? 'Контейнер запущен' : 'Контейнер остановлен' };
    }
  }

  const byName = await Promise.all(spec.names.map((name) => dockerCli([action, name])));
  if (byName.some(Boolean)) {
    return { ok: true, message: action === 'start' ? 'Контейнер запущен' : 'Контейнер остановлен' };
  }

  if (await dockerCli(['compose', action, ...spec.compose])) {
    return { ok: true, message: action === 'start' ? 'Сервис compose запущен' : 'Сервис compose остановлен' };
  }

  if (action === 'stop' && spec.stopHttp) {
    const ok = await httpStop(spec.stopHttp);
    if (ok) {
      return { ok: true, message: 'Процесс остановлен' };
    }
  }

  return {
    ok: false,
    message:
      action === 'start'
        ? 'Не удалось запустить. Если сервисы на хосте — поднимите их снова (scripts/up.ps1 или docker compose up).'
        : 'Не удалось остановить. Нужен Docker сокета или CLI.',
  };
}
