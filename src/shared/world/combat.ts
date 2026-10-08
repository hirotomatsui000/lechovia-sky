import { Vector3 } from 'three';
import { blastDamage } from '../damage/damage.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import { AFTERBURNER_THROTTLE, BOMB_ANVIL, type CannonSpec, CANNONS, COUNTERMEASURES, missilesFor, PLAYER_GUN_REACH, SRM_DART } from '../data/weapons.ts';
import type { Terrain } from '../map/terrain.ts';
import { type Approach, closestApproach } from '../math/closest-approach.ts';
import type { Rng } from '../math/rng.ts';
import { type AirData, atmosphere, SEA_LEVEL_DENSITY } from '../physics/atmosphere.ts';
import { autoDesignate, cycleDesignation, isContact } from '../targeting/designation.ts';
import { resetSeeker, updateSeeker } from '../targeting/ir-seeker.ts';
import { resetRadarLock, updateRadarLock } from '../targeting/radar-lock.ts';
import { detectContacts, type Obscurant, RADAR_SCAN_INTERVAL_S } from '../targeting/sensors.ts';
import { advanceProjectile, createProjectile, type Projectile, pullTrigger, TRIGGER_AT_REST } from '../weapons/cannon.ts';
import { decoyChance, rollDecoy } from '../weapons/countermeasures.ts';
import { assistedAim, GUN_ASSIST_RANGE_M, gunAssistPull } from '../weapons/gun-assist.ts';
import { leadDirection } from '../weapons/lead.ts';
import type { SteadyWind } from '../physics/wind.ts';
import { type Bomb, bombDamage, hasLanded, releaseBomb, stepBomb, surfaceCrossing } from '../weapons/bomb.ts';
import { activeRangeM, isArmed, isSpent, launchMissile, type Missile, stepMissile, withinGimbal } from '../weapons/missile.ts';
import type { AircraftEntity } from './entities.ts';
import type { GameEvent, WeaponKind } from './events.ts';
import type { GroundTarget } from './ground-targets.ts';

/** Lag compensation never rewinds further than this (250 ms, revision 28). */
export const MAX_REWIND_TICKS = 15;

/** The parts of the World that combat needs. */
export interface CombatHost {
  readonly tick: number;
  readonly tickRate: number;
  readonly terrain: Terrain;
  /** clouds hide aircraft from eyes and infrared seekers (M4) */
  readonly clouds: Obscurant;
  readonly rng: Rng;
  aircraftList(): Iterable<AircraftEntity>;
  getAircraft(id: number): AircraftEntity | undefined;
  emit(event: GameEvent): void;
  applyDamage(victim: AircraftEntity, amount: number, attacker: AircraftEntity | null, weapon: WeaponKind): void;
  readonly combatArea: { readonly x: number; readonly z: number; readonly radiusM: number };
  groundTargetList(): readonly GroundTarget[];
  applyTargetDamage(target: GroundTarget, amount: number, attacker: AircraftEntity | null): void;
  /** true once the mode has a winner: later bomb impacts do nothing (spec §10.4) */
  matchOver(): boolean;
  /** false while a team's datalink is down (Team Objective, M5) */
  datalinkUp(team: TeamId): boolean;
  /** the wind carries falling bombs (revision 16) */
  readonly wind: SteadyWind;
}

/**
 * Sensors, targeting, cannons, missiles and countermeasures for every aircraft (spec §10). The World steps it
 * after all aircraft have moved. Projectiles and missiles already in flight move before new ones are fired, so
 * every hit test compares movements over the same tick.
 */
export class Combat {
  readonly projectiles: Projectile[] = [];
  readonly missiles: Missile[] = [];
  readonly bombs: Bomb[] = [];
  private readonly host: CombatHost;
  private readonly scanTicks: number;
  private nextProjectileId = 1;
  private nextMissileId = 1;
  private nextBombId = 1;
  private readonly approach: Approach = { distance: 0, fraction: 0 };
  private readonly air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
  private readonly burst = new Vector3();
  private readonly victimPos = new Vector3();
  private readonly impact = new Vector3();
  private readonly rewoundPrev = new Vector3();
  private readonly rewoundPos = new Vector3();
  private readonly rewoundVel = new Vector3();
  private readonly nose = new Vector3();
  private readonly lead = new Vector3();
  private readonly solution = new Vector3();
  private readonly aim = new Vector3();
  private readonly sharedUsa = new Set<number>();
  private readonly sharedRussia = new Set<number>();

  constructor(host: CombatHost) {
    this.host = host;
    this.scanTicks = Math.max(1, Math.round(RADAR_SCAN_INTERVAL_S * host.tickRate));
  }

  step(dt: number): void {
    const host = this.host;
    if (host.tick % this.scanTicks === 0) this.scanSensors();
    this.stepProjectiles(dt);
    this.stepMissiles(dt);
    this.stepBombs(dt);
    for (const a of host.aircraftList()) {
      if (!a.alive) continue;
      if (a.input.cycleTarget) a.targetId = cycleDesignation(a.targetId, a.contacts);
      this.releaseCountermeasures(a);
      this.fireCannon(a, dt);
      this.updateSeeker(a, dt);
      this.updateRadarLock(a, dt);
      this.launchMissile(a);
      this.dropBomb(a);
    }
    this.updateWarnings();
  }

  /** A missile fired at `targetId` without a lock or launch checks (scripted training shots). */
  launchAt(shooter: AircraftEntity, targetId: number): Missile {
    const m = launchMissile(this.nextMissileId++, shooter, targetId, SRM_DART);
    this.missiles.push(m);
    this.host.emit({ type: 'missileLaunched', missileId: m.id, shooterId: shooter.id, targetId, kind: m.spec.id });
    return m;
  }

  /** Drops every reference to an aircraft that was destroyed or removed. */
  forget(id: number): void {
    for (const a of this.host.aircraftList()) {
      if (a.targetId === id) a.targetId = null;
      const i = a.contacts.findIndex((c) => c.id === id);
      if (i >= 0) a.contacts.splice(i, 1);
      const k = a.datalink.indexOf(id);
      if (k >= 0) a.datalink.splice(k, 1);
      if (a.seeker.targetId === id) resetSeeker(a.seeker, 'search');
      if (a.radarLock.targetId === id) resetRadarLock(a.radarLock, 'search');
    }
    for (const m of this.missiles) if (m.targetId === id) m.targetId = null;
  }

  private scanSensors(): void {
    const host = this.host;
    const shared: Record<TeamId, Set<number>> = { usa: this.sharedUsa, russia: this.sharedRussia };
    shared.usa.clear();
    shared.russia.clear();
    for (const a of host.aircraftList()) {
      if (!a.alive) continue;
      detectContacts(a, host.aircraftList(), host.terrain, a.contacts, host.clouds);
      if (!isContact(a.targetId, a.contacts)) a.targetId = null;
      if (a.targetId === null) a.targetId = autoDesignate(a.contacts);
      for (const c of a.contacts) if (c.radar) shared[a.team].add(c.id);
    }
    // Datalink (spec §10.3): every radar contact of a team, for the members who do not see it themselves.
    const up: Record<TeamId, boolean> = { usa: host.datalinkUp('usa'), russia: host.datalinkUp('russia') };
    for (const a of host.aircraftList()) {
      a.datalink.length = 0;
      if (!a.alive || !up[a.team]) continue;
      for (const id of shared[a.team]) if (!a.contacts.some((c) => c.id === id)) a.datalink.push(id);
    }
  }

  private releaseCountermeasures(a: AircraftEntity): void {
    const host = this.host;
    if (!a.input.countermeasures || a.stores.countermeasures <= 0) return;
    if (host.tick - a.lastCountermeasureTick < COUNTERMEASURES.minIntervalS * host.tickRate) return;
    a.stores.countermeasures--;
    a.lastCountermeasureTick = host.tick;
    host.emit({ type: 'countermeasures', aircraftId: a.id });
    const afterburner = a.flight.throttle > AFTERBURNER_THROTTLE;
    for (const m of this.missiles) {
      // Each missile rolls against its own countermeasure: flares for a Dart, chaff for a Lance.
      if (m.targetId !== a.id || !rollDecoy(host.rng, decoyChance(m.spec, afterburner, a.config.sensors.stealth))) continue;
      m.targetId = null;
      host.emit({ type: 'missileDecoyed', missileId: m.id, targetId: a.id });
    }
  }

  private fireCannon(a: AircraftEntity, dt: number): void {
    const spec = CANNONS[a.config.stores.cannon];
    a.firingCannon = a.input.fireCannon && a.stores.cannonRounds >= spec.roundsPerProjectile;
    if (!a.firingCannon) {
      a.cannonAccumulator = TRIGGER_AT_REST;
      return;
    }
    const shots = pullTrigger(a, spec, dt, a.stores.cannonRounds);
    if (shots === 0) return;
    const density = atmosphere(a.flight.pos.y, this.air).density;
    // Online, the shooter saw the others this far in the past: aim and judge the rounds against them there.
    const rewind = Math.min(Math.max(0, Math.round(a.viewDelayTicks)), MAX_REWIND_TICKS);
    const aim = a.isBot ? null : this.playerAim(a, spec, density, rewind);
    for (let i = 0; i < shots; i++) {
      const p = createProjectile(this.nextProjectileId++, a, spec, this.host.rng, density, aim);
      if (!a.isBot) p.reach = PLAYER_GUN_REACH;
      p.rewindTicks = rewind;
      this.projectiles.push(p);
      a.stores.cannonRounds -= spec.roundsPerProjectile;
    }
  }

  /**
   * Where the player's rounds go (revision 20): bent from the nose toward the firing solution of the enemy that the
   * aim assist pulls hardest, or null when no enemy is close enough to the nose.
   */
  private playerAim(a: AircraftEntity, spec: CannonSpec, density: number, rewind: number): Vector3 | null {
    const f = a.flight;
    this.nose.set(0, 0, -1).applyQuaternion(f.quat);
    const drag = (spec.dragPerM * density) / SEA_LEVEL_DENSITY;
    let best = 0;
    for (const t of this.host.aircraftList()) {
      if (!t.alive || t.team === a.team) continue;
      // Where the shooter saw it (online lag compensation, revision 28); where it is offline.
      const seen = rewind > 0 && t.history.sampleAt(Math.min(rewind, t.history.length - 1), this.rewoundPos, this.rewoundVel);
      const tPos = seen ? this.rewoundPos : t.flight.pos;
      const tVel = seen ? this.rewoundVel : t.flight.vel;
      const range = f.pos.distanceTo(tPos);
      if (range > GUN_ASSIST_RANGE_M) continue;
      leadDirection(f.pos, f.vel, tPos, tVel, spec.muzzleSpeedMs, drag, this.lead);
      const pull = gunAssistPull(this.nose, this.lead, range);
      if (pull > best) {
        best = pull;
        this.solution.copy(this.lead);
      }
    }
    return best > 0 ? assistedAim(this.nose, this.solution, best, this.aim) : null;
  }

  private updateSeeker(a: AircraftEntity, dt: number): void {
    const host = this.host;
    // The infrared seeker only runs while the Dart is selected.
    if (a.stores.srm <= 0 || a.input.weapon !== 'srm') {
      if (a.seeker.mode !== 'off') resetSeeker(a.seeker, 'off');
      return;
    }
    const designated = a.targetId === null ? null : (host.getAircraft(a.targetId) ?? null);
    updateSeeker(a.seeker, a, host.aircraftList(), designated, missilesFor(a).dart, host.terrain, dt, host.clouds);
    if (a.seeker.mode !== 'locked' || a.seeker.targetId === null) return;
    const target = host.getAircraft(a.seeker.targetId);
    if (target) {
      target.lastLockedBy = a.id;
      target.lastLockedTick = host.tick;
    }
  }

  /** The Lance's radar lock builds while it is selected (spec §10.3); a lock also counts toward kill credit. */
  private updateRadarLock(a: AircraftEntity, dt: number): void {
    const host = this.host;
    updateRadarLock(a.radarLock, a.config, a.input.weapon === 'mrm' && a.stores.mrm > 0, a.targetId, a.contacts, missilesFor(a).lance, dt);
    if (a.radarLock.mode !== 'locked' || a.radarLock.targetId === null) return;
    const target = host.getAircraft(a.radarLock.targetId);
    if (target) {
      target.lastLockedBy = a.id;
      target.lastLockedTick = host.tick;
    }
  }

  /** One press fires the selected missile, and only with a lock: the seeker's for a Dart, the radar's for a Lance. */
  private launchMissile(a: AircraftEntity): void {
    const host = this.host;
    if (!a.input.fireMissile) return;
    const { dart, lance } = missilesFor(a);
    if (a.input.weapon === 'mrm') {
      const lock = a.radarLock;
      if (lock.mode !== 'locked' || lock.targetId === null || a.stores.mrm <= 0) return;
      if (host.tick - a.lastMrmTick < lance.minLaunchIntervalS * host.tickRate) return;
      const m = launchMissile(this.nextMissileId++, a, lock.targetId, lance);
      this.missiles.push(m);
      a.stores.mrm--;
      a.lastMrmTick = host.tick;
      host.emit({ type: 'missileLaunched', missileId: m.id, shooterId: a.id, targetId: lock.targetId, kind: 'lance' });
      return;
    }
    const s = a.seeker;
    if (s.mode !== 'locked' || s.targetId === null || a.stores.srm <= 0) return;
    if (host.tick - a.lastMissileTick < dart.minLaunchIntervalS * host.tickRate) return;
    const m = launchMissile(this.nextMissileId++, a, s.targetId, dart);
    this.missiles.push(m);
    a.stores.srm--;
    a.lastMissileTick = host.tick;
    host.emit({ type: 'missileLaunched', missileId: m.id, shooterId: a.id, targetId: s.targetId, kind: 'dart' });
  }

  /** RWR (spec §10.3): an enemy radar lock, or a Lance its launcher still guides, sets `lockedByRadar`. */
  private updateWarnings(): void {
    const host = this.host;
    for (const a of host.aircraftList()) a.lockedByRadar = false;
    for (const a of host.aircraftList()) {
      if (!a.alive || a.radarLock.mode !== 'locked' || a.radarLock.targetId === null) continue;
      const t = host.getAircraft(a.radarLock.targetId);
      if (t) t.lockedByRadar = true;
    }
    for (const m of this.missiles) {
      if (m.active || m.targetId === null) continue;
      const t = host.getAircraft(m.targetId);
      if (t) t.lockedByRadar = true;
    }
  }

  /**
   * Whether a missile still has its target this tick. A radar missile in mid-course needs its launcher alive with the
   * target on radar (inside the cone), and goes active within its active range; an active seeker needs the target
   * inside its gimbal limit with a clear line of sight.
   */
  private keepsTarget(m: Missile, target: AircraftEntity | undefined): target is AircraftEntity {
    if (!target || !target.alive) return false;
    if (!m.active) {
      const launcher = this.host.getAircraft(m.ownerId);
      const supported = launcher !== undefined && launcher.alive && launcher.contacts.some((c) => c.id === target.id && c.radar);
      if (!supported) return false;
      if (m.pos.distanceTo(target.flight.pos) > activeRangeM(m, target.config.sensors.stealth)) return true;
      m.active = true;
    }
    if (!withinGimbal(m, target.flight.pos) || !this.host.terrain.lineOfSight(m.pos, target.flight.pos)) return false;
    // An infrared seeker loses a target inside a cloud; radar sees through.
    return m.spec.guidance !== 'ir' || !this.host.clouds.blocks(m.pos, target.flight.pos);
  }

  private dropBomb(a: AircraftEntity): void {
    const host = this.host;
    if (!a.input.dropBomb || a.stores.bombs <= 0) return;
    if (host.tick - a.lastBombTick < BOMB_ANVIL.minReleaseIntervalS * host.tickRate) return;
    const b = releaseBomb(this.nextBombId++, a, BOMB_ANVIL);
    this.bombs.push(b);
    a.stores.bombs--;
    a.lastBombTick = host.tick;
    host.emit({ type: 'bombReleased', bombId: b.id, aircraftId: a.id });
  }

  private stepBombs(dt: number): void {
    const host = this.host;
    const area = host.combatArea;
    const list = this.bombs;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      stepBomb(b, dt, host.wind);
      const landed = hasLanded(b, host.terrain);
      if (landed) this.explodeBomb(b);
      if (landed || b.ageS >= b.spec.maxFallS || Math.hypot(b.pos.x - area.x, b.pos.z - area.z) > area.radiusM) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  /** Bursts where the bomb met the ground and damages every target in reach, unless the match is already over. */
  private explodeBomb(b: Bomb): void {
    const host = this.host;
    const at = surfaceCrossing(b.prevPos, b.pos, host.terrain, this.impact);
    host.emit({ type: 'bombImpact', bombId: b.id, x: at.x, y: at.y, z: at.z });
    if (host.matchOver()) return;
    const owner = host.getAircraft(b.ownerId) ?? null;
    for (const t of host.groundTargetList()) {
      const damage = bombDamage(at.distanceTo(t.pos), b.spec);
      if (damage > 0) host.applyTargetDamage(t, damage, owner);
    }
  }

  private stepProjectiles(dt: number): void {
    const host = this.host;
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      advanceProjectile(p, dt);
      let done = false;
      for (const t of host.aircraftList()) {
        if (!t.alive || t.team === p.team) continue;
        let from = t.prevPos;
        let to = t.flight.pos;
        // Lag compensation: test against the target where the shooter saw it, within its current life only (the
        // history starts again at every spawn).
        const back = Math.min(p.rewindTicks, t.history.length - 2);
        if (back > 0 && t.history.sampleAt(back, this.rewoundPos) && t.history.sampleAt(back + 1, this.rewoundPrev)) {
          from = this.rewoundPrev;
          to = this.rewoundPos;
        }
        if (closestApproach(p.prevPos, p.pos, from, to, this.approach).distance > t.config.damage.hitRadiusM * p.reach) continue;
        host.applyDamage(t, p.damage, host.getAircraft(p.ownerId) ?? null, 'cannon');
        done = true;
        break;
      }
      done ||= p.ageS >= p.lifetimeS || p.pos.y < host.terrain.surfaceAt(p.pos.x, p.pos.z);
      if (done) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private stepMissiles(dt: number): void {
    const host = this.host;
    const list = this.missiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      let target = m.targetId === null ? undefined : host.getAircraft(m.targetId);
      if (m.targetId !== null && !this.keepsTarget(m, target)) {
        m.targetId = null;
        target = undefined;
      }
      stepMissile(m, target ? target.flight : null, atmosphere(m.pos.y, this.air).density, dt);

      let fraction = -1;
      if (isArmed(m)) {
        let nearest = m.spec.fuzeRadiusM;
        for (const t of host.aircraftList()) {
          if (!t.alive || t.team === m.team) continue;
          closestApproach(m.prevPos, m.pos, t.prevPos, t.flight.pos, this.approach);
          if (this.approach.distance <= nearest) {
            nearest = this.approach.distance;
            fraction = this.approach.fraction;
          }
        }
      }
      const nearAircraft = fraction >= 0;
      if (!nearAircraft && m.pos.y >= host.terrain.surfaceAt(m.pos.x, m.pos.z) && !isSpent(m)) continue;
      this.detonate(m, nearAircraft ? fraction : 1, nearAircraft);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  /** Bursts at `fraction` of the missile's last step and damages every enemy in blast range. */
  private detonate(m: Missile, fraction: number, nearAircraft: boolean): void {
    const host = this.host;
    this.burst.lerpVectors(m.prevPos, m.pos, fraction);
    host.emit({ type: 'missileDetonated', missileId: m.id, x: this.burst.x, y: this.burst.y, z: this.burst.z, nearAircraft });
    const owner = host.getAircraft(m.ownerId) ?? null;
    for (const t of host.aircraftList()) {
      if (!t.alive || t.team === m.team) continue;
      this.victimPos.lerpVectors(t.prevPos, t.flight.pos, fraction);
      const damage = blastDamage(this.burst.distanceTo(this.victimPos), m.spec);
      if (damage > 0) host.applyDamage(t, damage, owner, 'missile');
    }
  }
}
