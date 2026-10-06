import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { listAircraft } from '../data/aircraft/registry.ts';
import type { Airfield } from '../map/features.ts';
import { airfieldGroundHeight, airfieldLocal } from '../map/features.ts';
import { DEG } from '../math/units.ts';
import { runwayFlightState } from '../world/spawns.ts';
import { neutralInput } from './controls.ts';
import { type FlightEnv, type FlightState, stepFlight } from './flight-model.ts';
import { GEAR_HEIGHT_M, gentleTouchdown, restingHeight } from './ground.ts';

const DT = 1 / 60;
const field: Airfield = { id: 'test', name: 'Test Field', team: 'usa', x: 0, z: 0, headingRad: 90 * DEG, lengthM: 3000, widthM: 45, elevationM: 120 };
const features = { settlements: [], roads: [], rivers: [], airfields: [field] };

function run(
  s: FlightState,
  physicsId: string,
  seconds: number,
  control: (s: FlightState, t: number) => Partial<ReturnType<typeof neutralInput>>,
  each?: (s: FlightState) => void,
  wind = new Vector3(),
): void {
  const config = listAircraft().find((a) => a.id === physicsId)!;
  const env: FlightEnv = { thrustScale: 1, rollScale: 1, groundM: NaN, wind, fuelUsedKg: 0, gearWanted: false };
  const input = neutralInput(0.9);
  for (let t = 0; t < seconds; t += DT) {
    Object.assign(input, neutralInput(0.9), control(s, t));
    env.groundM = airfieldGroundHeight(features, s.pos.x, s.pos.z);
    stepFlight(s, input, config.physics, DT, env);
    each?.(s);
  }
}

describe('ground handling and take-off (spec §8, M4)', () => {
  it('starts every jet standing on its gear on the runway threshold, facing down the runway', () => {
    const s = runwayFlightState(field, 0);
    expect(s.onGround).toBe(true);
    expect(s.gear).toBe(1);
    expect(s.vel.length()).toBe(0);
    expect(s.pos.y).toBeCloseTo(restingHeight(field.elevationM), 6);
    const { u } = airfieldLocal(field, s.pos.x, s.pos.z);
    expect(u).toBeCloseTo(-field.lengthM / 2 + 150, 6);
    // Slots fill two lanes, then the next row.
    const lanes = [0, 1, 2].map((k) => airfieldLocal(field, runwayFlightState(field, k).pos.x, runwayFlightState(field, k).pos.z));
    expect(lanes[0].v).toBeCloseTo(-lanes[1].v, 6);
    expect(lanes[2].u - lanes[0].u).toBeCloseTo(300, 6);
  });

  for (const config of listAircraft()) {
    for (const [label, throttle] of [
      ['military power', 0.9],
      ['afterburner', 1],
    ] as const) {
      it(`${config.name} lifts off within the runway at ${label} and climbs away`, () => {
        const s = runwayFlightState(field, 0);
        let liftoffU: number | null = null;
        let lowest = Infinity;
        run(s, config.id, 40, (st) => ({ throttle, pitch: st.pos.y - field.elevationM > 150 ? 0 : 0.6 }), (st) => {
          if (liftoffU === null && !st.onGround) liftoffU = airfieldLocal(field, st.pos.x, st.pos.z).u;
          if (st.onGround) lowest = Math.min(lowest, st.pos.y - field.elevationM);
        });
        expect(liftoffU, 'never left the ground').not.toBeNull();
        expect(liftoffU!).toBeLessThan(field.lengthM / 2);
        expect(lowest).toBeGreaterThan(GEAR_HEIGHT_M - 0.5);
        expect(s.pos.y - field.elevationM).toBeGreaterThan(150);
        expect(s.gear).toBe(0);
        expect(s.onGround).toBe(false);
      });
    }
  }

  it('lifts off sooner into a headwind (revision 16)', () => {
    const liftoff = (wind: Vector3) => {
      const s = runwayFlightState(field, 0);
      let at: number | null = null;
      run(s, 'kestrel', 40, () => ({ throttle: 0.9, pitch: 0.6 }), (st) => {
        if (at === null && !st.onGround) at = airfieldLocal(field, st.pos.x, st.pos.z).u;
      }, wind);
      return at!;
    };
    // The runway points east: a wind from the east is a headwind.
    const calm = liftoff(new Vector3());
    const headwind = liftoff(new Vector3(-10, 0, 0));
    const tailwind = liftoff(new Vector3(10, 0, 0));
    expect(calm - headwind).toBeGreaterThan(100);
    expect(tailwind - calm).toBeGreaterThan(100);
  });

  it('rolls straight down the centre line with the stick centred', () => {
    const s = runwayFlightState(field, 0);
    const start = airfieldLocal(field, s.pos.x, s.pos.z);
    run(s, 'kestrel', 8, () => ({ throttle: 0.9 }));
    const end = airfieldLocal(field, s.pos.x, s.pos.z);
    expect(end.u - start.u).toBeGreaterThan(150);
    expect(Math.abs(end.v - start.v)).toBeLessThan(0.01);
    expect(s.onGround).toBe(true);
  });

  it('steers with the stick or rudder and stops on the brakes', () => {
    const s = runwayFlightState(field, 0);
    run(s, 'condor', 5, () => ({ throttle: 0.9 }));
    const moving = s.vel.length();
    expect(moving).toBeGreaterThan(20);
    const before = airfieldLocal(field, s.pos.x, s.pos.z);
    run(s, 'condor', 2, () => ({ throttle: 0.9, yaw: 1 }));
    const after = airfieldLocal(field, s.pos.x, s.pos.z);
    // A right turn moves the jet to the right of its earlier track.
    expect(after.v - before.v).toBeGreaterThan(1);
    run(s, 'condor', 20, () => ({ throttle: 0, airbrake: true }));
    expect(s.vel.length()).toBeLessThan(0.01);
    expect(s.onGround).toBe(true);
  });

  it('holds still on the brakes, resting on the gear', () => {
    const s = runwayFlightState(field, 0);
    s.throttle = 0;
    const y = s.pos.y;
    run(s, 'shade', 5, () => ({ throttle: 0, airbrake: true }));
    expect(s.vel.length()).toBeLessThan(0.5);
    expect(Math.abs(s.pos.y - y)).toBeLessThan(0.05);
  });

  it('cannot lift the nose before the elevator has authority', () => {
    const s = runwayFlightState(field, 0);
    run(s, 'yastreb', 1.5, () => ({ throttle: 0.9, pitch: 1 }));
    expect(s.vel.length()).toBeGreaterThan(5);
    expect(new Vector3(0, 0, -1).applyQuaternion(s.quat).y).toBeLessThan(Math.sin(1 * DEG));
  });

  it('accepts a gentle touchdown on the gear but not a hard or banked one', () => {
    const s = runwayFlightState(field, 0);
    s.onGround = false;
    s.pos.y = field.elevationM + GEAR_HEIGHT_M - 0.1;
    s.vel.set(80, -1, 0);
    expect(gentleTouchdown(s, field.elevationM)).toBe(true);
    s.vel.y = -6;
    expect(gentleTouchdown(s, field.elevationM)).toBe(false);
    s.vel.y = -1;
    s.gear = 0.5;
    expect(gentleTouchdown(s, field.elevationM)).toBe(false);
    s.gear = 1;
    expect(gentleTouchdown(s, NaN)).toBe(false);
  });
});
