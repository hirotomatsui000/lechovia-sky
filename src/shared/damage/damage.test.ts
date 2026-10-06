import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SRM_DART } from '../data/weapons.ts';
import { blastDamage, clearCredit, type CreditRecord, damageFlightEnv, damageState, maneuverKillCredit } from './damage.ts';

describe('damage', () => {
  it('maps hit points to damage states', () => {
    expect(damageState(100, 100)).toBe('healthy');
    expect(damageState(60, 100)).toBe('healthy');
    expect(damageState(59, 100)).toBe('damaged');
    expect(damageState(30, 100)).toBe('damaged');
    expect(damageState(29, 100)).toBe('critical');
    expect(damageState(0, 100)).toBe('destroyed');
  });

  it('weakens the engine and controls as damage grows', () => {
    const env = { thrustScale: 1, rollScale: 1, groundM: NaN, wind: new Vector3(), fuelUsedKg: 0, gearWanted: false };
    expect(damageFlightEnv('healthy', env)).toMatchObject({ thrustScale: 1, rollScale: 1 });
    expect(damageFlightEnv('damaged', env)).toMatchObject({ thrustScale: 0.9, rollScale: 1 });
    expect(damageFlightEnv('critical', env)).toMatchObject({ thrustScale: 0.75, rollScale: 0.7 });
  });

  it('applies full blast damage within 4 m, falling to 0 at 18 m', () => {
    expect(blastDamage(0, SRM_DART)).toBe(130);
    expect(blastDamage(4, SRM_DART)).toBe(130);
    expect(blastDamage(11, SRM_DART)).toBeCloseTo(65, 9);
    expect(blastDamage(18, SRM_DART)).toBe(0);
    expect(blastDamage(40, SRM_DART)).toBe(0);
  });

  describe('maneuverKillCredit', () => {
    const record = (): CreditRecord => ({ lastDamagedBy: null, lastDamagedTick: -1, lastLockedBy: null, lastLockedTick: -1 });

    it('credits recent enemy damage or an enemy lock within 15 s', () => {
      const r = record();
      r.lastDamagedBy = 4;
      r.lastDamagedTick = 100;
      expect(maneuverKillCredit(r, 100 + 15 * 60, 60)).toBe(4);
      expect(maneuverKillCredit(r, 101 + 15 * 60, 60)).toBeNull();
      r.lastLockedBy = 7;
      r.lastLockedTick = 500;
      expect(maneuverKillCredit(r, 600, 60)).toBe(7);
    });

    it('is uncredited without enemy involvement, and after clearing', () => {
      const r = record();
      expect(maneuverKillCredit(r, 1000, 60)).toBeNull();
      r.lastDamagedBy = 3;
      r.lastDamagedTick = 990;
      clearCredit(r);
      expect(maneuverKillCredit(r, 1000, 60)).toBeNull();
    });
  });
});
