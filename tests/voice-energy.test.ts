import { describe, expect, it } from 'vitest';
import { VoiceEnergyAdapter } from '../src/voice/energy';

describe('VoiceEnergyAdapter', () => {
  it('reads only the selected existing provider channel and bounds malformed levels', () => {
    const adapter = new VoiceEnergyAdapter();
    const channels: string[] = [];
    const source = { getAudioEnergy(channel: 'input' | 'output') { channels.push(channel); return channel === 'input' ? 2 : Number.NaN; } };
    expect(adapter.sample(source, 'input')).toBeGreaterThan(0);
    expect(adapter.sample(source, 'output')).toBeLessThan(1);
    expect(channels).toEqual(['input', 'output']);
  });
  it('settles to zero for pause, disconnect, and cleanup', () => {
    const adapter = new VoiceEnergyAdapter();
    const source = { getAudioEnergy: () => 1 };
    adapter.sample(source, 'input');
    for (let index = 0; index < 80; index++) adapter.sample(source, 'input', false);
    expect(adapter.sample(null, 'input')).toBe(0);
    adapter.sample(source, 'output'); adapter.reset();
    expect(adapter.sample(null, 'output')).toBe(0);
  });
});
