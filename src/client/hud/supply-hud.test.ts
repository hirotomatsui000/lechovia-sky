import { describe, expect, it } from 'vitest';
import type { Airfield, MapFeatures } from '../../shared/map/features.ts';
import { DEFAULT_BINDINGS } from '../input/bindings.ts';
import { testView } from '../testing/views.ts';
import { APPROACH_CUE_RANGE_M, homeCue, landingHint, REARM_ROUNDS, rtbReason, supplyLimits } from './supply-hud.ts';

const field = (id: string, team: Airfield['team'], x: number): Airfield => ({ id, name: `${id} Air Base`, team, x, z: 0, headingRad: Math.PI / 2, lengthM: 3000, widthM: 50, elevationM: 100 });
const features: MapFeatures = { settlements: [], roads: [], rivers: [], airfields: [field('Home', 'usa', -40000), field('Enemy', 'russia', 2000), field('Open', null, 30000)] };

describe('the way home (revision 22)', () => {
  it('points home once the missiles or the rounds are gone, the fuel is low or the jet badly hit', () => {
    const v = testView(1);
    expect(rtbReason(v)).toBeNull();
    expect(rtbReason({ ...v, stores: { ...v.stores, srm: 0, mrm: 0 } })).toBe('rearm');
    expect(rtbReason({ ...v, stores: { ...v.stores, cannonRounds: 0 } })).toBe('rearm');
    // Revision 26: down to 40 rounds is time to go home.
    expect(REARM_ROUNDS).toBe(40);
    expect(rtbReason({ ...v, stores: { ...v.stores, cannonRounds: 40 } })).toBe('rearm');
    expect(rtbReason({ ...v, stores: { ...v.stores, cannonRounds: 41 } })).toBeNull();
    expect(rtbReason({ ...v, stores: { ...v.stores, fuelKg: 0.1 * v.config.physics.fuelKg } })).toBe('fuel');
    expect(rtbReason({ ...v, hp: 0.2 * v.config.damage.hitPoints })).toBe('repair');
    expect(rtbReason({ ...v, alive: false, stores: { ...v.stores, srm: 0, mrm: 0 } })).toBeNull();
  });

  it('chooses the nearest friendly airfield, never the enemy\'s, and is near only close and low', () => {
    const v = testView(0);
    const cue = homeCue(features, v)!;
    // The enemy's field is 2 km away; the neutral one at 30 km is the nearest friendly.
    expect(cue.field.id).toBe('Open');
    expect(cue.distanceM).toBeCloseTo(30000, 0);
    expect(cue.near).toBe(false);
    v.flight.pos.set(30000 - APPROACH_CUE_RANGE_M / 2, 600, 0);
    expect(homeCue(features, v)!.near).toBe(true);
    v.flight.pos.y = 5000;
    expect(homeCue(features, v)!.near).toBe(false);
    expect(homeCue(undefined, v)).toBeNull();
  });

  it('gives the supply pass limits in the jet\'s units, and the roll-out hint with the brake key', () => {
    expect(supplyLimits('imperial')).toEqual({ speed: '250 KT', height: '450 FT' });
    expect(supplyLimits('metric')).toEqual({ speed: '460 KM/H', height: '150 M' });
    expect(landingHint(DEFAULT_BINDINGS, false)).toContain('B brakes · stop to repair');
    expect(landingHint(DEFAULT_BINDINGS, true)).toContain('D-pad up brakes');
  });
});
