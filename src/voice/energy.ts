import type { AudioChannel, VoiceEnergySource } from './types';

const bounded = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Samples the already active provider graph. Call once per animation frame or
 * at a lower display rate. No MediaStream, AudioContext, or recorder is made.
 */
export class VoiceEnergyAdapter {
  private value = 0;
  sample(source: VoiceEnergySource | null | undefined, channel: AudioChannel, active = true) {
    const target = active && source ? bounded(source.getAudioEnergy(channel)) : 0;
    // Fast attack makes speech readable. Slower release keeps short phonemes
    // from producing visual chatter while still settling to silence.
    const rate = target > this.value ? .46 : .16;
    this.value += (target - this.value) * rate;
    if (this.value < .002) this.value = 0;
    return this.value;
  }
  reset() { this.value = 0; }
}
