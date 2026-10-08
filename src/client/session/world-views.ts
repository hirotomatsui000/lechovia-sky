import { Quaternion, Vector3 } from 'three';
import { incomingMissileWarning } from '../../shared/targeting/warnings.ts';
import { projectileVelocity } from '../../shared/weapons/cannon.ts';
import { DT, type World } from '../../shared/world/world.ts';
import type { AircraftView, BombView, GroundTargetView, MissileView, ProjectileView } from './game-session.ts';

interface PreviousPose {
  pos: Vector3;
  quat: Quaternion;
  spawnGen: number;
}

/**
 * What the renderer and HUD see of a World that runs in this browser (single player, and the host of an online room):
 * aircraft, missiles, rounds and bombs drawn between the last two simulation steps.
 */
export class WorldViews {
  private world: World;
  private localId: number;
  private readonly previous = new Map<number, PreviousPose>();
  private readonly viewCache = new Map<number, AircraftView>();
  private readonly missileViews = new Map<number, MissileView>();
  private readonly projectilePool: ProjectileView[] = [];
  private readonly projectileViews: ProjectileView[] = [];
  private targetViews: GroundTargetView[] = [];
  private readonly bombViews = new Map<number, BombView>();

  constructor(world: World, localId: number) {
    this.world = world;
    this.localId = localId;
    this.reset(world, localId);
  }

  /** Starts over with another World (the next online match): new aircraft, targets and ordnance. */
  reset(world: World, localId: number): void {
    this.world = world;
    this.localId = localId;
    this.previous.clear();
    this.viewCache.clear();
    this.missileViews.clear();
    this.projectileViews.length = 0;
    this.bombViews.clear();
    this.targetViews = world.groundTargetList().map((t) => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      position: t.pos.clone(),
      maxHp: t.maxHp,
      hp: t.hp,
      destroyed: t.destroyed,
    }));
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

  dispose(): void {
    this.viewCache.clear();
    this.previous.clear();
    this.missileViews.clear();
    this.projectileViews.length = 0;
    this.bombViews.clear();
  }

  /** Before each simulation step: where everything was, to draw between steps. */
  capturePrevious(): void {
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

  /** After a frame's steps: the views, `alpha` of the way from the previous step to the last. */
  refresh(alpha: number): void {
    const world = this.world;
    const seen = new Set<number>();
    for (const a of world.aircraftList()) {
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
      view.boundarySecondsLeft = world.boundarySecondsLeft(a);
      view.respawnInS = world.respawnInS(a);
      view.gStrain = a.gStrain;
      view.blackedOutS = world.blackedOutS(a);
      view.supply = world.supplyProgress(a);
      view.kills = a.kills;
      view.deaths = a.deaths;
      view.firingCannon = a.firingCannon;
      view.targetId = a.targetId;
      view.lockedByRadar = a.lockedByRadar;
      view.incoming = a.alive ? incomingMissileWarning(a, world.missileList()) : null;
    }
    for (const id of this.viewCache.keys()) if (!seen.has(id)) this.viewCache.delete(id);

    const liveMissiles = new Set<number>();
    for (const m of world.missileList()) {
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
    for (const p of world.projectileList()) {
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

    const targets = world.groundTargetList();
    for (let t = 0; t < targets.length; t++) {
      this.targetViews[t].hp = targets[t].hp;
      this.targetViews[t].destroyed = targets[t].destroyed;
    }

    const liveBombs = new Set<number>();
    for (const b of world.bombList()) {
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
