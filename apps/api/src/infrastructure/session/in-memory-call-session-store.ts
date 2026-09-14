import { ConflictException, Injectable } from '@nestjs/common';
import type { ScenarioRuntimeState } from '@sys112/shared-types';
import type { CallSessionStorePort } from '../../ports';

@Injectable()
export class InMemoryCallSessionStore implements CallSessionStorePort {
  private readonly sessions = new Map<string, ScenarioRuntimeState>();

  async get(callId: string): Promise<ScenarioRuntimeState | undefined> {
    return this.sessions.get(callId);
  }

  async save(state: ScenarioRuntimeState, expectedVersion: number): Promise<ScenarioRuntimeState> {
    const current = this.sessions.get(state.callId);
    if (current && current.stateVersion !== expectedVersion) {
      throw new ConflictException('Scenario state version conflict');
    }
    const next = { ...state, stateVersion: expectedVersion + 1 };
    this.sessions.set(state.callId, next);
    return next;
  }

  async delete(callId: string): Promise<void> {
    this.sessions.delete(callId);
  }
}
