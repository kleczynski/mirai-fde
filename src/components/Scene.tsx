import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import type { SignalState } from './MiraiSignal';
import { AtmosphericField } from './AtmosphericField';
import { SignalFallback as Fallback } from './SignalFallback';
const MiraiSignal = lazy(() => import('./MiraiSignal'));
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback/> : this.props.children; }
}
export function Scene({ state, screen, questionPulse, energy }: { state: SignalState; screen: 'landing' | 'consent' | 'interview' | 'voice' | 'thanks'; questionPulse?: number | string; energy?: number }) {
  const [paused, setPaused] = useState(false);
  return <><AtmosphericField/><SceneBoundary><Suspense fallback={<Fallback/>}><MiraiSignal state={state} screen={screen} questionPulse={questionPulse} energy={energy} paused={paused}/></Suspense></SceneBoundary>{screen === 'landing' && <button className="motion-control" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Wznów animację' : 'Zatrzymaj animację'}<span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span></button>}</>;
}
