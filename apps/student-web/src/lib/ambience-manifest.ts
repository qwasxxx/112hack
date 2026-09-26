import type { AmbienceLayerKind, AmbienceType } from './ambience-types.ts';

export const AMBIENCE_PUBLIC_DIR = '/audio/ambience';

export const AMBIENCE_FILES = {
  fireLoop: `${AMBIENCE_PUBLIC_DIR}/fire_loop.mp3`,
  trafficLoop: `${AMBIENCE_PUBLIC_DIR}/traffic_accident_loop.mp3`,
  streetCrowdLoop: `${AMBIENCE_PUBLIC_DIR}/street_crowd_loop.mp3`,
  argumentCrowdLoop: `${AMBIENCE_PUBLIC_DIR}/argument_crowd_loop.mp3`,
  gasBuildingLoop: `${AMBIENCE_PUBLIC_DIR}/gas_building_loop.mp3`,
  medicalRoomLoop: `${AMBIENCE_PUBLIC_DIR}/medical_room_loop.mp3`,
  urbanLoop: `${AMBIENCE_PUBLIC_DIR}/urban_infrastructure_loop.mp3`,
  waterLoop: `${AMBIENCE_PUBLIC_DIR}/water_emergency_loop.mp3`,
  genericLoop: `${AMBIENCE_PUBLIC_DIR}/generic_emergency_loop.mp3`,
  sirenLoop: `${AMBIENCE_PUBLIC_DIR}/distant_siren_loop.mp3`,
  explosionOneshot: `${AMBIENCE_PUBLIC_DIR}/explosion_oneshot.mp3`,
  collisionOneshot: `${AMBIENCE_PUBLIC_DIR}/collision_oneshot.mp3`,
  fireVoicesLoop: `${AMBIENCE_PUBLIC_DIR}/fire_voices_loop.mp3`,
} as const;

export type AmbienceAssetId = keyof typeof AMBIENCE_FILES;

export type AmbienceManifestLayer = {
  id: string;
  kind: AmbienceLayerKind;
  asset: AmbienceAssetId;
  fallbacks: AmbienceAssetId[];
  gain: number;
  loop: boolean;
  delaySec?: number;
};

export type AmbienceManifestEntry = {
  type: AmbienceType;
  /** Master bed gain. Speech stays dominant. */
  gain: number;
  duckRatio: number;
  layers: AmbienceManifestLayer[];
};

/** Conservative call-length beds. Voice is never mixed into these files. */
export const AMBIENCE_MANIFEST: Record<AmbienceType, AmbienceManifestEntry> = {
  FIRE: {
    type: 'FIRE',
    gain: 0.17,
    duckRatio: 0.46,
    layers: [
      { id: 'fire', kind: 'fire_crackle', asset: 'fireLoop', fallbacks: [], gain: 0.7, loop: true },
      {
        id: 'people',
        kind: 'crowd',
        asset: 'streetCrowdLoop',
        fallbacks: ['argumentCrowdLoop'],
        gain: 0.24,
        loop: true,
      },
      { id: 'siren', kind: 'siren_distant', asset: 'sirenLoop', fallbacks: [], gain: 0.13, loop: true },
    ],
  },
  TRAFFIC_ACCIDENT: {
    type: 'TRAFFIC_ACCIDENT',
    gain: 0.45,
    duckRatio: 0.78,
    layers: [
      { id: 'road', kind: 'traffic_road', asset: 'trafficLoop', fallbacks: ['urbanLoop', 'genericLoop'], gain: 1, loop: true },
      { id: 'siren', kind: 'siren_distant', asset: 'sirenLoop', fallbacks: [], gain: 0.12, loop: true },
      {
        id: 'impact',
        kind: 'impact',
        asset: 'collisionOneshot',
        fallbacks: [],
        gain: 0.42,
        loop: false,
        delaySec: 0.28,
      },
    ],
  },
  POLICE_OR_FIGHT: {
    type: 'POLICE_OR_FIGHT',
    gain: 0.36,
    duckRatio: 0.8,
    layers: [
      { id: 'people', kind: 'crowd', asset: 'argumentCrowdLoop', fallbacks: ['streetCrowdLoop', 'genericLoop'], gain: 0.72, loop: true },
      { id: 'street', kind: 'street', asset: 'urbanLoop', fallbacks: ['genericLoop'], gain: 0.45, loop: true },
      { id: 'siren', kind: 'siren_distant', asset: 'sirenLoop', fallbacks: [], gain: 0.1, loop: true },
    ],
  },
  GAS: {
    type: 'GAS',
    gain: 0.28,
    duckRatio: 0.82,
    layers: [
      { id: 'place', kind: 'room', asset: 'gasBuildingLoop', fallbacks: ['medicalRoomLoop', 'genericLoop'], gain: 1, loop: true },
      { id: 'air', kind: 'street', asset: 'urbanLoop', fallbacks: ['genericLoop'], gain: 0.16, loop: true },
    ],
  },
  MEDICAL: {
    type: 'MEDICAL',
    gain: 0.25,
    duckRatio: 0.85,
    layers: [{ id: 'place', kind: 'room', asset: 'medicalRoomLoop', fallbacks: ['genericLoop'], gain: 1, loop: true }],
  },
  INFRASTRUCTURE: {
    type: 'INFRASTRUCTURE',
    gain: 0.28,
    duckRatio: 0.82,
    layers: [{ id: 'place', kind: 'street', asset: 'urbanLoop', fallbacks: ['genericLoop'], gain: 1, loop: true }],
  },
  WATER_FLOOD: {
    type: 'WATER_FLOOD',
    gain: 0.34,
    duckRatio: 0.8,
    layers: [
      { id: 'water', kind: 'water', asset: 'waterLoop', fallbacks: ['genericLoop'], gain: 1, loop: true },
      { id: 'air', kind: 'street', asset: 'urbanLoop', fallbacks: [], gain: 0.14, loop: true },
    ],
  },
  EXPLOSION_AFTERMATH: {
    type: 'EXPLOSION_AFTERMATH',
    gain: 0.32,
    duckRatio: 0.78,
    layers: [
      { id: 'place', kind: 'street', asset: 'urbanLoop', fallbacks: ['genericLoop'], gain: 1, loop: true },
      { id: 'blast', kind: 'impact', asset: 'explosionOneshot', fallbacks: [], gain: 0.5, loop: false, delaySec: 0.2 },
    ],
  },
  CROWD_PUBLIC_PLACE: {
    type: 'CROWD_PUBLIC_PLACE',
    gain: 0.3,
    duckRatio: 0.8,
    layers: [
      { id: 'people', kind: 'crowd', asset: 'streetCrowdLoop', fallbacks: ['argumentCrowdLoop', 'genericLoop'], gain: 1, loop: true },
      { id: 'place', kind: 'street', asset: 'urbanLoop', fallbacks: ['genericLoop'], gain: 0.22, loop: true },
    ],
  },
  GENERIC_EMERGENCY: {
    type: 'GENERIC_EMERGENCY',
    gain: 0.26,
    duckRatio: 0.82,
    layers: [{ id: 'place', kind: 'street', asset: 'genericLoop', fallbacks: ['urbanLoop'], gain: 1, loop: true }],
  },
  QUIET: {
    type: 'QUIET',
    gain: 0.14,
    duckRatio: 0.85,
    layers: [{ id: 'room', kind: 'room', asset: 'medicalRoomLoop', fallbacks: ['genericLoop'], gain: 1, loop: true }],
  },
};

export function assetUrl(id: AmbienceAssetId): string {
  return AMBIENCE_FILES[id];
}

export function allManifestAssetIds(): AmbienceAssetId[] {
  const ids = new Set<AmbienceAssetId>();
  for (const entry of Object.values(AMBIENCE_MANIFEST)) {
    for (const layer of entry.layers) {
      ids.add(layer.asset);
      for (const fallback of layer.fallbacks) {
        ids.add(fallback);
      }
    }
  }
  return [...ids];
}

export function localAssetFilename(id: AmbienceAssetId): string {
  return AMBIENCE_FILES[id].replace(`${AMBIENCE_PUBLIC_DIR}/`, '');
}
