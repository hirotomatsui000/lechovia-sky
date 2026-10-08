import { missilesFor } from '../data/weapons.ts';
import { radarLockProgress } from '../targeting/radar-lock.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { World } from '../world/world.ts';
import { flightNumbers, type OwnState, type Snapshot } from './codec.ts';

const v3 = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
const q4 = (q: { x: number; y: number; z: number; w: number }): [number, number, number, number] => [q.x, q.y, q.z, q.w];

/** Everyone's part of a snapshot; the per-pilot fields (ack, queue, own jet) are filled in per receiver. */
export function sharedSnapshot(world: World): Omit<Snapshot, 'ackSeq' | 'queueDepth' | 'own'> {
  return {
    tick: world.tick,
    aircraft: [...world.aircraftList()].map((a) => ({
      id: a.id,
      alive: a.alive,
      firingCannon: a.firingCannon,
      onGround: a.flight.onGround,
      spawnGen: a.spawnGen,
      hp: a.hp,
      throttle: a.flight.throttle,
      gear: a.flight.gear,
      gLoad: a.flight.gLoad,
      pos: v3(a.flight.pos),
      quat: q4(a.flight.quat),
      vel: v3(a.flight.vel),
    })),
    missiles: world.missileList().map((m) => ({
      id: m.id,
      kind: m.spec.id,
      ownerId: m.ownerId,
      targetId: m.targetId,
      motorBurning: m.ageS < m.spec.burnTimeS,
      team: m.team,
      pos: v3(m.pos),
      vel: v3(m.vel),
    })),
    bombs: world.bombList().map((b) => ({ id: b.id, team: b.team, pos: v3(b.pos), vel: v3(b.vel) })),
    targets: world.groundTargetList().map((t) => ({ hpFraction: t.maxHp > 0 ? t.hp / t.maxHp : 0, destroyed: t.destroyed })),
  };
}

/** The receiving pilot's own jet: its whole flight state at full precision, and what the HUD shows of it. */
export function ownState(a: AircraftEntity, world: World): OwnState {
  const respawn = world.respawnInS(a);
  return {
    flight: flightNumbers(a.flight),
    hp: a.hp,
    fuelKg: a.stores.fuelKg,
    gStrain: a.gStrain,
    blackoutTick: a.blackoutTick,
    cannonRounds: a.stores.cannonRounds,
    srm: a.stores.srm,
    mrm: a.stores.mrm,
    countermeasures: a.stores.countermeasures,
    bombs: a.stores.bombs,
    seekerMode: a.seeker.mode,
    seekerTargetId: a.seeker.targetId,
    seekerAxis: v3(a.seeker.axis),
    radarLockMode: a.radarLock.mode,
    radarLockTargetId: a.radarLock.targetId,
    radarLockProgress: radarLockProgress(a.radarLock, missilesFor(a).lance, a.config),
    lockedByRadar: a.lockedByRadar,
    targetId: a.targetId,
    outOfBoundsTicks: a.outOfBoundsTicks,
    respawnInTicks: respawn === null ? null : Math.round(respawn * world.tickRate),
    supply: world.supplyProgress(a),
    contacts: a.contacts.map((c) => ({ id: c.id, visual: c.visual, radar: c.radar, rangeM: c.rangeM, offNoseRad: c.offNoseRad })),
    datalink: [...a.datalink],
  };
}
