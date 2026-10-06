import { Euler, Quaternion, Vector3 } from 'three';
import type { AircraftPhysics } from '../data/aircraft/types.ts';
import { approach, clamp, DEG, G0, moveToward } from '../math/units.ts';
import { dragCoefficient, fuelFlowKgS, liftCoefficient, SIDE_FORCE_PER_RAD, thrustNewtons } from './aero.ts';
import { type AirData, atmosphere } from './atmosphere.ts';
import type { ControlInput } from './controls.ts';
import { GEAR_DRAG, gentleTouchdown, stepGround, updateGear } from './ground.ts';

export interface FlightState {
  pos: Vector3;
  vel: Vector3;
  /** body -> world rotation */
  quat: Quaternion;
  /** body-frame angular velocity (x = pitch up, y = yaw left, z = roll left), rad/s */
  angVel: Vector3;
  /** actual (spooled) throttle 0..1 */
  throttle: number;
  /** airbrake deployment 0..1 */
  airbrake: number;
  alpha: number;
  beta: number;
  /** load factor felt by the pilot along the body up axis */
  gLoad: number;
  mach: number;
  airspeed: number;
  thrust: number;
  /** landing gear: 1 down … 0 up (spec §8, M4) */
  gear: number;
  /** rolling on the wheels: the ground model flies the jet */
  onGround: boolean;
  /** fuel the engines burn now, kg/s (revision 16) */
  fuelFlow: number;
  /** 0 in controlled flight; +1 spinning right (the nose yaws clockwise seen from above), -1 spinning left */
  spin: number;
  /** progress of the spin recovery, 0 … 1 */
  spinRecovery: number;
  /** seconds in the current spin */
  spinTimeS: number;
  /** after a recovery the fly-by-wire keeps the angle of attack under the stall this long */
  recoveryGraceS: number;
}

/** What the world around the jet adds: damage, the runway under it, the wind and the fuel burnt. */
export interface FlightEnv {
  thrustScale: number;
  rollScale: number;
  /** height of the airfield ground under the jet, NaN away from airfields (no wheel contact there) */
  groundM: number;
  /** the air's velocity, ground frame (revision 16) */
  wind: Vector3;
  /** fuel burnt since the tanks were full: the jet is this much lighter than `massKg` */
  fuelUsedKg: number;
  /** on approach to a friendly airfield: the gear comes down (revision 22) */
  gearWanted: boolean;
}

export const DEFAULT_FLIGHT_ENV: Readonly<FlightEnv> = { thrustScale: 1, rollScale: 1, groundM: NaN, wind: new Vector3(), fuelUsedKg: 0, gearWanted: false };

export interface FlightStateInit {
  position: Vector3;
  /** 0 = north (-z), PI/2 = east (+x) */
  headingRad: number;
  /** flight-path pitch (velocity direction) */
  pitchRad?: number;
  /** nose above the flight path; use `trimAlpha` so a fresh aircraft starts in 1 G level flight */
  alphaRad?: number;
  speed: number;
  throttle?: number;
  /** on the runway with the gear down */
  onGround?: boolean;
}

const THROTTLE_TAU = 0.6;
const AIRBRAKE_RATE = 1;
const Q_FULL_AUTHORITY = 5000;
const ALPHA_NEG_LIMIT = -10 * DEG;
const K_ALPHA = 5;
const K_BETA = 3;
const BETA_MAX = 6 * DEG;
// Slow enough that the jet rolls and pitches smoothly rather than snapping (spec §9.2, revision 5).
const TAU_PITCH = 0.15;
const TAU_YAW = 0.08;
const TAU_ROLL = 0.35;
const MIN_SPEED = 1;

// Departures and spins (revision 16).
/** Stalled share: 0 at alphaMax, 1 this far beyond it. */
const STALL_SPAN = 5 * DEG;
/** Strength of the yaw divergence when stalled at low dynamic pressure. */
const K_DEPART = 8;
/** Sideslip one full roll input is worth while stalled: the dropping wing yaws the nose its way. */
const WING_DROP_RAD = 0.5;
/** Past this sideslip a departing jet is in a spin. */
const SPIN_ENTRY_BETA = 12 * DEG;
/** Slower than this a jet with little control left falls out of the sky (a tail slide). */
const TAIL_SLIDE_MS = 30;
const TAIL_SLIDE_INSTABILITY = 0.3;
/**
 * A developed spin: yaw rate round the vertical, the nose this far below the horizon (about 45° into the airflow once
 * the jet falls straight down), how fast the attitude follows, how fast the motion builds up or dies, and the drag of
 * an airframe falling broadside, which holds the descent at about 70–100 m/s.
 */
const SPIN_RATE = 100 * DEG;
const SPIN_PITCH = -45 * DEG;
const SPIN_ATTITUDE_TAU = 0.6;
const SPIN_TAU = 0.4;
const SPIN_DRAG_CD = 0.9;
/** No recovery before the spin has developed. */
const SPIN_INCIPIENT_S = 1.5;
/** Recovery per second: neutral controls, plus full opposite rudder, plus full forward stick (times 1 + resistance). */
const RECOVER_NEUTRAL = 0.2;
const RECOVER_RUDDER = 0.35;
const RECOVER_STICK = 0.15;
/** Pulling or pro-spin rudder undoes the recovery this fast. */
const RECOVER_UNDO = 0.5;
const RECOVERY_GRACE_S = 3;
/** During the grace the limiter keeps the angle of attack this far under alphaMax. */
const RECOVERY_ALPHA_MARGIN = 2 * DEG;

export function createFlightState(init: FlightStateInit): FlightState {
  const pitch = init.pitchRad ?? 0;
  const alpha = init.alphaRad ?? 0;
  const quat = new Quaternion().setFromEuler(new Euler(pitch + alpha, -init.headingRad, 0, 'YXZ'));
  const flightPath = new Quaternion().setFromEuler(new Euler(pitch, -init.headingRad, 0, 'YXZ'));
  const vel = new Vector3(0, 0, -1).applyQuaternion(flightPath).multiplyScalar(init.speed);
  return {
    pos: init.position.clone(),
    vel,
    quat,
    angVel: new Vector3(),
    throttle: init.throttle ?? 0.8,
    airbrake: 0,
    alpha: 0,
    beta: 0,
    gLoad: 1,
    mach: 0,
    airspeed: init.speed,
    thrust: 0,
    gear: init.onGround ? 1 : 0,
    onGround: init.onGround ?? false,
    fuelFlow: 0,
    spin: 0,
    spinRecovery: 0,
    spinTimeS: 0,
    recoveryGraceS: 0,
  };
}

const headingTmp = new Vector3();

/** Nose heading in radians, 0..2PI, 0 = north, clockwise positive. */
export function headingRad(s: FlightState): number {
  headingTmp.set(0, 0, -1).applyQuaternion(s.quat);
  const h = Math.atan2(headingTmp.x, -headingTmp.z);
  return h < 0 ? h + 2 * Math.PI : h;
}

// Module-level scratch objects: stepFlight is hot and must not allocate.
const air: AirData = { density: 0, temperature: 0, speedOfSound: 0, sigma: 0 };
const fwd = new Vector3();
const up = new Vector3();
const right = new Vector3();
const vHat = new Vector3();
const airVel = new Vector3();
const liftDir = new Vector3();
const sideDir = new Vector3();
const force = new Vector3();
const acc = new Vector3();
const vBody = new Vector3();
const vBodyHat = new Vector3();
const omegaCmd = new Vector3();
const axis = new Vector3();
const qInv = new Quaternion();
const dq = new Quaternion();
const qTarget = new Quaternion();
const spinEuler = new Euler(0, 0, 0, 'YXZ');
const spinYaw = new Vector3();

export function stepFlight(
  s: FlightState,
  input: ControlInput,
  p: AircraftPhysics,
  dt: number,
  env: Readonly<FlightEnv> = DEFAULT_FLIGHT_ENV,
): void {
  if (s.onGround) {
    stepGround(s, input, p, dt, env);
    return;
  }
  atmosphere(s.pos.y, air);
  // The jet flies in the moving air: airspeed, angles and aerodynamic forces use the air-relative velocity.
  airVel.subVectors(s.vel, env.wind);
  const speed = Math.max(airVel.length(), MIN_SPEED);
  const qbar = 0.5 * air.density * speed * speed;
  const mach = speed / air.speedOfSound;
  const mass = p.massKg - env.fuelUsedKg;
  const weight = mass * G0;
  const qS = qbar * p.wingAreaM2;

  s.throttle = approach(s.throttle, clamp(input.throttle, 0, 1), dt, THROTTLE_TAU);
  s.airbrake = moveToward(s.airbrake, input.airbrake ? 1 : 0, AIRBRAKE_RATE * dt);

  // Body axes and air-relative angles.
  fwd.set(0, 0, -1).applyQuaternion(s.quat);
  up.set(0, 1, 0).applyQuaternion(s.quat);
  right.set(1, 0, 0).applyQuaternion(s.quat);
  qInv.copy(s.quat).invert();
  vBody.copy(airVel).applyQuaternion(qInv);
  const alpha = Math.atan2(-vBody.y, -vBody.z);
  const beta = Math.atan2(vBody.x, -vBody.z);

  if (airVel.lengthSq() > 1e-6) vHat.copy(airVel).normalize();
  else vHat.copy(fwd);
  liftDir.crossVectors(right, vHat);
  if (liftDir.lengthSq() < 1e-8) liftDir.copy(up);
  else liftDir.normalize();
  sideDir.crossVectors(vHat, liftDir).normalize();

  // Forces.
  const cl = liftCoefficient(alpha, p);
  const cd = dragCoefficient(mach, cl, alpha, beta, s.airbrake, p) + GEAR_DRAG * s.gear + (s.spin !== 0 ? SPIN_DRAG_CD : 0);
  const cy = -SIDE_FORCE_PER_RAD * beta;
  const thrust = thrustNewtons(s.throttle, p, air.sigma, mach, env.thrustScale);
  force
    .set(0, 0, 0)
    .addScaledVector(liftDir, qS * cl)
    .addScaledVector(sideDir, qS * cy)
    .addScaledVector(vHat, -qS * cd)
    .addScaledVector(fwd, thrust);
  s.gLoad = force.dot(up) / weight;
  force.y -= weight;
  acc.copy(force).divideScalar(mass);

  // Fly-by-wire rotation.
  const authority = clamp(qbar / Q_FULL_AUTHORITY, 0.05, 1);
  const tvc = p.thrustVectoring * clamp(thrust / p.thrustAbN, 0, 1);
  const pitchYawAuthority = clamp(authority + tvc, 0.05, 1);

  const pitchMax = p.maxPitchRateDegS * DEG * (1 + tvc);
  const yawMax = p.maxYawRateDegS * DEG * (1 + tvc);
  const resist = p.departureResistance;
  const alphaMax = p.alphaMaxDeg * DEG;
  if (s.spin !== 0) updateSpin(s, input, resist, dt);

  if (s.spin !== 0) {
    // Autorotation (revision 16): the jet yaws round the vertical, its nose pulled toward the spin attitude, wings
    // level, on whatever heading it points now.
    const flat = Math.hypot(fwd.x, fwd.z) > 0.2;
    const heading = flat ? Math.atan2(fwd.x, -fwd.z) : fwd.y < 0 ? Math.atan2(up.x, -up.z) : Math.atan2(-up.x, up.z);
    qTarget.setFromEuler(spinEuler.set(SPIN_PITCH, -heading, 0));
    dq.copy(qInv).multiply(qTarget);
    if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
    const half = Math.acos(clamp(dq.w, -1, 1));
    const sinHalf = Math.sin(half);
    if (sinHalf > 1e-6) omegaCmd.set(dq.x, dq.y, dq.z).multiplyScalar((2 * half) / sinHalf / SPIN_ATTITUDE_TAU);
    else omegaCmd.set(0, 0, 0);
    omegaCmd.add(spinYaw.set(0, -s.spin * SPIN_RATE * (1 - 0.4 * resist), 0).applyQuaternion(qInv));
    s.angVel.x = approach(s.angVel.x, omegaCmd.x, dt, SPIN_TAU);
    s.angVel.y = approach(s.angVel.y, omegaCmd.y, dt, SPIN_TAU);
    s.angVel.z = approach(s.angVel.z, omegaCmd.z, dt, SPIN_TAU);
  } else {
    s.recoveryGraceS = Math.max(0, s.recoveryGraceS - dt);
    // Pitch: stick -> load factor -> angle-of-attack command -> pitch rate. Just after a spin the limiter keeps the
    // wing flying so the jet can dive out.
    const nTrim = liftDir.y;
    const nCmd = input.pitch >= 0 ? nTrim + input.pitch * (p.gMax - nTrim) : nTrim + input.pitch * (nTrim - p.gMin);
    const clRequired = (nCmd * weight - thrust * Math.sin(alpha)) / Math.max(qS, 1);
    const alphaLimit = s.recoveryGraceS > 0 ? Math.min(p.aoaLimiterDeg * DEG, alphaMax - RECOVERY_ALPHA_MARGIN) : p.aoaLimiterDeg * DEG;
    const alphaCmd = clamp(clRequired / p.clAlpha, ALPHA_NEG_LIMIT, alphaLimit);
    const pitchCmd = clamp(acc.dot(liftDir) / speed + K_ALPHA * pitchYawAuthority * (alphaCmd - alpha), -pitchMax, pitchMax);

    // Roll about the velocity vector, weaker at high AoA and low dynamic pressure.
    const highAlphaFade = 1 - 0.5 * clamp((Math.abs(alpha) - 15 * DEG) / (15 * DEG), 0, 1);
    const rollCmd = input.roll * p.maxRollRateDegS * DEG * authority * highAlphaFade * env.rollScale;

    // Yaw: keep the nose on the flight path, plus a rudder-commanded sideslip. Stalled at low dynamic pressure the
    // jet loses that stability and a dropping wing (roll input) yaws the nose away: a departure.
    const betaCmd = -input.yaw * BETA_MAX;
    const stalled = clamp((alpha - alphaMax) / STALL_SPAN, 0, 1);
    const instability = s.recoveryGraceS > 0 ? 0 : stalled * (1 - resist) * (1 - authority);
    const noseRight = clamp(
      acc.dot(sideDir) / speed + K_BETA * pitchYawAuthority * (beta - betaCmd) - K_DEPART * instability * (beta - WING_DROP_RAD * input.roll),
      -yawMax,
      yawMax,
    );

    vBodyHat.copy(vBody);
    if (vBodyHat.lengthSq() > 1e-6) vBodyHat.normalize();
    else vBodyHat.set(0, 0, -1);
    omegaCmd.set(pitchCmd, -noseRight, 0).addScaledVector(vBodyHat, rollCmd);

    s.angVel.x = approach(s.angVel.x, omegaCmd.x, dt, TAU_PITCH);
    s.angVel.y = approach(s.angVel.y, omegaCmd.y, dt, TAU_YAW);
    s.angVel.z = approach(s.angVel.z, omegaCmd.z, dt, TAU_ROLL);

    const diverged = instability > 0.05 && Math.abs(beta) > SPIN_ENTRY_BETA;
    const tailSlide = speed < TAIL_SLIDE_MS && (1 - resist) * (1 - authority) > TAIL_SLIDE_INSTABILITY;
    if (s.recoveryGraceS <= 0 && (diverged || tailSlide)) {
      // The nose has swung left of the airflow when the sideslip is positive: a spin to the left.
      s.spin = beta > 0 ? -1 : 1;
      s.spinTimeS = 0;
      s.spinRecovery = 0;
    }
  }

  // Integrate (semi-implicit Euler).
  s.vel.addScaledVector(acc, dt);
  s.pos.addScaledVector(s.vel, dt);
  const angle = s.angVel.length() * dt;
  if (angle > 1e-12) {
    axis.copy(s.angVel).normalize();
    dq.setFromAxisAngle(axis, angle);
    s.quat.multiply(dq).normalize();
  }

  s.alpha = alpha;
  s.beta = beta;
  s.mach = mach;
  s.airspeed = speed;
  s.thrust = thrust;
  s.fuelFlow = fuelFlowKgS(s.throttle, p, air.sigma, mach, env.thrustScale);
  if (s.gear > 0 || env.gearWanted) {
    updateGear(s, dt, env.groundM, env.gearWanted);
    if (gentleTouchdown(s, env.groundM)) s.onGround = true;
  }
}

/**
 * Spin recovery (revision 16): nothing helps until the spin has developed; then neutral controls recover in a few
 * seconds, opposite rudder and the stick forward faster, and pulling or pro-spin rudder undoes the progress.
 */
function updateSpin(s: FlightState, input: ControlInput, resist: number, dt: number): void {
  s.spinTimeS += dt;
  if (s.spinTimeS < SPIN_INCIPIENT_S) return;
  const opposite = clamp(-input.yaw * s.spin, 0, 1);
  const forward = clamp(-input.pitch, 0, 1);
  if (input.pitch > 0.3 || input.yaw * s.spin > 0.3) {
    s.spinRecovery = Math.max(0, s.spinRecovery - RECOVER_UNDO * dt);
    return;
  }
  s.spinRecovery += (RECOVER_NEUTRAL + RECOVER_RUDDER * opposite + RECOVER_STICK * forward) * (1 + resist) * dt;
  if (s.spinRecovery < 1) return;
  s.spin = 0;
  s.spinRecovery = 0;
  s.spinTimeS = 0;
  s.recoveryGraceS = RECOVERY_GRACE_S;
  s.angVel.multiplyScalar(0.3);
}
