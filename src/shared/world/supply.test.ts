import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { listAircraft } from '../data/aircraft/registry.ts';
import { buildTerrain, type MapDefinition } from '../data/maps/map-definition.ts';
import { createLechovia } from '../data/maps/lechovia/index.ts';
import type { GridTerrain } from '../map/terrain.ts';
import { type Airfield, airfieldWorld } from '../map/features.ts';
import { DEG } from '../math/units.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import { trimAlpha } from '../physics/aero.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState, type FlightState } from '../physics/flight-model.ts';
import { TOUCHDOWN_MAX_SINK_MS } from '../physics/ground.ts';
import { type AircraftEntity, createAircraftEntity } from './entities.ts';
import type { GameEvent } from './events.ts';
import { runwayFlightState } from './spawns.ts';
import { friendlyAirfield, nearestFriendlyAirfield, needsSupply, onApproach, resupply, SUPPLY_LANDED_S, SUPPLY_PASS_S, supplyAt } from './supply.ts';
import { TICK_RATE, World } from './world.ts';

let map: MapDefinition;
let terrain: GridTerrain;
let home: Airfield;
let enemy: Airfield;
let neutral: Airfield;

beforeAll(() => {
  map = createLechovia();
  terrain = buildTerrain(map);
  const fields = map.features!.airfields;
  home = fields.find((f) => f.team === 'usa')!;
  enemy = fields.find((f) => f.team === 'russia')!;
  neutral = fields.find((f) => f.team === null)!;
}, 60_000);

/** In the air over a runway point (u along the take-off direction from the centre), this high above it and fast. */
function over(field: Airfield, u: number, heightM: number, speed: number): FlightState {
  const p = airfieldWorld(field, u, 0);
  const y = field.elevationM + heightM;
  return createFlightState({ position: new Vector3(p.x, y, p.z), headingRad: field.headingRad, speed, alphaRad: 3 * DEG });
}

/** A Kestrel that has used its weapons and taken damage. */
function spent(w: World): AircraftEntity {
  const a = w.addAircraft({ callsign: 'P', team: 'usa', aircraftId: 'kestrel' });
  a.stores.srm = 0;
  a.stores.mrm = 1;
  a.stores.cannonRounds = 0;
  a.stores.countermeasures = 3;
  a.stores.fuelKg = 0.3 * a.config.physics.fuelKg;
  a.hp = a.config.damage.hitPoints / 2;
  return a;
}

describe('supplies at an airfield (revision 22)', () => {
  it('counts the own team\'s and neutral airfields, never the enemy\'s', () => {
    expect(friendlyAirfield(home, 'usa')).toBe(true);
    expect(friendlyAirfield(neutral, 'usa')).toBe(true);
    expect(friendlyAirfield(enemy, 'usa')).toBe(false);
    expect(nearestFriendlyAirfield(map.features, 'usa', home.x + 1000, home.z)).toBe(home);
    expect(nearestFriendlyAirfield(map.features, 'usa', enemy.x, enemy.z)).not.toBe(enemy);
    expect(nearestFriendlyAirfield(undefined, 'usa', 0, 0)).toBeNull();
  });

  it('knows a supply pass, a stop and an approach when it sees one', () => {
    expect(supplyAt(map.features, 'usa', over(home, 0, 100, 120))).toBe('pass');
    expect(supplyAt(map.features, 'usa', over(home, 0, 300, 120))).toBeNull();
    expect(supplyAt(map.features, 'usa', over(home, 0, 100, 200))).toBeNull();
    expect(supplyAt(map.features, 'usa', over(home, home.lengthM, 100, 120))).toBeNull();
    expect(supplyAt(map.features, 'russia', over(home, 0, 100, 120))).toBeNull();
    expect(supplyAt(map.features, 'usa', runwayFlightState(home, 0))).toBe('landed');
    // The gear comes down short of a friendly runway, low and slow; not climbing away, fast or at the enemy's.
    const approach = over(home, -home.lengthM / 2 - 4000, 300, 100);
    expect(onApproach(map.features, 'usa', approach)).toBe(true);
    expect(onApproach(map.features, 'russia', approach)).toBe(false);
    expect(onApproach(map.features, 'usa', over(home, -home.lengthM / 2 - 4000, 300, 200))).toBe(false);
    approach.vel.y = 10;
    expect(onApproach(map.features, 'usa', approach)).toBe(false);
  });

  it('reloads missiles, rounds, flares and fuel, repairs only after a stop, and leaves the bombs', () => {
    const config = listAircraft().find((c) => c.id === 'yastreb')!;
    const a = createAircraftEntity({ id: 1, callsign: 'R', team: 'russia', config, isBot: false, flight: runwayFlightState(enemy, 0), spawnSlot: 0, bombLoad: 2 });
    expect(a.stores.bombs).toBe(2);
    expect(needsSupply(a, true)).toBe(false);
    a.stores.srm = 0;
    a.stores.bombs = 0;
    a.hp = 10;
    expect(needsSupply(a, false)).toBe(true);
    resupply(a, false);
    expect(a.stores.srm).toBe(a.config.stores.srm);
    expect(a.hp).toBe(10);
    expect(needsSupply(a, false)).toBe(false);
    expect(needsSupply(a, true)).toBe(true);
    resupply(a, true);
    expect(a.hp).toBe(a.config.damage.hitPoints);
    expect(a.stores.bombs).toBe(0);
  });

  it('resupplies on a low, slow pass over a friendly runway, once', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    const a = spent(w);
    a.flight = over(home, -home.lengthM / 2 + 200, 80, 110);
    a.flight.throttle = 0.5;
    a.prevPos.copy(a.flight.pos);
    const inputs = new Map([[a.id, neutralInput(0.5)]]);
    const events: GameEvent[] = [];
    for (let t = 0; t < (SUPPLY_PASS_S + 2) * TICK_RATE; t++) {
      w.step(inputs);
      events.push(...w.drainEvents());
      if (t === TICK_RATE) expect(w.supplyProgress(a)).toMatchObject({ kind: 'pass' });
    }
    expect(events.filter((e) => e.type === 'resupplied')).toEqual([{ type: 'resupplied', aircraftId: a.id, repaired: false }]);
    expect(a.stores.srm).toBe(a.config.stores.srm);
    expect(a.stores.cannonRounds).toBe(a.config.stores.cannonRounds);
    expect(a.stores.fuelKg).toBeGreaterThan(0.95 * a.config.physics.fuelKg);
    expect(a.hp).toBe(a.config.damage.hitPoints / 2);
    expect(w.supplyProgress(a)).toBeNull();
  });

  it('gives nothing over the enemy\'s runway, and nothing to a full jet on its runway start', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    const a = spent(w);
    a.flight = over(enemy, -enemy.lengthM / 2 + 200, 80, 110);
    a.prevPos.copy(a.flight.pos);
    const b = w.addAircraft({ callsign: 'Q', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    for (let t = 0; t < (SUPPLY_LANDED_S + 2) * TICK_RATE; t++) w.step(new Map([[a.id, neutralInput(0.5)], [b.id, neutralInput(0)]]));
    expect(w.drainEvents().some((e) => e.type === 'resupplied')).toBe(false);
    expect(a.stores.srm).toBe(0);
    expect(b.flight.onGround).toBe(true);
  });

  it.each(listAircraft().filter((c) => !c.support).map((c) => c.id))('lands %s: gear down on approach, a gentle touchdown, then rearmed and repaired', (id) => {
    const config = listAircraft().find((c) => c.id === id)!;
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    const field = map.features!.airfields.find((f) => f.team === config.team)!;
    const a = w.addAircraft({ callsign: 'P', team: config.team, aircraftId: id });
    a.stores.srm = 0;
    a.stores.cannonRounds = 0;
    a.hp = a.config.damage.hitPoints / 2;
    // 5 km short of the threshold on the centre line, on a 3° slope at 95 m/s, gear up.
    const p = airfieldWorld(field, -field.lengthM / 2 - 5000, 0);
    const y = field.elevationM + 270;
    a.flight = createFlightState({ position: new Vector3(p.x, y, p.z), headingRad: field.headingRad, pitchRad: -3 * DEG, speed: 95, throttle: 0.4, alphaRad: trimAlpha(config.physics, 95, atmosphere(y).density) });
    a.prevPos.copy(a.flight.pos);
    // A plain autopilot: hold the slope and about 80 m/s, flatten out just above the runway; then idle and brake.
    const input = neutralInput(0.4);
    const inputs = new Map([[a.id, input]]);
    const events: GameEvent[] = [];
    let sink = 0;
    for (let t = 0; t < 150 * TICK_RATE && a.alive && !events.some((e) => e.type === 'resupplied' && e.repaired); t++) {
      const f = a.flight;
      if (f.onGround) {
        Object.assign(input, { pitch: 0, throttle: 0, airbrake: true });
      } else {
        const slope = Math.atan2(f.vel.y, Math.hypot(f.vel.x, f.vel.z));
        const target = f.pos.y - field.elevationM > 17 ? -3 * DEG : -0.6 * DEG;
        Object.assign(input, { pitch: Math.max(-0.25, Math.min(0.25, 3 * (target - slope))), throttle: Math.max(0, Math.min(0.9, 0.35 + 0.06 * (80 - f.airspeed))) });
        if (f.pos.y - field.elevationM < 10) sink = Math.max(sink, -f.vel.y);
      }
      w.step(inputs);
      events.push(...w.drainEvents());
    }
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(true);
    expect(a.flight.gear).toBe(1);
    expect(sink).toBeLessThan(TOUCHDOWN_MAX_SINK_MS);
    // Rearmed on the way down the runway, then repaired once stopped.
    expect(events.filter((e) => e.type === 'resupplied')).toEqual([
      { type: 'resupplied', aircraftId: a.id, repaired: false },
      { type: 'resupplied', aircraftId: a.id, repaired: true },
    ]);
    expect(a.stores.srm).toBe(a.config.stores.srm);
    expect(a.hp).toBe(a.config.damage.hitPoints);
  });
});
