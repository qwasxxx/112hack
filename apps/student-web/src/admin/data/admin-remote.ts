import type { Role } from '@sys112/shared-types';

export type RemoteUser = {
  id: string;
  login: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'blocked';
  createdAt: string;
};

export type ContourStatus = {
  at: string;
  services: Array<{ id: string; running: boolean; title: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function loginRemote(login: string, password: string) {
  return request<{ ok: boolean; user?: RemoteUser; message?: string }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
}

export function registerRemote(input: { login: string; email?: string; name: string; password: string }) {
  return request<{ ok: boolean; user?: RemoteUser; message?: string }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRemoteUsers() {
  return request<RemoteUser[]>('/api/v1/users');
}

export function createRemoteUser(input: {
  login: string;
  name: string;
  role: Role;
  password: string;
}) {
  return request<{ ok: boolean; user?: RemoteUser }>('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchRemoteUser(
  id: string,
  input: { role?: Role; status?: 'active' | 'blocked'; password?: string; name?: string },
) {
  return request<{ ok: boolean; user?: RemoteUser }>(`/api/v1/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function pullContourStatus() {
  return request<ContourStatus>('/api/v1/admin/status');
}

export function pullBackupStatus() {
  return request<{ lastAt: string | null; lastFile: string | null }>('/api/v1/admin/backup/status');
}

export function createRemoteBackup() {
  return request<Record<string, unknown>>('/api/v1/admin/backup', { method: 'POST' });
}
