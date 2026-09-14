import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ScenarioDefinition, TeacherInterventionCommand } from '@sys112/shared-types';
import { TOKENS } from '../common/tokens';
import type { CallSessionStorePort, EventBusPort } from '../ports';
import { ScenarioEngine } from '../scenario-engine/scenario-engine';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InterventionService {
  constructor(
    @Inject(ScenarioEngine) private readonly engine: ScenarioEngine,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TOKENS.CALL_SESSION_STORE) private readonly sessions: CallSessionStorePort,
    @Inject(TOKENS.EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async apply(input: {
    command: TeacherInterventionCommand;
    teacherId: string;
    definition: ScenarioDefinition;
  }) {
    const current = await this.sessions.get(input.command.callId);
    if (!current) {
      throw new NotFoundException('Active call not found');
    }

    const interventionId = randomUUID();
    const next = this.engine.applyIntervention({
      state: current,
      definition: input.definition,
      command: input.command,
      interventionId,
      now: new Date().toISOString(),
    });

    const saved = await this.sessions.save(next, current.stateVersion);
    await this.audit.append({
      actorId: input.teacherId,
      action: 'teacher.intervention',
      entityType: 'call',
      entityId: input.command.callId,
      payload: { type: input.command.type, interventionId },
    });
    await this.events.publish({
      type: 'TeacherInterventionApplied',
      eventId: randomUUID(),
      callId: input.command.callId,
      occurredAt: saved.updatedAt,
      payload: {
        interventionId,
        type: input.command.type,
        teacherId: input.teacherId,
      },
    });
    await this.events.publish({
      type: 'ScenarioStateChanged',
      eventId: randomUUID(),
      callId: input.command.callId,
      occurredAt: saved.updatedAt,
      payload: {
        currentStateId: saved.currentStateId,
        outcome: saved.outcome,
        emotionalState: saved.emotionalState,
        stateVersion: saved.stateVersion,
      },
    });
    return saved;
  }
}
