import { describe, expect, it } from 'vitest';
import { listAircraft } from '../shared/data/aircraft/registry.ts';
import { type Career, emptyCareer } from './career.ts';
import { careerXp, isUnlocked, levelForXp, levelProgress, matchXp, nextUnlock, progressionLines, UNLOCK_LEVELS, unlockedJets, xpForLevel } from './progression.ts';

const career = (c: Partial<Career>): Career => ({ ...emptyCareer(), ...c });

describe('pilot levels (revision 26)', () => {
  it('earns experience for finishing, winning, kills and Sentinels', () => {
    expect(matchXp({ result: 'loss', kills: 0, sentinels: 0 })).toBe(100);
    expect(matchXp({ result: 'win', kills: 3, sentinels: 1 })).toBe(100 + 150 + 150 + 100);
    expect(matchXp({ result: 'draw', kills: 1, sentinels: 0 })).toBe(200);
    // The career's experience is every match's, so matches before levels existed count too.
    expect(careerXp(career({ matches: 2, wins: 1, draws: 1, kills: 4, sentinels: 1 }))).toBe(200 + 150 + 50 + 200 + 100);
  });

  it('asks more for each level', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(xpForLevel)).toEqual([0, 300, 800, 1500, 2400, 3500, 4800]);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(4799)).toBe(6);
    expect(levelForXp(4800)).toBe(7);
    expect(levelProgress(1150)).toEqual({ level: 3, xp: 1150, from: 800, to: 1500, fraction: 0.5 });
  });

  it('opens a light fighter on each side at the start and the rest one level at a time', () => {
    for (const a of listAircraft()) expect(UNLOCK_LEVELS[a.id]).toBeGreaterThanOrEqual(1);
    expect(unlockedJets(1).sort()).toEqual(['kestrel', 'kobchik']);
    expect(unlockedJets(1, 'usa')).toEqual(['kestrel']);
    expect(unlockedJets(1, 'russia')).toEqual(['kobchik']);
    expect(isUnlocked('yastreb', 1)).toBe(false);
    expect(isUnlocked('yastreb', 2)).toBe(true);
    expect(unlockedJets(7)).toHaveLength(listAircraft().length);
    // One new jet per level from 2 to 7.
    const levels = Object.values(UNLOCK_LEVELS).filter((l) => l > 1).sort();
    expect(levels).toEqual([2, 3, 4, 5, 6, 7]);
    expect(nextUnlock(1)).toEqual({ aircraftId: 'yastreb', name: 'Yastreb', level: 2 });
    expect(nextUnlock(7)).toBeNull();
  });

  it('tells the end screen what the match earned, a level up and the jet it opened', () => {
    const before = career({ matches: 1, kills: 2 });
    const after = career({ matches: 2, wins: 1, kills: 4 });
    expect(careerXp(before)).toBe(200);
    expect(careerXp(after)).toBe(550);
    expect(progressionLines(before, after)).toEqual(['+350 XP · Level 2 (550 / 800 XP)', 'Level up · Level 2', 'New jet unlocked · Yastreb']);
    expect(progressionLines(after, career({ matches: 3, wins: 1, kills: 4 }))).toEqual(['+100 XP · Level 2 (650 / 800 XP)']);
  });
});
