import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { neutralInput } from '../physics/controls.ts';
import { createFlightState } from '../physics/flight-model.ts';
import { applyFlightNumbers, decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, FLIGHT_SCALARS, FLIGHT_VECTORS, flightNumbers, INPUT_BYTES, type OwnState, quantizeInput, type Snapshot, snapshotBytes } from './codec.ts';
import { ProtocolError } from './protocol.ts';

function ownState(): OwnState {
  const f = createFlightState({ position: new Vector3(41234.567891, 3210.25, -71234.125), headingRad: 1.1, speed: 231.5, throttle: 0.83 });
  f.angVel.set(0.1, -0.2, 0.3);
  f.spin = -1;
  f.spinTimeS = 2.25;
  f.gLoad = 6.7;
  return {
    flight: flightNumbers(f),
    hp: 61.5,
    fuelKg: 2345.678,
    gStrain: 0.4321,
    blackoutTick: -1,
    cannonRounds: 412,
    srm: 3,
    mrm: 2,
    countermeasures: 30,
    bombs: 0,
    seekerMode: 'locked',
    seekerTargetId: 7,
    seekerAxis: [0, 0, -1],
    radarLockMode: 'tracking',
    radarLockTargetId: 9,
    radarLockProgress: 0.5,
    lockedByRadar: true,
    targetId: 9,
    outOfBoundsTicks: 120,
    respawnInTicks: null,
    supply: { kind: 'pass', progress: 0.4 },
    contacts: [{ id: 9, visual: true, radar: true, rangeM: 4321.5, offNoseRad: 0.25 }],
    datalink: [11, 12],
  };
}

function snapshot(): Snapshot {
  return {
    tick: 123456,
    ackSeq: 987,
    queueDepth: 3,
    aircraft: [{ id: 1, alive: true, firingCannon: true, onGround: false, spawnGen: 300, hp: 87.5, throttle: 1, gear: 0.5, gLoad: 7.3, pos: [1000.5, 2000.25, -3000.125], quat: [0, 0.6, 0, 0.8], vel: [250.5, -10.2, 3.3] }],
    missiles: [{ id: 4, kind: 'lance', ownerId: 1, targetId: 2, motorBurning: true, team: 'russia', pos: [1, 2, 3], vel: [800, 0, -100] }],
    bombs: [{ id: 5, team: 'usa', pos: [4, 5, 6], vel: [200, -50, 0] }],
    targets: [{ hpFraction: 0.5, destroyed: false }],
    own: ownState(),
  };
}

describe('input codec', () => {
  it('round-trips an input in 17 bytes, quantized', () => {
    const input = { ...neutralInput(0.9), pitch: 0.5, roll: -1, yaw: 0.25, fireCannon: true, weapon: 'mrm' as const, helmetSight: true, lookYaw: 1, lookPitch: -0.5 };
    const buf = encodeInput(42, input, 11);
    expect(buf.byteLength).toBe(INPUT_BYTES);
    const d = decodeInput(buf);
    expect(d.seq).toBe(42);
    expect(d.viewDelay).toBe(11);
    expect(d.input.pitch).toBeCloseTo(0.5, 1);
    expect(d.input.roll).toBe(-1);
    expect(d.input.throttle).toBeCloseTo(0.9, 2);
    expect(d.input.fireCannon).toBe(true);
    expect(d.input.weapon).toBe('mrm');
    expect(d.input.helmetSight).toBe(true);
    expect(d.input.lookYaw).toBeCloseTo(1, 3);
    expect(quantizeInput(input)).toEqual(d.input);
  });

  it('refuses a message of the wrong size or kind', () => {
    expect(() => decodeInput(new ArrayBuffer(3))).toThrow(ProtocolError);
    const bad = encodeInput(1, neutralInput(), 0);
    new DataView(bad).setUint8(0, 9);
    expect(() => decodeInput(bad)).toThrow(ProtocolError);
  });
});

describe('snapshot codec (revision 28)', () => {
  it('round-trips the world, the pilot gets their own jet at full precision', () => {
    const s = snapshot();
    const buf = encodeSnapshot(s);
    expect(buf.byteLength).toBe(snapshotBytes(s));
    const d = decodeSnapshot(buf);
    expect(d.tick).toBe(s.tick);
    expect(d.ackSeq).toBe(s.ackSeq);
    expect(d.queueDepth).toBe(3);
    const a = d.aircraft[0];
    expect(a).toMatchObject({ id: 1, alive: true, firingCannon: true, onGround: false, spawnGen: 300 % 256 });
    expect(a.hp).toBeCloseTo(87.5, 1);
    expect(a.gear).toBeCloseTo(0.5, 2);
    expect(a.gLoad).toBeCloseTo(7.3, 1);
    expect(a.pos[2]).toBeCloseTo(-3000.125, 3);
    expect(a.quat[1]).toBeCloseTo(0.6, 3);
    expect(a.vel[0]).toBeCloseTo(250.5, 1);
    expect(d.missiles[0]).toMatchObject({ id: 4, kind: 'lance', ownerId: 1, targetId: 2, motorBurning: true, team: 'russia' });
    expect(d.bombs[0]).toMatchObject({ id: 5, team: 'usa' });
    expect(d.targets[0].hpFraction).toBeCloseTo(0.5, 2);
    // The own jet exactly as sent: every number of the flight state, the fuel and the strain at 64 bits.
    expect(d.own?.flight).toEqual(s.own?.flight);
    expect(d.own?.fuelKg).toBe(s.own?.fuelKg);
    expect(d.own?.gStrain).toBe(s.own?.gStrain);
    expect(d.own).toMatchObject({ blackoutTick: -1, cannonRounds: 412, srm: 3, mrm: 2, seekerMode: 'locked', seekerTargetId: 7, radarLockMode: 'tracking', lockedByRadar: true, targetId: 9, outOfBoundsTicks: 120, respawnInTicks: null, datalink: [11, 12] });
    expect(d.own?.supply?.kind).toBe('pass');
    expect(d.own?.supply?.progress).toBeCloseTo(0.4, 2);
    expect(d.own?.contacts[0]).toMatchObject({ id: 9, visual: true, radar: true });
  });

  it('carries a respawn countdown and a blackout', () => {
    const s = snapshot();
    s.own = { ...ownState(), respawnInTicks: 240, blackoutTick: 5000, supply: null };
    const d = decodeSnapshot(encodeSnapshot(s));
    expect(d.own?.respawnInTicks).toBe(240);
    expect(d.own?.blackoutTick).toBe(5000);
    expect(d.own?.supply).toBeNull();
  });

  it('sends every number of a flight state', () => {
    const f = createFlightState({ position: new Vector3(), headingRad: 0, speed: 100 });
    const covered = new Set<string>([...FLIGHT_SCALARS, ...FLIGHT_VECTORS, 'quat', 'onGround']);
    for (const key of Object.keys(f)) expect(covered.has(key), key).toBe(true);
    const n = flightNumbers(f);
    const g = applyFlightNumbers(n, createFlightState({ position: new Vector3(9, 9, 9), headingRad: 2, speed: 5 }));
    expect(flightNumbers(g)).toEqual(n);
  });

  it('refuses a truncated snapshot', () => {
    const buf = encodeSnapshot(snapshot());
    expect(() => decodeSnapshot(buf.slice(0, buf.byteLength - 3))).toThrow(ProtocolError);
  });
});
