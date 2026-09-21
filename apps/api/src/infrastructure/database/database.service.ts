import { Injectable } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { AppEnv } from '../config/env';
import * as schema from './schema';

@Injectable()
export class DatabaseService {
  private client: Sql | undefined;
  db: PostgresJsDatabase<typeof schema> | undefined;
  status: 'disabled' | 'connected' | 'error' = 'disabled';
  lastError?: string;

  constructor(private readonly env: AppEnv) {}

  async connect(): Promise<void> {
    if (!this.env.DATABASE_URL) {
      this.status = 'disabled';
      return;
    }
    try {
      this.client = postgres(this.env.DATABASE_URL, { max: 4 });
      this.db = drizzle(this.client, { schema });
      await this.client`select 1`;
      this.status = 'connected';
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : 'unknown';
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      await this.client`select 1`;
      this.status = 'connected';
      return true;
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : 'unknown';
      return false;
    }
  }

  requireSql(): Sql {
    if (!this.client || this.status !== 'connected') {
      throw new Error(this.lastError || 'База данных недоступна');
    }
    return this.client;
  }
}
