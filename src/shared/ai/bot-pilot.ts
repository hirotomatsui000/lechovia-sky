import { Vector3 } from 'three';
import { BOMB_ANVIL, CANNONS, COUNTERMEASURES } from '../data/weapons.ts';
import { timeToImpact } from '../map/ground-proximity.ts';
import type { Terrain } from '../map/terrain.ts';
import { Rng } from '../math/rng.ts';
import { clamp, DEG } from '../math/units.ts';
import { cornerSpeed } from '../physics/aero.ts';
import { type AirData, atmosphere } from '../physics/atmosphere.ts';
import type { ControlInput } from '../physics/controls.ts';
import type { FlightState } from '../physics/flight-model.ts';
import { incomingMissileWarning, type MissileWarning } from '../targeting/warnings.ts';
import type { SteadyWind } from '../physics/wind.ts';
import { predictImpact } from '../weapons/bomb.ts';
import { leadDirection } from '../weapons/lead.ts';
import type { Missile } from '../weapons/missile.ts';
import type { BotGoal } from '../modes/mode.ts';
import type { AircraftEntity } from '../world/entities.ts';
import { type GroundTarget, hitsToDestroy } from '../world/ground-targets.ts';
import type { DifficultyProfile } from './difficulty.ts';
import { steerToward, type SteerOutput } from './steering.ts';

/** What a bot may read from the World. */
export interface BotWorld {
  readonly tick: number;
  readonly tickRate: number;
  readonly terrain: Terrain;
  readonly combatArea: { readonly x: number; readonly z: number; readonly radiusM: number };
  aircraftList(): Iterable<AircraftEntity>;
  getAircraft(id: number): AircraftEntity | undefined;
  missileList(): Iterable<Missile>;
  groundTargetList(): readonly GroundTarget[];
  /** where the mode wants this bot when it has nothing near to fight (M5); null or absent = patrol */
  botGoal?(bot: AircraftEntity): BotGoal | null;
  /** bomb runs allow for the wind (revision 16) */
  readonly wind: SteadyWind;
}

const GROUND_HORIZON_S = 5;
const GROUND_MARGIN_M = 150;
const RECOVERY_CLIMB_RAD = 30 * DEG;
const BOUNDARY_FRACTION = 0.9;
const CEILING_M = 14000;
const PATROL_ALTITUDE_M = 4000;
const MIN_ENGAGE_ALTITUDE_M = 2500;
const SRM_MIN_RANGE_M = 500;
const SRM_MAX_RANGE_M = 7000;
/** Rough speed the missile gains over the launcher, for estimating time to intercept. */
const SRM_SPEED_GAIN_MS = 450;
const SRM_MAX_INTERCEPT_S = 12;
const MISSILES_PER_TARGET_INTERVAL_S = 5;
/** Lances are for targets beyond Dart range, out to where the missile still arrives with energy (spec §10.2). */
const MRM_MIN_RANGE_M = 6000;
const MRM_MAX_RANGE_M = 25000;
const MRM_SPEED_GAIN_MS = 450;
const MRM_MAX_INTERCEPT_S = 40;
const AIM_NOISE_HOLD_S = 0.5;
const LEAD_PURSUIT_RANGE_M = 2500;
const DEFEND_DIVE_ABOVE_M = 1500;
/** Flares only help near the end, so save them until the missile is this close in time. */
const FLARES_FROM_S = 3;
/**
 * G management (revision 21): past this strain the pilot eases the pull so the G does not black them out, unless
 * they are breaking from a missile or pulling away from the ground, when only the last stretch before G-LOC stops them.
 * Chosen with the balance tournament (spec §9.4): easing earlier or later tipped some pairings out of 35–65%.
 */
export const STRAIN_EASE_FROM = 0.55;
export const STRAIN_EASE_FROM_URGENT = 0.9;
/** The most stick an easing pilot uses: about 5 G, under the tolerance. */
export const EASED_PULL = 0.5;
/** A break this long before impact beats the missile's response lag (spec §10.2); slower pilots see it late. */
const IDEAL_BREAK_S = 2;
/** Even a badly misjudged missile still looks like it is coming. */
const MIN_IMPACT_JUDGEMENT = 0.3;
/** Break away from a target this close that is still closing fast, instead of flying into it. */
const COLLISION_BREAK_RANGE_M = 350;
const COLLISION_BREAK_CLOSURE_MS = 100;
/**
 * A Sentinel is slow and 30 m across: a bot creeping up behind it at low closure flew into it (about 1.5 times a
 * match). Inside this range any closure breaks off (revision 19).
 */
const SUPPORT_BREAK_RANGE_M = 200;
/** Strike (spec §14): bombing runs fly this high above the target, just below afterburner. */
const RUN_AGL_M = 1500;
const RUN_THROTTLE = 0.88;
/** The throw (how far ahead the bombs land) is re-predicted this often and carried along the track in between. */
const THROW_REFRESH_S = 0.25;
const THROW_PREDICT_DT_S = 1 / 20;
/** Close to the release point the throw is re-predicted every tick, at the World's own step. */
const FINE_THROW_ALONG_M = 1500;
/** Sideways miss that gets the strongest correction on the final run. */
const FINAL_RUN_CORRECTION_M = 500;
/** After a pass, fly on this far beyond the throw before turning back, so the next run can line up. */
const REATTACK_DISTANCE_M = 5000;
const STICK_SIZE = 2;
/**
 * An attacker turns to fight a defender only this close behind it; farther out it presses the run. Bot-vs-bot turning
 * fights rarely end in a kill, so fighting from farther out would run out the clock (the 35–65% balance check, §19).
 */
const CHASER_RANGE_M = 600;
const CHASER_TAIL_COS = Math.cos(60 * DEG);
/** A defender intercepts attackers this close to a standing target, and otherwise orbits over the targets. */
const DEFENDED_RADIUS_M = 15000;
const ORBIT_RADIUS_M = 5000;
const ORBIT_ALTITUDE_M = 4000;
/** With a mode goal (M5) a bot fights only enemies this close and otherwise heads for its goal. */
const GOAL_ENGAGE_RANGE_M = 12000;
/** ...but takes on an enemy support aircraft (a Sentinel) out to Lance range. */
const SUPPORT_ENGAGE_RANGE_M = MRM_MAX_RANGE_M;
/** Enemy fighters this far beyond the goal's radius are left alone, unless they sit on the bot's tail. */
const GOAL_FIGHT_MARGIN_M = 4000;
const TAIL_THREAT_RANGE_M = 2500;
const UP = new Vector3(0, 1, 0);

/** Bot seed per aircraft, so bots differ but stay deterministic for a World seed. */
export function botSeed(worldSeed: number, aircraftId: number): number {
  return (Math.imul(worldSeed, 0x9e3779b1) ^ Math.imul(aircraftId, 0x85ebca6b)) >>> 0;
}

function hasStandingTarget(world: BotWorld): boolean {
  for (const t of world.groundTargetList()) if (!t.destroyed) return true;
  return false;
}

/**
 * AI pilot (spec §14). It sees the world one reaction time late and flies through the same ControlInput as a human,
 * so it obeys the same physics. Priorities: avoid the ground, stay in the area, defend against missiles, fight,
 * patrol.
 */
export class BotPilot {
  readonly profile: DifficultyProfile;
  private readonly rng: Rng;
  private aimYaw = 0;
  private aimPitch = 0;
  private aimHoldUntilTick = 0;
  private nextFlareDecisionTick = 0;
  /** per inbound missile: how far off this pilot's sense of its time to impact is (a factor) */
  private readonly impactJudgement = new Map<number, number>();
  private readonly lastLaunchTick = new Map<number, number>();
  private readonly steer: SteerOutput = { pitch: 0, roll: 0, yaw: 0 };
  private readonly air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
  private readonly desired = new Vector3();
  private readonly tPos = new Vector3();
  private readonly tVel = new Vector3();
  private readonly lead = new Vector3();
  private readonly aim = new Vector3();
  private readonly toTarget = new Vector3();
  private readonly goal = new Vector3();
  private readonly rel = new Vector3();
  private readonly nose = new Vector3();
  private readonly right = new Vector3();
  private readonly upAxis = new Vector3();
  private lastSpawnGen = -1;
  /** this tick's stick is a missile break or a pull away from the ground (G management, revision 21) */
  private urgent = false;
  /** a support aircraft the bot wants designated: it presses "next target" next tick */
  private cycleTo: number | null = null;
  private runTargetId: string | null = null;
  private stickBombs = 0;
  /** a stick has gone; the next one waits until the jet has come around for a new pass */
  private awaitingPass = false;
  private stickTick = -1e9;
  private throwAlong = 0;
  private throwRefreshTick = 0;
  /** the last tick with a fine throw prediction, and the target's along-track lead over the impact point then */
  private fineTick = -1;
  private fineAlong = 0;
  /** this pilot's error for the current stick, horizontal meters */
  private readonly bombAim = new Vector3();
  private readonly impact = new Vector3();
  private readonly miss = new Vector3();
  private readonly track = new Vector3();

  constructor(profile: DifficultyProfile, seed: number) {
    this.profile = profile;
    this.rng = new Rng(seed);
  }

  think(world: BotWorld, self: AircraftEntity, out: ControlInput): ControlInput {
    this.urgent = false;
    this.decide(world, self, out);
    if (self.gStrain > (this.urgent ? STRAIN_EASE_FROM_URGENT : STRAIN_EASE_FROM)) out.pitch = Math.min(out.pitch, EASED_PULL);
    return out;
  }

  private decide(world: BotWorld, self: AircraftEntity, out: ControlInput): void {
    out.airbrake = false;
    out.fireCannon = false;
    out.fireMissile = false;
    out.countermeasures = false;
    out.dropBomb = false;
    out.cycleTarget = false;
    out.weapon = 'srm';
    out.helmetSight = false;
    out.lookYaw = 0;
    out.lookPitch = 0;
    // Stepping the designation toward a chosen Sentinel, one press per tick until it lands.
    if (this.cycleTo !== null) {
      const want = this.cycleTo;
      this.cycleTo = null;
      if (self.targetId !== want && self.contacts.some((c) => c.id === want)) out.cycleTarget = true;
    }
    if (self.spawnGen !== this.lastSpawnGen) {
      // A new aircraft starts a fresh bombing run.
      this.lastSpawnGen = self.spawnGen;
      this.runTargetId = null;
    }
    const reactionTicks = Math.round(this.profile.reactionS * world.tickRate);
    if (world.tick >= this.aimHoldUntilTick) {
      this.aimYaw = this.rng.gaussian() * this.profile.aimNoiseDeg * DEG;
      this.aimPitch = this.rng.gaussian() * this.profile.aimNoiseDeg * DEG;
      this.aimHoldUntilTick = world.tick + Math.round(AIM_NOISE_HOLD_S * world.tickRate);
    }
    const warning = incomingMissileWarning(self, world.missileList());
    const impactS = warning ? warning.timeToImpactS * this.judgeImpact(warning.missileId) : Infinity;
    if (!warning) this.impactJudgement.clear();
    out.countermeasures = impactS <= FLARES_FROM_S && this.decideFlares(world, self);

    if (this.avoidGround(world, self.flight, out)) {
      this.urgent = true;
      return;
    }
    if (this.returnToArea(world, self.flight, out)) return;
    if (warning && impactS <= IDEAL_BREAK_S - this.profile.reactionS && this.defend(world, self.flight, warning, out)) {
      this.urgent = true;
      return;
    }
    if (hasStandingTarget(world)) {
      if (self.bombLoad > 0) {
        if (this.attack(world, self, reactionTicks, out)) return;
      } else {
        this.defendTargets(world, self, reactionTicks, out);
        return;
      }
    }
    const goal = world.botGoal?.(self) ?? null;
    if (goal) {
      const target = this.goalTarget(world, self, goal, reactionTicks);
      if (target) this.engage(world, self, target, out);
      else this.holdGoal(self, goal, out);
      return;
    }
    const target = this.perceiveTarget(world, self, reactionTicks);
    if (target) this.engage(world, self, target, out);
    else this.patrol(world, self, reactionTicks, out);
  }

  /**
   * With a mode goal (M5): an enemy Sentinel on our contacts within Lance range comes first; then the nearest enemy
   * fighter that is near the goal (or right on our tail), so fights happen in the zone or round the escorted Sentinel
   * instead of dragging the bot away. The bot steps its designation onto a chosen Sentinel, so its missiles lock the
   * Sentinel rather than whatever is nearest the nose.
   */
  private goalTarget(world: BotWorld, self: AircraftEntity, goal: BotGoal, reactionTicks: number): AircraftEntity | null {
    const f = self.flight;
    this.track.copy(f.vel).normalize();
    let target: AircraftEntity | null = null;
    let best = Infinity;
    for (const c of self.contacts) {
      const t = world.getAircraft(c.id);
      if (!t || !t.alive || t.team === self.team) continue;
      let score = Infinity;
      if (t.support) {
        // A Sentinel ranks ahead of every fighter: its range counts as a quarter.
        if (c.rangeM <= SUPPORT_ENGAGE_RANGE_M) score = c.rangeM / 4;
      } else if (c.rangeM <= GOAL_ENGAGE_RANGE_M) {
        const p = t.flight.pos;
        const nearGoal = Math.hypot(p.x - goal.x, p.z - goal.z) <= goal.radiusM + GOAL_FIGHT_MARGIN_M;
        this.rel.subVectors(p, f.pos);
        const onTail = c.rangeM <= TAIL_THREAT_RANGE_M && -this.rel.dot(this.track) / Math.max(c.rangeM, 1) >= CHASER_TAIL_COS;
        if (nearGoal || onTail) score = c.rangeM;
      }
      if (score < best) {
        best = score;
        target = t;
      }
    }
    if (!target || !target.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) return null;
    if (target.support && self.targetId !== target.id) this.cycleTo = target.id;
    return target;
  }

  /** Flies to the goal and circles there, at the goal's height. */
  private holdGoal(self: AircraftEntity, goal: BotGoal, out: ControlInput): void {
    const f = self.flight;
    this.goal.set(goal.x, goal.altitudeM, goal.z);
    const d = Math.hypot(goal.x - f.pos.x, goal.z - f.pos.z);
    if (d > goal.radiusM * 1.2) {
      this.desired.set(goal.x - f.pos.x, 0, goal.z - f.pos.z).normalize();
      this.desired.setY(clamp((goal.altitudeM - f.pos.y) / 3000, -0.35, 0.35)).normalize();
      this.fly(f, this.desired, Math.min(this.profile.maxPull, 0.6), 0.9, out);
      return;
    }
    this.circle(f, this.goal, goal.radiusM * 0.8, goal.altitudeM, out);
  }

  private fly(f: FlightState, dir: Vector3, maxPull: number, throttle: number, out: ControlInput): void {
    steerToward(f, dir, { maxPull }, this.steer);
    out.pitch = this.steer.pitch;
    out.roll = this.steer.roll;
    out.yaw = this.steer.yaw;
    out.throttle = throttle;
  }

  /** Drawn once per missile: a pilot who misreads one missile's closure keeps misreading it. */
  private judgeImpact(missileId: number): number {
    let factor = this.impactJudgement.get(missileId);
    if (factor === undefined) {
      factor = Math.max(MIN_IMPACT_JUDGEMENT, 1 + this.rng.gaussian() * this.profile.impactJudgementError);
      this.impactJudgement.set(missileId, factor);
    }
    return factor;
  }

  private decideFlares(world: BotWorld, self: AircraftEntity): boolean {
    if (self.stores.countermeasures <= 0 || world.tick < this.nextFlareDecisionTick) return false;
    this.nextFlareDecisionTick = world.tick + Math.ceil(COUNTERMEASURES.minIntervalS * world.tickRate);
    return this.rng.next() < this.profile.countermeasureDiscipline;
  }

  private avoidGround(world: BotWorld, f: FlightState, out: ControlInput): boolean {
    if (timeToImpact(f, world.terrain, GROUND_HORIZON_S, 0.25, GROUND_MARGIN_M) === null) return false;
    this.desired.set(f.vel.x, 0, f.vel.z);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1);
    this.desired.normalize().setY(Math.tan(RECOVERY_CLIMB_RAD)).normalize();
    this.fly(f, this.desired, 1, 1, out);
    return true;
  }

  private returnToArea(world: BotWorld, f: FlightState, out: ControlInput): boolean {
    const c = world.combatArea;
    const dx = f.pos.x - c.x;
    const dz = f.pos.z - c.z;
    const leaving = dx * dx + dz * dz > (BOUNDARY_FRACTION * c.radiusM) ** 2 && dx * f.vel.x + dz * f.vel.z > 0;
    const high = f.pos.y > CEILING_M;
    if (!leaving && !high) return false;
    this.desired.set(-dx, 0, -dz);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1);
    this.desired.normalize().setY(high ? -0.3 : 0).normalize();
    this.fly(f, this.desired, this.profile.maxPull, 0.9, out);
    return true;
  }

  /** Turns to put the missile on the beam and pulls as hard as this pilot dares; the flares are decided separately. */
  private defend(world: BotWorld, f: FlightState, warning: MissileWarning, out: ControlInput): boolean {
    let missile: Missile | null = null;
    for (const m of world.missileList()) if (m.id === warning.missileId) missile = m;
    if (!missile) return false;
    this.rel.subVectors(f.pos, missile.pos).setY(0);
    this.desired.crossVectors(this.rel, UP);
    if (this.desired.lengthSq() < 1e-6) this.desired.set(1, 0, 0);
    this.desired.normalize();
    if (this.desired.dot(f.vel) < 0) this.desired.negate();
    if (f.pos.y - world.terrain.surfaceAt(f.pos.x, f.pos.z) > DEFEND_DIVE_ABOVE_M) this.desired.setY(-0.25).normalize();
    // Disciplined pilots come off afterburner, which makes flares twice as effective.
    this.fly(f, this.desired, this.profile.maxPull, this.profile.countermeasureDiscipline >= 0.8 ? 0.85 : 1, out);
    return true;
  }

  /** The designated (or nearest) enemy contact, seen one reaction time late. */
  private perceiveTarget(world: BotWorld, self: AircraftEntity, reactionTicks: number): AircraftEntity | null {
    let target = self.targetId === null ? undefined : world.getAircraft(self.targetId);
    if (!target || !target.alive || target.team === self.team) {
      target = undefined;
      let nearest = Infinity;
      for (const c of self.contacts) {
        const t = world.getAircraft(c.id);
        if (t && t.alive && c.rangeM < nearest) {
          nearest = c.rangeM;
          target = t;
        }
      }
    }
    if (!target || !target.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) return null;
    return target;
  }

  private engage(world: BotWorld, self: AircraftEntity, target: AircraftEntity, out: ControlInput): void {
    const f = self.flight;
    const p = this.profile;
    const air = atmosphere(f.pos.y, this.air);
    const cannon = CANNONS[self.config.stores.cannon];
    const range = f.pos.distanceTo(this.tPos);
    leadDirection(f.pos, f.vel, this.tPos, this.tVel, cannon.muzzleSpeedMs, cannon.dragPerM * air.sigma, this.lead);
    this.right.crossVectors(this.lead, UP);
    if (this.right.lengthSq() < 1e-9) this.right.set(1, 0, 0);
    this.right.normalize();
    this.upAxis.crossVectors(this.right, this.lead).normalize();
    this.aim.copy(this.lead).addScaledVector(this.right, Math.tan(this.aimYaw)).addScaledVector(this.upAxis, Math.tan(this.aimPitch)).normalize();
    this.toTarget.subVectors(this.tPos, f.pos).normalize();
    const closure = -this.rel.subVectors(this.tVel, f.vel).dot(this.toTarget);
    out.airbrake = range < 600 && closure > 80;
    if ((range < COLLISION_BREAK_RANGE_M && closure > COLLISION_BREAK_CLOSURE_MS) || (target.support && range < SUPPORT_BREAK_RANGE_M && closure > 0)) {
      this.desired.copy(f.vel).normalize().sub(this.toTarget).normalize();
      this.fly(f, this.desired, 1, 1, out);
      return;
    }
    // Far away: pure pursuit, but don't follow a low target down toward the ground.
    this.desired.copy(this.toTarget);
    if (this.tPos.y < MIN_ENGAGE_ALTITUDE_M) this.desired.setY(Math.max(this.desired.y, 0)).normalize();
    // Below corner speed, ease the pull instead of bleeding more energy.
    const corner = cornerSpeed(self.config.physics, air.density);
    const energyPull = f.airspeed >= corner ? 1 : clamp((f.airspeed - 0.5 * corner) / (0.5 * corner), 0.4, 1);
    this.fly(f, range < LEAD_PURSUIT_RANGE_M ? this.aim : this.desired, p.maxPull * energyPull, range < 1000 && closure > 40 ? 0.6 : 1, out);

    this.nose.set(0, 0, -1).applyQuaternion(f.quat);
    out.fireCannon = range <= p.gunRangeM && self.stores.cannonRounds > 0 && this.nose.angleTo(this.aim) <= p.fireThresholdDeg * DEG;

    // Beyond Dart range a jet with Lances left fights with them (M3). Pursuit keeps the target in the radar cone,
    // which the Lance needs until it goes active.
    const onRadar = self.contacts.some((c) => c.id === target.id && c.radar);
    if (self.stores.mrm > 0 && onRadar && range > MRM_MIN_RANGE_M) {
      out.weapon = 'mrm';
      this.fireLance(world, self, target, range, closure, out);
      return;
    }

    const s = self.seeker;
    if (s.mode !== 'locked' || s.targetId !== target.id || self.stores.srm <= 0) return;
    if (range < SRM_MIN_RANGE_M || range > SRM_MAX_RANGE_M) return;
    if (range / Math.max(closure + SRM_SPEED_GAIN_MS, 1) > SRM_MAX_INTERCEPT_S) return;
    const last = this.lastLaunchTick.get(target.id);
    if (last !== undefined && world.tick - last < MISSILES_PER_TARGET_INTERVAL_S * world.tickRate) return;
    out.fireMissile = true;
    this.lastLaunchTick.set(target.id, world.tick);
  }

  /** Fires a Lance on a radar lock when it can reach the target, one at a time per target. */
  private fireLance(world: BotWorld, self: AircraftEntity, target: AircraftEntity, range: number, closure: number, out: ControlInput): void {
    const lock = self.radarLock;
    if (lock.mode !== 'locked' || lock.targetId !== target.id) return;
    if (range > MRM_MAX_RANGE_M || range / Math.max(closure + MRM_SPEED_GAIN_MS, 1) > MRM_MAX_INTERCEPT_S) return;
    for (const m of world.missileList()) if (m.ownerId === self.id && m.targetId === target.id) return;
    out.fireMissile = true;
  }

  /** Strike attacker: fight a defender on our tail, otherwise bomb (spec §14). False when there is nothing to bomb with. */
  private attack(world: BotWorld, self: AircraftEntity, reactionTicks: number, out: ControlInput): boolean {
    const chaser = this.chaser(world, self, reactionTicks);
    if (chaser) {
      this.engage(world, self, chaser, out);
      return true;
    }
    if (self.stores.bombs <= 0) return false;
    const t = this.pickGroundTarget(world, self);
    if (!t) return false;
    this.bombRun(world, self, t, out);
    return true;
  }

  /** An enemy within 3 km and 60° of our tail; leaves tPos/tVel on it for engage(). */
  private chaser(world: BotWorld, self: AircraftEntity, reactionTicks: number): AircraftEntity | null {
    const f = self.flight;
    this.track.copy(f.vel).normalize();
    for (const a of world.aircraftList()) {
      if (!a.alive || a.team === self.team) continue;
      if (!a.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) continue;
      this.rel.subVectors(this.tPos, f.pos);
      const d = this.rel.length();
      if (d < 1 || d > CHASER_RANGE_M) continue;
      if (-this.rel.dot(this.track) / d >= CHASER_TAIL_COS) return a;
    }
    return null;
  }

  /** The standing target that needs the fewest more hits, nearest first. */
  private pickGroundTarget(world: BotWorld, self: AircraftEntity): GroundTarget | null {
    const p = self.flight.pos;
    let best: GroundTarget | null = null;
    let bestHits = Infinity;
    let bestDistance = Infinity;
    for (const t of world.groundTargetList()) {
      if (t.destroyed) continue;
      const hits = hitsToDestroy(t, BOMB_ANVIL.damage);
      const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
      if (hits < bestHits || (hits === bestHits && d < bestDistance)) {
        best = t;
        bestHits = hits;
        bestDistance = d;
      }
    }
    return best;
  }

  /**
   * Steers so the predicted impact point runs across the target and drops a two-bomb stick that straddles it, then
   * flies on and comes back for another pass (spec §14).
   */
  private bombRun(world: BotWorld, self: AircraftEntity, t: GroundTarget, out: ControlInput): void {
    const f = self.flight;
    if (t.id !== this.runTargetId) {
      this.runTargetId = t.id;
      this.throwRefreshTick = 0;
      this.fineTick = -1;
      this.newStick();
    }
    this.track.set(f.vel.x, 0, f.vel.z);
    if (this.track.lengthSq() < 1) this.track.set(0, 0, -1).applyQuaternion(f.quat).setY(0);
    this.track.normalize();
    const r = BOMB_ANVIL.fullDamageRadiusM;
    if (world.tick >= this.throwRefreshTick) this.updateThrow(world, f, false);
    const interval = Math.ceil(BOMB_ANVIL.minReleaseIntervalS * world.tickRate);
    let along = this.aimAt(t, f);
    // How far apart the two bombs of a stick land: roughly the ground speed times the interval, or, close to the
    // release point, how fast the predicted impact point itself sweeps forward (a slight climb stretches the stick).
    let spacing = Math.hypot(f.vel.x, f.vel.z) * (interval / world.tickRate);
    const finalRun = along < FINE_THROW_ALONG_M && along > -r;
    if (finalRun) {
      this.updateThrow(world, f, true);
      along = this.aimAt(t, f);
      if (this.fineTick === world.tick - 1) spacing = (this.fineAlong - along) * interval;
      this.fineTick = world.tick;
      this.fineAlong = along;
    }
    const ex = this.miss.x;
    const ez = this.miss.z;
    if (this.awaitingPass && along > FINE_THROW_ALONG_M) this.newStick();
    if (this.stickBombs > 0 && this.stickBombs < STICK_SIZE) {
      if (world.tick - this.stickTick >= interval) this.releaseInStick(world, out);
    } else if (this.stickBombs === 0 && !this.awaitingPass) {
      // Center the stick on the target: the first bomb half a spacing short, the second half a spacing beyond.
      const cross = Math.abs(ex * this.track.z - ez * this.track.x);
      if (cross <= r && along <= 0.5 * spacing && along > -r) this.releaseInStick(world, out);
    }
    const passed = along < -r;
    if (this.stickBombs >= STICK_SIZE) {
      this.stickBombs = 0;
      this.awaitingPass = true;
    }
    const distance = Math.hypot(t.pos.x - f.pos.x, t.pos.z - f.pos.z);
    const steady = finalRun || (this.stickBombs > 0 && this.stickBombs < STICK_SIZE);
    if (passed && distance < this.throwAlong + REATTACK_DISTANCE_M) {
      this.desired.copy(this.track);
    } else if (steady) {
      // On the final run keep the track and only ease sideways onto the target line: turning toward the target as the
      // impact point crosses it would swing the jet around in the middle of the stick.
      const cross = ex * -this.track.z + ez * this.track.x;
      this.desired.set(-this.track.z, 0, this.track.x).multiplyScalar(clamp(cross / FINAL_RUN_CORRECTION_M, -0.2, 0.2)).add(this.track).normalize();
    } else {
      this.desired.set(ex, 0, ez);
      if (this.desired.lengthSq() < 1) this.desired.copy(this.track);
      this.desired.normalize();
    }
    // Hold level flight through the final run and the stick: any climb or dive there stretches or shortens the throw.
    this.desired.setY(steady ? 0 : clamp((t.pos.y + RUN_AGL_M - f.pos.y) / 3000, -0.35, 0.35)).normalize();
    this.fly(f, this.desired, Math.min(this.profile.maxPull, 0.6), RUN_THROTTLE, out);
  }

  /** Re-predicts how far ahead along the track a bomb released now would land. */
  private updateThrow(world: BotWorld, f: FlightState, fine: boolean): void {
    this.throwRefreshTick = world.tick + Math.round(THROW_REFRESH_S * world.tickRate);
    const dt = fine ? 1 / world.tickRate : THROW_PREDICT_DT_S;
    const landing = predictImpact(f.pos, f.vel, BOMB_ANVIL, world.terrain, dt, this.impact, world.wind);
    this.throwAlong = landing ? this.rel.subVectors(landing, f.pos).setY(0).dot(this.track) : 0;
  }

  /**
   * Where this pilot believes the bombs would land now (the throw carried along the track, off by the pilot's
   * error); leaves the horizontal miss to the target in `miss` and returns its along-track part (+ = target ahead).
   */
  private aimAt(t: GroundTarget, f: FlightState): number {
    this.impact.copy(f.pos).addScaledVector(this.track, this.throwAlong).add(this.bombAim);
    this.miss.set(t.pos.x - this.impact.x, 0, t.pos.z - this.impact.z);
    return this.miss.dot(this.track);
  }

  private releaseInStick(world: BotWorld, out: ControlInput): void {
    out.dropBomb = true;
    this.stickBombs++;
    this.stickTick = world.tick;
  }

  /** A fresh stick, with a new error drawn from this pilot's bomb accuracy (RMS split over two axes). */
  private newStick(): void {
    this.stickBombs = 0;
    this.awaitingPass = false;
    const sigma = this.profile.bombErrorM / Math.SQRT2;
    this.bombAim.set(this.rng.gaussian() * sigma, 0, this.rng.gaussian() * sigma);
  }

  /**
   * Strike defender: intercept the attacker nearest to a standing target, else orbit (spec §14). It breaks off once a
   * fight drifts more than 15 km from every target, so a turning fight far from the targets cannot run out the clock.
   */
  private defendTargets(world: BotWorld, self: AircraftEntity, reactionTicks: number, out: ControlInput): void {
    let threat: AircraftEntity | null = null;
    let threatScore = DEFENDED_RADIUS_M;
    for (const a of world.aircraftList()) {
      if (!a.alive || a.team === self.team) continue;
      if (!a.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) continue;
      let score = Infinity;
      for (const t of world.groundTargetList()) {
        if (!t.destroyed) score = Math.min(score, Math.hypot(this.tPos.x - t.pos.x, this.tPos.z - t.pos.z));
      }
      if (score < threatScore) {
        threatScore = score;
        threat = a;
      }
    }
    if (threat && threat.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) {
      this.engage(world, self, threat, out);
      return;
    }
    this.orbitTargets(world, self, out);
  }

  /** Circles the standing targets 5 km out at 4,000 m. */
  private orbitTargets(world: BotWorld, self: AircraftEntity, out: ControlInput): void {
    const f = self.flight;
    let n = 0;
    this.goal.set(0, 0, 0);
    for (const t of world.groundTargetList()) {
      if (t.destroyed) continue;
      this.goal.add(t.pos);
      n++;
    }
    this.goal.divideScalar(Math.max(n, 1));
    this.circle(f, this.goal, ORBIT_RADIUS_M, ORBIT_ALTITUDE_M, out);
  }

  /** A right-hand circle of `radiusM` round `center` at `altitudeM`. */
  private circle(f: FlightState, center: Vector3, radiusM: number, altitudeM: number, out: ControlInput): void {
    this.rel.subVectors(f.pos, center).setY(0);
    const r = Math.max(this.rel.length(), 1);
    const lean = clamp((r - radiusM) / radiusM, -1, 1);
    this.desired.set(-this.rel.z / r, 0, this.rel.x / r).addScaledVector(this.rel, -lean / r).normalize();
    this.desired.setY(clamp((altitudeM - f.pos.y) / 3000, -0.35, 0.35)).normalize();
    this.fly(f, this.desired, Math.min(this.profile.maxPull, 0.6), 0.85, out);
  }

  /** Heads for the nearest enemy (where it was last heard of) or the middle of the area. */
  private patrol(world: BotWorld, self: AircraftEntity, reactionTicks: number, out: ControlInput): void {
    const f = self.flight;
    let nearest = Infinity;
    for (const a of world.aircraftList()) {
      if (!a.alive || a.team === self.team) continue;
      if (!a.history.perceive(reactionTicks, 1 / world.tickRate, this.tPos, this.tVel)) continue;
      const d = this.tPos.distanceTo(f.pos);
      if (d < nearest) {
        nearest = d;
        this.goal.copy(this.tPos);
      }
    }
    if (nearest === Infinity) this.goal.set(world.combatArea.x, PATROL_ALTITUDE_M, world.combatArea.z);
    const goalAltitude = Math.max(this.goal.y, MIN_ENGAGE_ALTITUDE_M);
    this.desired.subVectors(this.goal, f.pos).setY(0);
    if (this.desired.lengthSq() < 1) this.desired.set(0, 0, -1).applyQuaternion(f.quat).setY(0);
    this.desired.normalize().setY(clamp((goalAltitude - f.pos.y) / 3000, -0.35, 0.35)).normalize();
    this.fly(f, this.desired, Math.min(this.profile.maxPull, 0.6), 0.9, out);
  }
}
