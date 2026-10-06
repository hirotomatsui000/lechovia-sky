import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../ai/difficulty.ts';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { DEG } from '../math/units.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { trimAlpha } from '../physics/aero.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { SLUMP_PULL, VISION_LOSS_STRAIN } from '../physics/g-tolerance.ts';
import type { AircraftEntity } from './entities.ts';
import type { GameEvent } from './events.ts';
import { TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);
const right = new Vector3();

/** A jet at 3 km and 300 m/s in full afterburner, over the middle of the range. */
function fastJet(w: World): AircraftEntity {
  const a = w.addAircraft({ callsign: 'P', team: 'usa', aircraftId: 'kestrel' });
  const p = a.config.physics;
  a.flight = createFlightState({ position: new Vector3(map.combatArea.x, 3000, map.combatArea.z), headingRad: 0, speed: 300, throttle: 1, alphaRad: trimAlpha(p, 300, atmosphere(3000).density) });
  a.prevPos.copy(a.flight.pos);
  return a;
}

/** Full stick in a turn banked about 80°. */
function hardTurn(a: AircraftEntity, input: ControlInput): void {
  right.set(1, 0, 0).applyQuaternion(a.flight.quat);
  const bank = Math.asin(Math.max(-1, Math.min(1, -right.y)));
  input.roll = Math.max(-1, Math.min(1, 3 * (80 * DEG - bank)));
  input.pitch = 1;
}

describe('G-LOC (revision 21)', () => {
  it('blacks out a pilot who holds a hard turn: the view goes first, then the stick stops answering and the jet goes down', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 3 });
    const a = fastJet(w);
    const input = neutralInput(1);
    const inputs = new Map([[a.id, input]]);
    const events: GameEvent[] = [];
    let visionGoneAt = -1;
    let tick = 0;
    for (; tick < 30 * TICK_RATE && a.blackoutTick < 0; tick++) {
      hardTurn(a, input);
      w.step(inputs);
      events.push(...w.drainEvents());
      if (visionGoneAt < 0 && a.gStrain > VISION_LOSS_STRAIN) visionGoneAt = tick / TICK_RATE;
      if (a.blackoutTick < 0) expect(w.blackedOutS(a)).toBeNull();
    }
    const blackoutS = tick / TICK_RATE;
    expect(visionGoneAt).toBeGreaterThan(2);
    expect(visionGoneAt).toBeLessThan(7);
    expect(blackoutS).toBeGreaterThan(8);
    expect(blackoutS).toBeLessThan(16);
    expect(events).toContainEqual({ type: 'blackout', aircraftId: a.id });

    // Whatever the pilot's hands did, the slumped stick flies the jet, and it does not fire.
    Object.assign(input, { pitch: -1, roll: 1, fireCannon: true, fireMissile: true, countermeasures: true });
    w.step(inputs);
    expect(a.input.pitch).toBe(SLUMP_PULL);
    expect(a.input.fireCannon).toBe(false);
    expect(a.input.fireMissile).toBe(false);
    expect(a.input.throttle).toBe(1);
    // Two ticks: the one the pilot blacked out in, and this one.
    expect(w.blackedOutS(a)).toBeCloseTo(2 / TICK_RATE, 6);

    let destroyed: GameEvent | undefined;
    for (let t = 0; t < 30 * TICK_RATE && !destroyed; t++) {
      w.step(inputs);
      destroyed = w.drainEvents().find((e) => e.type === 'destroyed');
    }
    expect(destroyed).toMatchObject({ type: 'destroyed', aircraftId: a.id, cause: 'blackout' });
    expect(w.blackedOutS(a)).toBeNull();

    // The next jet comes with a clear-headed pilot.
    for (let t = 0; t < 5 * TICK_RATE && !a.alive; t++) w.step(inputs);
    expect(a.alive).toBe(true);
    expect(a.gStrain).toBe(0);
    expect(a.blackoutTick).toBe(-1);
  });

  it('lets the strain drain when the pilot eases off in time', () => {
    const w = new World({ map, terrain, mode: new FreeFlightMode(), seed: 3 });
    const a = fastJet(w);
    const input = neutralInput(1);
    const inputs = new Map([[a.id, input]]);
    for (let t = 0; t < 8 * TICK_RATE; t++) {
      hardTurn(a, input);
      w.step(inputs);
    }
    const strained = a.gStrain;
    expect(strained).toBeGreaterThan(VISION_LOSS_STRAIN);
    input.pitch = 0;
    input.roll = 0;
    for (let t = 0; t < 4 * TICK_RATE; t++) w.step(inputs);
    expect(a.gStrain).toBeLessThan(strained / 2);
    expect(a.blackoutTick).toBe(-1);
  });

  it('keeps AI pilots from blacking out: they ease the pull as the strain builds', () => {
    let blackouts = 0;
    let strainedTicks = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const w = new World({ map, terrain, mode: new TeamDeathmatchMode(), seed });
      const bots = [
        w.addAircraft({ callsign: 'A', team: 'usa', aircraftId: 'kestrel', bot: DIFFICULTIES.ace }),
        w.addAircraft({ callsign: 'B', team: 'russia', aircraftId: 'yastreb', bot: DIFFICULTIES.ace }),
      ];
      for (let t = 0; t < 120 * TICK_RATE; t++) {
        w.step(new Map());
        blackouts += w.drainEvents().filter((e) => e.type === 'blackout').length;
        for (const b of bots) if (b.alive && b.gStrain > VISION_LOSS_STRAIN) strainedTicks++;
      }
    }
    // Aces fly hard enough to feel the G, and still never black out.
    expect(strainedTicks).toBeGreaterThan(0);
    expect(blackouts).toBe(0);
  });
});
