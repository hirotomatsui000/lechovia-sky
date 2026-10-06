import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { BOUNDARY_GRACE_S, TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const newWorld = () => new World({ map, terrain, mode: new FreeFlightMode(), seed: 7 });
const noInputs = new Map<number, ControlInput>();
const run = (w: World, ticks: number, inputs: ReadonlyMap<number, ControlInput> = noInputs) => {
  for (let i = 0; i < ticks; i++) w.step(inputs);
};

describe('World', () => {
  it('spawns aircraft at the team spawn and emits an event', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'Tester', team: 'usa', aircraftId: 'kestrel' });
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(a.config.damage.hitPoints);
    expect(a.flight.pos.x).toBeCloseTo(map.spawns.usa.x, 3);
    expect(a.flight.pos.y).toBeGreaterThanOrEqual(map.spawns.usa.altitudeM);
    expect(w.drainEvents()).toEqual([{ type: 'spawned', aircraftId: a.id, spawnGen: 1 }]);
    expect(w.drainEvents()).toEqual([]);
  });

  it('spawns trimmed so a hands-off aircraft holds its altitude', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    const startAlt = a.flight.pos.y;
    run(w, 5 * TICK_RATE);
    expect(Math.abs(a.flight.pos.y - startAlt)).toBeLessThan(3);
  });

  it('places team-mates in separate spawn slots', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    const b = w.addAircraft({ callsign: 'B', team: 'usa', aircraftId: 'kestrel' });
    expect(a.flight.pos.distanceTo(b.flight.pos)).toBeGreaterThan(500);
  });

  it('rejects an aircraft flown for the wrong team', () => {
    expect(() => newWorld().addAircraft({ callsign: 'X', team: 'russia', aircraftId: 'kestrel' })).toThrow(/team/);
  });

  it('steps physics with sanitized inputs', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    const start = a.flight.pos.clone();
    run(w, 60, new Map([[a.id, { ...neutralInput(0.8), pitch: 5 }]]));
    expect(w.tick).toBe(60);
    expect(a.input.pitch).toBe(1);
    expect(a.flight.pos.distanceTo(start)).toBeGreaterThan(200);
  });

  it('destroys an aircraft that hits the ground and respawns it after the mode delay', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    w.drainEvents();
    a.flight.pos.y = terrain.heightAt(a.flight.pos.x, a.flight.pos.z) - 5;
    w.step(noInputs);
    expect(a.alive).toBe(false);
    expect(a.deaths).toBe(1);
    expect(w.drainEvents()).toEqual([{ type: 'destroyed', aircraftId: a.id, cause: 'crash', killerId: null }]);
    run(w, Math.round(w.mode.respawnDelayS * TICK_RATE));
    expect(a.alive).toBe(true);
    expect(a.spawnGen).toBe(2);
    expect(w.drainEvents()).toEqual([{ type: 'spawned', aircraftId: a.id, spawnGen: 2 }]);
  });

  it('destroys an aircraft that stays outside the combat area', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 7 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    a.flight.pos.set(28000, 5000, 0);
    run(w, TICK_RATE);
    expect(w.isOutOfBounds(a)).toBe(true);
    expect(w.boundarySecondsLeft(a)).toBeCloseTo(BOUNDARY_GRACE_S - 1, 1);
    run(w, (BOUNDARY_GRACE_S - 1) * TICK_RATE - 2);
    expect(a.alive).toBe(true);
    run(w, 5);
    expect(a.alive).toBe(false);
    expect(w.drainEvents().some((e) => e.type === 'destroyed' && e.cause === 'boundary')).toBe(true);
  });

  it('opens the whole map in Free Flight: only its edge is the boundary (revision 22)', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    a.flight.pos.set(map.sizeM / 2 - 1000, 5000, 0);
    expect(Math.abs(a.flight.pos.x)).toBeGreaterThan(map.combatArea.radiusM);
    expect(w.isOutOfBounds(a)).toBe(false);
    a.flight.pos.set(0, 5000, -(map.sizeM / 2 + 1000));
    expect(w.isOutOfBounds(a)).toBe(true);
  });

  it('treats the altitude ceiling as out of bounds', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    a.flight.pos.y = 19000;
    expect(w.isOutOfBounds(a)).toBe(true);
    expect(w.boundarySecondsLeft(a)).toBeNull();
  });

  it('removes aircraft', () => {
    const w = newWorld();
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
    expect(w.removeAircraft(a.id)).toBe(true);
    expect(w.getAircraft(a.id)).toBeUndefined();
    expect(w.removeAircraft(a.id)).toBe(false);
  });

  it('is deterministic', () => {
    const make = () => {
      const w = newWorld();
      const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel' });
      run(w, 300, new Map([[a.id, { ...neutralInput(1), pitch: 0.4, roll: 0.3 }]]));
      return a.flight.pos.toArray();
    };
    expect(make()).toEqual(make());
  });

  it('reports Free Flight status', () => {
    expect(newWorld().mode.status(newWorld()).label).toBe('Free Flight');
  });
});
