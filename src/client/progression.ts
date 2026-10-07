import { getAircraft, listAircraft } from '../shared/data/aircraft/registry.ts';
import type { TeamId } from '../shared/data/aircraft/types.ts';
import type { Career, MatchOutcome } from './career.ts';

/*
 * Pilot levels (revision 26, at the owner's request: "unlock fighters by levelling up"). Experience comes from the
 * career records, so matches flown before levels existed count too: every finished match, more for a win, and each
 * kill and Sentinel. Each level asks for more than the one before, and the jets open one level at a time, alternating
 * sides, from the light fighters to the stealth jets. Campaign missions still lend their own jet.
 */

/** Experience per finished match, per win or draw on top, per kill and per Sentinel. */
export const XP = { match: 100, win: 150, draw: 50, kill: 50, sentinel: 100 } as const;

/** The level each jet opens at; a jet not listed is open from the start. */
export const UNLOCK_LEVELS: Readonly<Record<string, number>> = {
  kestrel: 1,
  kobchik: 1,
  yastreb: 2,
  condor: 3,
  sapsan: 4,
  tempest: 5,
  prizrak: 6,
  shade: 7,
};

/** What one match earns. */
export function matchXp(m: { result: MatchOutcome; kills: number; sentinels: number }): number {
  return XP.match + (m.result === 'win' ? XP.win : m.result === 'draw' ? XP.draw : 0) + XP.kill * m.kills + XP.sentinel * m.sentinels;
}

/** All the experience in a career's records. */
export function careerXp(c: Career): number {
  return XP.match * c.matches + XP.win * c.wins + XP.draw * c.draws + XP.kill * c.kills + XP.sentinel * c.sentinels;
}

/** Experience needed to reach level `n`: 0, 300, 800, 1,500, 2,400 … (100 · (n² − 1)). */
export function xpForLevel(n: number): number {
  return 100 * (Math.max(1, n) ** 2 - 1);
}

export function levelForXp(xp: number): number {
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  return n;
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** experience at the start of this level and at the next */
  from: number;
  to: number;
  /** 0 … 1 of the way to the next level */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, xp, from, to, fraction: (xp - from) / (to - from) };
}

export function unlockLevel(aircraftId: string): number {
  return UNLOCK_LEVELS[aircraftId] ?? 1;
}

export function isUnlocked(aircraftId: string, level: number): boolean {
  return unlockLevel(aircraftId) <= level;
}

/** The jets (of one team, or both) open at `level`. */
export function unlockedJets(level: number, team?: TeamId): string[] {
  return listAircraft(team)
    .filter((a) => isUnlocked(a.id, level))
    .map((a) => a.id);
}

/** The next jet to open above `level` and its level, or null once all are open. */
export function nextUnlock(level: number): { aircraftId: string; name: string; level: number } | null {
  let best: { aircraftId: string; name: string; level: number } | null = null;
  for (const a of listAircraft()) {
    const at = unlockLevel(a.id);
    if (at > level && (!best || at < best.level)) best = { aircraftId: a.id, name: a.name, level: at };
  }
  return best;
}

/**
 * The end screen's lines about a match's experience: what it earned and where that leaves the pilot, a level reached,
 * and any jet it opened.
 */
export function progressionLines(before: Career, after: Career): string[] {
  const was = levelProgress(careerXp(before));
  const now = levelProgress(careerXp(after));
  const lines = [`+${(now.xp - was.xp).toLocaleString('en-US')} XP · Level ${now.level} (${now.xp.toLocaleString('en-US')} / ${now.to.toLocaleString('en-US')} XP)`];
  if (now.level > was.level) {
    lines.push(`Level up · Level ${now.level}`);
    for (const a of listAircraft()) {
      const at = unlockLevel(a.id);
      if (at > was.level && at <= now.level) lines.push(`New jet unlocked · ${getAircraft(a.id).name}`);
    }
  }
  return lines;
}
