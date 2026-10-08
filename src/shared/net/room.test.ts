import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../data/maps/map-definition.ts';
import { createTestRange } from '../data/maps/test-range.ts';
import type { GridTerrain } from '../map/terrain.ts';
import { type ControlInput, neutralInput } from '../physics/controls.ts';
import { CALM_NOON } from '../world/time-of-day.ts';
import { decodeSnapshot, encodeInput, type Snapshot } from './codec.ts';
import { type HostJsonMessage, MAX_PILOTS, PROTOCOL_VERSION, type RoomSettings } from './protocol.ts';
import { type Peer, Room, type RoomOptions, SILENT_PILOT_TICKS } from './room.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

class FakePeer implements Peer {
  readonly id: string;
  json: HostJsonMessage[] = [];
  snapshots: Snapshot[] = [];
  constructor(id: string) {
    this.id = id;
  }
  sendJson(msg: HostJsonMessage): void {
    this.json.push(msg);
  }
  sendBinary(buf: ArrayBuffer): void {
    this.snapshots.push(decodeSnapshot(buf));
  }
  last<T extends HostJsonMessage['type']>(type: T): Extract<HostJsonMessage, { type: T }> | undefined {
    return this.json.filter((m): m is Extract<HostJsonMessage, { type: T }> => m.type === type).at(-1);
  }
}

const hello = (aircraftId = 'kestrel', callsign = 'Ace', start = 'air') => JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, callsign, aircraftId, start });
const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ mode: 'team-deathmatch', map: 'test-range', environment: { ...CALM_NOON }, teamSize: 4, botSkill: 'veteran', ...over });
const options = (over: Partial<RoomOptions> = {}, s: Partial<RoomSettings> = {}): RoomOptions => ({
  settings: settings(s),
  host: { callsign: 'Host', aircraftId: 'kestrel', start: 'air' },
  map,
  terrain,
  seed: 5,
  restartDelayS: 2,
  ...over,
});
const send = (seq: number, over: Partial<ControlInput> = {}) => encodeInput(seq, { ...neutralInput(0.8), ...over }, 3);
const hostInput = neutralInput(0.8);
const ticks = (room: Room, n: number) => {
  for (let i = 0; i < n; i++) room.tick(hostInput);
};

function joined(room: Room, id: string, aircraftId = 'kestrel', callsign = 'Ace'): FakePeer {
  const p = new FakePeer(id);
  room.receiveJson(p, hello(aircraftId, callsign));
  return p;
}

describe('online Room (revision 28)', () => {
  it("flies the host's own jet and welcomes a pilot into the team of their jet, AI pilots filling both teams", () => {
    const room = new Room(options());
    const host = room.world.getAircraft(room.hostEntityId);
    expect(host?.callsign).toBe('Host');
    expect(host?.isBot).toBe(false);
    const p = joined(room, 'a', 'kobchik');
    const welcome = p.last('welcome');
    expect(welcome?.settings.mode).toBe('team-deathmatch');
    expect(welcome?.seed).toBe(room.seed);
    expect(welcome?.host).toBe('Host');
    const me = room.world.getAircraft(welcome?.you ?? -1);
    expect(me?.team).toBe('russia');
    expect(me?.isBot).toBe(false);
    ticks(room, 2);
    const roster = p.last('roster')?.players ?? [];
    expect(roster.filter((r) => r.team === 'russia')).toHaveLength(4);
    expect(roster.filter((r) => r.team === 'usa')).toHaveLength(4);
    expect(roster.filter((r) => r.isBot)).toHaveLength(6);
  });

  it('refuses another version, unknown jets and a full room', () => {
    const room = new Room(options());
    const old = new FakePeer('old');
    room.receiveJson(old, JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION - 1, callsign: 'X', aircraftId: 'kestrel', start: 'air' }));
    expect(old.last('reject')?.reason).toMatch(/version/);
    const odd = new FakePeer('odd');
    room.receiveJson(odd, hello('f-22'));
    expect(odd.last('reject')).toBeDefined();
    for (let i = 0; i < MAX_PILOTS - 1; i++) expect(joined(room, `p${i}`).last('welcome')).toBeDefined();
    expect(joined(room, 'late').last('reject')?.reason).toMatch(/full/);
  });

  it('applies one queued input per tick and acknowledges it in the snapshot, with the own jet in full', () => {
    const room = new Room(options());
    const p = joined(room, 'a');
    const you = p.last('welcome')?.you ?? -1;
    room.receiveBinary('a', send(10, { throttle: 1 }));
    room.receiveBinary('a', send(11, { throttle: 1 }));
    ticks(room, 2);
    const snap = p.snapshots.at(-1);
    const a = room.world.getAircraft(you);
    expect(snap?.ackSeq).toBe(11);
    expect(snap?.queueDepth).toBe(0);
    expect(a?.input.throttle).toBe(1);
    expect(a?.viewDelayTicks).toBe(3);
    expect(snap?.own?.flight.pos[0]).toBe(a?.flight.pos.x);
    expect(snap?.own?.fuelKg).toBe(a?.stores.fuelKg);
    expect(snap?.aircraft).toHaveLength(8);
  });

  it('repeats the last input without its presses when the queue runs dry, and keeps at most 30 waiting', () => {
    const room = new Room(options());
    const p = joined(room, 'a');
    const a = room.world.getAircraft(p.last('welcome')?.you ?? -1);
    room.receiveBinary('a', send(1, { throttle: 0.3, fireMissile: true, fireCannon: true }));
    ticks(room, 2);
    expect(a?.input.throttle).toBeCloseTo(0.3, 2);
    expect(a?.input.fireCannon).toBe(true);
    expect(a?.input.fireMissile).toBe(false);
    for (let s = 2; s <= 50; s++) room.receiveBinary('a', send(s));
    ticks(room, 2);
    expect(p.snapshots.at(-1)?.ackSeq).toBe(22);
    expect(p.snapshots.at(-1)?.queueDepth).toBe(28);
  });

  it('drops malformed messages without trouble', () => {
    const room = new Room(options());
    const p = joined(room, 'a');
    room.receiveJson(p, 'not json');
    room.receiveJson(p, '{"type":"chat","index":99}');
    room.receiveBinary('a', new ArrayBuffer(5));
    room.receiveBinary('a', new ArrayBuffer(500));
    ticks(room, 2);
    expect(p.snapshots.length).toBeGreaterThan(0);
  });

  it('sends snapshots at 30 Hz with the status, and answers pings with its tick', () => {
    const room = new Room(options());
    const p = joined(room, 'a');
    ticks(room, 60);
    expect(p.snapshots.length).toBe(30);
    expect(p.json.some((m) => m.type === 'status')).toBe(true);
    room.receiveJson(p, JSON.stringify({ type: 'ping', t: 123 }));
    expect(p.last('pong')).toEqual({ type: 'pong', t: 123, tick: 60 });
  });

  it("gives a leaving pilot's seat back to an AI pilot, and lets a silent one go", () => {
    const room = new Room(options());
    const a = joined(room, 'a', 'kestrel', 'A');
    joined(room, 'b', 'kestrel', 'B');
    expect([...room.world.aircraftList()].filter((x) => x.team === 'usa' && x.isBot)).toHaveLength(1);
    room.leave('b');
    ticks(room, 2);
    expect(room.pilotCount).toBe(1);
    expect([...room.world.aircraftList()].filter((x) => x.team === 'usa' && x.isBot)).toHaveLength(2);
    expect(a.last('roster')?.players.some((r) => r.callsign === 'B')).toBe(false);
    // A keeps quiet for ten seconds: gone.
    ticks(room, SILENT_PILOT_TICKS + 2);
    expect(room.pilotCount).toBe(0);
  });

  it('relays quick chat to everyone, the host included', () => {
    const room = new Room(options());
    const a = joined(room, 'a', 'kestrel', 'A');
    const b = joined(room, 'b', 'kobchik', 'B');
    room.receiveJson(a, JSON.stringify({ type: 'chat', index: 2 }));
    expect(b.last('chat')).toEqual({ type: 'chat', from: a.last('welcome')?.you, index: 2 });
    room.hostChat(1);
    expect(a.last('chat')).toEqual({ type: 'chat', from: room.hostEntityId, index: 1 });
    expect(room.chat).toHaveLength(2);
  });

  it('ends the match, waits, and starts a new one with the same pilots and a new seed', () => {
    const room = new Room(options({ scoreLimit: 1, restartDelayS: 1 }));
    const p = joined(room, 'a');
    const me = room.world.getAircraft(p.last('welcome')?.you ?? -1);
    if (!me) throw new Error('no jet');
    const seed = room.seed;
    room.world.applyDamage(me, 9999, null, 'cannon');
    ticks(room, 2);
    expect(p.last('matchEnd')?.status.winner).toBe('russia');
    expect(room.nextMatchInS).toBeGreaterThan(0);
    ticks(room, 70);
    const start = p.last('matchStart');
    expect(start?.seed).toBe(seed + 1);
    expect(room.matchNumber).toBe(1);
    const fresh = room.world.getAircraft(start?.you ?? -1);
    expect(fresh?.alive).toBe(true);
    expect(fresh?.callsign).toBe('Ace');
    expect(room.world.getAircraft(room.hostEntityId)?.callsign).toBe('Host');
    expect(room.world.mode.status(room.world).winner).toBeNull();
  });

  it('gives each Strike team four aircraft per seat', () => {
    const room = new Room(options({}, { mode: 'strike', teamSize: 2 }));
    joined(room, 'a', 'kobchik');
    expect(room.world.mode.status(room.world).strike?.aircraftLeft).toEqual({ usa: 8, russia: 8 });
  });

  it('runs Team Objective rooms; Sentinels never count as seat-filling AI pilots', () => {
    const room = new Room(options({}, { mode: 'team-objective' }));
    const p = joined(room, 'a', 'kestrel');
    const q = joined(room, 'b', 'kobchik', 'Two');
    ticks(room, 2);
    const roster = q.last('roster')?.players ?? [];
    expect(roster.filter((r) => r.aircraftId.startsWith('sentinel'))).toHaveLength(4);
    expect(roster.filter((r) => !r.aircraftId.startsWith('sentinel') && r.team === 'usa')).toHaveLength(4);
    room.leave(p.id);
    expect([...room.world.aircraftList()].filter((x) => x.support)).toHaveLength(4);
    ticks(room, 2);
    expect(q.snapshots.at(-1)?.own?.datalink).toBeDefined();
  });

  it('flies the chosen jet after the next respawn and in the next match', () => {
    const room = new Room(options({ scoreLimit: 50 }));
    const p = joined(room, 'a', 'kestrel');
    const me = room.world.getAircraft(p.last('welcome')?.you ?? -1)!;
    room.receiveJson(p, JSON.stringify({ type: 'jet', aircraftId: 'kobchik' }));
    expect(me.nextAircraftId).toBeNull();
    room.receiveJson(p, JSON.stringify({ type: 'jet', aircraftId: 'condor' }));
    room.world.applyDamage(me, 9999, null, 'cannon');
    ticks(room, 6 * 60);
    expect(me.alive).toBe(true);
    expect(me.config.id).toBe('condor');
    expect(p.last('roster')?.players.find((r) => r.id === me.id)?.aircraftId).toBe('condor');
  });

  it('Free Flight rooms have no AI pilots, take weather and fly-from requests and tell everyone', () => {
    const room = new Room(options({}, { mode: 'free-flight' }));
    const a = joined(room, 'a');
    const b = joined(room, 'b', 'kobchik', 'Two');
    ticks(room, 120);
    expect(b.last('roster')?.players.filter((r) => r.isBot)).toHaveLength(0);
    room.receiveJson(a, JSON.stringify({ type: 'world', weather: 'overcast', hour: 21, clockRunning: true }));
    expect(b.last('environment')?.environment.weather).toBe('overcast');
    expect(room.world.hour()).toBeCloseTo(21, 6);
    const jet = room.world.getAircraft(a.last('welcome')?.you ?? -1)!;
    room.receiveJson(a, JSON.stringify({ type: 'flyFrom', x: 6000, z: -9000 }));
    expect(jet.flight.pos.x).toBeCloseTo(6000, 0);
    // Only in Free Flight.
    const tdm = new Room(options());
    const c = joined(tdm, 'c');
    tdm.receiveJson(c, JSON.stringify({ type: 'world', weather: 'rain', hour: 3, clockRunning: false }));
    expect(c.last('environment')).toBeUndefined();
    expect(tdm.world.environment.weather).toBe('clear');
  });

  it('tells everyone when the host closes the room', () => {
    const room = new Room(options());
    const p = joined(room, 'a');
    room.shutdown();
    expect(p.last('shutdown')?.reason).toMatch(/host/i);
  });
});
