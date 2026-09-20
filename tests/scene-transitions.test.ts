import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene } from '../src/scene/createScene';
import type { SceneProps } from '../src/scene/types';

const harness = vi.hoisted(() => ({
  now: 1000, width: 1440, height: 900, reduced: false,
  frame: null as null | ((now: number) => void),
  resize: null as null | (() => void),
  snapshot: null as null | { vertices: number[]; center: number[]; scale: number },
}));

// Keep the real scene, geometry, and transforms. Only the GPU and browser
// lifecycle are replaced so transitions can be measured frame by frame.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = Object.assign(new EventTarget(), { remove() {} });
      info = { render: { triangles: 0, calls: 0 } };
      pixelRatio = 1;
      setClearColor() {}
      setSize() {}
      setPixelRatio(value: number) { this.pixelRatio = value; }
      getPixelRatio() { return this.pixelRatio; }
      setAnimationLoop(callback: null | ((now: number) => void)) { harness.frame = callback; }
      render(scene: THREE.Scene) {
        const placement = scene.children.find(child => child instanceof actual.Group)!;
        const sculpture = placement.children[0];
        const mesh = sculpture.children[0] as THREE.Mesh;
        const position = mesh.geometry.attributes.position;
        const vertices: number[] = [];
        for (let i = 0; i < position.count; i += 29) vertices.push(position.getX(i), position.getY(i), position.getZ(i));
        harness.snapshot = { vertices, center: placement.position.toArray(), scale: placement.scale.x };
      }
      dispose() {}
      forceContextLoss() {}
    },
  };
});

vi.mock('../src/scene/materials', () => ({
  createMaterials: () => ({
    environment: { texture: new THREE.Texture() },
    surface: new THREE.MeshPhysicalMaterial(), reverse: new THREE.MeshPhysicalMaterial(),
    hem: new THREE.MeshStandardMaterial(), edge: new THREE.LineBasicMaterial(),
    seam: new THREE.LineBasicMaterial(), trace: new THREE.LineBasicMaterial(), orbit: new THREE.LineBasicMaterial(),
    dispose() {},
  }),
}));

let scene: ReturnType<typeof createScene> | undefined;
const props = (screen: SceneProps['screen'], state: SceneProps['state'] = 'idle'): SceneProps => ({ screen, state });
function mount(initial: SceneProps) {
  const host = {
    dataset: {}, style: { setProperty() {} }, appendChild() {},
    getBoundingClientRect: () => ({ width: harness.width, height: harness.height, left: 0, top: 0 }),
  } as unknown as HTMLElement;
  scene = createScene(host, initial);
}
function step(milliseconds = 1000 / 60) {
  harness.now += milliseconds;
  harness.frame?.(harness.now);
  return harness.snapshot!;
}
function settle() { for (let i = 0; i < 180; i++) step(60); }
function maxChange(a: number[], b: number[]) { return Math.max(...a.map((value, i) => Math.abs(value - b[i]))); }

beforeEach(() => {
  Object.assign(harness, { now: 1000, width: 1440, height: 900, reduced: false, frame: null, resize: null, snapshot: null });
  vi.spyOn(performance, 'now').mockImplementation(() => harness.now);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { scrollY: 0 }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('innerHeight', harness.height);
  vi.stubGlobal('matchMedia', (query: string) => Object.assign(new EventTarget(), {
    get matches() { return query.includes('prefers-reduced-motion') ? harness.reduced : query.includes('max-width') ? harness.width < 640 : true; },
  }));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { harness.resize = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { scene?.disposeScene(); scene = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('continuous screen transitions', () => {
  it('keeps every fold continuous when entering and leaving the quiet screens', () => {
    mount(props('landing'));
    settle();
    for (const screen of ['consent', 'landing', 'interview', 'landing'] as const) {
      scene!.setProps(props(screen));
      let previous = harness.snapshot!.vertices;
      let largestStep = 0;
      for (let i = 0; i < 90; i++) {
        const current = step().vertices;
        largestStep = Math.max(largestStep, maxChange(current, previous));
        previous = current;
      }
      // 0.015 world units is below two displayed pixels at this viewport.
      expect(largestStep, `fold movement on ${screen}`).toBeLessThan(.015);
    }
  });

  it('does not finish the journey early when a resize notification arrives', () => {
    mount(props('landing'));
    settle();
    scene!.setProps(props('consent'));
    for (let i = 0; i < 4; i++) step();
    const before = harness.snapshot!;
    harness.resize!();
    expect(harness.snapshot!.center).toEqual(before.center);
    expect(harness.snapshot!.scale).toBe(before.scale);
    const previousPixelX = before.center[0] * 100 + harness.width / 2;
    harness.width -= 16; // A scrollbar can change the viewport during navigation.
    harness.resize!();
    expect(harness.snapshot!.center[0] * 100 + harness.width / 2).toBeCloseTo(previousPixelX, 8);
  });

  it('changes direction smoothly when the user comes back before arrival', () => {
    mount(props('landing'));
    settle();
    const destination = harness.snapshot!;
    scene!.setProps(props('interview'));
    for (let i = 0; i < 12; i++) step();
    scene!.setProps(props('landing'));
    let previous = harness.snapshot!;
    for (let i = 0; i < 150; i++) {
      const current = step();
      expect(maxChange(current.vertices, previous.vertices)).toBeLessThan(.015);
      expect(maxChange(current.center, previous.center)).toBeLessThan(.06);
      expect(Math.abs(current.scale - previous.scale)).toBeLessThan(.025);
      previous = current;
    }
    expect(maxChange(previous.center, destination.center)).toBeLessThan(.001);
    expect(Math.abs(previous.scale - destination.scale)).toBeLessThan(.001);
  });

  it('resumes an interrupted journey from its current position after tab visibility changes', () => {
    mount(props('landing'));
    settle();
    scene!.setProps(props('interview', 'listening'));
    for (let i = 0; i < 4; i++) step();
    const before = harness.snapshot!;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(maxChange(harness.snapshot!.center, before.center)).toBeLessThan(.06);
    expect(Math.abs(harness.snapshot!.scale - before.scale)).toBeLessThan(.025);
  });

  it('honours reduced motion with a still, correctly placed destination', () => {
    harness.reduced = true;
    mount(props('landing'));
    scene!.setProps(props('interview', 'listening'));
    expect(harness.frame).toBeNull();
    expect(harness.snapshot!.center[0]).toBeCloseTo((1440 * .78 - 720) / 100);
    expect(harness.snapshot!.scale).toBeCloseTo(900 * .54 / 480);
  });

  it('eases a newly arrived interview question into the fold', () => {
    mount(props('interview', 'listening'));
    settle();
    const before = harness.snapshot!.vertices;
    scene!.setProps({ ...props('interview', 'listening'), questionPulse: 'new-question' });
    expect(maxChange(step().vertices, before)).toBeLessThan(.015);
  });

  it('moves into the central voice pose continuously and accepts provider energy', () => {
    mount(props('interview', 'listening'));
    settle();
    scene!.setProps({ ...props('voice', 'listening'), energy: .8 });
    let previous = harness.snapshot!;
    for (let i = 0; i < 120; i++) {
      const current = step();
      expect(maxChange(current.vertices, previous.vertices)).toBeLessThan(.08);
      previous = current;
    }
    expect(previous.center[0]).toBeCloseTo(0, 2);
  });
});
