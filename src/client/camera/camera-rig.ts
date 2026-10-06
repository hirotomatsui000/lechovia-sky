import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { approach, clamp, DEG } from '../../shared/math/units.ts';

export interface CameraTarget {
  position: Vector3;
  quaternion: Quaternion;
  gLoad: number;
  mach: number;
  throttle: number;
  /** look-around direction relative to the view (C / right mouse) */
  lookYaw: number;
  lookPitch: number;
}

const FOV = 70;
const CHASE_DISTANCE = 30;
const CHASE_HEIGHT = 7;
const CHASE_LOOK_AHEAD = 60;
const CHASE_TAU = 0.15;
const TRAUMA_DECAY_PER_S = 1.5;
const SHAKE_MAX_ANGLE = 1.2 * DEG;
const SHAKE_MAX_ROLL = 1.5 * DEG;
/** The kill cam eases onto its shot with this time constant. */
const FRAME_TAU_S = 0.35;
/**
 * The ground never comes between the camera and what it looks at (revision 23): the camera stays this high above the
 * ground, the line to its subject this high above it at every sample, and it settles back down this gently. It rises
 * at once, by at most this much.
 */
const GROUND_CLEARANCE_M = 3;
const LINE_CLEARANCE_M = 2;
const LINE_SAMPLES = 8;
const SETTLE_TAU_S = 0.4;
const MAX_LIFT_M = 300;

/** How far to raise a camera at `cam` so it clears the ground and the ground does not hide `subject`; 0 when clear. */
export function clearanceLift(cam: Vector3, subject: Vector3, ground: (x: number, z: number) => number): number {
  let lift = ground(cam.x, cam.z) + GROUND_CLEARANCE_M - cam.y;
  for (let i = 1; i < LINE_SAMPLES; i++) {
    const t = i / LINE_SAMPLES;
    const need = ground(cam.x + (subject.x - cam.x) * t, cam.z + (subject.z - cam.z) * t) + LINE_CLEARANCE_M - (cam.y + (subject.y - cam.y) * t);
    // Raising the camera by L raises the line here by L·(1 − t).
    if (need > 0) lift = Math.max(lift, need / (1 - t));
  }
  return clamp(lift, 0, MAX_LIFT_M);
}

/** Continuous shake sources: high G, the transonic buffet band and afterburner rumble. */
export function sustainedTrauma(gLoad: number, mach: number, throttle: number): number {
  const g = clamp((Math.abs(gLoad) - 6) / 3, 0, 1) * 0.5;
  const transonic = mach > 0.95 && mach < 1.05 ? 0.25 : 0;
  const afterburner = throttle > 0.9 ? 0.08 : 0;
  return Math.max(g, transonic, afterburner);
}

export function decayTrauma(trauma: number, dt: number): number {
  return Math.max(0, trauma - TRAUMA_DECAY_PER_S * dt);
}

const WORLD_UP = new Vector3(0, 1, 0);

/** The game's only camera: third person, behind and above the jet (spec §15.1). */
export class CameraRig {
  reduceMotion = false;
  /** the ground's height, so the camera stays out of it (revision 23); null where there is no terrain */
  ground: ((x: number, z: number) => number) | null = null;
  private lift = 0;
  private readonly camera: PerspectiveCamera;
  private trauma = 0;
  private time = 0;
  private readonly offset = new Vector3();
  private offsetReady = false;
  /** the kill cam framed the last frame */
  private framing = false;
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpUp = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly tmpM = new Matrix4();
  private readonly tmpE = new Euler(0, 0, 0, 'YXZ');

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** The next update starts right behind the target (after a respawn) instead of easing over. */
  reset(): void {
    this.offsetReady = false;
  }

  /** `aimDirection`: the mouse-aim direction to look along (horizon level); null follows the jet's nose and roll. */
  update(dt: number, target: CameraTarget | null, aimDirection: Vector3 | null): void {
    if (!target) return;
    this.framing = false;
    this.time += dt;
    const dir = this.tmpA;
    if (aimDirection) dir.copy(aimDirection).normalize();
    else dir.set(0, 0, -1).applyQuaternion(target.quaternion);
    const up = aimDirection ? this.tmpUp.copy(WORLD_UP) : this.tmpUp.set(0, 1, 0).applyQuaternion(target.quaternion);
    if (target.lookYaw !== 0 || target.lookPitch !== 0) {
      dir.applyAxisAngle(up, -target.lookYaw);
      const side = this.tmpB.crossVectors(dir, up).normalize();
      dir.applyAxisAngle(side, target.lookPitch);
    }
    const desired = this.tmpB.copy(dir).multiplyScalar(-CHASE_DISTANCE).addScaledVector(up, CHASE_HEIGHT);
    if (!this.offsetReady) {
      this.offset.copy(desired);
      this.offsetReady = true;
    } else {
      this.offset.x = approach(this.offset.x, desired.x, dt, CHASE_TAU);
      this.offset.y = approach(this.offset.y, desired.y, dt, CHASE_TAU);
      this.offset.z = approach(this.offset.z, desired.z, dt, CHASE_TAU);
    }
    this.camera.position.copy(target.position).add(this.offset);
    this.keepClear(target.position, dt);
    const lookAt = this.tmpB.copy(target.position).addScaledVector(dir, CHASE_LOOK_AHEAD);
    this.tmpM.lookAt(this.camera.position, lookAt, up);
    this.camera.quaternion.setFromRotationMatrix(this.tmpM);

    this.trauma = Math.max(decayTrauma(this.trauma, dt), sustainedTrauma(target.gLoad, target.mach, target.throttle));
    if (this.trauma > 0) this.applyShake();
    if (this.camera.fov !== FOV) {
      this.camera.fov = FOV;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Looks at `lookAt` from `position` with a field of view of `fovDeg` (the kill cam, M5), easing over from where the
   * camera was. The next chase update starts fresh behind its target.
   */
  frame(position: Vector3, lookAt: Vector3, fovDeg: number, dt: number): void {
    const cam = this.camera;
    const k = dt > 0 ? 1 - Math.exp(-dt / FRAME_TAU_S) : 1;
    cam.position.lerp(position, this.framing ? k : 1);
    this.keepClear(lookAt, dt);
    this.tmpM.lookAt(cam.position, lookAt, WORLD_UP);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    if (this.framing) cam.quaternion.slerp(this.tmpQ, k);
    else cam.quaternion.copy(this.tmpQ);
    const fov = this.framing ? cam.fov + (fovDeg - cam.fov) * k : fovDeg;
    if (Math.abs(fov - cam.fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.framing = true;
    this.offsetReady = false;
  }

  /**
   * Raises the camera out of the ground and over any ground between it and `subject` (revision 23): flying low over
   * hills, the chase camera 30 m behind could sit in a slope, or behind a ridge the jet had just cleared, and the
   * scenery covered the jet. It rises at once and settles back gently.
   */
  private keepClear(subject: Vector3, dt: number): void {
    if (!this.ground) return;
    const cam = this.camera.position;
    const need = clearanceLift(cam, subject, this.ground);
    this.lift = Math.max(need, dt > 0 ? approach(this.lift, need, dt, SETTLE_TAU_S) : need);
    cam.y += this.lift;
  }

  private applyShake(): void {
    const amp = this.trauma * this.trauma * (this.reduceMotion ? 0.2 : 1);
    const t = this.time;
    const n = (a: number, b: number, seed: number) => 0.6 * Math.sin(t * a + seed) + 0.4 * Math.sin(t * b + seed * 2.3);
    this.tmpE.set(n(23, 37, 1) * SHAKE_MAX_ANGLE * amp, n(29, 41, 2) * SHAKE_MAX_ANGLE * amp, n(31, 43, 3) * SHAKE_MAX_ROLL * amp, 'YXZ');
    this.camera.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE));
  }
}
