import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { neutralInput } from './controls.ts';
import { G_LOC_AT_9G_S, G_TOLERANCE, SLUMP_PULL, slumpedInput, strainRate, updateStrain, VISION_LOSS_STRAIN, visionLoss } from './g-tolerance.ts';

const DT = 1 / 60;
const hold = (g: number, seconds: number, from = 0) => {
  let s = from;
  for (let t = 0; t < seconds / DT; t++) s = updateStrain(s, g, DT);
  return s;
};
const secondsToGloc = (g: number) => {
  let s = 0;
  for (let t = 1; t <= 600 / DT; t++) {
    s = updateStrain(s, g, DT);
    if (s >= 1) return t * DT;
  }
  return Infinity;
};

describe('G tolerance (revision 21)', () => {
  it('builds strain only above the tolerance, the faster the harder the pull', () => {
    expect(strainRate(1)).toBeLessThan(0);
    expect(strainRate(G_TOLERANCE)).toBeLessThan(0);
    expect(strainRate(G_TOLERANCE + 0.5)).toBeGreaterThan(0);
    expect(strainRate(9)).toBeGreaterThan(strainRate(8));
    expect(secondsToGloc(9)).toBeCloseTo(G_LOC_AT_9G_S, 0);
    expect(secondsToGloc(8)).toBeGreaterThan(2 * G_LOC_AT_9G_S);
    expect(secondsToGloc(G_TOLERANCE)).toBe(Infinity);
    expect(secondsToGloc(5)).toBe(Infinity);
  });

  it('starts to take the view about 3 s into a 9 G pull and has all of it at G-LOC', () => {
    expect(visionLoss(0)).toBe(0);
    expect(visionLoss(VISION_LOSS_STRAIN)).toBe(0);
    expect(visionLoss((1 + VISION_LOSS_STRAIN) / 2)).toBeCloseTo(0.5);
    expect(visionLoss(1)).toBe(1);
    expect(visionLoss(hold(9, 2.5))).toBe(0);
    expect(visionLoss(hold(9, 4))).toBeGreaterThan(0);
  });

  it('clears again once the pull eases, faster the lighter the load', () => {
    const strained = hold(9, 8);
    expect(strained).toBeGreaterThan(0.7);
    expect(hold(1, 4, strained)).toBe(0);
    const nearTolerance = hold(G_TOLERANCE - 1, 4, strained);
    expect(nearTolerance).toBeGreaterThan(0);
    expect(nearTolerance).toBeLessThan(strained);
  });

  it('slumps a blacked-out pilot on the stick: toward the low wing, a little pull, no buttons, the throttle kept', () => {
    const busy = () => ({ ...neutralInput(1), pitch: -1, roll: -1, yaw: 1, airbrake: true, fireCannon: true, fireMissile: true, countermeasures: true, dropBomb: true, cycleTarget: true, helmetSight: true });
    // Rolled right: the right wing is down.
    const rightLow = slumpedInput(busy(), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.5));
    expect(rightLow.roll).toBeGreaterThan(0);
    expect(rightLow.pitch).toBe(SLUMP_PULL);
    expect(rightLow.yaw).toBe(0);
    expect(rightLow.throttle).toBe(1);
    for (const button of ['airbrake', 'fireCannon', 'fireMissile', 'countermeasures', 'dropBomb', 'cycleTarget', 'helmetSight'] as const) expect(rightLow[button], button).toBe(false);
    const leftLow = slumpedInput(busy(), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.5));
    expect(leftLow.roll).toBeLessThan(0);
    // Past the slump's bank the stick rolls back.
    const over = slumpedInput(busy(), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -3));
    expect(over.roll).toBeLessThan(0);
  });
});
