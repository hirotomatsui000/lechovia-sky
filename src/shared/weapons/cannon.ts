import { Vector3 } from 'three';
import type { TeamId } from '../data/aircraft/types.ts';
import type { CannonSpec } from '../data/weapons.ts';
import type { Rng } from '../math/rng.ts';
import { SEA_LEVEL_DENSITY } from '../physics/atmosphere.ts';
import type { FlightState } from '../physics/flight-model.ts';
import { ballisticPosition, ballisticVelocity } from './ballistics.ts';

/** Trigger accumulator value at rest: the first projectile leaves on the first tick the trigger is held. */
export const TRIGGER_AT_REST = 1;

export interface Projectile {
  id: number;
  ownerId: number;
  team: TeamId;
  origin: Vector3;
  /** shooter velocity at launch */
  inherited: Vector3;
  /** unit muzzle direction, including dispersion */
  dir: Vector3;
  muzzleSpeed: number;
  /** drag constant for the air density at launch */
  drag: number;
  damage: number;
  /** hits within the target's hit radius times this (the player's rounds reach further, revision 20) */
  reach: number;
  lifetimeS: number;
  ageS: number;
  pos: Vector3;
  prevPos: Vector3;
  /** lag compensation online: hit tests take targets where they were this many ticks ago (revision 28) */
  rewindTicks: number;
}

export interface Trigger {
  cannonAccumulator: number;
}

/** Number of projectiles to fire this tick while the trigger is held. */
export function pullTrigger(trigger: Trigger, spec: CannonSpec, dt: number, roundsLeft: number): number {
  trigger.cannonAccumulator += spec.projectilesPerS * dt;
  const due = Math.floor(trigger.cannonAccumulator);
  trigger.cannonAccumulator -= due;
  return Math.min(due, Math.floor(roundsLeft / spec.roundsPerProjectile));
}

export interface Shooter {
  id: number;
  team: TeamId;
  flight: FlightState;
}

const right = new Vector3();
const up = new Vector3();

/** A projectile leaving along the shooter's nose, or along `aim` (a unit direction) when given, with random dispersion. */
export function createProjectile(id: number, shooter: Shooter, spec: CannonSpec, rng: Rng, density: number, aim: Vector3 | null = null): Projectile {
  const q = shooter.flight.quat;
  const sigma = spec.dispersionMrad / 1000;
  right.set(1, 0, 0).applyQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q);
  const dir = (aim ? new Vector3().copy(aim) : new Vector3(0, 0, -1).applyQuaternion(q))
    .addScaledVector(right, rng.gaussian() * sigma)
    .addScaledVector(up, rng.gaussian() * sigma)
    .normalize();
  const pos = shooter.flight.pos;
  return {
    id,
    ownerId: shooter.id,
    team: shooter.team,
    origin: pos.clone(),
    inherited: shooter.flight.vel.clone(),
    dir,
    muzzleSpeed: spec.muzzleSpeedMs,
    drag: (spec.dragPerM * density) / SEA_LEVEL_DENSITY,
    damage: spec.damagePerProjectile,
    reach: 1,
    lifetimeS: spec.lifetimeS,
    ageS: 0,
    pos: pos.clone(),
    prevPos: pos.clone(),
    rewindTicks: 0,
  };
}

export function advanceProjectile(p: Projectile, dt: number): void {
  p.prevPos.copy(p.pos);
  p.ageS += dt;
  ballisticPosition(p.origin, p.inherited, p.dir, p.muzzleSpeed, p.drag, p.ageS, p.pos);
}

export function projectileVelocity(p: Projectile, out: Vector3): Vector3 {
  return ballisticVelocity(p.inherited, p.dir, p.muzzleSpeed, p.drag, p.ageS, out);
}
