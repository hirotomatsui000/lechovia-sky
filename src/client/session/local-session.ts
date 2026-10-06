import { Quaternion, Vector3 } from 'three';
import { botCallsign } from '../../shared/ai/bot-names.ts';
import type { DifficultyProfile } from '../../shared/ai/difficulty.ts';
import { getAircraft, opposingTeam, randomAircraft } from '../../shared/data/aircraft/registry.ts';
import { buildTerrain, type MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { Rng } from '../../shared/math/rng.ts';
import type { GameMode, ModeStatus } from '../../shared/modes/mode.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import type { SteadyWind } from '../../shared/physics/wind.ts';
import { incomingMissileWarning } from '../../shared/targeting/warnings.ts';
import { projectileVelocity } from '../../shared/weapons/cannon.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, environmentAt } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { FreeFlightMode } from '../../shared/modes/free-flight.ts';
import { DT, TICK_RATE, World } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, BombView, GameSession, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';

export interface OpponentOptions {
  count: number;
  profile: DifficultyProfile;
}

export interface LocalSessionOptions {
  map: MapDefinition;
  mode: GameMode;
  aircraftId: string;
  callsign: string;
  seed?: number;
  /** reuse an already built terrain (tests, restarts) */
  terrain?: Terrain;
  /** AI bots on the other team */
  opponents?: OpponentOptions;
  /** AI bots on the player's own team (M5) */
  wingmen?: OpponentOptions;
  /** the player starts in the air (default) or on the team's runway (M4) */
  start?: SpawnStart;
  /** weather and clock (M4) */
  environment?: EnvironmentSettings;
}

export { BOT_CALLSIGNS } from '../../shared/ai/bot-names.ts';

interface PreviousPose {
  pos: Vector3;
  quat: Quaternion;
  spawnGen: number;
}

/** Runs the authoritative World inside the browser (single player, M1). */
export class LocalSession implements GameSession {
  readonly world: World;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly localId: number;
  private readonly stepper = new FixedStepper(DT);
  private readonly inputs = new Map<number, ControlInput>();
  private readonly stepInput = neutralInput();
  /** button presses wait here until a simulation step consumes them (frames can run 0 or several steps) */
  private readonly latched = { cycleTarget: false, countermeasures: false, fireMissile: false, dropBomb: false };
  private readonly previous = new Map<number, PreviousPose>();
  private readonly viewCache = new Map<number, AircraftView>();
  private readonly missileViews = new Map<number, MissileView>();
  private readonly projectilePool: ProjectileView[] = [];
  private readonly projectileViews: ProjectileView[] = [];
  private readonly targetViews: GroundTargetView[];
  private readonly bombViews = new Map<number, BombView>();
  private pendingEvents: GameEvent[] = [];

  constructor(opts: LocalSessionOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain ?? buildTerrain(opts.map);
    this.world = new World({ map: opts.map, terrain: this.terrain, mode: opts.mode, seed: opts.seed ?? 1, environment: opts.environment });
    const config = getAircraft(opts.aircraftId);
    this.localId = this.world.addAircraft({ callsign: opts.callsign, team: config.team, aircraftId: config.id, start: opts.start }).id;
    // Each AI pilot flies a random jet of its team, chosen from the match seed.
    const jets = new Rng((opts.seed ?? 1) ^ 0x2545f491);
    if (opts.opponents) {
      const team = opposingTeam(config.team);
      for (let i = 0; i < opts.opponents.count; i++) {
        this.world.addAircraft({ callsign: botCallsign(team, i), team, aircraftId: randomAircraft(team, jets).id, bot: opts.opponents.profile });
      }
    }
    if (opts.wingmen) {
      for (let i = 0; i < opts.wingmen.count; i++) {
        this.world.addAircraft({ callsign: botCallsign(config.team, i), team: config.team, aircraftId: randomAircraft(config.team, jets).id, bot: opts.wingmen.profile });
      }
    }
    this.targetViews = this.world.groundTargetList().map((t) => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      position: t.pos.clone(),
      maxHp: t.maxHp,
      hp: t.hp,
      destroyed: t.destroyed,
    }));
    this.pendingEvents.push(...this.world.drainEvents());
  }

  get wind(): SteadyWind {
    return this.world.wind;
  }

  get environment(): EnvironmentSettings {
    return this.world.environment;
  }

  hour(): number {
    return this.world.hour();
  }

  update(frameDtS: number, input: ControlInput): void {
    const l = this.latched;
    l.cycleTarget ||= input.cycleTarget;
    l.countermeasures ||= input.countermeasures;
    l.fireMissile ||= input.fireMissile;
    l.dropBomb ||= input.dropBomb;
    this.stepper.advance(frameDtS, () => {
      Object.assign(this.stepInput, input, l);
      l.cycleTarget = false;
      l.countermeasures = false;
      l.fireMissile = false;
      l.dropBomb = false;
      this.inputs.set(this.localId, this.stepInput);
      this.capturePrevious();
      this.world.step(this.inputs);
      this.pendingEvents.push(...this.world.drainEvents());
    });
    this.refreshViews();
  }

  views(): Iterable<AircraftView> {
    return this.viewCache.values();
  }

  localView(): AircraftView | null {
    return this.viewCache.get(this.localId) ?? null;
  }

  view(id: number): AircraftView | null {
    return this.viewCache.get(id) ?? null;
  }

  missiles(): Iterable<MissileView> {
    return this.missileViews.values();
  }

  projectiles(): Iterable<ProjectileView> {
    return this.projectileViews;
  }

  groundTargets(): readonly GroundTargetView[] {
    return this.targetViews;
  }

  bombs(): Iterable<BombView> {
    return this.bombViews.values();
  }

  drainEvents(): GameEvent[] {
    const drained = this.pendingEvents;
    this.pendingEvents = [];
    return drained;
  }

  modeStatus(): ModeStatus {
    return this.world.mode.status(this.world);
  }

  chooseNextJet(aircraftId: string): void {
    this.world.setNextAircraft(this.localId, aircraftId);
  }

  changeWorld(weather: WeatherId, hour: number, clockRunning: boolean): void {
    if (this.world.mode.id === 'free-flight') this.world.setEnvironment(environmentAt(weather, hour, clockRunning, this.world.tick / TICK_RATE));
  }

  flyFrom(x: number, z: number): void {
    this.world.flyFrom(this.localId, x, z);
  }

  get canCallDrones(): boolean {
    return this.world.mode instanceof FreeFlightMode;
  }

  setDrones(on: boolean): void {
    if (this.world.mode instanceof FreeFlightMode) this.world.mode.setDrones(on);
  }

  dispose(): void {
    this.viewCache.clear();
    this.previous.clear();
    this.missileViews.clear();
    this.projectileViews.length = 0;
    this.bombViews.clear();
  }

  private capturePrevious(): void {
    for (const a of this.world.aircraftList()) {
      let prev = this.previous.get(a.id);
      if (!prev) {
        prev = { pos: new Vector3(), quat: new Quaternion(), spawnGen: a.spawnGen };
        this.previous.set(a.id, prev);
      }
      prev.pos.copy(a.flight.pos);
      prev.quat.copy(a.flight.quat);
      prev.spawnGen = a.spawnGen;
    }
  }

  private refreshViews(): void {
    const alpha = this.stepper.alpha;
    const seen = new Set<number>();
    for (const a of this.world.aircraftList()) {
      seen.add(a.id);
      let view = this.viewCache.get(a.id);
      if (!view) {
        view = {
          id: a.id,
          callsign: a.callsign,
          team: a.team,
          config: a.config,
          isLocal: a.id === this.localId,
          isBot: a.isBot,
          alive: a.alive,
          hp: a.hp,
          spawnGen: a.spawnGen,
          position: a.flight.pos.clone(),
          quaternion: a.flight.quat.clone(),
          flight: a.flight,
          boundarySecondsLeft: null,
          respawnInS: null,
          gStrain: 0,
          blackedOutS: null,
          supply: null,
          kills: 0,
          deaths: 0,
          firingCannon: false,
          stores: a.stores,
          bombLoad: a.bombLoad,
          targetId: null,
          contacts: a.contacts,
          datalink: a.datalink,
          seeker: a.seeker,
          radarLock: a.radarLock,
          lockedByRadar: false,
          incoming: null,
        };
        this.viewCache.set(a.id, view);
      }
      const prev = this.previous.get(a.id);
      if (prev && prev.spawnGen === a.spawnGen) {
        view.position.lerpVectors(prev.pos, a.flight.pos, alpha);
        view.quaternion.slerpQuaternions(prev.quat, a.flight.quat, alpha);
      } else {
        view.position.copy(a.flight.pos);
        view.quaternion.copy(a.flight.quat);
      }
      view.config = a.config;
      view.alive = a.alive;
      view.hp = a.hp;
      view.spawnGen = a.spawnGen;
      view.flight = a.flight;
      view.boundarySecondsLeft = this.world.boundarySecondsLeft(a);
      view.respawnInS = this.world.respawnInS(a);
      view.gStrain = a.gStrain;
      view.blackedOutS = this.world.blackedOutS(a);
      view.supply = this.world.supplyProgress(a);
      view.kills = a.kills;
      view.deaths = a.deaths;
      view.firingCannon = a.firingCannon;
      view.targetId = a.targetId;
      view.lockedByRadar = a.lockedByRadar;
      view.incoming = a.alive ? incomingMissileWarning(a, this.world.missileList()) : null;
    }
    for (const id of this.viewCache.keys()) if (!seen.has(id)) this.viewCache.delete(id);

    const liveMissiles = new Set<number>();
    for (const m of this.world.missileList()) {
      liveMissiles.add(m.id);
      let v = this.missileViews.get(m.id);
      if (!v) {
        v = { id: m.id, kind: m.spec.id, team: m.team, ownerId: m.ownerId, targetId: m.targetId, position: new Vector3(), velocity: new Vector3(), motorBurning: true };
        this.missileViews.set(m.id, v);
      }
      v.targetId = m.targetId;
      v.position.lerpVectors(m.prevPos, m.pos, alpha);
      v.velocity.copy(m.vel);
      v.motorBurning = m.ageS < m.spec.burnTimeS;
    }
    for (const id of this.missileViews.keys()) if (!liveMissiles.has(id)) this.missileViews.delete(id);

    this.projectileViews.length = 0;
    let i = 0;
    for (const p of this.world.projectileList()) {
      let v = this.projectilePool[i];
      if (!v) {
        v = { team: p.team, position: new Vector3(), velocity: new Vector3(), ageS: 0 };
        this.projectilePool.push(v);
      }
      v.team = p.team;
      v.position.lerpVectors(p.prevPos, p.pos, alpha);
      v.ageS = Math.max(0, p.ageS - (1 - alpha) * DT);
      projectileVelocity(p, v.velocity);
      this.projectileViews.push(v);
      i++;
    }

    const targets = this.world.groundTargetList();
    for (let t = 0; t < targets.length; t++) {
      this.targetViews[t].hp = targets[t].hp;
      this.targetViews[t].destroyed = targets[t].destroyed;
    }

    const liveBombs = new Set<number>();
    for (const b of this.world.bombList()) {
      liveBombs.add(b.id);
      let v = this.bombViews.get(b.id);
      if (!v) {
        v = { id: b.id, team: b.team, position: new Vector3(), velocity: new Vector3() };
        this.bombViews.set(b.id, v);
      }
      v.position.lerpVectors(b.prevPos, b.pos, alpha);
      v.velocity.copy(b.vel);
    }
    for (const id of this.bombViews.keys()) if (!liveBombs.has(id)) this.bombViews.delete(id);
  }
}
