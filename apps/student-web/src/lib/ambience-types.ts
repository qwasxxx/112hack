export type AmbienceType =
  | 'FIRE'
  | 'TRAFFIC_ACCIDENT'
  | 'POLICE_OR_FIGHT'
  | 'GAS'
  | 'MEDICAL'
  | 'INFRASTRUCTURE'
  | 'WATER_FLOOD'
  | 'EXPLOSION_AFTERMATH'
  | 'CROWD_PUBLIC_PLACE'
  | 'GENERIC_EMERGENCY'
  | 'QUIET';

export type AmbienceLayerKind =
  | 'fire_crackle'
  | 'traffic_road'
  | 'siren_distant'
  | 'street'
  | 'crowd'
  | 'room'
  | 'wind'
  | 'water'
  | 'phone'
  | 'impact'
  | 'bystander';

export type AmbienceLayer = {
  id: string;
  kind: AmbienceLayerKind;
  loop: boolean;
  gain: number;
  assetUrl: string | null;
  fallbackUrls: string[];
  delaySec: number;
};

export type AmbienceProfile = {
  type: AmbienceType;
  gain: number;
  duckRatio: number;
  assetUrl: string | null;
  layers: AmbienceLayer[];
  variation: {
    gainScale: number;
    loopOffsetRatio: number;
  };
};

export const AMBIENCE_TYPES: readonly AmbienceType[] = [
  'FIRE',
  'TRAFFIC_ACCIDENT',
  'POLICE_OR_FIGHT',
  'GAS',
  'MEDICAL',
  'INFRASTRUCTURE',
  'WATER_FLOOD',
  'EXPLOSION_AFTERMATH',
  'CROWD_PUBLIC_PLACE',
  'GENERIC_EMERGENCY',
  'QUIET',
] as const;
