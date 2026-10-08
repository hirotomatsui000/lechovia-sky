import type { Vector3 } from 'three';

/**
 * Recent positions and velocities of one aircraft, newest last. Bots use it for delayed perception, and online play
 * for lag compensation (revision 28).
 */
export class MotionHistory {
  private readonly capacity: number;
  private readonly pos: Float64Array;
  private readonly vel: Float64Array;
  private count = 0;
  private head = -1;

  constructor(capacity = 64) {
    this.capacity = capacity;
    this.pos = new Float64Array(capacity * 3);
    this.vel = new Float64Array(capacity * 3);
  }

  get length(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.head = -1;
  }

  record(pos: Vector3, vel: Vector3): void {
    this.head = (this.head + 1) % this.capacity;
    const i = this.head * 3;
    this.pos[i] = pos.x;
    this.pos[i + 1] = pos.y;
    this.pos[i + 2] = pos.z;
    this.vel[i] = vel.x;
    this.vel[i + 1] = vel.y;
    this.vel[i + 2] = vel.z;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /**
   * The position and velocity recorded `ticksAgo` records ago (0 = newest), clamped to the oldest. False when nothing
   * is recorded.
   */
  sampleAt(ticksAgo: number, outPos: Vector3, outVel?: Vector3): boolean {
    if (this.count === 0) return false;
    const back = Math.min(Math.max(0, Math.round(ticksAgo)), this.count - 1);
    const i = ((this.head - back + this.capacity) % this.capacity) * 3;
    outPos.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
    outVel?.set(this.vel[i], this.vel[i + 1], this.vel[i + 2]);
    return true;
  }

  /**
   * Where the aircraft appeared to be `ticksAgo` records ago, extrapolated to now along the velocity it had then
   * (clamped to the oldest record). False when nothing has been recorded.
   */
  perceive(ticksAgo: number, dt: number, outPos: Vector3, outVel: Vector3): boolean {
    if (this.count === 0) return false;
    const back = Math.min(Math.max(0, Math.round(ticksAgo)), this.count - 1);
    const i = ((this.head - back + this.capacity) % this.capacity) * 3;
    outVel.set(this.vel[i], this.vel[i + 1], this.vel[i + 2]);
    outPos.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]).addScaledVector(outVel, back * dt);
    return true;
  }
}
