import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { StrikeStatus } from '../../shared/modes/mode.ts';
import type { GroundTargetView } from '../session/game-session.ts';
import { BOMB_CUE_RANGE_M, bombCue, releaseCue, strikeStatusLines, TargetAlerts, targetDestroyedText } from './strike-hud.ts';

const status: StrikeStatus = { attacker: 'russia', defender: 'usa', aircraftLeft: { usa: 4, russia: 3 }, targetsDestroyed: 1, targetsToWin: 2, reason: null };
const target = (id: string, x: number, destroyed = false): GroundTargetView => ({ id, kind: 'radar', label: id, position: new Vector3(x, 100, 0), maxHp: 100, hp: destroyed ? 0 : 100, destroyed });

describe('strike HUD', () => {
  it('shows the clock and targets standing, then aircraft left with own team first', () => {
    expect(strikeStatusLines(status, 462, 2, 3, 'usa')).toEqual([
      [
        ['7:42', 'neutral'],
        ['   TARGETS 2/3', 'neutral'],
      ],
      [
        ['AIRCRAFT ', 'neutral'],
        ['USA 4', 'mine'],
        ['  ', 'neutral'],
        ['RUSSIA 3', 'theirs'],
      ],
    ]);
    expect(strikeStatusLines(status, 462, 2, 3, 'russia')[1][1]).toEqual(['RUSSIA 3', 'mine']);
  });

  it('cues the release while the impact point is within 30 m of a standing target', () => {
    const targets = [target('A', 0), target('B', 1000, true)];
    expect(releaseCue(new Vector3(25, 100, 10), targets)).toBe(true);
    expect(releaseCue(new Vector3(40, 100, 0), targets)).toBe(false);
    expect(releaseCue(new Vector3(1000, 100, 0), targets)).toBe(false);
    expect(releaseCue(null, targets)).toBe(false);
  });

  it('shows the bomb cue only on a run: the impact near a standing target, not from far out', () => {
    const targets = [target('A', 0), target('B', 10000, true)];
    const near = new Vector3(BOMB_CUE_RANGE_M - 100, 100, 0);
    expect(bombCue(near, targets)).toBe(near);
    expect(bombCue(new Vector3(BOMB_CUE_RANGE_M + 100, 100, 0), targets)).toBeNull();
    // Near a destroyed target only: nothing to bomb there.
    expect(bombCue(new Vector3(10000, 100, 0), targets)).toBeNull();
    expect(bombCue(null, targets)).toBeNull();
  });

  it('warns about an attacked target at most once every 3 s', () => {
    const alerts = new TargetAlerts();
    expect(alerts.underAttack('B', 10)).toBe('TARGET B UNDER ATTACK');
    expect(alerts.underAttack('B', 12)).toBeNull();
    expect(alerts.underAttack('C', 12)).toBe('TARGET C UNDER ATTACK');
    expect(alerts.underAttack('B', 13)).toBe('TARGET B UNDER ATTACK');
    expect(targetDestroyedText('A')).toBe('TARGET A DESTROYED');
  });
});
