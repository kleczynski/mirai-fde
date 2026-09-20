import * as THREE from 'three';
import { createRibbon } from './geometry';
import { createMaterials } from './materials';
import { createInteractionController } from './interaction';
import { states, type SceneProps, type SceneScreen } from './types';

const damp = (a: number, b: number, dt: number, rate = 3) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function sceneLayout(screen: SceneScreen, width: number, height: number) {
  if (width < 640) {
    // The camera maps one world unit to 100 CSS pixels. The closed pose is
    // 4.24 world units wide, so divide the desired pixel diameter by 424.
    if (screen === 'voice') return { x: width * .5, y: Math.min(height * .34, 285), scale: Math.min(width * .5, 210) / 424 };
    const h = screen === 'landing' ? 210 : screen === 'interview' ? 135 : 150;
    const cy = screen === 'landing' ? 173 : screen === 'interview' ? 213 : 176;
    return { x: width * .71, y: cy, scale: h / 480 };
  }
  const settings = {
    landing: { x: .735, y: .47, height: .69 }, consent: { x: .79, y: .46, height: .53 },
    interview: { x: .78, y: .44, height: .54 }, voice: { x: .5, y: .47, height: .48 }, thanks: { x: .8, y: .46, height: .45 },
  }[screen];
  return { x: width * settings.x, y: height * settings.y, scale: Math.min(height * settings.height, 690, width * .58) / 480 };
}

/** Visual state only: no access to audio, transcripts, authentication, or storage. */
export function createScene(host: HTMLElement, initialProps: SceneProps) {
  let props = initialProps, disposed = false, contextLost = false;
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = matchMedia('(max-width: 639px)');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowPower = () => mobileQuery.matches || connection?.saveData || (memory !== undefined && memory <= 4);
  const staticMode = () => reduceQuery.matches || !!props.paused;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 60);
  camera.position.set(0, 0, 12);
  const materials = createMaterials(renderer);
  scene.environment = materials.environment.texture;
  scene.add(new THREE.HemisphereLight('#f7f5e9', '#607b6e', .9));
  const key = new THREE.DirectionalLight('#fffbed', 2.4); key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight('#d6e8df', 1.8); rim.position.set(4, 0, -3);
  const bounce = new THREE.DirectionalLight('#e7b28c', 0); bounce.position.set(-4, -2, 3);
  scene.add(key, rim, bounce);
  const placement = new THREE.Group(), sculpture = new THREE.Group();
  scene.add(placement); placement.add(sculpture);
  const ribbon = createRibbon(lowPower() ? 96 : 160, lowPower() ? 32 : 48);
  sculpture.add(new THREE.Mesh(ribbon.geometry, materials.surface));
  sculpture.add(new THREE.Mesh(ribbon.geometry, materials.reverse));
  sculpture.add(new THREE.Mesh(ribbon.hemGeometry, materials.hem));
  sculpture.add(new THREE.Line(ribbon.edgeGeometry, materials.edge));
  sculpture.add(new THREE.Line(ribbon.traceGeometry, materials.trace));
  sculpture.add(new THREE.LineSegments(ribbon.seamGeometry, materials.seam));
  // Open, tapered paths echo the membrane's folds. They share its motion
  // but sit at a different depth, making the pointer parallax readable.
  const contours = new THREE.Group(); placement.add(contours);
  const contourGeometries: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 150; j++) {
      const t = j / 150, a = t * Math.PI * 2.1 - .6 + i * .3;
      const spread = Math.pow(Math.sin(t * Math.PI), .65);
      points.push(new THREE.Vector3(Math.sin(a) * (1.45 + i * .16) * spread, (t - .5) * 5.05, Math.cos(a) * .8 - .3));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, materials.orbit);
    line.rotation.z = -.1; line.position.y = i * .05;
    contours.add(line); contourGeometries.push(geometry);
  }
  const interaction = createInteractionController(host);
  let width = 1, height = 1, time = 0, lastTime = 0, opening = states[props.state].opening;
  let placed = false, breathPhase = 0, arrivalImpulse = 0, scrollPosition = 0;
  let pointerX = 0, pointerY = 0, arrival = 0, frames = 0, samples = 0, cpuTotal = 0;
  let hero = props.screen === 'landing' ? 1 : 0;
  let lightX = 0, lightY = 0;
  let geometryTotal = 0, renderTotal = 0;
  let stateBreath = states[props.state].breath, statePeriod = states[props.state].period;
  let morph = props.screen === 'voice' ? 1 : 0, energy = 0;
  const traceCold = new THREE.Color('#c7d9c8'), traceWarm = new THREE.Color('#d49374');
  function place(snap: boolean, dt: number) {
    const target = sceneLayout(props.screen, width, height);
    const x = (target.x - width / 2) / 100, y = (height / 2 - target.y) / 100;
    placement.position.x = snap ? x : damp(placement.position.x, x, dt, 4);
    placement.position.y = snap ? y : damp(placement.position.y, y, dt, 4);
    placement.scale.setScalar(snap ? target.scale : damp(placement.scale.x, target.scale, dt, 4));
    placed = true;
    contours.visible = hero > .01 && props.screen !== 'voice' && width >= 640;
  }
  function draw(now = performance.now(), force = false) {
    if (disposed || contextLost || document.hidden) return;
    const interval = lowPower() ? 1000 / 30 : 1000 / 60;
    if (!force && lastTime && now - lastTime < interval - 1.5) return;
    const start = performance.now();
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .06) : 1 / 60;
    lastTime = now;
    const frozen = staticMode();
    if (!frozen) time += dt;
    const target = states[props.state];
    const immersive = props.screen === 'voice';
    hero = frozen ? (props.screen === 'landing' ? 1 : 0) : damp(hero, props.screen === 'landing' ? 1 : 0, dt, 3);
    // A long ease keeps the large topology change below a visible frame jump.
    morph = frozen ? (immersive ? 1 : 0) : damp(morph, immersive ? 1 : 0, dt, .9);
    const inputEnergy = immersive && !props.paused && (props.state === 'listening' || props.state === 'speaking') ? Math.max(0, Math.min(1, props.energy ?? 0)) : 0;
    energy = frozen ? 0 : damp(energy, inputEnergy, dt, inputEnergy > energy ? 16 : 5);
    const heroOpening = target.opening + hero * .2;
    opening = frozen ? heroOpening : damp(opening, heroOpening, dt, 2.4);
    stateBreath = frozen ? 0 : damp(stateBreath, target.breath, dt, props.state === 'interrupted' ? 12 : 3);
    statePeriod = damp(statePeriod, target.period, dt, 2);
    // Integrate the rhythm instead of reinterpreting all elapsed time at a
    // new frequency. Navigation can then change pace without changing pose.
    if (!frozen) {
      const period = statePeriod + (7.4 - statePeriod) * hero;
      breathPhase = (breathPhase + dt * Math.PI * 2 / period) % (Math.PI * 2);
    }
    pointerX = frozen ? 0 : damp(pointerX, interaction.input.x, dt, 2.3);
    pointerY = frozen ? 0 : damp(pointerY, interaction.input.y, dt, 2.3);
    lightX = frozen ? 0 : damp(lightX, interaction.input.x, dt, 1.15);
    lightY = frozen ? 0 : damp(lightY, interaction.input.y, dt, 1.15);
    scrollPosition = frozen ? interaction.input.scroll : damp(scrollPosition, interaction.input.scroll, dt, 6);
    arrivalImpulse = frozen ? 0 : arrivalImpulse * Math.exp(-dt * 1.5);
    arrival = frozen ? 0 : damp(arrival, arrivalImpulse, dt, 10);
    const entrance = frozen ? 1 : 1 - Math.pow(1 - Math.min(time / 2.8, 1), 3);
    const drift = frozen ? 0 : hero;
    const sway = Math.sin(time * .54);
    const geometryStart = performance.now();
    ribbon.update(time, opening, stateBreath + drift * .16, breathPhase, arrival, morph, energy);
    geometryTotal += performance.now() - geometryStart;
    sculpture.rotation.set(
      pointerY * (.035 + hero * .16) + drift * Math.sin(time * .39) * .085,
      -.34 + pointerX * (.14 + hero * .44) + drift * sway * .32 + (1 - entrance) * (.75 + hero),
      -.08 + pointerX * (.025 + hero * .085) + drift * Math.sin(time * .54 + .6) * .1 - (1 - entrance) * hero * .2,
    );
    sculpture.position.set(
      pointerX * hero * .16 + drift * Math.sin(time * .31) * .055,
      frozen ? 0 : Math.sin(time * .58) * (.028 + hero * .06 + morph * .035) - scrollPosition * (.12 + hero * .26) - pointerY * hero * .11 - (1 - entrance) * hero * .24,
      0,
    );
    sculpture.scale.setScalar(1 - (1 - entrance) * hero * .09);
    contours.rotation.set(-pointerY * .08, -pointerX * .2 + drift * sway * .12, drift * Math.sin(time * .54 + .6) * -.06);
    contours.position.set(-pointerX * .18, pointerY * .12, -.3);
    materials.orbit.opacity = hero * .22;
    key.position.x = -3 + pointerX * hero * 2 + drift * Math.sin(time * .32) * .7;
    bounce.intensity = hero * .7;
    // A broad amber light follows with a slower ease than the sculpture.
    // Gradients move as layers; no full-screen blur or particle simulation.
    const compact = width < 640;
    const lampX = width * (.57 + lightX * .27) + drift * Math.sin(time * .23) * 18;
    const lampY = compact ? 250 : height * (.61 + lightY * .23);
    host.style.setProperty('--light-x', `${lampX.toFixed(1)}px`);
    host.style.setProperty('--light-y', `${lampY.toFixed(1)}px`);
    host.style.setProperty('--cool-x', `${(width * (.79 - lightX * .08)).toFixed(1)}px`);
    host.style.setProperty('--cool-y', `${(compact ? 150 : height * (.4 - lightY * .08)).toFixed(1)}px`);
    host.style.setProperty('--illumination', hero.toFixed(3));
    materials.trace.color.lerpColors(traceCold, traceWarm, target.warmth);
    materials.trace.opacity = .16 + arrival * .28 + target.warmth * .28;
    materials.surface.roughness = .27;
    // An urgent render (resize, restored context, tab return) is not a request
    // to finish a screen transition. Only initial/static placement snaps.
    place(frozen || !placed, dt);
    const renderStart = performance.now();
    renderer.render(scene, camera);
    renderTotal += performance.now() - renderStart;
    host.dataset.ready = 'true';
    host.dataset.mode = frozen ? 'static' : lowPower() ? '30fps' : '60fps';
    frames++; samples++; cpuTotal += performance.now() - start;
    // Local, non-identifying diagnostics; no telemetry or public JavaScript API.
    if (samples >= 30 || force) {
      host.dataset.frames = String(frames);
      host.dataset.triangles = String(renderer.info.render.triangles);
      host.dataset.drawCalls = String(renderer.info.render.calls);
      host.dataset.cpuMs = (cpuTotal / samples).toFixed(2);
      host.dataset.geometryMs = (geometryTotal / samples).toFixed(2);
      host.dataset.renderMs = (renderTotal / samples).toFixed(2);
      host.dataset.dpr = String(renderer.getPixelRatio());
      host.dataset.motion = frozen ? 'still' : hero > .5 ? 'expressive' : 'conversation';
      samples = 0; cpuTotal = 0; geometryTotal = 0; renderTotal = 0;
    }
  }
  function syncLoop() {
    renderer.setAnimationLoop(null); lastTime = 0;
    if (disposed || contextLost || document.hidden) return;
    draw(performance.now(), true);
    if (!staticMode()) renderer.setAnimationLoop(now => draw(now));
  }
  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width), nextHeight = Math.max(1, rect.height);
    if (placed && !staticMode()) {
      // Keep the current pixel position when the orthographic viewport changes.
      placement.position.x += (width - nextWidth) / 200;
      placement.position.y += (nextHeight - height) / 200;
    }
    width = nextWidth; height = nextHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower() ? 1.25 : 1.75));
    renderer.setSize(width, height, false);
    camera.left = -width / 200; camera.right = width / 200;
    camera.top = height / 200; camera.bottom = -height / 200;
    camera.updateProjectionMatrix(); draw(performance.now(), true);
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; host.dataset.ready = 'false'; renderer.setAnimationLoop(null); };
  const restored = () => {
    scene.environment = materials.restoreEnvironment().texture;
    contextLost = false; resize(); syncLoop();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  reduceQuery.addEventListener('change', syncLoop);
  mobileQuery.addEventListener('change', resize);
  document.addEventListener('visibilitychange', syncLoop);
  resize(); syncLoop();
  return {
    setProps(next: SceneProps) {
      const modeChanged = props.paused !== next.paused;
      if (next.questionPulse !== props.questionPulse && next.screen === 'interview') arrivalImpulse = 1;
      props = next; host.dataset.state = props.state;
      if (modeChanged || staticMode()) syncLoop();
    },
    disposeScene() {
      if (disposed) return;
      disposed = true; renderer.setAnimationLoop(null); observer.disconnect(); interaction.dispose();
      reduceQuery.removeEventListener('change', syncLoop); mobileQuery.removeEventListener('change', resize);
      document.removeEventListener('visibilitychange', syncLoop);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      ribbon.dispose(); contourGeometries.forEach(g => g.dispose()); materials.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
