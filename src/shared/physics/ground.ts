import { Euler, Vector3 } from 'three';
import type { AircraftPhysics } from '../data/aircraft/types.ts';
import { approach, clamp, DEG, G0, lerp, moveToward, smoothstep } from '../math/units.ts';
import { dragCoefficient, fuelFlowKgS, liftCoefficient, thrustNewtons } from './aero.ts';
import { type AirData, atmosphere } from './atmosphere.ts';
import type { ControlInput } from './controls.ts';
import type { FlightEnv, FlightState } from './flight-model.ts';

/** Height of the aircraft's reference point above the runway when the gear is unloaded (spec §8, M4). */
export const GEAR_HEIGHT_M = 2.5;
/** The gear retracts by itself once the jet is this high above the airfield, or has left it, and comes down by itself on
 * approach to a friendly one (revision 22); either way it takes this long. */
export const GEAR_RETRACT_ABOVE_M = 30;
export const GEAR_RETRACT_S = 4;
/** Extra drag coefficient of the extended gear. */
export const GEAR_DRAG = 0.02;
export const ROLLING_FRICTION = 0.025;
/** Wheel brakes (the airbrake key on the ground); they also take the engines to idle (revision 22). */
export const BRAKE_FRICTION = 0.35;
/** Nose-up limit on the wheels before the tail would strike. */
export const ROTATION_LIMIT_RAD = 14 * DEG;
/** Dynamic pressure at which the elevator can lift the nose all the way (about 155 kt at sea level). */
const ROTATION_FULL_Q_PA = 4000;
const PITCH_TAU_S = 0.5;
const PITCH_RATE_MAX = 6 * DEG;
/** Nose-wheel steering at taxi speed, rudder-only steering fast. */
const STEER_SLOW = 25 * DEG;
const STEER_FAST = 4 * DEG;
/** Gear springs: natural frequency and damping ratio; they hold the weight about 12 cm compressed. */
const SPRING_OMEGA = 9;
const SPRING_ZETA = 0.8;
/** Wheels this far clear of the runway while climbing: the jet is flying. */
const LIFTOFF_CLEARANCE_M = 0.5;
/**
 * A touchdown on the gear is gentle enough below these (else the jet hits the ground and crashes). Revision 22 made
 * landing part of the game and loosened them from 3 m/s, 10° and −2…15°: a 3° approach at 90 m/s sinks at 4.7 m/s.
 */
export const TOUCHDOWN_MAX_SINK_MS = 5;
export const TOUCHDOWN_MAX_BANK = 15 * DEG;
const TOUCHDOWN_PITCH = [-3 * DEG, 16 * DEG] as const;

/** Where the static gear compression leaves the reference point on a level runway. */
export function restingHeight(groundM: number): number {
  return groundM + GEAR_HEIGHT_M - G0 / (SPRING_OMEGA * SPRING_OMEGA);
}

const air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
const fwd = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');

/**
 * One tick on the wheels (spec §8, M4): thrust, drag and wheel friction along the heading, no side slip, gear springs
 * under the weight, nose-wheel steering from the roll and rudder inputs, and rotation once the elevator has
 * authority. The jet leaves the ground by itself when lift exceeds weight; `onGround` then turns false. Lift and drag
 * come from the airspeed along the runway, so a headwind shortens the roll (revision 16).
 */
export function stepGround(s: FlightState, input: ControlInput, p: AircraftPhysics, dt: number, env: Readonly<FlightEnv>): void {
  const groundM = env.groundM;
  if (!Number.isFinite(groundM)) {
    s.onGround = false;
    return;
  }
  atmosphere(s.pos.y, air);
  // Braking idles the engines (revision 22): above about half throttle they outpull the brakes, and a jet landed with
  // the throttle half open would roll on and never stop to be repaired.
  s.throttle = approach(s.throttle, input.airbrake ? 0 : clamp(input.throttle, 0, 1), dt, 0.6);
  s.airbrake = moveToward(s.airbrake, input.airbrake ? 1 : 0, dt);

  fwd.set(0, 0, -1).applyQuaternion(s.quat);
  let pitch = Math.asin(clamp(fwd.y, -1, 1));
  let heading = Math.atan2(fwd.x, -fwd.z);
  const hx = Math.sin(heading);
  const hz = -Math.cos(heading);
  let u = Math.max(0, s.vel.x * hx + s.vel.z * hz);
  let vy = s.vel.y;
  const headwind = -(env.wind.x * hx + env.wind.z * hz);
  const ua = Math.max(0, u + headwind);
  const mass = p.massKg - env.fuelUsedKg;

  const qbar = 0.5 * air.density * ua * ua;
  const mach = ua / air.speedOfSound;
  const alpha = pitch - Math.atan2(vy, Math.max(ua, 1));
  const qS = qbar * p.wingAreaM2;
  const cl = liftCoefficient(alpha, p);
  const drag = qS * (dragCoefficient(mach, cl, alpha, 0, s.airbrake, p) + GEAR_DRAG * s.gear);
  const lift = qS * cl;
  const thrust = thrustNewtons(s.throttle, p, air.sigma, mach, env.thrustScale);
  const weight = mass * G0;

  // Gear springs carry what the wings do not.
  const compression = groundM + GEAR_HEIGHT_M - s.pos.y;
  const wheelLoad = compression > 0 ? Math.max(0, mass * (SPRING_OMEGA * SPRING_OMEGA * compression - 2 * SPRING_ZETA * SPRING_OMEGA * vy)) : 0;
  const friction = (ROLLING_FRICTION + (input.airbrake ? BRAKE_FRICTION : 0)) * wheelLoad;
  let au = (thrust * Math.cos(pitch) - drag - friction) / mass;
  if (u <= 0 && au < 0) au = 0;
  u = Math.max(0, u + au * dt);
  vy += ((lift + thrust * Math.sin(pitch) + wheelLoad - weight) / mass) * dt;

  // Steering: the nose wheel at taxi speed, the rudder when fast; nothing turns a jet standing still.
  const steer = clamp(input.yaw + input.roll, -1, 1);
  const steerRate = steer * lerp(STEER_SLOW, STEER_FAST, smoothstep(15, 80, u)) * Math.min(1, u / 3);
  heading += steerRate * dt;

  // Rotation: the nose lifts only as fast as the elevator's authority allows and never below the runway.
  const authority = clamp(qbar / ROTATION_FULL_Q_PA, 0, 1);
  const target = input.pitch > 0 ? input.pitch * ROTATION_LIMIT_RAD * authority : 0;
  const onWheels = compression > -0.05;
  const pitchRate = clamp((target - pitch) / PITCH_TAU_S, -PITCH_RATE_MAX, PITCH_RATE_MAX);
  pitch += pitchRate * dt;
  if (onWheels) pitch = clamp(pitch, 0, ROTATION_LIMIT_RAD);

  euler.set(pitch, -heading, 0);
  s.quat.setFromEuler(euler);
  s.vel.set(Math.sin(heading) * u, vy, -Math.cos(heading) * u);
  s.pos.addScaledVector(s.vel, dt);
  s.angVel.set(pitchRate, -steerRate, 0);
  s.alpha = alpha;
  s.beta = 0;
  s.mach = mach;
  s.airspeed = Math.hypot(ua, vy);
  s.thrust = thrust;
  s.fuelFlow = fuelFlowKgS(s.throttle, p, air.sigma, mach, env.thrustScale);
  s.gLoad = (lift + wheelLoad) / weight;
  if (s.pos.y - groundM - GEAR_HEIGHT_M > LIFTOFF_CLEARANCE_M && vy > 0) s.onGround = false;
}

/**
 * In flight with the gear still down: whether the wheels touch the runway gently enough to roll (a bounce on the
 * take-off run). Anything harder is left to the crash rule.
 */
export function gentleTouchdown(s: FlightState, groundM: number): boolean {
  if (s.gear < 1 || !Number.isFinite(groundM) || s.pos.y > groundM + GEAR_HEIGHT_M) return false;
  if (s.vel.y < -TOUCHDOWN_MAX_SINK_MS) return false;
  euler.setFromQuaternion(s.quat, 'YXZ');
  return Math.abs(euler.z) < TOUCHDOWN_MAX_BANK && euler.x > TOUCHDOWN_PITCH[0] && euler.x < TOUCHDOWN_PITCH[1];
}

/**
 * The gear comes down while it is wanted (on approach to a friendly airfield, revision 22). Otherwise it starts up once
 * the jet is well clear of the airfield, then keeps going.
 */
export function updateGear(s: FlightState, dt: number, groundM: number, wanted = false): void {
  if (wanted) {
    s.gear = Math.min(1, s.gear + dt / GEAR_RETRACT_S);
    return;
  }
  if (s.gear <= 0) return;
  const clear = !Number.isFinite(groundM) || s.pos.y - groundM > GEAR_RETRACT_ABOVE_M;
  if (s.gear < 1 || clear) s.gear = Math.max(0, s.gear - dt / GEAR_RETRACT_S);
}
