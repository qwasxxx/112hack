import { Injectable } from '@nestjs/common';
import type {
  ScenarioDefinition,
  ScenarioRuntimeState,
  TeacherInterventionCommand,
} from '@sys112/shared-types';

@Injectable()
export class ScenarioEngine {
  createInitialState(input: {
    callId: string;
    definition: ScenarioDefinition;
    now: string;
  }): ScenarioRuntimeState {
    const hidden = input.definition.facts
      .filter((fact) => fact.visibility === 'hidden' || fact.visibility === 'discoverable')
      .map((fact) => fact.id);
    const callerKnows = input.definition.facts
      .filter((fact) => fact.visibility === 'caller_knows' || fact.visibility === 'public')
      .map((fact) => fact.id);

    return {
      callId: input.callId,
      scenarioId: input.definition.id,
      scenarioVersion: input.definition.version,
      currentStateId: input.definition.initialStateId,
      outcome: 'in_progress',
      emotionalState: input.definition.initialEmotionalState,
      factsKnownByCaller: callerKnows,
      factsDiscoveredByStudent: [],
      factsStillHidden: hidden,
      completedActionIds: [],
      forbiddenActionIds: [],
      activeModifiers: [],
      incidentCardValues: {},
      stateVersion: 0,
      updatedAt: input.now,
    };
  }

  applyIntervention(input: {
    state: ScenarioRuntimeState;
    definition: ScenarioDefinition;
    command: TeacherInterventionCommand;
    interventionId: string;
    now: string;
  }): ScenarioRuntimeState {
    const allowed = input.definition.allowedInterventions.includes(input.command.type);
    if (!allowed) {
      return input.state;
    }

    const next: ScenarioRuntimeState = {
      ...input.state,
      updatedAt: input.now,
      activeModifiers: [
        ...input.state.activeModifiers,
        {
          sourceInterventionId: input.interventionId,
          kind: input.command.type,
          payload: input.command.params,
        },
      ],
    };

    if (input.command.type === 'set_emotional_state' && this.isEmotionalState(input.command.params)) {
      next.emotionalState = input.command.params;
    }

    if (input.command.type === 'force_state' && typeof input.command.params.stateId === 'string') {
      next.currentStateId = input.command.params.stateId;
    }

    if (input.command.type === 'end_call') {
      next.outcome = 'partial';
    }

    return next;
  }

  buildCallerContext(definition: ScenarioDefinition, state: ScenarioRuntimeState): string {
    const knownFacts = definition.facts
      .filter((fact) => state.factsKnownByCaller.includes(fact.id))
      .map((fact) => `${fact.label}: ${fact.value}`)
      .join('\n');

    return [
      definition.systemInstructions,
      `state=${state.currentStateId}`,
      `emotion=${state.emotionalState.primary}:${state.emotionalState.intensity}`,
      `known_facts:\n${knownFacts}`,
    ].join('\n');
  }

  private isEmotionalState(
    value: Record<string, unknown>,
  ): value is ScenarioRuntimeState['emotionalState'] {
    return (
      typeof value.primary === 'string' &&
      typeof value.intensity === 'number' &&
      typeof value.stability === 'number'
    );
  }
}
