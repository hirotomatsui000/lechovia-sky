import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrain } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import { getAircraft } from '../data/aircraft/registry.ts';
import { CANNONS } from '../data/weapons.ts';
import { DEG } from '../math/units.ts';
import { FreeFlightMode } from '../modes/free-flight.ts';
import type { GameMode } from '../modes/mode.ts';
import { StrikeMode } from '../modes/strike.ts';
import { TeamDeathmatchMode } from '../modes/team-deathmatch.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import type { AircraftEntity } from './entities.ts';
import type { GameEvent } from './events.ts';
import { TICK_RATE, World } from './world.ts';

const map = createTestRange(1);
const terrain = buildTerrain(map);

function duel(mode: GameMode = new TeamDeathmatchMode(), seed = 3) {
  const world = new World({ map, terrain, mode, seed });
  const shooter = world.addAircraft({ callsign: 'Shooter', team: 'usa', aircraftId: 'kestrel' });
  const target = world.addAircraft({ callsign: 'Target', team: 'russia', aircraftId: 'kobchik' });
  world.drainEvents();
  return { world, shooter, target };
}

/** Straight flight with the nose on the flight path (no angle of attack), so guns point where the jet goes. */
function place(a: AircraftEntity, x: number, y: number, z: number, headingDeg = 0, speed = 250): void {
  a.flight = createFlightState({ position: new Vector3(x, y, z), headingRad: headingDeg * DEG, speed, throttle: 0.8 });
  a.prevPos.copy(a.flight.pos);
}

function run(world: World, ticks: number, inputs: (tick: number) => ReadonlyMap<number, ControlInput> = () => new Map()): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    world.step(inputs(i));
    events.push(...world.drainEvents());
  }
  return events;
}

const hold = (id: number, over: Partial<ControlInput>) => new Map([[id, { ...neutralInput(0.8), ...over }]]);

describe('World combat', () => {
  it('hits an enemy ahead with the cannon and spends rounds', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 300);
    place(target, 0, 3000, 0);
    const events = run(world, 20, () => hold(shooter.id, { fireCannon: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', aircraftId: target.id, attackerId: shooter.id, weapon: 'cannon' }));
    expect(target.hp).toBeLessThan(target.config.damage.hitPoints);
    const rc20 = CANNONS['RC-20'];
    expect(shooter.stores.cannonRounds).toBeLessThanOrEqual(shooter.config.stores.cannonRounds - 5 * rc20.roundsPerProjectile);
    expect(shooter.firingCannon).toBe(true);
  });

  it("hits with the player's rounds within three times the target's hit radius, and no further", () => {
    const radius = getAircraft('kobchik').damage.hitRadiusM;
    for (const [offset, hits] of [
      [2.5 * radius, true],
      [3.5 * radius, false],
    ] as const) {
      // 50 m ahead the target is more than 15° off the nose, beyond the aim assist.
      const { world, shooter, target } = duel();
      place(shooter, 0, 3000, 50);
      place(target, offset, 3000, 0);
      const events = run(world, 20, () => hold(shooter.id, { fireCannon: true }));
      expect(events.some((e) => e.type === 'hit' && e.weapon === 'cannon')).toBe(hits);
    }
  });

  it("bends the player's rounds onto an enemy a few degrees off the nose (aim assist)", () => {
    const radius = getAircraft('kobchik').damage.hitRadiusM;
    const { world, shooter, target } = duel();
    // 100 m off at 700 m: about 8° off the nose and far beyond the rounds' reach without the assist.
    place(shooter, 0, 3000, 700);
    place(target, 100, 3000, 0);
    expect(100).toBeGreaterThan(3 * radius);
    // The rounds take about 0.75 s to get there.
    const events = run(world, 80, () => hold(shooter.id, { fireCannon: true }));
    expect(events.some((e) => e.type === 'hit' && e.weapon === 'cannon' && e.aircraftId === target.id)).toBe(true);
  });

  it('designates the enemy ahead automatically, locks the seeker and kills it with a missile', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 2500);
    place(target, 0, 3000, 0);
    run(world, 55);
    expect(shooter.targetId).toBe(target.id);
    expect(shooter.seeker.mode).toBe('locked');
    const events = run(world, 12 * TICK_RATE, (t) => hold(shooter.id, { fireMissile: t === 0 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'missileLaunched', shooterId: shooter.id, targetId: target.id }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'missileDetonated', nearAircraft: true }));
    expect(events).toContainEqual({ type: 'destroyed', aircraftId: target.id, cause: 'missile', killerId: shooter.id });
    expect(shooter.kills).toBe(1);
    expect(shooter.stores.srm).toBe(shooter.config.stores.srm - 1);
  });

  it('does not launch without a lock', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 2500);
    place(target, 3000, 3000, 0);
    const events = run(world, 5, () => hold(shooter.id, { fireMissile: true }));
    expect(events.some((e) => e.type === 'missileLaunched')).toBe(false);
    expect(shooter.stores.srm).toBe(shooter.config.stores.srm);
  });

  it("lets flares decoy the player's missiles now and then", () => {
    let decoyed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { world, shooter, target } = duel(new TeamDeathmatchMode(), seed);
      place(shooter, 0, 3000, 2500);
      place(target, 0, 3000, 0);
      run(world, 55);
      const events = run(world, 8 * TICK_RATE, (t) =>
        new Map([
          [shooter.id, { ...neutralInput(0.8), fireMissile: t === 0 }],
          [target.id, { ...neutralInput(0.8), countermeasures: t === 60 }],
        ]),
      );
      expect(events.filter((e) => e.type === 'countermeasures')).toHaveLength(1);
      if (events.some((e) => e.type === 'missileDecoyed')) decoyed++;
    }
    expect(decoyed).toBeGreaterThan(0);
    expect(decoyed).toBeLessThan(10);
  });

  it('locks on radar with the Lance selected, warns the target, and kills it from 15 km', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 15000);
    place(target, 0, 3000, 0, 180);
    const mrm = (over: Partial<ControlInput> = {}) => hold(shooter.id, { weapon: 'mrm', ...over });
    run(world, 30, () => mrm());
    expect(shooter.targetId).toBe(target.id);
    expect(shooter.radarLock.mode).toBe('tracking');
    expect(target.lockedByRadar).toBe(false);
    expect(shooter.seeker.mode).toBe('off');
    run(world, 75, () => mrm());
    expect(shooter.radarLock).toMatchObject({ mode: 'locked', targetId: target.id });
    expect(target.lockedByRadar).toBe(true);

    const events = run(world, 1, () => mrm({ fireMissile: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'missileLaunched', shooterId: shooter.id, targetId: target.id, kind: 'lance' }));
    expect(shooter.stores.mrm).toBe(shooter.config.stores.mrm - 1);
    const lance = world.missileList()[0];
    expect(lance.active).toBe(false);
    // Back on the Dart: the radar lock drops, but the launcher still guides its Lance, so the RWR stays on.
    run(world, 30, () => hold(shooter.id, { weapon: 'srm' }));
    expect(shooter.radarLock.mode).toBe('off');
    expect(target.lockedByRadar).toBe(true);

    let wentActiveAtM = 0;
    const later: GameEvent[] = [];
    for (let i = 0; i < 20 * TICK_RATE && target.alive; i++) {
      world.step(new Map());
      later.push(...world.drainEvents());
      if (lance.active && wentActiveAtM === 0) wentActiveAtM = lance.pos.distanceTo(target.flight.pos);
    }
    const activeRange = 10000 * (1 - 0.5 * target.config.sensors.stealth);
    expect(wentActiveAtM).toBeGreaterThan(activeRange - 1000);
    expect(wentActiveAtM).toBeLessThanOrEqual(activeRange);
    expect(later).toContainEqual({ type: 'destroyed', aircraftId: target.id, cause: 'missile', killerId: shooter.id });
  });

  it('loses a Lance whose launcher turns the target out of its radar cone before it goes active', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 25000);
    place(target, 0, 3000, 0, 180);
    run(world, 120, () => hold(shooter.id, { weapon: 'mrm' }));
    expect(shooter.radarLock.mode).toBe('locked');
    run(world, 1, () => hold(shooter.id, { weapon: 'mrm', fireMissile: true }));
    const lance = world.missileList()[0];
    expect(lance.targetId).toBe(target.id);
    place(shooter, 0, 3000, 25000, 180);
    run(world, 30);
    expect(lance.active).toBe(false);
    expect(lance.targetId).toBeNull();
    expect(target.lockedByRadar).toBe(false);
  });

  it('needs a radar lock for a Lance, and keeps 2 s between launches', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 15000);
    place(target, 0, 3000, 0, 180);
    let events = run(world, 30, () => hold(shooter.id, { weapon: 'mrm', fireMissile: true }));
    expect(events.some((e) => e.type === 'missileLaunched')).toBe(false);
    events = run(world, 3 * TICK_RATE, () => hold(shooter.id, { weapon: 'mrm', fireMissile: true }));
    const launches = events.filter((e) => e.type === 'missileLaunched');
    expect(launches).toHaveLength(2);
  });

  it("lets chaff break the player's Lances now and then", () => {
    let decoyed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { world, shooter, target } = duel(new TeamDeathmatchMode(), seed);
      place(shooter, 0, 3000, 15000);
      place(target, 0, 3000, 0, 180);
      run(world, 120, () => hold(shooter.id, { weapon: 'mrm' }));
      const events = run(world, 4 * TICK_RATE, (t) =>
        new Map([
          [shooter.id, { ...neutralInput(0.8), weapon: 'mrm' as const, fireMissile: t === 0 }],
          [target.id, { ...neutralInput(0.8), countermeasures: t === 60 }],
        ]),
      );
      expect(events.filter((e) => e.type === 'countermeasures')).toHaveLength(1);
      if (events.some((e) => e.type === 'missileDecoyed')) decoyed++;
    }
    expect(decoyed).toBeGreaterThan(0);
    expect(decoyed).toBeLessThan(10);
  });

  it('acts on a button press once, even when no new input follows', () => {
    const { world, target } = duel();
    run(world, 60, (t) => (t === 0 ? hold(target.id, { countermeasures: true }) : new Map()));
    expect(target.stores.countermeasures).toBe(target.config.stores.countermeasures - 1);
  });

  it('destroys both aircraft in a mid-air collision', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 400, 0);
    place(target, 0, 3000, -400, 180);
    const events = run(world, 120);
    expect(events).toContainEqual({ type: 'destroyed', aircraftId: shooter.id, cause: 'collision', killerId: null });
    expect(events).toContainEqual({ type: 'destroyed', aircraftId: target.id, cause: 'collision', killerId: null });
  });

  it('credits a crash after enemy damage to that enemy', () => {
    const { world, shooter, target } = duel();
    world.applyDamage(target, 10, shooter, 'cannon');
    target.flight.pos.y = terrain.heightAt(target.flight.pos.x, target.flight.pos.z) - 5;
    const events = run(world, 1);
    expect(events).toContainEqual({ type: 'destroyed', aircraftId: target.id, cause: 'crash', killerId: shooter.id });
    expect(shooter.kills).toBe(1);
  });

  it('respawns with full hit points and stores', () => {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 300);
    place(target, 0, 3000, 0);
    run(world, 30, () => hold(shooter.id, { fireCannon: true }));
    world.applyDamage(shooter, 30, target, 'cannon');
    shooter.flight.pos.y = -10;
    run(world, 1 + 5 * TICK_RATE);
    expect(shooter.alive).toBe(true);
    expect(shooter.hp).toBe(shooter.config.damage.hitPoints);
    const full = shooter.config.stores;
    expect(shooter.stores).toEqual({ cannonRounds: full.cannonRounds, srm: full.srm, mrm: full.mrm, countermeasures: full.countermeasures, bombs: 0, fuelKg: shooter.config.physics.fuelKg });
    expect(shooter.targetId).toBeNull();
  });

  it('reports the hit points a hit actually took, not more than were left', () => {
    const { world, shooter, target } = duel();
    world.applyDamage(target, 30, shooter, 'cannon');
    world.applyDamage(target, 999, shooter, 'missile');
    const hits = world.drainEvents().filter((e) => e.type === 'hit');
    expect(hits.map((e) => (e.type === 'hit' ? e.damage : 0))).toEqual([30, target.config.damage.hitPoints - 30]);
    expect(target.alive).toBe(false);
  });

  it('counts the match seconds to a respawn, and has none for a side with no jets left (Strike)', () => {
    const { world, shooter, target } = duel();
    expect(world.respawnInS(shooter)).toBeNull();
    world.applyDamage(shooter, 999, target, 'cannon');
    expect(world.respawnInS(shooter)).toBeCloseTo(5);
    run(world, 2 * TICK_RATE);
    expect(world.respawnInS(shooter)).toBeCloseTo(3);
    run(world, 3 * TICK_RATE + 1);
    expect(shooter.alive).toBe(true);
    expect(world.respawnInS(shooter)).toBeNull();

    const strike = duel(new StrikeMode({ timeLimitS: 540, aircraftPerTeam: 1, targetsToWin: 2 }));
    strike.world.applyDamage(strike.shooter, 999, strike.target, 'cannon');
    expect(strike.world.respawnInS(strike.shooter)).toBeNull();
  });

  it('scores Team Deathmatch through the mode', () => {
    const mode = new TeamDeathmatchMode();
    const { world, shooter, target } = duel(mode);
    world.applyDamage(target, 500, shooter, 'missile');
    run(world, 1);
    expect(mode.status(world).scores).toEqual({ usa: 1, russia: 0 });
  });

  it('has no weapons in Free Flight', () => {
    const { world, shooter, target } = duel(new FreeFlightMode());
    place(shooter, 0, 3000, 300);
    place(target, 0, 3000, 0);
    run(world, 30, () => hold(shooter.id, { fireCannon: true }));
    expect(world.projectileList()).toHaveLength(0);
    expect(target.hp).toBe(target.config.damage.hitPoints);
  });

  it('flies damaged aircraft with less thrust', () => {
    const healthy = duel();
    const damaged = duel();
    for (const d of [healthy, damaged]) place(d.target, 0, 3000, 0);
    damaged.world.applyDamage(damaged.target, 70, damaged.shooter, 'cannon');
    const full = hold(healthy.target.id, { throttle: 1 });
    run(healthy.world, 120, () => full);
    run(damaged.world, 120, () => hold(damaged.target.id, { throttle: 1 }));
    expect(damaged.target.flight.vel.length()).toBeLessThan(healthy.target.flight.vel.length() - 1);
  });
});

describe('lag compensation online (revision 28)', () => {
  /** A fast crossing target that passes the shooter's line of fire before the burst arrives. */
  function crossing(viewDelayTicks: number) {
    const { world, shooter, target } = duel();
    place(shooter, 0, 3000, 100, 0, 250);
    place(target, -25, 3000, 0, 90, 300);
    shooter.viewDelayTicks = viewDelayTicks;
    return run(world, 30, (t) => hold(shooter.id, { fireCannon: t >= 6 && t <= 16 })).filter((e) => e.type === 'hit' && e.aircraftId === target.id);
  }

  it('misses a target that has already crossed when the shooter sees the world as it is', () => {
    expect(crossing(0)).toHaveLength(0);
  });

  it('hits where the shooter saw the target, rewound by the view delay', () => {
    expect(crossing(10).length).toBeGreaterThan(0);
  });

  it('caps the rewind at 15 ticks (250 ms)', () => {
    const { world, shooter } = duel();
    shooter.viewDelayTicks = 600;
    run(world, 1, () => hold(shooter.id, { fireCannon: true }));
    expect(world.projectileList()[0].rewindTicks).toBe(15);
  });
});
