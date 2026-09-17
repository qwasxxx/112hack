import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import type { TheoryRegionId } from './types';

export type ArmGuidedState = {
  activeRegionIds: TheoryRegionId[];
  onSelectRegion: (id: TheoryRegionId) => void;
};

const ArmGuidedContext = createContext<ArmGuidedState | null>(null);

export function ArmGuidedProvider(props: { value: ArmGuidedState | null; children: ReactNode }) {
  return <ArmGuidedContext.Provider value={props.value}>{props.children}</ArmGuidedContext.Provider>;
}

export function useArmGuided(): ArmGuidedState | null {
  return useContext(ArmGuidedContext);
}

export function useArmRegionProps(id: TheoryRegionId) {
  const guided = useArmGuided();
  const active = Boolean(guided?.activeRegionIds.includes(id));
  return {
    'data-arm-region': id,
    className: guided ? `arm-region${active ? ' is-active' : ''}` : '',
    onClick: guided
      ? (event: MouseEvent) => {
          event.stopPropagation();
          guided.onSelectRegion(id);
        }
      : undefined,
  };
}

export function mergeClassName(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}
