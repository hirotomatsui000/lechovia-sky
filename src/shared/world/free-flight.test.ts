import { describe, expect, it } from 'vitest';
import { createLechovia } from '../data/maps/lechovia/index.ts';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { FREE_FLIGHT_DRONES, FreeFlightMode } from '../modes/free-flight.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import type { ControlInput } from '../physics/controls.ts';
import { environmentAt } from './time-of-day.ts';
import { TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const none = new Map<number, ControlInput>();
const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) w.step(none);
};

describe('Free Flight weather and clock (M5)', () => {
  it('sets the hour it is now, keeps the clock running from there and rebuilds the clouds', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1, environment: { weather: 'clear', startHour: 12, clockRunning: true } });
    run(w, 30 * TICK_RATE);
    expect(w.hour()).toBeCloseTo(12.5, 6);
    const clouds = w.clouds;
    w.setEnvironment(environmentAt('broken', 22, true, w.tick / TICK_RATE));
    expect(w.hour()).toBeCloseTo(22, 6);
    expect(w.clouds).not.toBe(clouds);
    run(w, 60 * TICK_RATE);
    expect(w.hour()).toBeCloseTo(23, 6);
    w.setEnvironment(environmentAt('broken', 6.5, false, w.tick / TICK_RATE));
    const same = w.clouds;
    run(w, 60 * TICK_RATE);
    expect(w.hour()).toBeCloseTo(6.5, 6);
    expect(w.clouds).toBe(same);
  });
});

describe('Free Flight "fly from here" (M5)', () => {
  it('puts the jet in the air over the point, anywhere on the map, and only in Free Flight', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 1 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    w.drainEvents();
    expect(w.flyFrom(a.id, 5000, 12000)).toBe(true);
    expect(a.flight.pos.x).toBeCloseTo(5000, 0);
    expect(a.flight.pos.z).toBeCloseTo(12000, 0);
    expect(a.flight.pos.y).toBeGreaterThanOrEqual(Math.max(2000, terrain.surfaceAt(5000, 12000) + 1500) - 1);
    expect(a.spawnGen).toBe(2);
    expect(w.drainEvents()).toEqual([{ type: 'spawned', aircraftId: a.id, spawnGen: 2 }]);
    // Outside the combat area, where the map screen was clicked (revision 22), with no boundary countdown.
    const corner = map.sizeM / 2 - 3000;
    expect(Math.hypot(corner, corner)).toBeGreaterThan(map.combatArea.radiusM);
    w.flyFrom(a.id, corner, -corner);
    expect(a.flight.pos.x).toBeCloseTo(corner, 0);
    expect(a.flight.pos.z).toBeCloseTo(-corner, 0);
    run(w, 2 * TICK_RATE);
    expect(w.boundarySecondsLeft(a)).toBeNull();
    // Off the map it stops just inside the edge.
    w.flyFrom(a.id, 3 * map.sizeM, 0);
    expect(a.flight.pos.x).toBeLessThan(map.sizeM / 2);
    expect(a.flight.pos.x).toBeGreaterThan(map.sizeM / 2 - 5000);
    // A dead pilot flies again at once.
    w.applyDamage(a, 999, null, 'cannon');
    expect(w.flyFrom(a.id, 0, 0)).toBe(true);
    expect(a.alive).toBe(true);
    const tdm = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 1 });
    const b = tdm.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel' });
    expect(tdm.flyFrom(b.id, 0, 0)).toBe(false);
  });

  it('starts on the runway when the point is on an airfield', () => {
    const lechovia = createLechovia();
    const w = new World({ map: lechovia, terrain: buildTerrain(lechovia), mode: new FreeFlightMode(), seed: 1 });
    const a = w.addAircraft({ callsign: 'A', team: 'russia', aircraftId: 'kobchik' });
    const field = lechovia.features!.airfields.find((f) => f.name.startsWith('Morzysko'))!;
    expect(w.flyFrom(a.id, field.x, field.z)).toBe(true);
    expect(a.flight.onGround).toBe(true);
    expect(Math.hypot(a.flight.pos.x - field.x, a.flight.pos.z - field.z)).toBeLessThan(field.lengthM / 2);
    run(w, TICK_RATE);
    expect(a.alive).toBe(true);
  }, 30_000);
});

describe('Free Flight target drones (M5)', () => {
  it('flies four unarmed enemy drones round the player, replaces shot-down ones and clears them when turned off', () => {
    const mode = new FreeFlightMode();
    const w = new World({ map, terrain, mode, seed: 1 });
    const me = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    run(w, 1);
    expect(mode.combatEnabled).toBe(false);
    expect([...w.aircraftList()]).toHaveLength(1);
    mode.setDrones(true);
    run(w, 1);
    const drones = () => [...w.aircraftList()].filter((a) => a.isBot);
    expect(drones()).toHaveLength(FREE_FLIGHT_DRONES);
    expect(mode.combatEnabled).toBe(true);
    expect(mode.status().drones).toBe(true);
    for (const d of drones()) {
      expect(d.team).toBe('russia');
      expect(d.flight.pos.distanceTo(me.flight.pos)).toBeLessThan(8000);
    }
    const first = drones()[0];
    w.applyDamage(first, 999, me, 'cannon');
    expect(me.kills).toBe(1);
    run(w, 3 * TICK_RATE);
    expect(w.getAircraft(first.id)).toBeUndefined();
    expect(drones()).toHaveLength(FREE_FLIGHT_DRONES - 1);
    run(w, 8 * TICK_RATE);
    expect(drones()).toHaveLength(FREE_FLIGHT_DRONES);
    // Flying from somewhere else brings the drones along.
    w.flyFrom(me.id, -15000, 10000);
    run(w, 1);
    expect(drones()).toHaveLength(FREE_FLIGHT_DRONES);
    for (const d of drones()) expect(d.flight.pos.distanceTo(me.flight.pos)).toBeLessThan(8000);
    mode.setDrones(false);
    run(w, 1);
    expect(drones()).toHaveLength(0);
    expect(mode.combatEnabled).toBe(false);
  });
});
