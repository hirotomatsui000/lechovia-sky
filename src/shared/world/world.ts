import { Vector3 } from 'three';
import { BotPilot, type BotWorld, botSeed } from '../ai/bot-pilot.ts';
import { DronePilot } from '../ai/drone-pilot.ts';
import { SentinelPilot } from '../ai/sentinel-pilot.ts';
import type { DifficultyProfile } from '../ai/difficulty.ts';
import { damageFlightEnv, damageState, maneuverKillCredit } from '../damage/damage.ts';
import { getAircraft } from '../data/aircraft/registry.ts';
import type { AircraftPhysics, TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import { airfieldGroundAt, airfieldGroundHeight } from '../map/features.ts';
import type { Terrain } from '../map/terrain.ts';
import { type Approach, closestApproach } from '../math/closest-approach.ts';
import { Rng } from '../math/rng.ts';
import type { BotGoal, DroneSpec, GameMode, ModeDirector, SupportSpec } from '../modes/mode.ts';
import { trimAlpha } from '../physics/aero.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { type ControlInput, neutralInput, sanitizeInput } from '../physics/controls.ts';
import { createFlightState, type FlightEnv, type FlightState, stepFlight } from '../physics/flight-model.ts';
import { slumpedInput, updateStrain } from '../physics/g-tolerance.ts';
import { WindField } from '../physics/wind.ts';
import type { Projectile } from '../weapons/cannon.ts';
import type { Bomb } from '../weapons/bomb.ts';
import type { Missile } from '../weapons/missile.ts';
import { Combat, type CombatHost } from './combat.ts';
import { type AircraftEntity, createAircraftEntity, resetForSpawn } from './entities.ts';
import type { DeathCause, GameEvent, WeaponKind } from './events.ts';
import { createGroundTarget, damageGroundTarget, type GroundTarget } from './ground-targets.ts';
import { runwayFlightState, type SpawnStart, spawnFlightState, teamAirfield } from './spawns.ts';
import { needsSupply, onApproach, resupply, SUPPLY_LANDED_S, SUPPLY_PASS_S, supplyAt, type SupplyKind } from './supply.ts';
import { CALM_NOON, type EnvironmentSettings, hourAt } from './time-of-day.ts';
import { CloudField, WEATHER } from './weather.ts';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const BOUNDARY_GRACE_S = 15;
export const CEILING_M = 18000;
export const GROUND_CLEARANCE_M = 2;
/** AI pilots stay off the afterburner below this share of fuel (revision 16). */
export const AI_FUEL_SAVING_SHARE = 0.25;
/** Free Flight's "fly from here" (M5): at least this high, and this far above the ground, this far inside the map's edge. */
const FLY_FROM_MIN_ALTITUDE_M = 2000;
const FLY_FROM_CLEARANCE_M = 1500;
const FLY_FROM_EDGE_M = 2000;

export interface WorldOptions {
  map: MapDefinition;
  terrain: Terrain;
  mode: GameMode;
  seed: number;
  /** weather and clock (M4); a clear noon without clouds by default */
  environment?: EnvironmentSettings;
}

export interface AddAircraftOptions {
  callsign: string;
  team: TeamId;
  aircraftId: string;
  /** makes the aircraft an AI bot with this skill */
  bot?: DifficultyProfile;
  /** where the aircraft starts (and restarts): in the air, or on its team's runway where the mode allows it */
  start?: SpawnStart;
}

/**
 * A support aircraft starts on the point of its orbit farthest from `centre` (the middle of the combat area), heading
 * along its right-hand orbit, so both teams' Sentinels start alike (revision 19; they used to start west of the orbit
 * centre, which put one team's 16 km nearer the front).
 */
function supportFlightState(spec: SupportSpec, physics: AircraftPhysics, centre: { x: number; z: number }): FlightState {
  const o = spec.orbit;
  const away = Math.hypot(o.x - centre.x, o.z - centre.z);
  const rx = away > 1 ? (o.x - centre.x) / away : -1;
  const rz = away > 1 ? (o.z - centre.z) / away : 0;
  // A right-hand orbit keeps its centre on the right: the path runs along (-rz, rx).
  return createFlightState({
    position: new Vector3(o.x + rx * o.radiusM, o.altitudeM, o.z + rz * o.radiusM),
    headingRad: Math.atan2(-rz, -rx),
    speed: o.speedMs,
    throttle: 0.6,
    alphaRad: trimAlpha(physics, o.speedMs, atmosphere(o.altitudeM).density),
  });
}

/** Anything that flies an aircraft from the World's state: bots, training drones and Sentinels. */
interface Pilot {
  think(world: BotWorld, self: AircraftEntity, out: ControlInput): ControlInput;
}

/** Authoritative simulation. Pure: no I/O, no clocks, randomness only from `rng`. */
export class World implements ModeDirector, CombatHost, BotWorld {
  readonly tickRate = TICK_RATE;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly mode: GameMode;
  readonly rng: Rng;
  readonly combat: Combat;
  /** weather and clock; Free Flight can change them during a match (M5) */
  environment: EnvironmentSettings;
  clouds: CloudField;
  /** the match's wind, from the weather and the seed (revision 16) */
  wind: WindField;
  tick = 0;
  private readonly seed: number;
  private readonly aircraft = new Map<number, AircraftEntity>();
  private readonly groundTargets: GroundTarget[];
  private readonly bots = new Map<number, { pilot: Pilot; input: ControlInput }>();
  private events: GameEvent[] = [];
  private nextId = 1;
  private readonly env: FlightEnv = { thrustScale: 1, rollScale: 1, groundM: NaN, wind: new Vector3(), fuelUsedKg: 0, gearWanted: false };
  private readonly approach: Approach = { distance: 0, fraction: 0 };
  private readonly living: AircraftEntity[] = [];

  constructor(opts: WorldOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain;
    this.mode = opts.mode;
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
    this.environment = { ...(opts.environment ?? CALM_NOON) };
    // The clouds belong to the map and the weather, so every client draws the same ones.
    this.clouds = new CloudField(WEATHER[this.environment.weather], opts.map.seed);
    this.wind = windFor(this.environment, opts.seed);
    opts.mode.prepare?.(opts.map);
    this.groundTargets = opts.mode.groundTargets(opts.map).map((spec) => createGroundTarget(spec, opts.terrain));
    this.combat = new Combat(this);
    for (const spec of opts.mode.supportAircraft?.(opts.map) ?? []) this.addSupport(spec);
  }

  /** New weather and clock for the rest of the match (Free Flight, M5); the clouds and wind follow the new weather. */
  setEnvironment(env: EnvironmentSettings): void {
    const weatherChanged = env.weather !== this.environment.weather;
    const windChanged = weatherChanged || env.calm !== this.environment.calm;
    this.environment = { ...env };
    if (weatherChanged) this.clouds = new CloudField(WEATHER[env.weather], this.map.seed);
    if (windChanged) this.wind = windFor(env, this.seed);
  }

  /**
   * Free Flight (M5): puts a pilot's jet in the air over (x, z), or on the runway when the point is on an airfield,
   * at once and fully repaired. The point is kept just inside the map's edge (revision 22: it used to be pulled into the
   * combat area, so a click near the edge of the map screen flew you from somewhere else). False in other modes.
   */
  flyFrom(id: number, x: number, z: number): boolean {
    const a = this.aircraft.get(id);
    if (!a || a.support || this.mode.id !== 'free-flight') return false;
    const half = this.map.sizeM / 2 - FLY_FROM_EDGE_M;
    x = Math.min(half, Math.max(-half, x));
    z = Math.min(half, Math.max(-half, z));
    const c = this.map.combatArea;
    const field = this.map.features ? airfieldGroundAt(this.map.features.airfields, x, z) : null;
    let flight: FlightState;
    if (field) {
      flight = runwayFlightState(field, a.id % 12);
    } else {
      // Toward the middle of the area, high enough above the ground below.
      const heading = Math.atan2(c.x - x, -(c.z - z));
      const altitude = Math.max(FLY_FROM_MIN_ALTITUDE_M, this.terrain.surfaceAt(x, z) + FLY_FROM_CLEARANCE_M);
      flight = spawnFlightState({ x, z, headingRad: Number.isFinite(heading) ? heading : 0, altitudeM: altitude }, this.terrain, 0, a.config.physics);
    }
    a.flight = flight;
    a.alive = true;
    a.spawnGen++;
    a.respawnAtTick = -1;
    a.outOfBoundsTicks = 0;
    resetForSpawn(a);
    this.emit({ type: 'spawned', aircraftId: a.id, spawnGen: a.spawnGen });
    return true;
  }

  /** Where the mode wants a bot when it has nothing near to fight (M5). */
  botGoal(bot: AircraftEntity): BotGoal | null {
    return this.mode.botGoal?.(this, bot) ?? null;
  }

  /** False while the mode has cut a team's datalink (Team Objective, M5). */
  datalinkUp(team: TeamId): boolean {
    return this.mode.datalinkUp?.(team) ?? true;
  }

  /** The local hour now (spec §12.3). */
  hour(): number {
    return hourAt(this.environment.startHour, this.environment.clockRunning, this.tick / TICK_RATE);
  }

  get combatArea(): MapDefinition['combatArea'] {
    return this.map.combatArea;
  }

  aircraftList(): IterableIterator<AircraftEntity> {
    return this.aircraft.values();
  }

  getAircraft(id: number): AircraftEntity | undefined {
    return this.aircraft.get(id);
  }

  missileList(): readonly Missile[] {
    return this.combat.missiles;
  }

  projectileList(): readonly Projectile[] {
    return this.combat.projectiles;
  }

  bombList(): readonly Bomb[] {
    return this.combat.bombs;
  }

  groundTargetList(): readonly GroundTarget[] {
    return this.groundTargets;
  }

  /** Bomb damage to a ground target; emits targetHit and, at 0 hit points, targetDestroyed. */
  applyTargetDamage(target: GroundTarget, amount: number, attacker: AircraftEntity | null): void {
    const before = target.hp;
    const result = damageGroundTarget(target, amount);
    if (result === null) return;
    const attackerId = attacker ? attacker.id : null;
    this.emit({ type: 'targetHit', targetId: target.id, attackerId, damage: before - target.hp });
    if (result === 'destroyed') this.emit({ type: 'targetDestroyed', targetId: target.id, attackerId });
  }

  matchOver(): boolean {
    return this.mode.status(this).winner !== null;
  }

  addAircraft(opts: AddAircraftOptions): AircraftEntity {
    const config = getAircraft(opts.aircraftId);
    if (config.team !== opts.team) {
      throw new Error(`${config.name} does not fly for team ${opts.team}`);
    }
    let slot = 0;
    for (const other of this.aircraft.values()) if (other.team === opts.team) slot++;
    const entity = createAircraftEntity({
      id: this.nextId++,
      callsign: opts.callsign,
      team: opts.team,
      config,
      isBot: opts.bot !== undefined,
      flight: this.spawnState(opts.team, slot, config.physics, opts.start ?? 'air'),
      spawnSlot: slot,
      bombLoad: this.mode.bombLoad(opts.team),
      lanceLoad: this.mode.lanceLoad?.() ?? null,
      start: opts.start ?? 'air',
    });
    this.aircraft.set(entity.id, entity);
    if (opts.bot) this.bots.set(entity.id, { pilot: new BotPilot(opts.bot, botSeed(this.seed, entity.id)), input: neutralInput(0.8) });
    this.emit({ type: 'spawned', aircraftId: entity.id, spawnGen: entity.spawnGen });
    return entity;
  }

  /** A target drone on a level orbit (training): it never fires and does not count as a team's spawn slot. */
  addDrone(spec: DroneSpec): AircraftEntity {
    const config = getAircraft(spec.aircraftId);
    if (config.team !== spec.team) throw new Error(`${config.name} does not fly for team ${spec.team}`);
    const speed = spec.orbit.speedMs;
    const flight = createFlightState({
      position: new Vector3(spec.x, spec.altitudeM, spec.z),
      headingRad: spec.headingRad,
      speed,
      throttle: 0.6,
      alphaRad: trimAlpha(config.physics, speed, atmosphere(spec.altitudeM).density),
    });
    const entity = createAircraftEntity({
      id: this.nextId++,
      callsign: spec.callsign,
      team: spec.team,
      config,
      isBot: true,
      flight,
      spawnSlot: -1,
      bombLoad: 0,
    });
    this.aircraft.set(entity.id, entity);
    // The orbit center lies one radius to the right of the start: (cos h, sin h) in x/z.
    const r = spec.orbit.radiusM;
    const orbit = { x: spec.x + Math.cos(spec.headingRad) * r, z: spec.z + Math.sin(spec.headingRad) * r, radiusM: r, altitudeM: spec.altitudeM, speedMs: speed };
    this.bots.set(entity.id, { pilot: new DronePilot(orbit), input: neutralInput(0.6) });
    this.emit({ type: 'spawned', aircraftId: entity.id, spawnGen: entity.spawnGen });
    return entity;
  }

  /** A mode-flown support aircraft (a Sentinel): it orbits, runs from fighters and returns after its own delay. */
  addSupport(spec: SupportSpec): AircraftEntity {
    const base = getAircraft(spec.aircraftId);
    const config = spec.hitPoints === undefined ? base : { ...base, damage: { ...base.damage, hitPoints: spec.hitPoints } };
    if (config.team !== spec.team) throw new Error(`${config.name} does not fly for team ${spec.team}`);
    const entity = createAircraftEntity({
      id: this.nextId++,
      callsign: spec.callsign,
      team: spec.team,
      config,
      isBot: true,
      flight: supportFlightState(spec, config.physics, this.map.combatArea),
      spawnSlot: -1,
      bombLoad: 0,
      support: spec,
    });
    this.aircraft.set(entity.id, entity);
    this.bots.set(entity.id, { pilot: new SentinelPilot(spec.orbit), input: neutralInput(0.6) });
    this.emit({ type: 'spawned', aircraftId: entity.id, spawnGen: entity.spawnGen });
    return entity;
  }

  /**
   * The jet a pilot flies from the next respawn on (M5): one of the fighters of their team. Returns false for an
   * unknown jet, another team's or a support aircraft.
   */
  setNextAircraft(id: number, aircraftId: string): boolean {
    const a = this.aircraft.get(id);
    if (!a || a.support) return false;
    let config;
    try {
      config = getAircraft(aircraftId);
    } catch {
      return false;
    }
    if (config.team !== a.team || config.support) return false;
    a.nextAircraftId = config.id === a.config.id ? null : config.id;
    return true;
  }

  launchMissileAt(shooterId: number, targetId: number): number | null {
    const shooter = this.aircraft.get(shooterId);
    const target = this.aircraft.get(targetId);
    if (!shooter || !shooter.alive || !target || !target.alive) return null;
    return this.combat.launchAt(shooter, targetId).id;
  }

  restock(id: number): void {
    const a = this.aircraft.get(id);
    if (a && a.alive) resetForSpawn(a);
  }

  removeAircraft(id: number): boolean {
    if (!this.aircraft.delete(id)) return false;
    this.bots.delete(id);
    this.combat.forget(id);
    return true;
  }

  step(inputs: ReadonlyMap<number, ControlInput>): void {
    // Pilots decide on the state at the start of the tick.
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const bot = this.bots.get(a.id);
      const raw = bot ? bot.pilot.think(this, a, bot.input) : inputs.get(a.id);
      if (raw) sanitizeInput(raw, a.input);
      if (bot) airmanship(a);
      // A blacked-out pilot's hands are slumped on the stick, whatever they or their AI would do (revision 21).
      if (a.blackoutTick >= 0) slumpedInput(a.input, a.flight.quat);
    }
    const timeS = this.tick * DT;
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      a.prevPos.copy(a.flight.pos);
      const env = this.env;
      damageFlightEnv(damageState(a.hp, a.config.damage.hitPoints), env);
      // An empty tank flames the engines out (revision 16).
      if (a.stores.fuelKg <= 0) env.thrustScale = 0;
      env.groundM = airfieldGroundHeight(this.map.features, a.flight.pos.x, a.flight.pos.z);
      this.wind.at(a.flight.pos, timeS, env.wind);
      env.fuelUsedKg = a.config.physics.fuelKg - a.stores.fuelKg;
      env.gearWanted = onApproach(this.map.features, a.team, a.flight);
      stepFlight(a.flight, a.input, a.config.physics, DT, env);
      a.stores.fuelKg = Math.max(0, a.stores.fuelKg - a.flight.fuelFlow * DT);
      a.history.record(a.flight.pos, a.flight.vel);
      if (a.blackoutTick < 0) {
        a.gStrain = updateStrain(a.gStrain, a.flight.gLoad, DT);
        if (a.gStrain >= 1) {
          a.blackoutTick = this.tick;
          this.emit({ type: 'blackout', aircraftId: a.id });
        }
      }
    }
    if (this.mode.combatEnabled) this.combat.step(DT);
    this.checkCollisions();
    for (const a of this.aircraft.values()) {
      if (!a.alive) continue;
      const p = a.flight.pos;
      // On the wheels the gear carries the jet, but only on an airfield: rolling off it is a crash.
      const crashed = a.flight.onGround ? Number.isNaN(airfieldGroundHeight(this.map.features, p.x, p.z)) : p.y < this.terrain.surfaceAt(p.x, p.z) + GROUND_CLEARANCE_M;
      if (crashed) {
        const credited = maneuverKillCredit(a, this.tick, TICK_RATE);
        this.destroy(a, a.blackoutTick >= 0 ? 'blackout' : 'crash', credited === null ? null : (this.aircraft.get(credited) ?? null));
        continue;
      }
      if (this.isOutOfBounds(a)) {
        a.outOfBoundsTicks++;
        if (a.outOfBoundsTicks >= BOUNDARY_GRACE_S * TICK_RATE) this.destroy(a, 'boundary', null);
      } else {
        a.outOfBoundsTicks = 0;
      }
      if (a.alive) this.updateSupply(a);
    }
    for (const a of this.aircraft.values()) {
      // Button presses act once, even if no new input arrives next tick.
      a.input.cycleTarget = false;
      a.input.countermeasures = false;
      a.input.fireMissile = false;
      a.input.dropBomb = false;
      if (!a.alive && a.respawnAtTick >= 0 && this.tick >= a.respawnAtTick && (a.support !== null || this.mode.canRespawn(a.team))) this.respawn(a);
    }
    this.mode.update(this);
    this.mode.direct?.(this);
    this.tick++;
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  /**
   * Weapon damage. Records the attacker for kill credit and destroys the victim at 0 hit points. The hit event reports
   * the hit points actually taken, so a blast bigger than what is left does not swell the damage dealt.
   */
  applyDamage(victim: AircraftEntity, amount: number, attacker: AircraftEntity | null, weapon: WeaponKind): void {
    if (!victim.alive || amount <= 0) return;
    const taken = Math.min(amount, victim.hp);
    victim.hp = Math.max(0, victim.hp - amount);
    if (attacker && attacker.team !== victim.team) {
      victim.lastDamagedBy = attacker.id;
      victim.lastDamagedTick = this.tick;
    }
    this.emit({ type: 'hit', aircraftId: victim.id, attackerId: attacker ? attacker.id : null, weapon, damage: taken });
    if (victim.hp <= 0) this.destroy(victim, weapon, attacker);
  }

  isOutOfBounds(a: AircraftEntity): boolean {
    if (this.mode.wholeMap) {
      const half = this.map.sizeM / 2;
      return Math.abs(a.flight.pos.x) > half || Math.abs(a.flight.pos.z) > half || a.flight.pos.y > CEILING_M;
    }
    const c = this.map.combatArea;
    const dx = a.flight.pos.x - c.x;
    const dz = a.flight.pos.z - c.z;
    return dx * dx + dz * dz > c.radiusM * c.radiusM || a.flight.pos.y > CEILING_M;
  }

  /**
   * Seconds of match time until a shot-down aircraft flies again; null while it is alive or when its team has no
   * aircraft left (Strike). Counted in ticks, so it agrees with the respawn however fast the match runs.
   */
  respawnInS(a: AircraftEntity): number | null {
    if (a.alive || a.respawnAtTick < 0) return null;
    if (a.support === null && !this.mode.canRespawn(a.team)) return null;
    return Math.max(0, (a.respawnAtTick - this.tick) / TICK_RATE);
  }

  /**
   * How far along the jet is in taking on supplies at a friendly airfield (revision 22): a supply pass (or the roll-out
   * after a landing) rearms and refuels, a stop also repairs. Null when it is not taking any, or needs none.
   */
  supplyProgress(a: AircraftEntity): { kind: SupplyKind; progress: number } | null {
    if (!a.alive || a.supplyKind === null) return null;
    const repair = a.supplyKind === 'landed';
    const need = (repair ? SUPPLY_LANDED_S : SUPPLY_PASS_S) * TICK_RATE;
    if (a.supplyTicks >= need || !needsSupply(a, repair)) return null;
    return { kind: a.supplyKind, progress: a.supplyTicks / need };
  }

  /** Seconds since the pilot blacked out (G-LOC, revision 21); null while conscious or shot down. */
  blackedOutS(a: AircraftEntity): number | null {
    return a.alive && a.blackoutTick >= 0 ? (this.tick - a.blackoutTick) / TICK_RATE : null;
  }

  /** Seconds until a boundary kill, or null when the aircraft is not currently counting down. */
  boundarySecondsLeft(a: AircraftEntity): number | null {
    if (a.outOfBoundsTicks === 0) return null;
    return (BOUNDARY_GRACE_S * TICK_RATE - a.outOfBoundsTicks) / TICK_RATE;
  }

  /** Mid-air collisions destroy both aircraft (spec §11); swept so head-on passes can't tunnel. */
  private checkCollisions(): void {
    const list = this.living;
    list.length = 0;
    for (const a of this.aircraft.values()) if (a.alive) list.push(a);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a.alive || !b.alive) continue;
        const limit = 0.5 * (a.config.damage.hitRadiusM + b.config.damage.hitRadiusM);
        if (closestApproach(a.prevPos, a.flight.pos, b.prevPos, b.flight.pos, this.approach).distance > limit) continue;
        this.destroy(a, 'collision', null);
        this.destroy(b, 'collision', null);
      }
    }
  }

  private destroy(a: AircraftEntity, cause: DeathCause, killer: AircraftEntity | null): void {
    a.alive = false;
    a.deaths++;
    a.outOfBoundsTicks = 0;
    a.firingCannon = false;
    a.respawnAtTick = this.tick + Math.round((a.support ? a.support.respawnDelayS : this.mode.respawnDelayS) * TICK_RATE);
    if (killer && killer.team !== a.team) killer.kills++;
    this.emit({ type: 'destroyed', aircraftId: a.id, cause, killerId: killer ? killer.id : null });
    this.combat.forget(a.id);
    this.mode.onAircraftDestroyed(this, a, killer, cause);
  }

  /** Supplies at a friendly airfield (revision 22): once per stay, after a few seconds on a pass or stopped. */
  private updateSupply(a: AircraftEntity): void {
    const kind = a.support ? null : supplyAt(this.map.features, a.team, a.flight);
    if (kind !== a.supplyKind) {
      a.supplyKind = kind;
      a.supplyTicks = 0;
    }
    if (kind === null) return;
    a.supplyTicks++;
    const repair = kind === 'landed';
    if (a.supplyTicks !== (repair ? SUPPLY_LANDED_S : SUPPLY_PASS_S) * TICK_RATE || !needsSupply(a, repair)) return;
    resupply(a, repair);
    this.emit({ type: 'resupplied', aircraftId: a.id, repaired: repair });
  }

  /** A runway start on the team's airfield when the mode and map have one, else the mode's airborne spawn line. */
  private spawnState(team: TeamId, slot: number, physics: AircraftPhysics, start: SpawnStart): FlightState {
    const field = start === 'runway' && this.mode.runwayStarts ? teamAirfield(this.map, team) : null;
    return field ? runwayFlightState(field, slot) : spawnFlightState(this.mode.spawnPoint(this.map, team), this.terrain, slot, physics);
  }

  private respawn(a: AircraftEntity): void {
    if (a.nextAircraftId) {
      a.config = getAircraft(a.nextAircraftId);
      a.nextAircraftId = null;
    }
    a.flight = a.support ? supportFlightState(a.support, a.config.physics, this.map.combatArea) : this.spawnState(a.team, a.spawnSlot, a.config.physics, a.start);
    a.alive = true;
    a.spawnGen++;
    a.respawnAtTick = -1;
    a.outOfBoundsTicks = 0;
    resetForSpawn(a);
    this.emit({ type: 'spawned', aircraftId: a.id, spawnGen: a.spawnGen });
  }
}

/** The match's wind: the weather's, from a direction drawn from the seed, or none in a calm. */
function windFor(env: EnvironmentSettings, seed: number): WindField {
  return env.calm ? new WindField({ surfaceMs: 0, aloftMs: 0, gust: 0, fromRad: 0 }, seed) : WindField.forWeather(WEATHER[env.weather], seed);
}

/**
 * What every AI pilot does whatever its tactics (revision 16): recover from a spin with the stick forward and opposite
 * rudder, and save fuel by staying off the afterburner once the tank runs low.
 */
function airmanship(a: AircraftEntity): void {
  const input = a.input;
  if (a.flight.spin !== 0) {
    input.pitch = -0.5;
    input.roll = 0;
    input.yaw = -a.flight.spin;
  }
  if (a.stores.fuelKg < AI_FUEL_SAVING_SHARE * a.config.physics.fuelKg) input.throttle = Math.min(input.throttle, 0.9);
}
