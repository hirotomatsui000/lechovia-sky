import { describe, expect, it } from 'vitest';
import { VISION_LOSS_STRAIN } from '../../shared/physics/g-tolerance.ts';
import { BLACKOUT_DIM, BLACKOUT_FADE_S, BLACKOUT_HOLD_S, createGVision, gVision } from './g-vision.ts';

const at = (strain: number, reduceMotion = false) => gVision(strain, null, reduceMotion, createGVision());

describe('G vision (revision 21)', () => {
  it('leaves the view alone until the strain takes it', () => {
    expect(at(0)).toEqual({ red: 0, clear: 1, edge: 0, black: 0 });
    expect(at(VISION_LOSS_STRAIN)).toEqual({ red: 0, clear: 1, edge: 0, black: 0 });
  });

  it('turns the view red while it darkens from the edges in, and black at G-LOC', () => {
    const early = at(0.45);
    const late = at(0.85);
    expect(early.red).toBeGreaterThan(0);
    expect(early.edge).toBeGreaterThan(0);
    expect(early.black).toBe(0);
    expect(late.red).toBeGreaterThanOrEqual(early.red);
    expect(late.clear).toBeLessThan(early.clear);
    expect(late.edge).toBeGreaterThan(early.edge);
    expect(late.black).toBeGreaterThan(0);
    expect(at(1)).toMatchObject({ clear: 0, edge: 1, black: 1 });
  });

  it('is softer with reduced motion, but still shows', () => {
    expect(at(0.85, true).edge).toBeLessThan(at(0.85).edge);
    expect(at(0.85, true).edge).toBeGreaterThan(0);
    expect(at(1, true).black).toBeLessThan(1);
  });

  it('holds black after the blackout, then lets the falling jet show through, dim', () => {
    const out = (s: number) => gVision(1, s, false, createGVision());
    expect(out(0).black).toBe(1);
    expect(out(BLACKOUT_HOLD_S).black).toBe(1);
    expect(out(BLACKOUT_HOLD_S + BLACKOUT_FADE_S / 2).black).toBeLessThan(1);
    expect(out(BLACKOUT_HOLD_S + BLACKOUT_FADE_S).black).toBeCloseTo(BLACKOUT_DIM);
    expect(out(60).black).toBeCloseTo(BLACKOUT_DIM);
    // Reduced motion does not lift the blackout itself.
    expect(gVision(1, 0, true, createGVision()).black).toBe(1);
  });
});
