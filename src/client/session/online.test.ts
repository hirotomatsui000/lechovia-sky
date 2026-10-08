import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain, type MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { createTestRange } from '../../shared/data/maps/test-range.ts';
import type { GridTerrain } from '../../shared/map/terrain.ts';
import type { HostJsonMessage, RoomSettings } from '../../shared/net/protocol.ts';
import type { Peer } from '../../shared/net/room.ts';
import { type ControlInput, neutralInput } from '../../shared/physics/controls.ts';
import { CALM_NOON } from '../../shared/world/time-of-day.ts';
import { type HostLink, HostSession } from './host-session.ts';
import { INTERP_DELAY_TICKS, NetworkSession, type Transport } from './network-session.ts';

let map: MapDefinition;
let terrain: GridTerrain;
beforeAll(() => {
  map = createTestRange(1);
  terrain = buildTerrain(map);
});

const FRAME_MS = 1000 / 60;

/** Virtual time, a host in a "browser", and in-memory links with a one-way delay each way. */
class Harness implements HostLink {
  t = 0;
  onJson: HostLink['onJson'] = null;
  onBinary: HostLink['onBinary'] = null;
  onLeave: HostLink['onLeave'] = null;
  readonly host: HostSession;
  hostInput: ControlInput = neutralInput(0.8);
  /** the host's positions per tick, by aircraft id, for checking interpolation */
  readonly history = new Map<number, Map<number, Vector3>>();
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;
  private hostMs = 0;
  private readonly lines: Transport[] = [];
  readonly oneWayMs: number;

  constructor(oneWayMs: number, settings: Partial<RoomSettings> = {}, seed = 3, scoreLimit?: number) {
    this.oneWayMs = oneWayMs;
    this.host = new HostSession({
      settings: { mode: 'team-deathmatch', map: 'test-range', environment: { ...CALM_NOON }, teamSize: 1, botSkill: 'rookie', ...settings },
      host: { callsign: 'Host', aircraftId: 'kestrel', start: 'air' },
      map,
      terrain,
      code: 'TEST42',
      link: this,
      seed,
      restartDelayS: 3,
      scoreLimit,
    });
  }

  close(): void {
    for (const line of this.lines) this.at(this.oneWayMs, () => line.onClose?.('The host left: the room has closed.'));
  }

  at(ms: number, fn: () => void): void {
    this.timers.push({ at: this.t + ms, seq: this.seq++, fn });
  }

  /** A pilot's link to the host, with the delay both ways. */
  line(id: string): Transport {
    const h = this;
    const transport: Transport = {
      onMessage: null,
      onClose: null,
      send(data) {
        h.at(h.oneWayMs, () => {
          if (typeof data === 'string') h.onJson?.(peer, data);
          else h.onBinary?.(id, data.slice(0));
        });
      },
      close() {
        h.at(h.oneWayMs, () => h.onLeave?.(id));
      },
    };
    const peer: Peer = {
      id,
      sendJson: (msg: HostJsonMessage) => {
        const text = JSON.stringify(msg);
        h.at(h.oneWayMs, () => transport.onMessage?.(text));
      },
      sendBinary: (buf) => h.at(h.oneWayMs, () => transport.onMessage?.(buf.slice(0))),
    };
    this.lines.push(transport);
    return transport;
  }

  /** Advances virtual time by `ms`: due messages, and the host's frames at 60 Hz. */
  advance(ms: number): void {
    const end = this.t + ms;
    while (true) {
      const nextTimer = this.timers.reduce((m, x) => (x.at < m.at || (x.at === m.at && x.seq < m.seq) ? x : m), { at: Infinity, seq: 0, fn: () => {} });
      const nextTick = this.hostMs + FRAME_MS;
      const next = Math.min(nextTimer.at, nextTick);
      if (next > end) break;
      this.t = next;
      if (nextTick <= nextTimer.at) {
        this.hostMs = nextTick;
        this.host.update(1 / 60, this.hostInput);
        const world = this.host.room.world;
        for (const a of world.aircraftList()) {
          let hist = this.history.get(a.id);
          if (!hist) this.history.set(a.id, (hist = new Map()));
          hist.set(world.tick, a.flight.pos.clone());
        }
      } else {
        this.timers = this.timers.filter((x) => x !== nextTimer);
        nextTimer.fn();
      }
    }
    this.t = end;
  }
}

async function join(h: Harness, id: string, aircraftId = 'kestrel') {
  const promise = NetworkSession.connect(h.line(id), { callsign: id, aircraftId, start: 'air' }, async () => ({ map, terrain }), () => h.t);
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 120 && !done; i++) {
    h.advance(FRAME_MS);
    await Promise.resolve();
    await Promise.resolve();
  }
  return promise;
}

/** Runs the pilot and the host together for `seconds` with the given stick input. */
function fly(h: Harness, session: NetworkSession, seconds: number, input: (t: number) => ControlInput) {
  for (let i = 0; i < seconds * 60; i++) {
    session.update(1 / 60, input(i / 60));
    h.advance(FRAME_MS);
  }
}

const weave = (t: number): ControlInput => ({ ...neutralInput(0.85), roll: 0.6 * Math.sin(t * 1.3), pitch: 0.3 + 0.3 * Math.sin(t * 0.7) });

describe('online play between browsers (revision 28)', () => {
  it("joins the host's room, predicts its own jet exactly with no lag, and sees the host and the AI pilots", async () => {
    const h = new Harness(0);
    const s = await join(h, 'a');
    fly(h, s, 3, weave);
    expect(s.localView()?.isLocal).toBe(true);
    expect(s.hostCallsign).toBe('Host');
    expect(s.predictionErrorM).toBeLessThan(0.01);
    // The host (USA), this pilot (USA) and one AI pilot for Russia.
    const callsigns = [...s.views()].map((v) => v.callsign);
    expect(callsigns).toHaveLength(3);
    expect(callsigns).toEqual(expect.arrayContaining(['Host', 'a']));
    expect([...h.host.views()]).toHaveLength(3);
  });

  it('keeps its prediction exact at 150 ms each way, in gusty wind and burning fuel, with the queue near two inputs', async () => {
    const h = new Harness(150, { environment: { weather: 'rain', startHour: 12, clockRunning: false } });
    const s = await join(h, 'a');
    let worst = 0;
    const depths: number[] = [];
    for (let i = 0; i < 8 * 60; i++) {
      s.update(1 / 60, weave(i / 60));
      h.advance(FRAME_MS);
      if (i > 3 * 60) {
        worst = Math.max(worst, s.predictionErrorM);
        depths.push(s.queueDepth);
      }
    }
    expect(worst).toBeLessThan(0.05);
    const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(5);
    const me = h.host.room.world.getAircraft(s.localId);
    expect(s.localView()?.stores.fuelKg).toBeCloseTo(me?.stores.fuelKg ?? 0, 0);
  });

  it("predicts the pilot's G strain as the host builds it", async () => {
    const h = new Harness(50);
    const s = await join(h, 'a');
    fly(h, s, 1, () => neutralInput(1));
    fly(h, s, 4, () => ({ ...neutralInput(1), pitch: 1 }));
    const host = h.host.room.world.getAircraft(s.localId);
    expect(host?.gStrain).toBeGreaterThan(0.05);
    expect(s.localView()?.gStrain).toBeCloseTo(host?.gStrain ?? 0, 1);
  });

  it('syncs its clock to the host within two ticks at 300 ms round trip', async () => {
    const h = new Harness(150);
    const s = await join(h, 'a');
    fly(h, s, 5, () => neutralInput(0.8));
    expect(Math.abs(s.serverTickNow() - h.host.room.world.tick)).toBeLessThan(2);
    expect(s.rttMs).toBeGreaterThan(280);
    expect(s.rttMs).toBeLessThan(340);
  });

  it('draws others on the path the host flew them about 100 ms ago, within a metre and a half', async () => {
    const h = new Harness(150);
    const s = await join(h, 'a');
    fly(h, s, 4, () => neutralInput(0.8));
    const other = [...s.views()].find((v) => !v.isLocal);
    if (!other) throw new Error('no other aircraft');
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      s.update(1 / 60, neutralInput(0.8));
      h.advance(FRAME_MS);
      // The synced clock may be a tick off, so compare with the host's path around the render time.
      const render = Math.floor(s.serverTickNow() - INTERP_DELAY_TICKS);
      const hist = h.history.get(other.id);
      let nearest = Infinity;
      for (let k = render - 3; k <= render + 3; k++) {
        const a = hist?.get(k);
        const b = hist?.get(k + 1);
        if (!a || !b) continue;
        for (let f = 0; f <= 1; f += 0.05) nearest = Math.min(nearest, new Vector3().lerpVectors(a, b, f).distanceTo(other.position));
      }
      expect(nearest).toBeLessThan(Infinity);
      worst = Math.max(worst, nearest);
    }
    expect(worst).toBeLessThan(1.5);
  });

  it("shows the host's radar lock on the own jet once the Lance is selected", async () => {
    const h = new Harness(50);
    const s = await join(h, 'a');
    fly(h, s, 1, () => neutralInput(0.8));
    expect(s.localView()?.radarLock.mode).toBe('off');
    fly(h, s, 3, () => ({ ...neutralInput(0.8), weapon: 'mrm' }));
    expect(h.host.room.world.getAircraft(s.localId)?.radarLock.mode).not.toBe('off');
    expect(s.localView()?.radarLock.mode).not.toBe('off');
  });

  it('lets two pilots and the host see each other; a pilot who leaves goes from every list', async () => {
    const h = new Harness(30);
    const a = await join(h, 'a', 'kestrel');
    const b = await join(h, 'b', 'kobchik');
    fly(h, a, 1, () => neutralInput(0.8));
    b.update(1 / 60, neutralInput(0.8));
    expect([...a.views()].filter((v) => !v.isBot)).toHaveLength(3);
    a.dispose();
    expect(a.closed).toBe(true);
    fly(h, b, 1, () => neutralInput(0.8));
    expect([...b.views()].filter((v) => !v.isBot)).toHaveLength(2);
    expect([...h.host.views()].filter((v) => !v.isBot)).toHaveLength(2);
  });

  it('tells the pilots when the host leaves', async () => {
    const h = new Harness(20);
    const s = await join(h, 'a');
    fly(h, s, 0.5, () => neutralInput(0.8));
    let reason = '';
    s.onClosed = (r) => (reason = r);
    h.host.dispose();
    fly(h, s, 0.5, () => neutralInput(0.8));
    expect(s.closed).toBe(true);
    expect(reason).toMatch(/host/i);
  });

  it('respawns in the jet the pilot picked, and shows it', async () => {
    const h = new Harness(20);
    const s = await join(h, 'a', 'kestrel');
    fly(h, s, 0.5, () => neutralInput(0.8));
    s.chooseNextJet('condor');
    fly(h, s, 0.2, () => neutralInput(0.8));
    const world = h.host.room.world;
    world.applyDamage(world.getAircraft(s.localId)!, 9999, null, 'cannon');
    fly(h, s, 1, () => neutralInput(0.8));
    expect(s.localView()?.alive).toBe(false);
    expect(s.localView()?.respawnInS).toBeGreaterThan(0);
    fly(h, s, 5, () => neutralInput(0.8));
    expect(s.localView()?.alive).toBe(true);
    expect(s.localView()?.config.id).toBe('condor');
    expect(s.localView()?.stores.cannonRounds).toBe(world.getAircraft(s.localId)?.config.stores.cannonRounds);
  });

  it('flies a Free Flight room with a shared, changeable sky and fly-from-here', async () => {
    const h = new Harness(20, { mode: 'free-flight' });
    const a = await join(h, 'a', 'kestrel');
    const b = await join(h, 'b', 'kobchik');
    fly(h, a, 0.5, () => neutralInput(0.8));
    expect([...a.views()].filter((v) => v.isBot)).toHaveLength(0);
    expect(a.modeStatus().label).toBe('Free Flight');
    expect(a.canCallDrones).toBe(false);
    b.changeWorld('rain', 22, false);
    fly(h, a, 0.5, () => neutralInput(0.8));
    expect(a.environment.weather).toBe('rain');
    expect(h.host.environment.weather).toBe('rain');
    expect(a.hour()).toBeCloseTo(22, 2);
    a.flyFrom(4000, 8000);
    fly(h, a, 1, () => neutralInput(0.8));
    expect(Math.hypot((a.localView()?.position.x ?? 0) - 4000, (a.localView()?.position.z ?? 0) - 8000)).toBeLessThan(400);
  });

  it('goes on to the next match with everyone, new aircraft and all', async () => {
    // A short room: the first kill wins.
    const h = new Harness(20, {}, 3, 1);
    const s = await join(h, 'a');
    fly(h, s, 0.5, () => neutralInput(0.8));
    const world = h.host.room.world;
    const enemy = [...world.aircraftList()].find((x) => x.team === 'russia')!;
    world.applyDamage(enemy, 9999, world.getAircraft(s.localId) ?? null, 'cannon');
    fly(h, s, 0.5, () => neutralInput(0.8));
    expect(h.host.room.endedAtTick).not.toBeNull();
    expect(s.nextMatchInS()).toBeGreaterThan(0);
    fly(h, s, h.host.room.restartDelayS + 1, () => neutralInput(0.8));
    expect(s.consumeMatchStart()).toBe(true);
    expect(h.host.consumeMatchStart()).toBe(true);
    fly(h, s, 1, () => neutralInput(0.8));
    expect(s.modeStatus().winner).toBeNull();
    expect(s.localView()?.alive).toBe(true);
    expect(h.host.room.world.getAircraft(s.localId)?.callsign).toBe('a');
  });
});
