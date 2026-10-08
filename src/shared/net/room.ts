import { botCallsign } from '../ai/bot-names.ts';
import { DIFFICULTIES } from '../ai/difficulty.ts';
import { getAircraft, randomAircraft } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition } from '../data/maps/map-definition.ts';
import type { Terrain } from '../map/terrain.ts';
import { Rng } from '../math/rng.ts';
import type { ModeStatus } from '../modes/mode.ts';
import { createMode } from '../modes/registry.ts';
import { STRIKE_AIRCRAFT_PER_PILOT } from '../modes/strike.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GameEvent } from '../world/events.ts';
import type { SpawnStart } from '../world/spawns.ts';
import { environmentAt } from '../world/time-of-day.ts';
import type { WeatherId } from '../world/weather.ts';
import { TICK_RATE, World } from '../world/world.ts';
import { type DecodedInput, decodeInput, encodeSnapshot, MSG_INPUT } from './codec.ts';
import {
  type HelloMessage,
  type HostJsonMessage,
  MAX_CLIENT_BINARY_BYTES,
  MAX_PILOTS,
  parseClientJson,
  PROTOCOL_VERSION,
  ProtocolError,
  type RoomSettings,
  type RosterEntry,
  SNAPSHOT_EVERY_TICKS,
} from './protocol.ts';
import { ownState, sharedSnapshot } from './snapshot.ts';

/** One connected pilot's link, whatever carries it (WebRTC in the browser, a fake in tests). */
export interface Peer {
  readonly id: string;
  sendJson(msg: HostJsonMessage): void;
  sendBinary(buf: ArrayBuffer): void;
}

/** The host's own pilot: flies in the host's browser, without a link. */
export interface HostPilot {
  callsign: string;
  aircraftId: string;
  start: SpawnStart;
}

export interface RoomOptions {
  settings: RoomSettings;
  host: HostPilot;
  map: MapDefinition;
  terrain: Terrain;
  seed?: number;
  /** seconds between the end of a match and the next (default 15) */
  restartDelayS?: number;
  /** a lower score limit for the scoring modes (tests) */
  scoreLimit?: number;
}

/** Inputs waiting per pilot; older ones are dropped beyond this (half a second). */
export const MAX_QUEUE = 30;
/** Status updates go out on change, and at least this often so clocks stay in step. */
const STATUS_EVERY_TICKS = TICK_RATE;
/** A pilot who sends nothing for this long has gone (their link may not have said so); pilots ping every few seconds. */
export const SILENT_PILOT_TICKS = 30 * TICK_RATE;

interface Pilot {
  readonly peer: Peer;
  readonly callsign: string;
  /** the jet this pilot flies; a jet change also carries over to the next match */
  aircraftId: string;
  readonly team: TeamId;
  readonly start: SpawnStart;
  /** the pilot's aircraft in the current World */
  entityId: number;
  readonly queue: DecodedInput[];
  readonly lastInput: ControlInput;
  ackSeq: number;
  lastHeardTick: number;
}

/**
 * An online match hosted in a browser (revision 28): the World at 60 Hz with the host's own aircraft, one aircraft per
 * connected pilot and AI pilots filling each team, input queues, 30 Hz snapshots and event fan-out. After a match it
 * starts the next one by itself. Time is driven from outside through `tick()`; nothing here touches the network.
 */
export class Room {
  world: World;
  readonly settings: RoomSettings;
  /** the host's aircraft in the current World */
  hostEntityId = -1;
  /** bumped at every new match: the host's session starts over with the new World */
  matchNumber = 0;
  /** the host tick the match ended at, null while it runs */
  endedAtTick: number | null = null;
  /** quick-chat lines for the host's own HUD */
  readonly chat: { from: number; index: number }[] = [];
  private readonly options: RoomOptions;
  private readonly host: HostPilot;
  private readonly pilots = new Map<string, Pilot>();
  private readonly inputs = new Map<number, ControlInput>();
  private pendingEvents: GameEvent[] = [];
  private lastStatusKey = '';
  private lastStatusTick = -Infinity;
  private rosterDirty = true;
  private readonly baseSeed: number;
  /** picks each AI pilot's jet, so they fly a mix of the roster */
  private readonly botJets: Rng;

  constructor(options: RoomOptions) {
    this.options = options;
    this.settings = options.settings;
    this.host = { ...options.host };
    this.baseSeed = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.botJets = new Rng(this.baseSeed ^ 0x2545f491);
    this.world = this.createWorld();
  }

  /** The current match's seed: the wind comes from it. */
  get seed(): number {
    return this.baseSeed + this.matchNumber;
  }

  get pilotCount(): number {
    return this.pilots.size;
  }

  get restartDelayS(): number {
    return this.options.restartDelayS ?? 15;
  }

  /** Seconds until the next match, while a finished one is shown; null while a match runs. */
  get nextMatchInS(): number | null {
    return this.endedAtTick === null ? null : Math.max(0, this.restartDelayS - (this.world.tick - this.endedAtTick) / TICK_RATE);
  }

  /** Free Flight rooms fly without AI pilots. */
  private get freeFlight(): boolean {
    return this.settings.mode === 'free-flight';
  }

  /** A pilot's first message. Answers with `welcome`, or `reject` and false. */
  join(peer: Peer, hello: HelloMessage): boolean {
    const refuse = (reason: string) => {
      peer.sendJson({ type: 'reject', reason });
      return false;
    };
    if (this.pilots.has(peer.id)) return true;
    if (hello.version !== PROTOCOL_VERSION) return refuse('The host runs another version of the game: both of you reload the page.');
    if (this.pilots.size + 1 >= MAX_PILOTS) return refuse(`The room is full (${MAX_PILOTS} pilots).`);
    let team: TeamId;
    let aircraftId: string;
    try {
      const config = getAircraft(hello.aircraftId);
      if (config.support) throw new Error('support');
      team = config.team;
      aircraftId = config.id;
    } catch {
      return refuse(`Unknown aircraft "${hello.aircraftId}".`);
    }
    const pilot: Pilot = {
      peer,
      callsign: hello.callsign,
      aircraftId,
      team,
      start: hello.start,
      entityId: -1,
      queue: [],
      lastInput: neutralInput(0.8),
      ackSeq: 0,
      lastHeardTick: this.world.tick,
    };
    this.pilots.set(peer.id, pilot);
    this.removeBot(team);
    pilot.entityId = this.world.addAircraft({ callsign: pilot.callsign, team, aircraftId, start: pilot.start }).id;
    peer.sendJson({
      type: 'welcome',
      version: PROTOCOL_VERSION,
      you: pilot.entityId,
      settings: this.settings,
      seed: this.seed,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      snapshotEvery: SNAPSHOT_EVERY_TICKS,
      host: this.host.callsign,
    });
    this.rosterDirty = true;
    this.sendStatus(true);
    if (this.endedAtTick !== null) peer.sendJson({ type: 'matchEnd', status: this.world.mode.status(this.world), restartInS: this.nextMatchInS ?? 0 });
    return true;
  }

  /** A pilot left (or their link dropped): their seat goes back to an AI pilot. */
  leave(peerId: string): void {
    const p = this.pilots.get(peerId);
    if (!p) return;
    this.pilots.delete(peerId);
    this.world.removeAircraft(p.entityId);
    this.fillBots();
    this.rosterDirty = true;
  }

  /** A JSON message from a pilot; a `hello` from a new one joins them. Malformed messages are dropped. */
  receiveJson(peer: Peer, text: string): void {
    let msg;
    try {
      msg = parseClientJson(text);
    } catch (err) {
      if (err instanceof ProtocolError) return;
      throw err;
    }
    if (msg.type === 'hello') {
      this.join(peer, msg);
      return;
    }
    const p = this.pilots.get(peer.id);
    if (!p) return;
    p.lastHeardTick = this.world.tick;
    switch (msg.type) {
      case 'ping':
        peer.sendJson({ type: 'pong', t: msg.t, tick: this.world.tick });
        break;
      case 'chat':
        this.broadcastChat(p.entityId, msg.index);
        break;
      case 'jet':
        if (this.world.setNextAircraft(p.entityId, msg.aircraftId)) p.aircraftId = msg.aircraftId;
        break;
      case 'world':
        this.changeWorld(msg.weather, msg.hour, msg.clockRunning);
        break;
      case 'flyFrom':
        if (this.freeFlight) this.world.flyFrom(p.entityId, msg.x, msg.z);
        break;
    }
  }

  /** A binary message from a pilot: one tick of input. */
  receiveBinary(peerId: string, buf: ArrayBuffer): void {
    const p = this.pilots.get(peerId);
    if (!p || buf.byteLength > MAX_CLIENT_BINARY_BYTES || buf.byteLength < 1 || new DataView(buf).getUint8(0) !== MSG_INPUT) return;
    let input: DecodedInput;
    try {
      input = decodeInput(buf);
    } catch {
      return;
    }
    p.lastHeardTick = this.world.tick;
    if (input.seq <= p.ackSeq && p.ackSeq !== 0) return;
    p.queue.push(input);
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  /** The host's own quick-chat line. */
  hostChat(index: number): void {
    this.broadcastChat(this.hostEntityId, index);
  }

  /** The jet the host flies from their next respawn on, and in the next match. */
  hostChooseJet(aircraftId: string): void {
    if (this.world.setNextAircraft(this.hostEntityId, aircraftId)) this.host.aircraftId = aircraftId;
  }

  /** Free Flight: the host or any pilot sets the weather and the hour it is now, for everyone. */
  changeWorld(weather: WeatherId, hour: number, clockRunning: boolean): void {
    if (!this.freeFlight) return;
    const env = environmentAt(weather, hour, clockRunning, this.world.tick / TICK_RATE);
    this.world.setEnvironment(env);
    this.settings.environment = env;
    this.broadcast({ type: 'environment', environment: env });
  }

  /**
   * One 60 Hz step: one input per pilot, the host's own, the World, then every other tick the snapshots. Returns the
   * World's events of this tick, for the host's own session.
   */
  tick(hostInput: ControlInput): GameEvent[] {
    this.inputs.clear();
    for (const [id, p] of this.pilots) {
      if (this.world.tick - p.lastHeardTick > SILENT_PILOT_TICKS) {
        this.leave(id);
        continue;
      }
      const next = p.queue.shift();
      const entity = this.world.getAircraft(p.entityId);
      if (next) {
        Object.assign(p.lastInput, next.input);
        p.ackSeq = next.seq;
        if (entity) entity.viewDelayTicks = next.viewDelay;
      } else {
        // Hold the stick and throttle, but a press is never repeated.
        p.lastInput.fireMissile = false;
        p.lastInput.countermeasures = false;
        p.lastInput.dropBomb = false;
        p.lastInput.cycleTarget = false;
      }
      this.inputs.set(p.entityId, p.lastInput);
    }
    this.inputs.set(this.hostEntityId, hostInput);
    this.world.step(this.inputs);
    const events = this.world.drainEvents();
    for (const e of events) {
      this.pendingEvents.push(e);
      if (e.type === 'destroyed' || e.type === 'spawned') this.rosterDirty = true;
    }
    const status = this.world.mode.status(this.world);
    if (status.winner !== null && this.endedAtTick === null) {
      this.endedAtTick = this.world.tick;
      this.flush(status);
      this.broadcast({ type: 'matchEnd', status, restartInS: this.restartDelayS });
    } else if (this.endedAtTick !== null && this.world.tick - this.endedAtTick >= this.restartDelayS * TICK_RATE) {
      this.restart();
      return events;
    }
    if (this.world.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush(status);
    return events;
  }

  /** Tells every pilot the room is closing. */
  shutdown(reason = 'The host left: the room has closed.'): void {
    this.broadcast({ type: 'shutdown', reason });
  }

  /** Everyone in the room, for a list on the host's screen. */
  roster(): RosterEntry[] {
    return [...this.world.aircraftList()].map((a) => ({
      id: a.id,
      callsign: a.callsign,
      team: a.team,
      aircraftId: a.config.id,
      isBot: a.isBot,
      kills: a.kills,
      deaths: a.deaths,
    }));
  }

  private createWorld(): World {
    const s = this.settings;
    const size = Math.max(1, s.teamSize);
    const mode = createMode(s.mode, {
      strike: { aircraftPerTeam: STRIKE_AIRCRAFT_PER_PILOT * size },
      scoreLimit: this.options.scoreLimit,
      teamObjective: { fighters: { usa: size, russia: size } },
    });
    const world = new World({ map: this.options.map, terrain: this.options.terrain, mode, seed: this.seed, environment: s.environment });
    this.world = world;
    const host = getAircraft(this.host.aircraftId);
    this.hostEntityId = world.addAircraft({ callsign: this.host.callsign, team: host.team, aircraftId: host.id, start: this.host.start }).id;
    for (const p of this.pilots.values()) p.entityId = world.addAircraft({ callsign: p.callsign, team: p.team, aircraftId: p.aircraftId, start: p.start }).id;
    this.fillBots();
    return world;
  }

  private restart(): void {
    this.matchNumber++;
    this.endedAtTick = null;
    this.pendingEvents = [];
    this.createWorld();
    this.rosterDirty = true;
    for (const p of this.pilots.values()) {
      p.queue.length = 0;
      p.ackSeq = 0;
      p.lastHeardTick = this.world.tick;
      p.peer.sendJson({ type: 'matchStart', you: p.entityId, tick: this.world.tick, seed: this.seed });
    }
    this.lastStatusKey = '';
    this.flush(this.world.mode.status(this.world));
  }

  private humansOn(team: TeamId): number {
    let n = getAircraft(this.host.aircraftId).team === team ? 1 : 0;
    for (const p of this.pilots.values()) if (p.team === team) n++;
    return n;
  }

  /** AI pilots that fill seats: never the Sentinels the mode flies itself. */
  private botsOn(team: TeamId): AircraftEntity[] {
    return [...this.world.aircraftList()].filter((a) => a.isBot && !a.support && a.team === team);
  }

  private removeBot(team: TeamId): void {
    const bot = this.botsOn(team).at(-1);
    if (bot) {
      this.world.removeAircraft(bot.id);
      this.rosterDirty = true;
    }
  }

  /** Tops each team up with AI pilots to the team size (none in Free Flight). */
  private fillBots(): void {
    const size = this.freeFlight ? 0 : this.settings.teamSize;
    const profile = DIFFICULTIES[this.settings.botSkill];
    for (const team of ['usa', 'russia'] as const) {
      const bots = this.botsOn(team);
      let missing = size - this.humansOn(team) - bots.length;
      let index = bots.length;
      while (missing-- > 0) {
        const jet = randomAircraft(team, this.botJets);
        // They take off with the host when the host starts on the runway (revision 26).
        this.world.addAircraft({ callsign: botCallsign(team, index++), team, aircraftId: jet.id, bot: profile, firstStart: this.host.start });
      }
    }
  }

  private broadcastChat(from: number, index: number): void {
    this.chat.push({ from, index });
    this.broadcast({ type: 'chat', from, index });
  }

  private sendStatus(force: boolean, status: ModeStatus = this.world.mode.status(this.world)): void {
    // Whole seconds are enough for the clock; pilots count down in between.
    const key = JSON.stringify({ ...status, timeLeftS: status.timeLeftS === null ? null : Math.ceil(status.timeLeftS) });
    if (!force && key === this.lastStatusKey && this.world.tick - this.lastStatusTick < STATUS_EVERY_TICKS) return;
    this.lastStatusKey = key;
    this.lastStatusTick = this.world.tick;
    this.broadcast({ type: 'status', tick: this.world.tick, status });
  }

  /** Roster, events and status as JSON, then each pilot's binary snapshot. */
  private flush(status: ModeStatus): void {
    if (this.pilots.size === 0) {
      this.pendingEvents = [];
      return;
    }
    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.broadcast({ type: 'roster', players: this.roster() });
    }
    if (this.pendingEvents.length > 0) {
      this.broadcast({ type: 'events', tick: this.world.tick, events: this.pendingEvents });
      this.pendingEvents = [];
    }
    this.sendStatus(false, status);
    const shared = sharedSnapshot(this.world);
    for (const p of this.pilots.values()) {
      const own = this.world.getAircraft(p.entityId);
      p.peer.sendBinary(encodeSnapshot({ ...shared, ackSeq: p.ackSeq, queueDepth: Math.min(p.queue.length, 255), own: own ? ownState(own, this.world) : null }));
    }
  }

  private broadcast(msg: HostJsonMessage): void {
    for (const p of this.pilots.values()) p.peer.sendJson(msg);
  }
}
