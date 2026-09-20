export type SignalState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'insight' | 'interrupted' | 'error' | 'complete';
export type SceneScreen = 'landing' | 'consent' | 'interview' | 'voice' | 'thanks';
/** `energy` is supplied by the voice adapter. It is never sampled by the renderer. */
export type SceneProps = { state: SignalState; screen: SceneScreen; questionPulse?: number | string; paused?: boolean; energy?: number };

/** One opening gesture, expressed at conversation pace. Never an audio equalizer. */
export const states: Record<SignalState, { opening: number; breath: number; period: number; warmth: number }> = {
  idle: { opening: .12, breath: .055, period: 10.8, warmth: 0 },
  listening: { opening: .42, breath: .035, period: 10.8, warmth: 0 },
  thinking: { opening: -.08, breath: .025, period: 8, warmth: .2 },
  speaking: { opening: .23, breath: .085, period: 4.2, warmth: .1 },
  insight: { opening: .5, breath: .03, period: 10, warmth: 1 },
  interrupted: { opening: .4, breath: .025, period: 11, warmth: 0 },
  error: { opening: .04, breath: 0, period: 11, warmth: 0 },
  complete: { opening: -.2, breath: .012, period: 14, warmth: .35 },
};
