import type { CallerTruthSource, IncidentClass } from '../data/caller-truth.ts';
import { AMBIENCE_MANIFEST, assetUrl } from './ambience-manifest.ts';
import {
  AMBIENCE_TYPES,
  type AmbienceLayer,
  type AmbienceProfile,
  type AmbienceType,
} from './ambience-types.ts';

export type { AmbienceLayer, AmbienceLayerKind, AmbienceProfile, AmbienceType } from './ambience-types.ts';
export { AMBIENCE_TYPES };

export type AmbienceScenarioInput = Pick<
  CallerTruthSource,
  'id' | 'ticketNo' | 'situationNo' | 'situation' | 'address' | 'summary' | 'services'
>;

const ALIAS: Record<string, AmbienceType> = {
  fire: 'FIRE',
  traffic: 'TRAFFIC_ACCIDENT',
  crowd: 'POLICE_OR_FIGHT',
  gas: 'GAS',
  indoor: 'MEDICAL',
  urban: 'INFRASTRUCTURE',
  phone: 'GENERIC_EMERGENCY',
  none: 'QUIET',
  water: 'WATER_FLOOD',
  explosion: 'EXPLOSION_AFTERMATH',
};

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeAmbienceType(type: string): AmbienceType {
  if ((AMBIENCE_TYPES as readonly string[]).includes(type)) {
    return type as AmbienceType;
  }
  return ALIAS[type] ?? 'GENERIC_EMERGENCY';
}

export function ambienceTypeForIncident(
  incidentClass: IncidentClass,
  source: AmbienceScenarioInput = {},
): AmbienceType {
  const text = blobOf(source);
  if (looksLikeExplosionAftermath(text)) {
    return 'EXPLOSION_AFTERMATH';
  }
  if (looksLikeWaterEmergency(text)) {
    return 'WATER_FLOOD';
  }
  switch (incidentClass) {
    case 'fire':
      return 'FIRE';
    case 'traffic_accident':
      return 'TRAFFIC_ACCIDENT';
    case 'violence':
      return 'POLICE_OR_FIGHT';
    case 'gas':
      return 'GAS';
    case 'medical':
      return 'MEDICAL';
    case 'infrastructure':
      if (looksLikeDisturbance(text)) {
        return 'POLICE_OR_FIGHT';
      }
      if (looksLikePublicCrowd(text)) {
        return 'CROWD_PUBLIC_PLACE';
      }
      return 'INFRASTRUCTURE';
    default:
      if (looksLikeIndoorMedical(text)) {
        return 'MEDICAL';
      }
      if (looksLikeDisturbance(text)) {
        return 'POLICE_OR_FIGHT';
      }
      if (looksLikePublicCrowd(text)) {
        return 'CROWD_PUBLIC_PLACE';
      }
      if (looksLikeQuietIndoor(text)) {
        return 'QUIET';
      }
      return 'GENERIC_EMERGENCY';
  }
}

export function ambienceProfileForIncident(
  incidentClass: IncidentClass,
  source: AmbienceScenarioInput = {},
): AmbienceProfile {
  const type = ambienceTypeForIncident(incidentClass, source);
  const seed = hashSeed(
    `${source.id ?? ''}|${source.ticketNo ?? ''}|${source.situationNo ?? ''}|${incidentClass}|${type}`,
  );
  return profileForType(type, seed, source);
}

export function profileForType(
  type: AmbienceType | string,
  seed = 0,
  source: AmbienceScenarioInput = {},
): AmbienceProfile {
  const resolved = normalizeAmbienceType(type);
  const gainScale = 1 + (((seed % 9) - 4) * 0.012);
  const loopOffsetRatio = ((seed >>> 8) % 80) / 100;
  const layers = layersFor(resolved, source);
  return {
    type: resolved,
    gain: AMBIENCE_MANIFEST[resolved].gain,
    duckRatio: AMBIENCE_MANIFEST[resolved].duckRatio,
    assetUrl: layers.find((layer) => layer.loop && layer.assetUrl)?.assetUrl ?? null,
    layers,
    variation: { gainScale, loopOffsetRatio },
  };
}

/** Scales every profile uniformly so the caller voice stays in the foreground. */
export const AMBIENCE_MASTER_LEVEL = 0.62;

export function effectiveAmbienceGain(profile: AmbienceProfile, ducked: boolean): number {
  const base = profile.gain * profile.variation.gainScale;
  if (base <= 0) {
    return 0;
  }
  return AMBIENCE_MASTER_LEVEL * (ducked ? Math.max(0.04, base * profile.duckRatio) : base);
}

function layersFor(type: AmbienceType, source: AmbienceScenarioInput): AmbienceLayer[] {
  const outdoor = looksOutdoor(source);
  const ticket11 = isGarbageFireTicket(source);
  const layers = AMBIENCE_MANIFEST[type].layers.map((layer) => {
    let gain = layer.gain;
    let kind = layer.kind;
    let asset = layer.asset;
    let fallbacks = layer.fallbacks;
    if (type === 'FIRE' && layer.id === 'people' && ticket11) {
      gain = 0.12;
    } else if (type === 'FIRE' && layer.id === 'people' && !outdoor) {
      gain = 0.16;
    }
    if (type === 'FIRE' && layer.id === 'siren' && !outdoor) {
      gain = 0.08;
    }
    if (type === 'POLICE_OR_FIGHT' && layer.id === 'people' && looksLargeDisturbance(source)) {
      gain = Math.min(1, gain + 0.18);
    }
    if ((type === 'MEDICAL' || (type === 'GAS' && layer.id === 'place')) && outdoor) {
      kind = 'street';
      asset = 'urbanLoop';
      fallbacks = ['genericLoop'];
    }
    return {
      id: layer.id,
      kind,
      loop: layer.loop,
      gain,
      assetUrl: assetUrl(asset),
      fallbackUrls: fallbacks.map(assetUrl),
      delaySec: layer.delaySec ?? 0,
    };
  });
  if (type !== 'QUIET') {
    layers.push({
      id: 'voices',
      kind: 'bystander',
      loop: true,
      gain: ticket11 ? 0.62 : 0.496,
      assetUrl: assetUrl('fireVoicesLoop'),
      fallbackUrls: [],
      delaySec: 0.9,
    });
  }
  return layers;
}

function isGarbageFireTicket(source: AmbienceScenarioInput): boolean {
  if (source.id === 'ags-01-1') {
    return true;
  }
  return source.ticketNo === 1 && source.situationNo === 1;
}

function blobOf(source: AmbienceScenarioInput): string {
  return `${source.situation ?? source.summary ?? ''} ${source.address ?? ''}`.replace(/\u00a0/g, ' ').toLowerCase();
}

function looksOutdoor(source: AmbienceScenarioInput): boolean {
  const text = blobOf(source);
  return /улиц|парковк|стоянк|обочин|перекрёст|перекрест|мкад|шоссе|тротуар|дворе|пляж|мост|набереж|депо/.test(
    text,
  );
}

function looksLargeDisturbance(source: AmbienceScenarioInput): boolean {
  return /10-15|толп|масс|бунт|погром|дерутся \d/.test(blobOf(source));
}

function looksLikeExplosionAftermath(text: string): boolean {
  if (/угрожает взорвать/.test(text)) {
    return false;
  }
  return /после взрыва|произош\w*\s+взрыв|взрыв газа|взорвал[аоись]|детонац|взрывчат/.test(text);
}

function looksLikeWaterEmergency(text: string): boolean {
  return /тонет|льдин|утоп|нырнул в воду|упал с моста в воду|падени[ея] автомашины в воду|плывут на льдин/.test(
    text,
  );
}

function looksLikeDisturbance(text: string): boolean {
  return /ссора|скандал|нетрезв|дерут|драк|хулиган|буянит|поругал|ругаетс|крики о помощи/.test(text);
}

function looksLikePublicCrowd(text: string): boolean {
  return /вокзал|метро|торгов|тц |магазин|станци|стадион|посадк/.test(text);
}

function looksLikeIndoorMedical(text: string): boolean {
  return (
    /потерял[аи]?\s+сознани|лекарств|топором|барабанн|инсульт|скончал|головн|судорог|снотворн|перекошен|рвота|животе/.test(
      text,
    ) && !/дтп|наезд|дерут|пожар|горит/.test(text)
  );
}

function looksLikeQuietIndoor(text: string): boolean {
  return /повесит|суицид|дверь в квартиру закрыта|доме престарелых/.test(text);
}
