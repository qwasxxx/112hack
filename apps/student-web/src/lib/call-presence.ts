export const FIRST_SILENCE_MS = 11_000;
export const HOLD_SILENCE_MS = 45_000;
export const SECOND_SILENCE_MS = 25_000;
export const MAX_PROBES = 2;

export type PresenceIntent = 'hear' | 'eta' | 'wait' | 'urgent' | 'stay' | 'farewell';

export type PresenceSnapshot = {
  now: number;
  callActive: boolean;
  userBusy: boolean;
  lastHumanAt: number;
  probes: number;
  probeAudioEndedAt: number | null;
  hold: boolean;
  closeArmed: boolean;
  farewellAudioReady: boolean;
  operatorText: string;
  assistantText: string;
  role: 'victim' | 'operator' | 'service';
  askedStay: boolean;
};

export type PresenceDecision =
  | { kind: 'idle' }
  | { kind: 'probe'; intent: Exclude<PresenceIntent, 'farewell'> }
  | { kind: 'hangup' };

export function holdRequested(text: string): boolean {
  return /оставай(?:тесь|ся) на линии|не клад(?:ите|и) трубку|подожд(?:ите|и)|одну минуту|я уточню|не заверша/i.test(
    text,
  );
}

export function operatorMayEndCall(text: string): boolean {
  if (holdRequested(text)) {
    return false;
  }
  return /до свидания|всего доброго|можете положить трубку|можете класть трубку|на этом всё|на этом все|разговор окончен|вызов заверш|хорошего дня/i.test(
    text,
  );
}

export function soundsLikeFarewell(text: string): boolean {
  return /до свидания|всего доброго|хорошего дня|до связи|будьте здоровы/i.test(text);
}

function softClose(text: string): boolean {
  const line = text.trim().toLowerCase();
  if (!line || line.includes('?') || operatorMayEndCall(line) || holdRequested(line)) {
    return false;
  }
  return /^(?:спасибо|хорошо|ладно|понял|поняла)(?:$|[\s,.!?])/.test(line) || /помощь (?:едет|уже|выехал|отправил)/.test(line);
}

function helpPromised(text: string): boolean {
  return /выехал|выезжа|едут|направил|бригад|помощь (?:едет|уже|отправил)/i.test(text);
}

function timeNamed(text: string): boolean {
  return /через\s+\d+|\d+\s*мин|полчаса|час(?:а|ов)?\b/i.test(text);
}

function urgentKnown(text: string): boolean {
  const line = text.toLowerCase();
  if (/освещен/.test(line) && !/пожар/.test(line)) {
    return false;
  }
  return /без сознания|не дышит|заблокир|пожар|горит|запах газа|тонет|кровотеч/.test(line);
}

export function silenceIntent(input: {
  operator: string;
  assistant: string;
  role: PresenceSnapshot['role'];
  askedStay: boolean;
}): Exclude<PresenceIntent, 'farewell'> {
  const heard = `${input.operator}\n${input.assistant}`;
  if (holdRequested(input.operator)) {
    return 'wait';
  }
  if (!input.askedStay && softClose(input.operator)) {
    return 'stay';
  }
  if (helpPromised(heard) && !timeNamed(heard)) {
    return 'eta';
  }
  if (input.role === 'victim' && urgentKnown(heard)) {
    return 'urgent';
  }
  return 'hear';
}

export function presenceDecision(state: PresenceSnapshot): PresenceDecision {
  if (!state.callActive || state.userBusy) {
    return { kind: 'idle' };
  }
  if (state.farewellAudioReady) {
    return { kind: 'hangup' };
  }
  if (state.closeArmed || state.probes >= MAX_PROBES) {
    return { kind: 'idle' };
  }
  const firstGap = state.hold ? HOLD_SILENCE_MS : FIRST_SILENCE_MS;
  if (state.probes === 0 && state.now - state.lastHumanAt >= firstGap) {
    return {
      kind: 'probe',
      intent: silenceIntent({
        operator: state.operatorText,
        assistant: state.assistantText,
        role: state.role,
        askedStay: state.askedStay,
      }),
    };
  }
  if (
    state.probes === 1 &&
    state.probeAudioEndedAt != null &&
    state.now - state.probeAudioEndedAt >= SECOND_SILENCE_MS
  ) {
    return {
      kind: 'probe',
      intent: silenceIntent({
        operator: state.operatorText,
        assistant: state.assistantText,
        role: state.role,
        askedStay: true,
      }),
    };
  }
  return { kind: 'idle' };
}
