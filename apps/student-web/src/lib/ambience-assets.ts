import { AMBIENCE_FILES, allManifestAssetIds, type AmbienceAssetId } from './ambience-manifest.ts';

export const REQUIRED_AMBIENCE_FILES: readonly string[] = [
  'fire_loop.mp3',
  'traffic_accident_loop.mp3',
  'street_crowd_loop.mp3',
  'argument_crowd_loop.mp3',
  'gas_building_loop.mp3',
  'medical_room_loop.mp3',
  'urban_infrastructure_loop.mp3',
  'water_emergency_loop.mp3',
  'generic_emergency_loop.mp3',
  'distant_siren_loop.mp3',
  'explosion_oneshot.mp3',
  'collision_oneshot.mp3',
  'fire_voices_loop.mp3',
];

const ALLOWED_EXT = new Set(['.mp3', '.ogg', '.wav']);

export function ambienceAssetPath(id: AmbienceAssetId): string {
  return AMBIENCE_FILES[id];
}

export function isSupportedAmbienceFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return [...ALLOWED_EXT].some((ext) => lower.endsWith(ext));
}

export function requiredFilenamesFromManifest(): string[] {
  return allManifestAssetIds().map((id) => AMBIENCE_FILES[id].replace('/audio/ambience/', ''));
}

export const GENERIC_FALLBACK_URL = AMBIENCE_FILES.genericLoop;
