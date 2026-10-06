import { type Quaternion, Vector3 } from 'three';
import { clamp, DEG } from '../math/units.ts';
import type { ControlInput } from './controls.ts';

/*
 * The pilot's tolerance to G (revision 21). The owner: "G builds → the view goes red and darker → at its darkest the
 * pilot blacks out → the stick stops answering and the jet crashes".
 *
 * The strain is 0 with a clear head. It builds while the load factor is above what a pilot in a G-suit holds for as
 * long as they like, the faster the harder the pull, and drains again below it. The view starts to redden and darken
 * at VISION_LOSS_STRAIN and is black at 1, where the pilot blacks out (G-LOC) and stays out: the jet goes down with
 * them.
 */

/** The load factor a pilot in a G-suit, straining against it, holds for as long as they like. */
export const G_TOLERANCE = 7;
/** A fighter's limit held without a break takes a clear-headed pilot to G-LOC in this many seconds. */
export const G_LOC_AT_9G_S = 10;
/** The strain at which the view starts to redden and darken. */
export const VISION_LOSS_STRAIN = 0.3;
/** Strain shed per second at 1 G: less just under the tolerance, more under negative G. */
const RECOVERY_PER_S = 0.25;
/**
 * A blacked-out pilot slumps against the stick (revision 21): it holds the jet rolled past knife-edge to this bank, and
 * this much pull drags the nose down into a steepening spiral dive. Over the eight fighters it reaches the ground in
 * about 15 s from 3 km and 28 s at most from 8 km (`world/blackout.test.ts` follows one down from a turn at 3 km).
 */
export const SLUMP_BANK_RAD = 150 * DEG;
export const SLUMP_PULL = 0.3;
const SLUMP_MAX_ROLL = 0.6;

/** How fast the strain changes at this load factor, per second. */
export function strainRate(gLoad: number): number {
  if (gLoad > G_TOLERANCE) return ((gLoad - G_TOLERANCE) / (9 - G_TOLERANCE)) ** 1.5 / G_LOC_AT_9G_S;
  return -RECOVERY_PER_S * clamp((G_TOLERANCE - gLoad) / (G_TOLERANCE - 1), 0.2, 1.5);
}

/** The strain after `dt` seconds at this load factor, 0 … 1. */
export function updateStrain(strain: number, gLoad: number, dt: number): number {
  return clamp(strain + strainRate(gLoad) * dt, 0, 1);
}

/** How much of the view the strain has taken: 0 clear … 1 black. */
export function visionLoss(strain: number): number {
  return clamp((strain - VISION_LOSS_STRAIN) / (1 - VISION_LOSS_STRAIN), 0, 1);
}

const right = new Vector3();
const up = new Vector3();

/** An unconscious pilot's hands: slumped on the stick (see SLUMP_BANK_RAD) and off every button; the throttle stays. */
export function slumpedInput(input: ControlInput, attitude: Quaternion): ControlInput {
  right.set(1, 0, 0).applyQuaternion(attitude);
  up.set(0, 1, 0).applyQuaternion(attitude);
  // Bank, positive with the right wing down; the jet goes over toward whichever wing is low already.
  const bank = Math.atan2(-right.y, up.y);
  const target = bank >= 0 ? SLUMP_BANK_RAD : -SLUMP_BANK_RAD;
  input.pitch = SLUMP_PULL;
  input.roll = clamp(2 * (target - bank), -SLUMP_MAX_ROLL, SLUMP_MAX_ROLL);
  input.yaw = 0;
  input.airbrake = false;
  input.fireCannon = false;
  input.fireMissile = false;
  input.countermeasures = false;
  input.dropBomb = false;
  input.cycleTarget = false;
  input.helmetSight = false;
  input.lookYaw = 0;
  input.lookPitch = 0;
  return input;
}
