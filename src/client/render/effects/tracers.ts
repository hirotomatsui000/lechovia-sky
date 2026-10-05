import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments, Points } from 'three';
import type { ProjectileView } from '../../session/game-session.ts';
import { applyParticleFrame, createParticleMaterial, type ParticleFrame } from './particles.ts';

/** Seconds of flight each tracer streak covers (about 35 m), or less while the round is newer than that. */
const STREAK_S = 0.03;
const HEAD_SIZE_M = 1.6;
const HEAD = [1, 0.85, 0.45];
const TAIL = [0.55, 0.22, 0.04];

/** Cannon projectiles drawn as glowing streaks with a bright head. */
export class Tracers {
  readonly lines: LineSegments;
  readonly heads: Points;
  /** tracers drawn by the last update */
  count = 0;
  private readonly capacity: number;
  private readonly linePos: Float32Array;
  private readonly lineColor: Float32Array;
  private readonly headPos: Float32Array;
  private readonly headColor: Float32Array;
  private readonly headSize: Float32Array;
  private readonly lineGeometry = new BufferGeometry();
  private readonly headGeometry = new BufferGeometry();
  private readonly lineMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false });
  private readonly headMaterial = createParticleMaterial(true);

  constructor(capacity = 2048) {
    this.capacity = capacity;
    this.linePos = new Float32Array(capacity * 6);
    this.lineColor = new Float32Array(capacity * 6);
    this.headPos = new Float32Array(capacity * 3);
    this.headColor = new Float32Array(capacity * 4);
    this.headSize = new Float32Array(capacity).fill(HEAD_SIZE_M);
    this.lineGeometry.setAttribute('position', new BufferAttribute(this.linePos, 3).setUsage(DynamicDrawUsage));
    this.lineGeometry.setAttribute('color', new BufferAttribute(this.lineColor, 3).setUsage(DynamicDrawUsage));
    this.headGeometry.setAttribute('position', new BufferAttribute(this.headPos, 3).setUsage(DynamicDrawUsage));
    this.headGeometry.setAttribute('aColor', new BufferAttribute(this.headColor, 4).setUsage(DynamicDrawUsage));
    this.headGeometry.setAttribute('aSize', new BufferAttribute(this.headSize, 1));
    for (let i = 0; i < capacity; i++) {
      this.lineColor.set(HEAD, i * 6);
      this.lineColor.set(TAIL, i * 6 + 3);
      this.headColor.set([HEAD[0], HEAD[1], HEAD[2], 1], i * 4);
    }
    this.lines = new LineSegments(this.lineGeometry, this.lineMaterial);
    this.heads = new Points(this.headGeometry, this.headMaterial);
    for (const o of [this.lines, this.heads]) {
      o.frustumCulled = false;
      o.renderOrder = 3;
    }
  }

  update(projectiles: Iterable<ProjectileView>, frame: ParticleFrame): void {
    let n = 0;
    for (const p of projectiles) {
      if (n >= this.capacity) break;
      const a = p.position;
      const v = p.velocity;
      // Never behind the gun: a full-length streak on a round just fired reached back past the chase camera and
      // showed as a line from the jet to the bottom of the screen.
      const back = Math.min(STREAK_S, p.ageS);
      this.linePos[n * 6] = a.x;
      this.linePos[n * 6 + 1] = a.y;
      this.linePos[n * 6 + 2] = a.z;
      this.linePos[n * 6 + 3] = a.x - v.x * back;
      this.linePos[n * 6 + 4] = a.y - v.y * back;
      this.linePos[n * 6 + 5] = a.z - v.z * back;
      this.headPos[n * 3] = a.x;
      this.headPos[n * 3 + 1] = a.y;
      this.headPos[n * 3 + 2] = a.z;
      n++;
    }
    this.count = n;
    this.lineGeometry.setDrawRange(0, n * 2);
    this.headGeometry.setDrawRange(0, n);
    this.lineGeometry.getAttribute('position').needsUpdate = true;
    this.headGeometry.getAttribute('position').needsUpdate = true;
    applyParticleFrame(this.headMaterial, frame);
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.headGeometry.dispose();
    this.lineMaterial.dispose();
    this.headMaterial.dispose();
  }
}
