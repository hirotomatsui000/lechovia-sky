import { botCallsign } from '../../shared/ai/bot-names.ts';
import type { DifficultyProfile } from '../../shared/ai/difficulty.ts';
import { getAircraft, opposingTeam, randomAircraft } from '../../shared/data/aircraft/registry.ts';
import { buildTerrain, type MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { Rng } from '../../shared/math/rng.ts';
import type { GameMode, ModeStatus } from '../../shared/modes/mode.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import type { SteadyWind } from '../../shared/physics/wind.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, environmentAt } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { FreeFlightMode } from '../../shared/modes/free-flight.ts';
import { DT, TICK_RATE, World } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, BombView, GameSession, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';
import { WorldViews } from './world-views.ts';

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
  private readonly worldViews: WorldViews;
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
        // They take off with a player who starts on the runway (revision 26).
        this.world.addAircraft({ callsign: botCallsign(team, i), team, aircraftId: randomAircraft(team, jets).id, bot: opts.opponents.profile, firstStart: opts.start });
      }
    }
    if (opts.wingmen) {
      for (let i = 0; i < opts.wingmen.count; i++) {
        this.world.addAircraft({ callsign: botCallsign(config.team, i), team: config.team, aircraftId: randomAircraft(config.team, jets).id, bot: opts.wingmen.profile, firstStart: opts.start });
      }
    }
    this.worldViews = new WorldViews(this.world, this.localId);
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
      this.worldViews.capturePrevious();
      this.world.step(this.inputs);
      this.pendingEvents.push(...this.world.drainEvents());
    });
    this.worldViews.refresh(this.stepper.alpha);
  }

  views(): Iterable<AircraftView> {
    return this.worldViews.views();
  }

  localView(): AircraftView | null {
    return this.worldViews.localView();
  }

  view(id: number): AircraftView | null {
    return this.worldViews.view(id);
  }

  missiles(): Iterable<MissileView> {
    return this.worldViews.missiles();
  }

  projectiles(): Iterable<ProjectileView> {
    return this.worldViews.projectiles();
  }

  groundTargets(): readonly GroundTargetView[] {
    return this.worldViews.groundTargets();
  }

  bombs(): Iterable<BombView> {
    return this.worldViews.bombs();
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
    this.worldViews.dispose();
  }
}
