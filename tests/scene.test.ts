import { describe, expect, it } from 'vitest';
import { createRibbon } from '../src/scene/geometry';
import { sceneLayout } from '../src/scene/createScene';
import { states } from '../src/scene/types';

describe('Unfinished Signal geometry', () => {
  it('keeps a finite, attached edge across conversation poses and quality levels', () => {
    for (const [rows, columns] of [[96, 32], [160, 48]]) {
      const ribbon = createRibbon(rows, columns);
      for (const state of [...Object.values(states), { opening: .7, breath: .22, period: 7.4 }]) {
        for (const time of [0, 1.6, 12, 120]) {
          ribbon.update(time, state.opening, state.breath, time * Math.PI * 2 / state.period, .8);
          const position = ribbon.geometry.attributes.position;
          const normals = ribbon.geometry.attributes.normal;
          expect([...position.array, ...normals.array].every(Number.isFinite)).toBe(true);
          expect([...ribbon.hemGeometry.attributes.position.array, ...ribbon.hemGeometry.attributes.normal.array,
            ...ribbon.seamGeometry.attributes.position.array].every(Number.isFinite)).toBe(true);
          expect(Math.max(...ribbon.geometry.index!.array)).toBeLessThan(position.count);
          const edge = ribbon.edgeGeometry.attributes.position;
          for (const row of [0, rows / 2, rows]) {
            const index = row * (columns + 1) + columns;
            expect(edge.getX(row)).toBeCloseTo(position.getX(index), 5);
            expect(edge.getY(row)).toBeCloseTo(position.getY(index), 5);
          }
        }
      }
      ribbon.dispose();
    }
  });
  it('reserves a distinct mobile artwork region above the reading column', () => {
    const mobile = sceneLayout('landing', 390, 844);
    expect(mobile.y + mobile.scale * 240).toBeLessThan(302);
    const desktop = sceneLayout('landing', 1440, 900);
    expect(desktop.x).toBeGreaterThan(1440 * .65);
    expect(desktop.y + desktop.scale * 240).toBeLessThan(800);
  });
  it('has a central, finite closed pose for immersive voice', () => {
    const desktop = sceneLayout('voice', 1440, 900);
    const mobile = sceneLayout('voice', 390, 844);
    expect(desktop.x).toBeCloseTo(720);
    expect(mobile.x).toBeCloseTo(195);
    expect(mobile.scale * 424).toBeCloseTo(195);
    expect(mobile.y - mobile.scale * 212).toBeGreaterThan(0);
    expect(mobile.y + mobile.scale * 212).toBeLessThan(844);
    const ribbon = createRibbon(96, 32);
    ribbon.update(1, .2, .03, .2, 0, 1, .8);
    expect([...ribbon.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
    ribbon.dispose();
  });
});
