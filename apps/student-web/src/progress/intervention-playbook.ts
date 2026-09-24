import type { InterventionType } from '@sys112/shared-types';

export function pickInterventionNote(_type: InterventionType, custom?: string): string {
  return custom?.trim() ?? '';
}
