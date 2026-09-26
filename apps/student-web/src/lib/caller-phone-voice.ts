/** Playback-only telephone colouring for the caller voice. Ambience never passes through here. */
export const CALLER_PHONE_VOICE = {
  highpassHz: 300,
  lowpassHz: 3400,
  filterQ: 0.707,
  presenceHz: 1800,
  presenceDb: 2,
  presenceQ: 0.9,
  compressorThresholdDb: -16,
  compressorKneeDb: 12,
  compressorRatio: 1.8,
  compressorAttackSec: 0.006,
  compressorReleaseSec: 0.2,
  outputGain: 1.25,
} as const;

const chains = new WeakMap<BaseAudioContext, AudioNode>();

export function callerPhoneInput(ctx: BaseAudioContext): AudioNode {
  const cached = chains.get(ctx);
  if (cached) {
    return cached;
  }
  const v = CALLER_PHONE_VOICE;
  try {
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = v.highpassHz;
    highpass.Q.value = v.filterQ;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = v.lowpassHz;
    lowpass.Q.value = v.filterQ;

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = v.presenceHz;
    presence.gain.value = v.presenceDb;
    presence.Q.value = v.presenceQ;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = v.compressorThresholdDb;
    compressor.knee.value = v.compressorKneeDb;
    compressor.ratio.value = v.compressorRatio;
    compressor.attack.value = v.compressorAttackSec;
    compressor.release.value = v.compressorReleaseSec;

    const output = ctx.createGain();
    output.gain.value = v.outputGain;

    highpass.connect(lowpass);
    lowpass.connect(presence);
    presence.connect(compressor);
    compressor.connect(output);
    output.connect(ctx.destination);
    chains.set(ctx, highpass);
    return highpass;
  } catch {
    return ctx.destination;
  }
}
