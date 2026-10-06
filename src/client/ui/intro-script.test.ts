import { describe, expect, it } from 'vitest';
import { BEAT, banditPose, hitPoint, INTRO_MAX_S, INTRO_S, jetPoint, loadLabel, missilePose, revealAt, shakeAt, timecode, typed } from './intro-script.ts';

describe('the opening', () => {
  it('cuts to the title screen after five seconds once loaded, and waits for loading only so long', () => {
    expect(INTRO_S).toBe(5);
    expect(revealAt(4.9, true)).toBe(false);
    expect(revealAt(5, true)).toBe(true);
    expect(revealAt(7, false)).toBe(false);
    expect(revealAt(INTRO_MAX_S, false)).toBe(true);
  });

  it('brings the bandit over the top of the frame and settles it ahead, near the middle', () => {
    expect(banditPose(BEAT.banditIn - 0.01)).toBeNull();
    const first = banditPose(BEAT.banditIn);
    expect(first).not.toBeNull();
    // Just off the camera's right shoulder: well outside the frame.
    expect(first!.z).toBeLessThan(0.5);
    expect(first!.x / first!.z).toBeGreaterThan(2);
    expect(first!.y / first!.z).toBeGreaterThan(1);
    let z = 0;
    for (let t = BEAT.banditIn; t <= BEAT.banditSettled; t += 0.05) {
      const pose = banditPose(t)!;
      expect(pose.z).toBeGreaterThan(z);
      z = pose.z;
    }
    const settled = banditPose(BEAT.banditSettled)!;
    expect(settled.z).toBeCloseTo(9, 5);
    expect(Math.abs(settled.x / settled.z)).toBeLessThan(0.1);
    expect(settled.y / settled.z).toBeGreaterThan(0);
    // Gone in the fireball.
    expect(banditPose(BEAT.hit)).toBeNull();
  });

  it('flies the missile from under the left wing to where the bandit is at the hit', () => {
    expect(missilePose(BEAT.fire - 0.01)).toBeNull();
    const launch = missilePose(BEAT.fire)!;
    expect(launch.x).toBeLessThan(0);
    expect(launch.y).toBeLessThan(0);
    const last = missilePose(BEAT.hit - 1e-6)!;
    const hit = hitPoint();
    expect(last.x).toBeCloseTo(hit.x, 3);
    expect(last.y).toBeCloseTo(hit.y, 3);
    expect(last.z).toBeCloseTo(hit.z, 3);
    expect(missilePose(BEAT.hit)).toBeNull();
  });

  it('banks points on the bandit with it, right wing down for a positive bank', () => {
    const level = { x: 1, y: 2, z: 5, roll: 0 };
    expect(jetPoint(level, 0.5, 0, -0.2)).toEqual({ x: 1.5, y: 2, z: 4.8 });
    const banked = { ...level, roll: 0.5 };
    expect(jetPoint(banked, 0.5, 0, 0).y).toBeLessThan(2);
    expect(jetPoint(banked, -0.5, 0, 0).y).toBeGreaterThan(2);
  });

  it('shows the title only after the fireball has had its moment', () => {
    expect(BEAT.fire).toBeGreaterThan(BEAT.lock);
    expect(BEAT.hit).toBeGreaterThan(BEAT.fire);
    expect(BEAT.title - BEAT.hit).toBeGreaterThanOrEqual(0.3);
    expect(BEAT.tagline).toBeLessThan(INTRO_S);
  });

  it('shakes for the pass and the blast, and holds still otherwise', () => {
    expect(shakeAt(0.3)).toBeLessThan(0.1);
    expect(shakeAt(1.3)).toBeGreaterThan(8);
    expect(shakeAt(2.4)).toBeLessThan(0.1);
    expect(shakeAt(BEAT.hit)).toBeGreaterThan(15);
    expect(shakeAt(INTRO_S)).toBeLessThan(0.1);
  });

  it('types text, runs a film timecode and counts the loading', () => {
    expect(typed('RADAR OK', 1, 0.5)).toBe('');
    expect(typed('RADAR OK', 1, 1.05, 60)).toBe('RAD');
    expect(typed('RADAR OK', 1, 9)).toBe('RADAR OK');
    expect(timecode(0)).toBe('00:00:00:00');
    expect(timecode(1.5)).toBe('00:00:01:12');
    expect(timecode(65.25)).toBe('00:01:05:06');
    expect(loadLabel(3, 8)).toBe('LOADING 3/8');
    expect(loadLabel(8, 8)).toBe('SYSTEMS READY');
  });
});
