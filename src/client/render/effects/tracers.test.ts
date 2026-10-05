import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Tracers } from './tracers.ts';

const frame = { pixelScale: 800, fogColor: new Color(), fogDensity: 0 };

describe('Tracers', () => {
  it('never draws a streak behind the gun: a round just fired has none, an older one about 35 m', () => {
    const tracers = new Tracers(4);
    const velocity = new Vector3(0, 0, -1200);
    tracers.update(
      [
        { team: 'usa', position: new Vector3(0, 1000, 0), velocity, ageS: 0 },
        { team: 'usa', position: new Vector3(0, 1000, -12), velocity, ageS: 0.01 },
        { team: 'usa', position: new Vector3(0, 1000, -600), velocity, ageS: 0.5 },
      ],
      frame,
    );
    const p = tracers.lines.geometry.getAttribute('position').array;
    const length = (i: number) => Math.hypot(p[i * 6] - p[i * 6 + 3], p[i * 6 + 1] - p[i * 6 + 4], p[i * 6 + 2] - p[i * 6 + 5]);
    expect(tracers.count).toBe(3);
    expect(length(0)).toBe(0);
    expect(length(1)).toBeCloseTo(12);
    expect(length(2)).toBeCloseTo(36);
    tracers.dispose();
  });
});
