import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../ai/difficulty.ts';
import { createLechovia } from '../data/maps/lechovia/index.ts';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { airfieldLocal } from '../map/features.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { RUNWAY_LANE_OFFSET_M, runwaySlot, teamAirfield } from './spawns.ts';
import { TICK_RATE, World } from './world.ts';

const map = createLechovia();
const terrain = buildTerrain(map);

function fly(w: World, id: number, seconds: number, input: Partial<ControlInput> | ((w: World) => Partial<ControlInput>)): void {
  const inputs = new Map([[id, neutralInput(0.9)]]);
  for (let t = 0; t < seconds * TICK_RATE; t++) {
    Object.assign(inputs.get(id)!, neutralInput(0.9), typeof input === 'function' ? input(w) : input);
    w.step(inputs);
  }
}

describe('runway starts (spec §13, M4)', () => {
  it('starts a pilot who asks for it on the team runway, and others in the air', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    const b = w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'kobchik' });
    const usaField = teamAirfield(map, 'usa')!;
    const { u, v } = airfieldLocal(usaField, a.flight.pos.x, a.flight.pos.z);
    expect(Math.abs(u)).toBeLessThan(usaField.lengthM / 2);
    expect(Math.abs(v)).toBeLessThan(usaField.widthM / 2);
    expect(a.flight.onGround).toBe(true);
    expect(b.flight.onGround).toBe(false);
    expect(b.flight.pos.y).toBeGreaterThan(4000);
  });

  it('puts the first jet on the centre line and the rest behind it, two to a row (revision 26)', () => {
    // Regression: the first jet (the player's) stood in the left lane, 12 m off the centre line.
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    const field = teamAirfield(map, 'usa')!;
    expect(Math.abs(airfieldLocal(field, a.flight.pos.x, a.flight.pos.z).v)).toBeLessThan(0.01);
    expect(runwaySlot(0)).toEqual({ row: 0, lane: 0 });
    expect(runwaySlot(1)).toEqual({ row: 1, lane: -RUNWAY_LANE_OFFSET_M });
    expect(runwaySlot(2)).toEqual({ row: 1, lane: RUNWAY_LANE_OFFSET_M });
    expect(runwaySlot(10)).toEqual({ row: 5, lane: RUNWAY_LANE_OFFSET_M });
    expect(runwaySlot(11)).toEqual({ row: 0, lane: 0 });
    // Every slot of a full runway stands on the runway, none on another.
    const spots = Array.from({ length: 11 }, (_, i) => `${runwaySlot(i).row},${runwaySlot(i).lane}`);
    expect(new Set(spots).size).toBe(11);
  });

  it('takes off without crashing, and starts on the runway again after a death', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'russia', aircraftId: 'yastreb', start: 'runway' });
    fly(w, a.id, 5, { throttle: 0.9 });
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(true);
    expect(a.flight.vel.length()).toBeGreaterThan(20);
    // Pull until 300 m above the runway, then fly on level.
    const top = teamAirfield(map, 'russia')!.elevationM + 300;
    fly(w, a.id, 30, () => ({ throttle: 1, pitch: a.flight.pos.y < top ? 0.5 : 0 }));
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(false);
    expect(a.flight.gear).toBe(0);
    // Dive into the ground: the next jet starts on the runway again.
    fly(w, a.id, 60, { throttle: 1, pitch: -1 });
    expect(a.deaths).toBeGreaterThanOrEqual(1);
    fly(w, a.id, 6, { throttle: 0 });
    expect(a.alive).toBe(true);
    expect(a.flight.onGround).toBe(true);
  });

  it('takes the AI pilots off with a player who starts on the runway, then brings them back in the air (revision 26)', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 5 });
    const me = w.addAircraft({ callsign: 'Me', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    const bots = [
      w.addAircraft({ callsign: 'R1', team: 'russia', aircraftId: 'yastreb', bot: DIFFICULTIES.veteran, firstStart: 'runway' }),
      w.addAircraft({ callsign: 'R2', team: 'russia', aircraftId: 'kobchik', bot: DIFFICULTIES.veteran, firstStart: 'runway' }),
      w.addAircraft({ callsign: 'U1', team: 'usa', aircraftId: 'condor', bot: DIFFICULTIES.veteran, firstStart: 'runway' }),
    ];
    for (const b of bots) expect(b.flight.onGround).toBe(true);
    // Each on its own team's runway; the Russian lead on the centre line, the second behind it.
    const ru = teamAirfield(map, 'russia')!;
    expect(Math.abs(airfieldLocal(ru, bots[0].flight.pos.x, bots[0].flight.pos.z).v)).toBeLessThan(0.01);
    expect(Math.abs(airfieldLocal(ru, bots[1].flight.pos.x, bots[1].flight.pos.z).v)).toBeLessThan(ru.widthM / 2);
    // The player sits on the brakes; the bots roll straight down the runway and lift off...
    fly(w, me.id, 15, { throttle: 0, airbrake: true });
    for (const b of bots) {
      const field = teamAirfield(map, b.team)!;
      expect(Math.abs(airfieldLocal(field, b.flight.pos.x, b.flight.pos.z).v)).toBeLessThan(field.widthM / 2);
      expect(b.flight.vel.length()).toBeGreaterThan(60);
    }
    // ...and climb out clear of the ground.
    fly(w, me.id, 30, { throttle: 0, airbrake: true });
    for (const b of bots) {
      expect(b.alive).toBe(true);
      expect(b.deaths).toBe(0);
      expect(b.flight.onGround).toBe(false);
      expect(b.flight.pos.y - terrain.surfaceAt(b.flight.pos.x, b.flight.pos.z)).toBeGreaterThan(250);
    }
    expect(me.flight.onGround).toBe(true);
    // A bot that dies comes back in the air.
    const r1 = bots[0];
    r1.hp = 0;
    r1.alive = false;
    r1.respawnAtTick = w.tick + 1;
    fly(w, me.id, 1, { throttle: 0, airbrake: true });
    expect(r1.alive).toBe(true);
    expect(r1.flight.onGround).toBe(false);
  });

  it('crashes a jet that rolls off the airfield', () => {
    const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'condor', start: 'runway' });
    fly(w, a.id, 4, { throttle: 0.9 });
    fly(w, a.id, 30, { throttle: 0.9, roll: -1 });
    const events = w.drainEvents().filter((e) => e.type === 'destroyed');
    expect(events.map((e) => e.type === 'destroyed' && e.cause)).toContain('crash');
  });

  it('ignores runway starts in modes without them', () => {
    class AirOnly extends TeamDeathmatchMode {
      readonly runwayStarts = false;
    }
    const w = new World({ map, terrain, mode: new AirOnly(), seed: 3 });
    const a = w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', start: 'runway' });
    expect(a.flight.onGround).toBe(false);
  });
});
