import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '@sys112/shared-types';
import { DatabaseService } from '../infrastructure/database/database.service';

export type UserRecord = {
  id: string;
  login: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'blocked';
  createdAt: string;
};

type UserRow = {
  id: string;
  login: string | null;
  email: string;
  display_name: string;
  role: string;
  deactivated_at: Date | string | null;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    login: row.login || row.email,
    email: row.email,
    name: row.display_name,
    role: row.role as Role,
    status: row.deactivated_at ? 'blocked' : 'active',
    createdAt: toIso(row.created_at),
  };
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  roles(): Role[] {
    return ['STUDENT', 'TEACHER', 'ADMIN'] as Role[];
  }

  async login(login: string, password: string): Promise<UserRecord | null> {
    const sql = this.database.requireSql();
    const key = login.trim().toLowerCase();
    const [row] = await sql<UserRow[]>`
      SELECT id, login, email, display_name, role, deactivated_at, created_at
      FROM users
      WHERE (lower(coalesce(login, '')) = ${key} OR lower(email) = ${key})
        AND password_hash = crypt(${password}, password_hash)
      LIMIT 1
    `;
    if (!row) {
      return null;
    }
    if (row.deactivated_at) {
      throw new Error('blocked');
    }
    return mapUser(row);
  }

  async listUsers(): Promise<UserRecord[]> {
    const sql = this.database.requireSql();
    const rows = await sql<UserRow[]>`
      SELECT id, login, email, display_name, role, deactivated_at, created_at
      FROM users
      ORDER BY display_name
    `;
    return rows.map(mapUser);
  }

  async createUser(input: {
    login: string;
    email?: string;
    name: string;
    role: Role;
    password: string;
  }): Promise<UserRecord> {
    const sql = this.database.requireSql();
    const login = input.login.trim().toLowerCase();
    const email = (input.email || `${login}@sys112.local`).trim().toLowerCase();
    const [row] = await sql<UserRow[]>`
      INSERT INTO users (email, password_hash, display_name, role, login)
      VALUES (${email}, crypt(${input.password}, gen_salt('bf')), ${input.name.trim()}, ${input.role}, ${login})
      RETURNING id, login, email, display_name, role, deactivated_at, created_at
    `;
    return mapUser(row);
  }

  async patchUser(
    id: string,
    input: { role?: Role; status?: 'active' | 'blocked'; password?: string; name?: string },
  ): Promise<UserRecord | null> {
    const sql = this.database.requireSql();
    if (input.password) {
      await sql`UPDATE users SET password_hash = crypt(${input.password}, gen_salt('bf')), updated_at = now() WHERE id = ${id}`;
    }
    if (input.role) {
      await sql`UPDATE users SET role = ${input.role}, updated_at = now() WHERE id = ${id}`;
    }
    if (input.name) {
      await sql`UPDATE users SET display_name = ${input.name}, updated_at = now() WHERE id = ${id}`;
    }
    if (input.status === 'blocked') {
      await sql`UPDATE users SET deactivated_at = now(), updated_at = now() WHERE id = ${id}`;
    }
    if (input.status === 'active') {
      await sql`UPDATE users SET deactivated_at = NULL, updated_at = now() WHERE id = ${id}`;
    }
    const [row] = await sql<UserRow[]>`
      SELECT id, login, email, display_name, role, deactivated_at, created_at
      FROM users WHERE id = ${id}
    `;
    return row ? mapUser(row) : null;
  }
}
