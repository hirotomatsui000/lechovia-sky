import type { Vector3 } from 'three';
import { TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { BOMB_ANVIL } from '../../shared/data/weapons.ts';
import type { StrikeStatus } from '../../shared/modes/mode.ts';
import type { GroundTargetView } from '../session/game-session.ts';
import { formatClock } from './format.ts';

export type StrikeTextPart = readonly [text: string, side: 'mine' | 'theirs' | 'neutral'];

/** A target's "UNDER ATTACK" banner repeats at most this often (spec §15.2). */
export const UNDER_ATTACK_REPEAT_S = 3;

/**
 * The Strike status (spec §15.2): the clock and targets standing, then aircraft left per team. Two short lines, so
 * the status stays clear of the heading tape in windows narrower than about 1,250 px.
 */
export function strikeStatusLines(s: StrikeStatus, timeLeftS: number, standing: number, total: number, localTeam: TeamId): StrikeTextPart[][] {
  const other = localTeam === s.attacker ? s.defender : s.attacker;
  return [
    [
      [formatClock(timeLeftS), 'neutral'],
      [`   TARGETS ${standing}/${total}`, 'neutral'],
    ],
    [
      ['AIRCRAFT ', 'neutral'],
      [`${TEAM_NAMES[localTeam].toUpperCase()} ${s.aircraftLeft[localTeam]}`, 'mine'],
      ['  ', 'neutral'],
      [`${TEAM_NAMES[other].toUpperCase()} ${s.aircraftLeft[other]}`, 'theirs'],
    ],
  ];
}

/**
 * The bomb cue (impact point and fall line) shows only on a bombing run: with the predicted impact this close to a
 * standing target. Shown whenever bombs were aboard, the fall line hung from the flight-path marker to the bottom of
 * the screen all the way from 20 km out, through the gun sight; the owner took it for a broken aiming line.
 */
export const BOMB_CUE_RANGE_M = 2500;

const near = (impact: Vector3, targets: readonly GroundTargetView[], rangeM: number) =>
  targets.some((t) => !t.destroyed && Math.hypot(impact.x - t.position.x, impact.z - t.position.z) <= rangeM);

/** The predicted impact to draw, or null when no standing target is near it. */
export function bombCue(impact: Vector3 | null, targets: readonly GroundTargetView[]): Vector3 | null {
  return impact && near(impact, targets, BOMB_CUE_RANGE_M) ? impact : null;
}

/** True while the predicted impact point lies within a standing target's full-damage radius. */
export function releaseCue(impact: Vector3 | null, targets: readonly GroundTargetView[]): boolean {
  return impact !== null && near(impact, targets, BOMB_ANVIL.fullDamageRadiusM);
}

export function targetDestroyedText(targetId: string): string {
  return `TARGET ${targetId} DESTROYED`;
}

/** Defender banners for target hits, throttled per target. */
export class TargetAlerts {
  private readonly lastAlertS = new Map<string, number>();

  underAttack(targetId: string, nowS: number): string | null {
    const last = this.lastAlertS.get(targetId);
    if (last !== undefined && nowS - last < UNDER_ATTACK_REPEAT_S) return null;
    this.lastAlertS.set(targetId, nowS);
    return `TARGET ${targetId} UNDER ATTACK`;
  }
}
