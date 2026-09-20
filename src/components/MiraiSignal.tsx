import { useEffect, useRef, useState } from 'react';
import { createScene } from '../scene/createScene';
import type { SceneProps } from '../scene/types';
import { SignalFallback } from './SignalFallback';
export type { SignalState } from '../scene/types';
export default function MiraiSignal(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene> | null>(null);
  const initial = useRef(props);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    try { scene.current = createScene(host.current, initial.current); }
    catch { setFailed(true); }
    return () => { scene.current?.disposeScene(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setProps(props); }, [props.state, props.screen, props.questionPulse, props.energy, props.paused]);
  return <div ref={host} aria-hidden="true" data-mirai-scene="persistent" data-state={props.state} className={`signal-scene${failed ? ' signal-unavailable' : ''}`}><SignalFallback/></div>;
}
