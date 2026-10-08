import { Quaternion, Vector3 } from 'three';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import type { AircraftConfig, TeamId } from '../../shared/data/aircraft/types.ts';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { MapId } from '../../shared/data/maps/registry.ts';
import { CANNONS, type CannonSpec, missilesFor } from '../../shared/data/weapons.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { Rng } from '../../shared/math/rng.ts';
import type { GameMode, ModeStatus } from '../../shared/modes/mode.ts';
import { createMode } from '../../shared/modes/registry.ts';
import { applyFlightNumbers, decodeSnapshot, encodeInput, quantizeInput, type Snapshot } from '../../shared/net/codec.ts';
import { type HostJsonMessage, type OnlineModeId, PROTOCOL_VERSION, type RoomSettings, type RosterEntry, type WelcomeMessage } from '../../shared/net/protocol.ts';
import { atmosphere, SEA_LEVEL_DENSITY } from '../../shared/physics/atmosphere.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import { createFlightState, type FlightState } from '../../shared/physics/flight-model.ts';
import { slumpedInput } from '../../shared/physics/g-tolerance.ts';
import type { WindField } from '../../shared/physics/wind.ts';
import { createSeeker } from '../../shared/targeting/ir-seeker.ts';
import { createRadarLock, radarLockTimeS } from '../../shared/targeting/radar-lock.ts';
import type { Contact } from '../../shared/targeting/sensors.ts';
import { incomingMissileWarning } from '../../shared/targeting/warnings.ts';
import { advanceProjectile, createProjectile, type Projectile, projectileVelocity } from '../../shared/weapons/cannon.ts';
import { assistedAim, gunAssistPull, GUN_ASSIST_RANGE_M } from '../../shared/weapons/gun-assist.ts';
import { leadDirection } from '../../shared/weapons/lead.ts';
import type { StoresState } from '../../shared/world/entities.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import { type FlyContext, flyTick } from '../../shared/world/fly.ts';
import { createGroundTarget } from '../../shared/world/ground-targets.ts';
import type { SpawnStart } from '../../shared/world/spawns.ts';
import { type EnvironmentSettings, hourAt } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { BOUNDARY_GRACE_S, DT, TICK_RATE, windFor } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, BombView, GameSession, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';

/** Others are drawn this far in the past, so there is almost always a newer snapshot to blend toward. */
export const INTERP_DELAY_TICKS = 6;
/** Past the newest snapshot, motion continues along the last velocity for at most this long. */
const MAX_EXTRAPOLATION_TICKS = 12;
/** Prediction errors fade out with this time constant. */
const CORRECTION_TAU_S = 0.1;
/** A correction bigger than this is a teleport: snap instead of blending. */
const SNAP_DISTANCE_M = 60;
const PING_INTERVAL_MS = 2000;
/** While no frames run (the page still loading the match, or a hidden tab), pings keep the host from timing the pilot out. */
const KEEPALIVE_MS = 3000;
/** The host's clock does not wait for a slow frame: catch up to a quarter second (15 inputs) per frame. */
export const MAX_STEPS_PER_FRAME = 15;
const CLOCK_SAMPLES = 10;
const TARGET_QUEUE = 2;
const MAX_NUDGE = 0.02;
const SAMPLES_KEPT = 40;
const MAX_TRACERS = 600;

/** A message pipe to the host: a WebRTC data channel in the browser, an in-memory pipe in tests. */
export interface Transport {
  send(data: string | ArrayBuffer): void;
  close(): void;
  onMessage: ((data: string | ArrayBuffer) => void) | null;
  /** the link to the host is gone */
  onClose: ((reason: string) => void) | null;
}

export interface HelloOptions {
  callsign: string;
  aircraftId: string;
  start: SpawnStart;
}

/** The map a room flies on, made ready by the page (generated, or already loaded for the title screen). */
export type MapLoader = (id: MapId) => Promise<{ map: MapDefinition; terrain: Terrain }>;

interface Sample {
  tick: number;
  spawnGen: number;
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
}

/** An aircraft as seen over the link: interpolated (others) or predicted (your own). */
class NetAircraft implements AircraftView {
  readonly id: number;
  readonly callsign: string;
  readonly team: TeamId;
  config: AircraftConfig;
  readonly isLocal: boolean;
  readonly isBot: boolean;
  alive = true;
  hp: number;
  spawnGen = 0;
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  flight: FlightState;
  boundarySecondsLeft: number | null = null;
  respawnInS: number | null = null;
  gStrain = 0;
  blackedOutS: number | null = null;
  supply: AircraftView['supply'] = null;
  kills = 0;
  deaths = 0;
  firingCannon = false;
  readonly stores: StoresState = { cannonRounds: 0, srm: 0, mrm: 0, countermeasures: 0, bombs: 0, fuelKg: 0 };
  readonly bombLoad: number;
  targetId: number | null = null;
  contacts: Contact[] = [];
  datalink: number[] = [];
  readonly seeker = createSeeker();
  readonly radarLock = createRadarLock();
  lockedByRadar = false;
  incoming: AircraftView['incoming'] = null;
  readonly samples: Sample[] = [];
  /** tracer timing for the drawn cannon fire */
  cannonAccumulator = 0;

  constructor(r: RosterEntry, isLocal: boolean, bombLoad: number) {
    this.id = r.id;
    this.callsign = r.callsign;
    this.team = r.team;
    this.config = getAircraft(r.aircraftId);
    this.isLocal = isLocal;
    this.isBot = r.isBot;
    this.hp = this.config.damage.hitPoints;
    this.bombLoad = bombLoad;
    this.flight = createFlightState({ position: new Vector3(), headingRad: 0, speed: 0 });
    this.stores.fuelKg = this.config.physics.fuelKg;
  }
}

interface MovingView {
  readonly id: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
}

/** The pilot's own jet as the prediction flies it: the parts the shared flight step needs. */
interface PredictedJet {
  team: TeamId;
  config: AircraftConfig;
  flight: FlightState;
  hp: number;
  stores: { fuelKg: number };
  input: ControlInput;
  gStrain: number;
  blackoutTick: number;
}

const v3 = (out: Vector3, a: readonly number[]) => out.set(a[0], a[1], a[2]);

/** Cubic Hermite blend of positions with their velocities over `durationS`. */
function hermite(p0: Vector3, v0: Vector3, p1: Vector3, v1: Vector3, s: number, durationS: number, out: Vector3): Vector3 {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return out
    .copy(p0)
    .multiplyScalar(h00)
    .addScaledVector(v0, h10 * durationS)
    .addScaledVector(p1, h01)
    .addScaledVector(v1, h11 * durationS);
}

/**
 * A pilot's side of an online room (revision 28, after the M2 client): predicts the pilot's own jet with the very
 * flight step the host runs (wind, fuel, damage, the runway, G strain) and reconciles it with each snapshot, draws
 * everyone else 100 ms in the past, and keeps its clock and input rate in step with the host. Implements the same
 * GameSession as single player, so the HUD and renderer do not change.
 */
export class NetworkSession implements GameSession {
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  localId: number;
  readonly settings: RoomSettings;
  readonly modeId: OnlineModeId;
  readonly hostCallsign: string;
  readonly isHost = false;
  /** called once when the link ends */
  onClosed: ((reason: string) => void) | null = null;
  closed = false;
  closeReason = '';
  /** weather and clock of the room; a Free Flight room can change them */
  environment: EnvironmentSettings;
  wind: WindField;

  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly mode: GameMode;
  private readonly stepper = new FixedStepper(DT, MAX_STEPS_PER_FRAME);
  private readonly aircraft = new Map<number, NetAircraft>();
  private readonly snapshots: Snapshot[] = [];
  private status: ModeStatus;
  private statusTick = 0;
  private pendingEvents: { tick: number; event: GameEvent }[] = [];
  private chatLines: { from: number; index: number }[] = [];
  private matchStarted = false;
  private nextMatchAtMs: number | null = null;
  private seed: number;
  private keepalive: ReturnType<typeof setInterval> | undefined;

  // Prediction.
  private seq = 0;
  private readonly pending: { seq: number; input: ControlInput }[] = [];
  private readonly predicted: FlightState = createFlightState({ position: new Vector3(), headingRad: 0, speed: 0 });
  private readonly jet: PredictedJet;
  private readonly fly: FlyContext;
  /** the host tick the next predicted step runs at, for the gusts */
  private predictedTick = 0;
  private predictedValid = false;
  private readonly predictedHistory = new Map<number, Vector3>();
  private readonly offsetPos = new Vector3();
  private readonly offsetQuat = new Quaternion();
  private readonly stepInput = neutralInput();
  private readonly flown = neutralInput();
  private readonly latched = { cycleTarget: false, countermeasures: false, fireMissile: false, dropBomb: false };
  private localSpawnGen = -1;
  /** the host tick a shot-down jet flies again */
  private respawnAtTick: number | null = null;
  /** last prediction error measured at a snapshot, metres (debug overlay, tests) */
  predictionErrorM = 0;

  // Clock and queue.
  private tickBase: number;
  private msBase: number;
  private readonly clockSamples: { rttMs: number; tick: number; ms: number }[] = [];
  private lastPingMs = -Infinity;
  rttMs = 0;
  queueDepth = 0;
  private nudge = 0;
  /** the newest snapshot not yet reconciled with the own jet */
  private toReconcile: Snapshot | null = null;

  // Views.
  private readonly missileViews = new Map<number, MissileView>();
  private readonly bombViews = new Map<number, BombView>();
  private readonly targetViews: GroundTargetView[];
  private readonly tracers: Projectile[] = [];
  private readonly tracerViews: ProjectileView[] = [];
  private nextTracerId = 1;
  private readonly rng = new Rng(7);
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly prevQuat = new Quaternion();
  private readonly invQuat = new Quaternion();
  private readonly nose = new Vector3();
  private readonly lead = new Vector3();
  private readonly solution = new Vector3();
  private readonly aim = new Vector3();

  /**
   * Opens the session: sends hello, and on the host's welcome loads the room's map, then resolves; messages that
   * arrive meanwhile wait. Rejects on refusal or a closed link.
   */
  static connect(transport: Transport, hello: HelloOptions, loadMap: MapLoader, now: () => number = () => performance.now()): Promise<NetworkSession> {
    return new Promise((resolve, reject) => {
      const early: HostJsonMessage[] = [];
      const binaries: ArrayBuffer[] = [];
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        transport.close();
        reject(err);
      };
      transport.onClose = (reason) => fail(new Error(reason));
      let welcomed = false;
      transport.onMessage = (data) => {
        if (settled) return;
        if (typeof data !== 'string') {
          binaries.push(data);
          return;
        }
        const msg = JSON.parse(data) as HostJsonMessage;
        if (msg.type === 'reject') {
          fail(new Error(msg.reason));
        } else if (msg.type === 'welcome' && !welcomed) {
          welcomed = true;
          loadMap(msg.settings.map).then(
            ({ map, terrain }) => {
              if (settled) return;
              settled = true;
              const session = new NetworkSession(transport, msg, map, terrain, now);
              for (const m of early) session.handleJson(m);
              for (const b of binaries) session.handleSnapshot(b);
              resolve(session);
            },
            (err: unknown) => fail(err instanceof Error ? err : new Error(String(err))),
          );
        } else {
          early.push(msg);
        }
      };
      transport.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, ...hello }));
    });
  }

  constructor(transport: Transport, welcome: WelcomeMessage, map: MapDefinition, terrain: Terrain, now: () => number) {
    this.transport = transport;
    this.map = map;
    this.terrain = terrain;
    this.now = now;
    this.localId = welcome.you;
    this.settings = welcome.settings;
    this.modeId = welcome.settings.mode;
    this.hostCallsign = welcome.host;
    this.environment = welcome.settings.environment;
    this.seed = welcome.seed;
    this.wind = windFor(this.environment, this.seed);
    const size = Math.max(1, welcome.settings.teamSize);
    this.mode = createMode(this.modeId, { teamObjective: { fighters: { usa: size, russia: size } } });
    this.mode.prepare?.(map);
    this.status = { modeId: this.modeId, label: '', scores: null, timeLeftS: null, winner: null };
    this.tickBase = welcome.tick;
    this.msBase = now();
    this.predictedTick = welcome.tick;
    this.fly = { features: map.features, wind: this.wind, timeS: 0, env: { thrustScale: 1, rollScale: 1, groundM: NaN, wind: new Vector3(), fuelUsedKg: 0, gearWanted: false } };
    const anyJet = getAircraft('kestrel');
    this.jet = { team: anyJet.team, config: anyJet, flight: this.predicted, hp: anyJet.damage.hitPoints, stores: { fuelKg: anyJet.physics.fuelKg }, input: this.flown, gStrain: 0, blackoutTick: -1 };
    this.targetViews = this.mode.groundTargets(map).map((spec) => {
      const t = createGroundTarget(spec, terrain);
      return { id: t.id, kind: t.kind, label: t.label, position: t.pos.clone(), maxHp: t.maxHp, hp: t.hp, destroyed: false };
    });
    transport.onMessage = (data) => {
      if (typeof data === 'string') this.handleJson(JSON.parse(data) as HostJsonMessage);
      else this.handleSnapshot(data);
    };
    transport.onClose = (reason) => this.markClosed(reason);
    this.ping();
    this.keepalive = setInterval(() => {
      if (!this.closed && this.now() - this.lastPingMs >= KEEPALIVE_MS) this.ping();
    }, KEEPALIVE_MS);
  }

  hour(): number {
    return hourAt(this.environment.startHour, this.environment.clockRunning, this.serverTickNow() / TICK_RATE);
  }

  /** The host tick it is now, by the synced clock (fractional). */
  serverTickNow(): number {
    return this.tickBase + ((this.now() - this.msBase) * TICK_RATE) / 1000;
  }

  /** The tick others are drawn at. */
  renderTick(): number {
    return this.serverTickNow() - INTERP_DELAY_TICKS;
  }

  update(frameDtS: number, input: ControlInput): void {
    if (this.closed) return;
    if (this.now() - this.lastPingMs >= PING_INTERVAL_MS) this.ping();
    const l = this.latched;
    l.cycleTarget ||= input.cycleTarget;
    l.countermeasures ||= input.countermeasures;
    l.fireMissile ||= input.fireMissile;
    l.dropBomb ||= input.dropBomb;
    if (this.toReconcile) {
      this.reconcile(this.toReconcile);
      this.toReconcile = null;
    }
    const me = this.aircraft.get(this.localId);
    this.stepper.advance(frameDtS * (1 + this.nudge), () => {
      Object.assign(this.stepInput, input, l);
      l.cycleTarget = false;
      l.countermeasures = false;
      l.fireMissile = false;
      l.dropBomb = false;
      this.clientTick(me);
    });
    this.decayCorrection(frameDtS);
    this.refreshViews();
  }

  views(): Iterable<AircraftView> {
    return this.aircraft.values();
  }

  localView(): AircraftView | null {
    return this.aircraft.get(this.localId) ?? null;
  }

  view(id: number): AircraftView | null {
    return this.aircraft.get(id) ?? null;
  }

  missiles(): Iterable<MissileView> {
    return this.missileViews.values();
  }

  projectiles(): Iterable<ProjectileView> {
    return this.tracerViews;
  }

  groundTargets(): readonly GroundTargetView[] {
    return this.targetViews;
  }

  bombs(): Iterable<BombView> {
    return this.bombViews.values();
  }

  /** Game events whose moment has come at the render time, so effects line up with what is drawn. */
  drainEvents(): GameEvent[] {
    const due = this.renderTick() + 1;
    const out: GameEvent[] = [];
    const keep: { tick: number; event: GameEvent }[] = [];
    for (const e of this.pendingEvents) {
      // Your own hits, launches and deaths show at once; everything else when it is drawn.
      if (e.tick <= due || this.concernsLocal(e.event)) out.push(e.event);
      else keep.push(e);
    }
    this.pendingEvents = keep;
    return out;
  }

  modeStatus(): ModeStatus {
    const s = this.status;
    if (s.timeLeftS === null || s.winner !== null) return s;
    const elapsed = Math.max(0, (this.serverTickNow() - this.statusTick) / TICK_RATE);
    return { ...s, timeLeftS: Math.max(0, s.timeLeftS - elapsed) };
  }

  /** Seconds until the next match after one has ended; null while a match runs. */
  nextMatchInS(): number | null {
    return this.nextMatchAtMs === null ? null : Math.max(0, (this.nextMatchAtMs - this.now()) / 1000);
  }

  /** Quick-chat lines received since the last call. */
  drainChat(): { from: number; index: number }[] {
    const lines = this.chatLines;
    this.chatLines = [];
    return lines;
  }

  sendChat(index: number): void {
    if (!this.closed) this.transport.send(JSON.stringify({ type: 'chat', index }));
  }

  chooseNextJet(aircraftId: string): void {
    if (!this.closed) this.transport.send(JSON.stringify({ type: 'jet', aircraftId }));
  }

  changeWorld(weather: WeatherId, hour: number, clockRunning: boolean): void {
    if (!this.closed && this.modeId === 'free-flight') this.transport.send(JSON.stringify({ type: 'world', weather, hour, clockRunning }));
  }

  flyFrom(x: number, z: number): void {
    if (!this.closed && this.modeId === 'free-flight') this.transport.send(JSON.stringify({ type: 'flyFrom', x, z }));
  }

  /** Online Free Flight has no target drones: weapons stay off for everyone. */
  readonly canCallDrones = false;

  setDrones(): void {}

  /** True once after the host started a new match in this room (new aircraft ids). */
  consumeMatchStart(): boolean {
    const started = this.matchStarted;
    this.matchStarted = false;
    return started;
  }

  dispose(): void {
    clearInterval(this.keepalive);
    if (!this.closed) {
      this.closed = true;
      this.closeReason = 'Left the room';
      this.transport.close();
    }
  }

  private markClosed(reason: string): void {
    clearInterval(this.keepalive);
    if (this.closed) return;
    this.closed = true;
    this.closeReason = reason;
    this.onClosed?.(reason);
  }

  private concernsLocal(e: GameEvent): boolean {
    const id = this.localId;
    switch (e.type) {
      case 'hit':
        return e.aircraftId === id || e.attackerId === id;
      case 'destroyed':
        return e.aircraftId === id;
      case 'missileLaunched':
        return e.shooterId === id;
      case 'countermeasures':
      case 'bombReleased':
      case 'resupplied':
      case 'blackout':
        return e.aircraftId === id;
      case 'missileDecoyed':
        return e.targetId === id;
      default:
        return false;
    }
  }

  private ping(): void {
    this.lastPingMs = this.now();
    this.transport.send(JSON.stringify({ type: 'ping', t: this.lastPingMs }));
  }

  /** One 60 Hz tick: send the input and predict the own jet with it. */
  private clientTick(me: NetAircraft | undefined): void {
    this.seq++;
    const input = quantizeInput(this.stepInput);
    const rttTicks = (this.rttMs * TICK_RATE) / 1000;
    const viewDelay = Math.round(rttTicks / 2 + this.queueDepth + INTERP_DELAY_TICKS);
    this.transport.send(encodeInput(this.seq, input, viewDelay));
    this.pending.push({ seq: this.seq, input });
    if (this.pending.length > 300) this.pending.shift();
    if (me && me.alive && this.predictedValid) {
      this.predict(input);
      this.predictedHistory.set(this.seq, this.predicted.pos.clone());
      if (this.predictedHistory.size > 300) this.predictedHistory.delete(this.seq - 300);
      me.stores.fuelKg = this.jet.stores.fuelKg;
      this.fireTracers(me, input.fireCannon && me.stores.cannonRounds > 0, this.predicted, true);
    }
    for (const a of this.aircraft.values()) {
      if (!a.isLocal) this.fireTracers(a, a.alive && a.firingCannon, a.flight, false);
    }
    this.advanceTracers();
  }

  /** One step of the own jet, as the host will fly it: a blacked-out pilot's hands slump on the stick. */
  private predict(input: ControlInput): void {
    const jet = this.jet;
    Object.assign(this.flown, input);
    if (jet.blackoutTick >= 0) slumpedInput(this.flown, jet.flight.quat);
    this.fly.wind = this.wind;
    this.fly.timeS = this.predictedTick * DT;
    if (flyTick(jet, this.fly, DT)) jet.blackoutTick = this.predictedTick;
    this.predictedTick++;
  }

  private fireTracers(a: NetAircraft, firing: boolean, flight: FlightState, local: boolean): void {
    if (!firing) {
      a.cannonAccumulator = 1;
      return;
    }
    const spec = CANNONS[a.config.stores.cannon];
    a.cannonAccumulator += spec.projectilesPerS * DT;
    const density = atmosphere(flight.pos.y).density;
    // The own rounds bend toward a firing solution as the host's do, from what this pilot sees.
    const aim = local ? this.gunAim(a, flight, spec, density) : null;
    while (a.cannonAccumulator >= 1) {
      a.cannonAccumulator -= 1;
      if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
      this.tracers.push(createProjectile(this.nextTracerId++, { id: a.id, team: a.team, flight }, spec, this.rng, density, aim));
    }
  }

  /** The player's gun aim assist (revision 20), on the enemies as drawn here. */
  private gunAim(a: NetAircraft, f: FlightState, spec: CannonSpec, density: number): Vector3 | null {
    this.nose.set(0, 0, -1).applyQuaternion(f.quat);
    const drag = (spec.dragPerM * density) / SEA_LEVEL_DENSITY;
    let best = 0;
    for (const t of this.aircraft.values()) {
      if (!t.alive || t.team === a.team) continue;
      const range = f.pos.distanceTo(t.position);
      if (range > GUN_ASSIST_RANGE_M) continue;
      leadDirection(f.pos, f.vel, t.position, t.flight.vel, spec.muzzleSpeedMs, drag, this.lead);
      const pull = gunAssistPull(this.nose, this.lead, range);
      if (pull > best) {
        best = pull;
        this.solution.copy(this.lead);
      }
    }
    return best > 0 ? assistedAim(this.nose, this.solution, best, this.aim) : null;
  }

  private advanceTracers(): void {
    const list = this.tracers;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      advanceProjectile(p, DT);
      if (p.ageS >= p.lifetimeS || p.pos.y < this.terrain.surfaceAt(p.pos.x, p.pos.z)) list.splice(i, 1);
    }
  }

  private handleJson(msg: HostJsonMessage): void {
    switch (msg.type) {
      case 'roster':
        this.applyRoster(msg.players);
        break;
      case 'events':
        for (const event of msg.events) this.pendingEvents.push({ tick: msg.tick, event });
        break;
      case 'status':
        this.status = msg.status;
        this.statusTick = msg.tick;
        break;
      case 'matchEnd':
        this.status = msg.status;
        this.statusTick = this.serverTickNow();
        this.nextMatchAtMs = this.now() + msg.restartInS * 1000;
        break;
      case 'matchStart':
        this.startNewMatch(msg.you, msg.tick, msg.seed);
        break;
      case 'chat':
        this.chatLines.push({ from: msg.from, index: msg.index });
        break;
      case 'environment':
        this.environment = msg.environment;
        this.wind = windFor(this.environment, this.seed);
        break;
      case 'pong':
        this.applyPong(msg.t, msg.tick);
        break;
      case 'shutdown':
        this.markClosed(msg.reason);
        break;
      case 'reject':
        this.markClosed(msg.reason);
        break;
      default:
        break;
    }
  }

  private applyPong(sentMs: number, tick: number): void {
    const now = this.now();
    const rtt = Math.max(0, now - sentMs);
    this.clockSamples.push({ rttMs: rtt, tick: tick + (rtt / 2 / 1000) * TICK_RATE, ms: now });
    if (this.clockSamples.length > CLOCK_SAMPLES) this.clockSamples.shift();
    // The fastest round trip of the recent ones carries the least queueing noise.
    let best = this.clockSamples[0];
    for (const s of this.clockSamples) if (s.rttMs < best.rttMs) best = s;
    this.rttMs = best.rttMs;
    this.tickBase = best.tick;
    this.msBase = best.ms;
  }

  private applyRoster(players: readonly RosterEntry[]): void {
    const seen = new Set<number>();
    for (const r of players) {
      seen.add(r.id);
      let a = this.aircraft.get(r.id);
      if (!a) {
        a = new NetAircraft(r, r.id === this.localId, this.mode.bombLoad(r.team));
        this.aircraft.set(r.id, a);
      }
      a.kills = r.kills;
      a.deaths = r.deaths;
      // A pilot who respawned in another jet.
      if (a.config.id !== r.aircraftId) a.config = getAircraft(r.aircraftId);
    }
    for (const id of [...this.aircraft.keys()]) if (!seen.has(id)) this.aircraft.delete(id);
  }

  private startNewMatch(you: number, tick: number, seed: number): void {
    this.localId = you;
    this.seed = seed;
    this.wind = windFor(this.environment, seed);
    this.aircraft.clear();
    this.snapshots.length = 0;
    this.toReconcile = null;
    this.pending.length = 0;
    this.pendingEvents = [];
    this.predictedValid = false;
    this.localSpawnGen = -1;
    this.respawnAtTick = null;
    this.offsetPos.set(0, 0, 0);
    this.offsetQuat.identity();
    this.tracers.length = 0;
    this.missileViews.clear();
    this.bombViews.clear();
    this.nextMatchAtMs = null;
    this.tickBase = tick;
    this.msBase = this.now();
    this.clockSamples.length = 0;
    for (const t of this.targetViews) {
      t.hp = t.maxHp;
      t.destroyed = false;
    }
    this.matchStarted = true;
  }

  private handleSnapshot(buf: ArrayBuffer): void {
    const snap = decodeSnapshot(buf);
    // The host is never behind its own snapshot: catch the clock up if it fell back.
    if (snap.tick > this.serverTickNow()) {
      this.tickBase = snap.tick;
      this.msBase = this.now();
    }
    this.snapshots.push(snap);
    if (this.snapshots.length > SAMPLES_KEPT) this.snapshots.shift();
    this.queueDepth = snap.queueDepth;
    this.nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, (TARGET_QUEUE - snap.queueDepth) * 0.01));

    for (const s of snap.aircraft) {
      const a = this.aircraft.get(s.id);
      if (!a) continue;
      a.samples.push({ tick: snap.tick, spawnGen: s.spawnGen, alive: s.alive, pos: v3(new Vector3(), s.pos), vel: v3(new Vector3(), s.vel), quat: new Quaternion(s.quat[0], s.quat[1], s.quat[2], s.quat[3]) });
      if (a.samples.length > SAMPLES_KEPT) a.samples.shift();
      a.hp = s.hp;
      a.firingCannon = s.firingCannon;
      if (!a.isLocal) {
        a.flight.throttle = s.throttle;
        a.flight.gear = s.gear;
        a.flight.gLoad = s.gLoad;
        a.flight.onGround = s.onGround;
        a.alive = s.alive;
        a.spawnGen = s.spawnGen;
      }
    }
    snap.targets.forEach((t, i) => {
      const v = this.targetViews[i];
      if (!v) return;
      v.hp = t.hpFraction * v.maxHp;
      v.destroyed = t.destroyed;
    });
    // Replaying the own inputs is the costly part: do it once per frame, for the newest snapshot only.
    this.toReconcile = snap;
  }

  /** Resets the own jet to the host's state for the acknowledged input and replays the inputs after it. */
  private reconcile(snap: Snapshot): void {
    const me = this.aircraft.get(this.localId);
    const own = snap.own;
    const mine = snap.aircraft.find((a) => a.id === this.localId);
    if (!me || !own || !mine) return;
    me.alive = mine.alive;
    const s = me.stores;
    s.cannonRounds = own.cannonRounds;
    s.srm = own.srm;
    s.mrm = own.mrm;
    s.countermeasures = own.countermeasures;
    s.bombs = own.bombs;
    s.fuelKg = own.fuelKg;
    me.hp = own.hp;
    me.targetId = own.targetId;
    me.contacts = own.contacts.map((c) => ({ ...c }));
    me.datalink = own.datalink;
    me.seeker.mode = own.seekerMode;
    me.seeker.targetId = own.seekerTargetId;
    v3(me.seeker.axis, own.seekerAxis);
    me.radarLock.mode = own.radarLockMode;
    me.radarLock.targetId = own.radarLockTargetId;
    me.radarLock.timerS = own.radarLockProgress * radarLockTimeS(missilesFor(me).lance, me.config);
    me.lockedByRadar = own.lockedByRadar;
    me.boundarySecondsLeft = own.outOfBoundsTicks > 0 ? (BOUNDARY_GRACE_S * TICK_RATE - own.outOfBoundsTicks) / TICK_RATE : null;
    me.supply = own.supply;
    this.respawnAtTick = own.respawnInTicks === null ? null : snap.tick + own.respawnInTicks;
    while (this.pending.length > 0 && this.pending[0].seq <= snap.ackSeq) this.pending.shift();
    const jet = this.jet;
    jet.hp = own.hp;
    jet.stores.fuelKg = own.fuelKg;
    jet.gStrain = own.gStrain;
    jet.blackoutTick = own.blackoutTick;
    jet.team = me.team;
    jet.config = me.config;
    if (!mine.alive) {
      this.predictedValid = false;
      return;
    }

    const before = this.tmpA.copy(this.predicted.pos);
    this.prevQuat.copy(this.predicted.quat);
    const respawned = mine.spawnGen !== this.localSpawnGen || !this.predictedValid;
    const atAck = this.predictedHistory.get(snap.ackSeq);
    applyFlightNumbers(own.flight, this.predicted);
    if (atAck) this.predictionErrorM = atAck.distanceTo(this.predicted.pos);
    this.predictedTick = snap.tick;
    for (const { seq, input } of this.pending) {
      this.predict(input);
      this.predictedHistory.set(seq, this.predicted.pos.clone());
    }
    me.stores.fuelKg = jet.stores.fuelKg;
    this.predictedValid = true;
    if (respawned) {
      this.localSpawnGen = mine.spawnGen;
      me.spawnGen++;
      this.offsetPos.set(0, 0, 0);
      this.offsetQuat.identity();
      return;
    }
    // Keep what is drawn where it was and let the difference fade.
    this.offsetPos.add(before.sub(this.predicted.pos));
    if (this.offsetPos.length() > SNAP_DISTANCE_M) this.offsetPos.set(0, 0, 0);
    // Drawn = offset · predicted, so the new offset is old offset · old predicted · new predicted⁻¹.
    this.offsetQuat.multiply(this.prevQuat).multiply(this.invQuat.copy(this.predicted.quat).invert()).normalize();
  }

  private decayCorrection(dt: number): void {
    const k = Math.exp(-dt / CORRECTION_TAU_S);
    this.offsetPos.multiplyScalar(k);
    this.offsetQuat.slerp(this.tmpQ.identity(), 1 - k);
  }

  private refreshViews(): void {
    const render = this.renderTick();
    const now = this.serverTickNow();
    const me = this.aircraft.get(this.localId);
    for (const a of this.aircraft.values()) {
      if (a.isLocal && this.predictedValid && a.alive) {
        a.flight = this.predicted;
        a.position.copy(this.predicted.pos).add(this.offsetPos);
        a.quaternion.copy(this.offsetQuat).multiply(this.predicted.quat);
        continue;
      }
      this.interpolate(a, render);
    }
    if (me) {
      const jet = this.jet;
      me.gStrain = me.alive ? jet.gStrain : 0;
      me.blackedOutS = me.alive && jet.blackoutTick >= 0 ? Math.max(0, (now - jet.blackoutTick) / TICK_RATE) : null;
      me.respawnInS = !me.alive && this.respawnAtTick !== null ? Math.max(0, (this.respawnAtTick - now) / TICK_RATE) : null;
      me.incoming = me.alive ? incomingMissileWarning({ id: me.id, flight: me.flight }, this.missileSamples()) : null;
    }
    this.refreshOrdnance(render);
    this.refreshTracers();
  }

  private interpolate(a: NetAircraft, render: number): void {
    const list = a.samples;
    if (list.length === 0) return;
    let i = list.length - 1;
    while (i > 0 && list[i].tick > render) i--;
    const s0 = list[i];
    const s1 = list[i + 1];
    const f = a.flight;
    if (s1 && s1.spawnGen === s0.spawnGen && s1.tick > s0.tick && render >= s0.tick) {
      const span = s1.tick - s0.tick;
      const s = Math.min(1, (render - s0.tick) / span);
      hermite(s0.pos, s0.vel, s1.pos, s1.vel, s, span / TICK_RATE, a.position);
      a.quaternion.slerpQuaternions(s0.quat, s1.quat, s);
      f.vel.lerpVectors(s0.vel, s1.vel, s);
    } else {
      const latest = render < s0.tick ? s0 : (s1 ?? s0);
      const ahead = Math.min(Math.max(0, render - latest.tick), MAX_EXTRAPOLATION_TICKS) / TICK_RATE;
      a.position.copy(latest.pos).addScaledVector(latest.vel, ahead);
      a.quaternion.copy(latest.quat);
      f.vel.copy(latest.vel);
    }
    f.pos.copy(a.position);
    f.quat.copy(a.quaternion);
    f.airspeed = f.vel.length();
  }

  private missileSamples(): { id: number; targetId: number | null; pos: Vector3; vel: Vector3 }[] {
    const out: { id: number; targetId: number | null; pos: Vector3; vel: Vector3 }[] = [];
    for (const m of this.missileViews.values()) out.push({ id: m.id, targetId: m.targetId, pos: m.position, vel: m.velocity });
    return out;
  }

  /** Missiles and bombs: drawn at the render time like aircraft, from the snapshots around it. */
  private refreshOrdnance(render: number): void {
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i].tick > render) i--;
    const s0 = snaps[i];
    const s1 = snaps[i + 1];
    const span = s1 ? s1.tick - s0.tick : 1;
    const s = s1 ? Math.min(1, Math.max(0, (render - s0.tick) / span)) : 0;
    const ahead = s1 ? 0 : Math.min(Math.max(0, render - s0.tick), MAX_EXTRAPOLATION_TICKS) / TICK_RATE;

    const blend = (views: Map<number, MovingView>, now: { id: number; pos: number[]; vel: number[] }[], next: { id: number; pos: number[]; vel: number[] }[] | undefined, make: (id: number) => MovingView) => {
      const nextById = new Map(next?.map((x) => [x.id, x]));
      const seen = new Set<number>();
      for (const m of now) {
        seen.add(m.id);
        let v = views.get(m.id);
        if (!v) {
          v = make(m.id);
          views.set(m.id, v);
        }
        const n = nextById.get(m.id);
        v3(this.tmpA, m.pos);
        v3(v.velocity, m.vel);
        if (n) {
          v3(this.tmpB, n.pos);
          hermite(this.tmpA, v.velocity, this.tmpB, v3(new Vector3(), n.vel), s, span / TICK_RATE, v.position);
        } else {
          v.position.copy(this.tmpA).addScaledVector(v.velocity, ahead + (s * span) / TICK_RATE);
        }
      }
      for (const id of [...views.keys()]) if (!seen.has(id)) views.delete(id);
    };

    blend(this.missileViews as unknown as Map<number, MovingView>, s0.missiles, s1?.missiles, (id) => {
      const m = s0.missiles.find((x) => x.id === id);
      return { id, kind: m?.kind ?? 'dart', team: m?.team ?? 'usa', ownerId: m?.ownerId ?? 0, targetId: null, position: new Vector3(), velocity: new Vector3(), motorBurning: true } as MissileView;
    });
    for (const m of s0.missiles) {
      const v = this.missileViews.get(m.id);
      if (!v) continue;
      v.targetId = m.targetId;
      v.motorBurning = m.motorBurning;
    }
    blend(this.bombViews as unknown as Map<number, MovingView>, s0.bombs, s1?.bombs, (id) => {
      const b = s0.bombs.find((x) => x.id === id);
      return { id, team: b?.team ?? 'russia', position: new Vector3(), velocity: new Vector3() };
    });
  }

  private refreshTracers(): void {
    const alpha = this.stepper.alpha;
    this.tracerViews.length = 0;
    for (const p of this.tracers) {
      const v: ProjectileView = { team: p.team, position: new Vector3().lerpVectors(p.prevPos, p.pos, alpha), velocity: new Vector3(), ageS: p.ageS };
      projectileVelocity(p, v.velocity);
      this.tracerViews.push(v);
    }
  }
}
