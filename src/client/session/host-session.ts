import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { RoomSettings } from '../../shared/net/protocol.ts';
import { Room, type HostPilot, type Peer } from '../../shared/net/room.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import type { SteadyWind } from '../../shared/physics/wind.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import type { EnvironmentSettings } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import { DT } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, BombView, GameSession, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';
import { WorldViews } from './world-views.ts';

/** What carries the room's messages to the other pilots: WebRTC in the browser, a fake in tests. */
export interface HostLink {
  /** a pilot's link opened, a message arrived, or it closed */
  onJson: ((peer: Peer, text: string) => void) | null;
  onBinary: ((peerId: string, buf: ArrayBuffer) => void) | null;
  onLeave: ((peerId: string) => void) | null;
  /** closes every link, after the last messages have gone */
  close(): void;
}

export interface HostSessionOptions {
  settings: RoomSettings;
  host: HostPilot;
  map: MapDefinition;
  terrain: Terrain;
  /** the room code the others join with */
  code: string;
  link: HostLink;
  seed?: number;
  /** seconds between matches (the Room's default when left out) */
  restartDelayS?: number;
  /** a lower score limit (tests) */
  scoreLimit?: number;
}

/**
 * The host's side of an online room (revision 28): the Room runs the match in this browser, the host flies in it
 * with no delay, and the link carries the others' inputs in and the snapshots out. A slow frame is caught up with up
 * to a quarter second of steps, so the others' clocks keep running.
 */
export class HostSession implements GameSession {
  readonly room: Room;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly code: string;
  readonly isHost = true;
  closed = false;
  private readonly link: HostLink;
  private readonly worldViews: WorldViews;
  private readonly stepper = new FixedStepper(DT, 15);
  private readonly stepInput = neutralInput();
  private readonly latched = { cycleTarget: false, countermeasures: false, fireMissile: false, dropBomb: false };
  private pendingEvents: GameEvent[] = [];
  private seenMatch = 0;
  private matchStarted = false;

  constructor(opts: HostSessionOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain;
    this.code = opts.code;
    this.link = opts.link;
    this.room = new Room({ settings: opts.settings, host: opts.host, map: opts.map, terrain: opts.terrain, seed: opts.seed, restartDelayS: opts.restartDelayS, scoreLimit: opts.scoreLimit });
    this.worldViews = new WorldViews(this.room.world, this.room.hostEntityId);
    this.pendingEvents.push(...this.room.world.drainEvents());
    this.link.onJson = (peer, text) => this.room.receiveJson(peer, text);
    this.link.onBinary = (peerId, buf) => this.room.receiveBinary(peerId, buf);
    this.link.onLeave = (peerId) => this.room.leave(peerId);
  }

  get localId(): number {
    return this.room.hostEntityId;
  }

  get environment(): EnvironmentSettings {
    return this.room.world.environment;
  }

  get wind(): SteadyWind {
    return this.room.world.wind;
  }

  hour(): number {
    return this.room.world.hour();
  }

  update(frameDtS: number, input: ControlInput): void {
    if (this.closed) return;
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
      this.worldViews.capturePrevious();
      const events = this.room.tick(this.stepInput);
      if (this.room.matchNumber !== this.seenMatch) {
        // The next match: a new World with new aircraft ids.
        this.seenMatch = this.room.matchNumber;
        this.worldViews.reset(this.room.world, this.room.hostEntityId);
        this.pendingEvents = [];
        this.matchStarted = true;
      } else {
        this.pendingEvents.push(...events);
      }
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
    return this.room.world.mode.status(this.room.world);
  }

  /** Seconds until the next match after one has ended; null while a match runs. */
  nextMatchInS(): number | null {
    return this.room.nextMatchInS;
  }

  /** True once after the room started its next match (new aircraft ids). */
  consumeMatchStart(): boolean {
    const started = this.matchStarted;
    this.matchStarted = false;
    return started;
  }

  /** Quick-chat lines since the last call. */
  drainChat(): { from: number; index: number }[] {
    return this.room.chat.splice(0);
  }

  sendChat(index: number): void {
    if (!this.closed) this.room.hostChat(index);
  }

  chooseNextJet(aircraftId: string): void {
    this.room.hostChooseJet(aircraftId);
  }

  changeWorld(weather: WeatherId, hour: number, clockRunning: boolean): void {
    this.room.changeWorld(weather, hour, clockRunning);
  }

  flyFrom(x: number, z: number): void {
    if (this.room.settings.mode === 'free-flight') this.room.world.flyFrom(this.room.hostEntityId, x, z);
  }

  /** Online Free Flight has no target drones: weapons stay off for everyone. */
  readonly canCallDrones = false;

  setDrones(): void {}

  /** Closes the room: every pilot is told, then the links close. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.room.shutdown();
    this.link.close();
    this.worldViews.dispose();
  }
}
