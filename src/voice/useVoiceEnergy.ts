import { useEffect, useRef, useState } from 'react';
import { VoiceEnergyAdapter } from './energy';
import type { VoiceEnergySource, VoiceStatus } from './types';

/** Display-only sampling of a provider that is already connected by the caller. */
export function useVoiceEnergy(source: VoiceEnergySource | null, status: VoiceStatus, muted: boolean) {
  const [energy, setEnergy] = useState(0);
  const adapter = useRef(new VoiceEnergyAdapter());
  useEffect(() => {
    const channel = status === 'speaking' ? 'output' : 'input';
    const active = !!source && (status === 'speaking' || (status === 'listening' && !muted));
    let frame = 0;
    const sample = () => {
      setEnergy(adapter.current.sample(source, channel, active));
      if (active) frame = requestAnimationFrame(sample);
    };
    sample();
    return () => { cancelAnimationFrame(frame); adapter.current.reset(); setEnergy(0); };
  }, [source, status, muted]);
  return energy;
}
