import { Color, type Object3D, Quaternion, type Scene, Vector3 } from 'three';
import type { Terrain } from '../../../shared/map/terrain.ts';
import { smoothstep } from '../../../shared/math/units.ts';
import { damageState } from '../../../shared/damage/damage.ts';
import type { GameEvent } from '../../../shared/world/events.ts';
import type { AircraftView, GameSession, GroundTargetView, MissileView } from '../../session/game-session.ts';
import { BOMB_LOOK, LANCE_LOOK, MISSILE_LOOK, OrdnanceModels } from './ordnance-models.ts';
import { type ParticleFrame, ParticleSystem } from './particles.ts';
import { Tracers } from './tracers.ts';
import { TrailRibbons, type TrailLook } from './trails.ts';

const SMOKE_CAPACITY = 9000;
const FIRE_CAPACITY = 3000;
const TRAIL_SPACING_M = 9;
const FLARES_PER_SALVO = 2;
const FLARE_BURN_S = 3;
const CHAFF_BITS = 36;
const DAMAGE_SMOKE_INTERVAL_S = 0.04;
const TARGET_SMOKE_INTERVAL_S = 0.2;
const TARGET_FIRE_INTERVAL_S = 0.08;

const FIRE = [new Color(0xffd27a), new Color(0xff8a2a), new Color(0xff5a14)];
const DARK_SMOKE = new Color(0x2a2a2a);
const GREY_SMOKE = new Color(0x7d7d7d);
const TRAIL_SMOKE = new Color(0xd8d8d8);
const LANCE_SMOKE = new Color(0xeeeeee);
const CHAFF = new Color(0xc8ced6);
const CHAFF_GLINT = new Color(0xf2f6ff);
const MOTOR = new Color(0xffe2b0);
const FLARE = new Color(0xfff4d0);
const SPARK = new Color(0xffc977);
const DUST = new Color(0x8b7d62);

const rand = (a: number, b: number) => a + (b - a) * Math.random();

/** Contrails (spec §15.4): from 8 km up, long-lived and spreading. */
const CONTRAIL_LOOK: TrailLook = { lifeS: 40, sampleS: 0.35, width0: 1.5, width1: 28, alpha: 0.55, fadeInS: 0.3, maxPoints: 120, color: new Color(0.96, 0.97, 1) };
const CONTRAIL_FROM_M = 7600;
const CONTRAIL_FULL_M = 8600;
/** Wingtip vapour (spec §15.4): above 5 G, short wisps from the wingtips. */
const VAPOR_LOOK: TrailLook = { lifeS: 0.8, sampleS: 1 / 40, width0: 0.9, width1: 3, alpha: 0.7, fadeInS: 0, maxPoints: 40, color: new Color(1, 1, 1) };
const VAPOR_FROM_G = 4.5;
const VAPOR_FULL_G = 6.5;
/** Burning wrecks fall for at most this long; at most this many at once. */
const WRECK_MAX_S = 15;
const MAX_WRECKS = 8;
const WRECK_DRAG_PER_S = 0.12;

interface Wreck {
  obj: Object3D;
  vel: Vector3;
  axis: Vector3;
  spinRadS: number;
  ageS: number;
  emitS: number;
}

export interface EffectsOptions {
  /** the ground wrecks fall onto */
  terrain?: Terrain;
  /** a jet's model as drawn now, to copy into a falling wreck (M5) */
  wreckModel?: (aircraftId: number) => Object3D | null;
}

interface Flare {
  pos: Vector3;
  vel: Vector3;
  ageS: number;
}

/** Visual combat effects driven by the session state and game events (spec §15.4). Purely cosmetic. */
export class Effects {
  private readonly scene: Scene;
  private readonly smoke = new ParticleSystem(SMOKE_CAPACITY, false);
  private readonly fire = new ParticleSystem(FIRE_CAPACITY, true);
  private readonly tracers = new Tracers();
  private readonly missileModels: OrdnanceModels;
  private readonly lanceModels: OrdnanceModels;
  private readonly bombModels: OrdnanceModels;
  private readonly darts: MissileView[] = [];
  private readonly lances: MissileView[] = [];
  private readonly flares: Flare[] = [];
  private readonly targetTimers = new Map<string, number>();
  private readonly trailFrom = new Map<number, Vector3>();
  private damageTimer = 0;
  private readonly contrails = new TrailRibbons(CONTRAIL_LOOK, 4000);
  private readonly vapor = new TrailRibbons(VAPOR_LOOK, 1500);
  /** each jet's smoothed load factor, for the vapour */
  private readonly loads = new Map<number, number>();
  private readonly wrecks: Wreck[] = [];
  private readonly options: EffectsOptions;
  /** effect time: stands still while the game is paused */
  private clock = 0;
  /** wrecks that hit the ground since the last call (for their sound) */
  private impacts: Vector3[] = [];
  private readonly spin = new Quaternion();
  private readonly emitAt = new Vector3();
  private readonly tmp = new Vector3();
  private readonly dir = new Vector3();
  private readonly tail = new Vector3();
  private readonly zero = new Vector3();

  constructor(scene: Scene, options: EffectsOptions = {}) {
    this.scene = scene;
    this.options = options;
    scene.add(this.contrails.mesh, this.vapor.mesh);
    this.missileModels = new OrdnanceModels(scene, MISSILE_LOOK);
    this.lanceModels = new OrdnanceModels(scene, LANCE_LOOK);
    this.bombModels = new OrdnanceModels(scene, BOMB_LOOK);
    scene.add(this.smoke.points, this.fire.points, this.tracers.lines, this.tracers.heads);
  }

  /** Share of smoke and fire particles kept (graphics presets). */
  setParticleDensity(density: number): void {
    this.smoke.density = density;
    this.fire.density = density;
  }

  /** Live smoke and fire particles (tests and debugging). */
  get particleCount(): number {
    return this.smoke.liveCount + this.fire.liveCount;
  }

  onEvent(e: GameEvent, session: GameSession): void {
    if (e.type === 'destroyed') {
      const v = session.view(e.aircraftId);
      if (v) {
        this.explosion(v.position, v.flight.vel, 1);
        // Shot down, collided or lost in the air: the burning airframe falls (M5). A crash ends on the ground, with or
        // without a blacked-out pilot (revision 21).
        if (e.cause !== 'crash' && e.cause !== 'blackout') this.spawnWreck(e.aircraftId, v);
      }
    } else if (e.type === 'missileDetonated') {
      this.explosion(this.tmp.set(e.x, e.y, e.z), this.zero, e.nearAircraft ? 0.6 : 0.45);
    } else if (e.type === 'countermeasures') {
      const v = session.view(e.aircraftId);
      if (v) {
        this.releaseFlares(v);
        this.releaseChaff(v);
      }
    } else if (e.type === 'hit' && e.weapon === 'cannon') {
      const v = session.view(e.aircraftId);
      if (v) this.sparks(v.position, 8);
    } else if (e.type === 'bombImpact') {
      this.bombBlast(this.tmp.set(e.x, e.y, e.z));
    }
  }

  /** `light`: how lit the sky is (1 day … about 0.15 at night), for the trails. */
  update(dt: number, session: GameSession, frame: ParticleFrame, cameraPos: Vector3, light = 1): void {
    this.clock += dt;
    if (dt > 0) {
      for (const v of session.views()) this.emitTrails(v, dt);
      this.updateWrecks(dt);
      for (const m of session.missiles()) this.missileTrail(m);
      for (const id of this.trailFrom.keys()) if (!this.hasMissile(session, id)) this.trailFrom.delete(id);
      this.updateFlares(dt);
      this.damageTimer += dt;
      const emitDamage = this.damageTimer >= DAMAGE_SMOKE_INTERVAL_S;
      if (emitDamage) this.damageTimer = 0;
      for (const v of session.views()) {
        if (!v.alive) continue;
        if (emitDamage) this.damageSmoke(v);
        if (v.firingCannon) this.muzzleFlash(v);
      }
      this.targetSmoke(dt, session.groundTargets());
    }
    this.darts.length = 0;
    this.lances.length = 0;
    for (const m of session.missiles()) (m.kind === 'lance' ? this.lances : this.darts).push(m);
    this.missileModels.update(this.darts, cameraPos);
    this.lanceModels.update(this.lances, cameraPos);
    this.bombModels.update(session.bombs(), cameraPos);
    this.tracers.update(session.projectiles(), frame);
    this.smoke.update(dt, frame);
    this.fire.update(dt, frame);
    this.contrails.update(this.clock, frame, light);
    this.vapor.update(this.clock, frame, light);
  }

  /** Wrecks that reached the ground since the last call, for the explosion sound. */
  drainImpacts(): Vector3[] {
    const out = this.impacts;
    this.impacts = [];
    return out;
  }

  /** Contrails from the engines above 8 km and vapour from the wingtips above 5 G (spec §15.4). */
  private emitTrails(v: AircraftView, dt: number): void {
    const t = this.clock;
    const vis = v.config.visual;
    const L = vis.lengthM;
    if (!v.alive) {
      this.loads.delete(v.id);
      return;
    }
    const was = this.loads.get(v.id) ?? 1;
    const g = was + (v.flight.gLoad - was) * Math.min(1, dt / 0.15);
    this.loads.set(v.id, g);
    const contrail = smoothstep(CONTRAIL_FROM_M, CONTRAIL_FULL_M, v.position.y) * (0.5 + 0.5 * Math.min(1, v.flight.throttle / 0.9));
    const engines = vis.engines === 2 ? [-1, 1] : [0];
    const spacing = vis.engineSpacingM ?? 1.25 * vis.fuselageRadiusM;
    for (const [i, side] of engines.entries()) {
      this.emitAt.set((side * spacing) / 2, 0, L / 2 + 2).applyQuaternion(v.quaternion).add(v.position);
      this.contrails.store.emit(`${v.id}:${v.spawnGen}:e${i}`, this.emitAt, contrail, t);
    }
    const vapor = smoothstep(VAPOR_FROM_G, VAPOR_FULL_G, g);
    const sweep = Math.tan((vis.wingSweepDeg * Math.PI) / 180) * (vis.spanM / 2);
    const tipZ = (vis.wingPositionFraction - 0.5) * L + sweep + vis.wingTipChordM;
    for (const side of [-1, 1]) {
      this.emitAt.set(side * vis.spanM * 0.49, 0, tipZ).applyQuaternion(v.quaternion).add(v.position);
      this.vapor.store.emit(`${v.id}:${v.spawnGen}:w${side}`, this.emitAt, vapor, t);
    }
  }

  private spawnWreck(id: number, v: AircraftView): void {
    const model = this.options.wreckModel?.(id);
    if (!model) return;
    const obj = model.clone(true);
    // No lights, wheels or afterburner flames on a wreck (a copied flame would also share the live jet's material).
    const dead: Object3D[] = [];
    obj.traverse((o) => {
      if (o.name === 'nav-lights' || o.name === 'landing-gear' || o.name === 'afterburner') dead.push(o);
    });
    for (const o of dead) o.removeFromParent();
    obj.visible = true;
    obj.position.copy(v.position);
    obj.quaternion.copy(v.quaternion);
    this.scene.add(obj);
    const axis = new Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    this.wrecks.push({ obj, vel: v.flight.vel.clone(), axis, spinRadS: rand(0.6, 1.8), ageS: 0, emitS: 0 });
    if (this.wrecks.length > MAX_WRECKS) this.removeWreck(0);
  }

  /** Falling, tumbling, burning airframes; each bursts where it meets the ground. */
  private updateWrecks(dt: number): void {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.ageS += dt;
      w.vel.multiplyScalar(Math.max(0, 1 - WRECK_DRAG_PER_S * dt));
      w.vel.y -= 9.80665 * dt;
      w.obj.position.addScaledVector(w.vel, dt);
      w.obj.quaternion.premultiply(this.spin.setFromAxisAngle(w.axis, w.spinRadS * dt));
      w.emitS += dt;
      if (w.emitS >= 0.05) {
        w.emitS = 0;
        const p = w.obj.position;
        this.fire.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-3, 3), vy: rand(-1, 3), vz: rand(-3, 3), lifeS: rand(0.4, 0.8), size0: rand(5, 9), size1: rand(2, 4), color: FIRE[Math.floor(Math.random() * FIRE.length)], alpha: 1, lift: 2 });
        this.smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, lifeS: rand(5, 8), size0: 5, size1: rand(30, 45), color: DARK_SMOKE, alpha: 0.75, lift: 1.5 });
      }
      const ground = this.options.terrain?.surfaceAt(w.obj.position.x, w.obj.position.z) ?? -Infinity;
      if (w.obj.position.y <= ground + 2) {
        this.tmp.copy(w.obj.position).setY(ground + 2);
        this.bombBlast(this.tmp);
        this.impacts.push(this.tmp.clone());
        this.removeWreck(i);
      } else if (w.ageS > WRECK_MAX_S) {
        this.removeWreck(i);
      }
    }
  }

  private removeWreck(i: number): void {
    this.scene.remove(this.wrecks[i].obj);
    this.wrecks.splice(i, 1);
  }

  dispose(): void {
    this.scene.remove(this.smoke.points, this.fire.points, this.tracers.lines, this.tracers.heads, this.contrails.mesh, this.vapor.mesh);
    for (let i = this.wrecks.length - 1; i >= 0; i--) this.removeWreck(i);
    this.contrails.dispose();
    this.vapor.dispose();
    this.smoke.dispose();
    this.fire.dispose();
    this.tracers.dispose();
    this.missileModels.dispose();
    this.lanceModels.dispose();
    this.bombModels.dispose();
  }

  private hasMissile(session: GameSession, id: number): boolean {
    for (const m of session.missiles()) if (m.id === id) return true;
    return false;
  }

  private explosion(at: Vector3, vel: Vector3, scale: number): void {
    const burst = (n: number, fn: () => void) => {
      for (let i = 0; i < Math.round(n * scale); i++) fn();
    };
    burst(36, () => {
      this.randomDir(this.dir).multiplyScalar(rand(20, 70) * scale);
      this.fire.spawn({
        x: at.x + rand(-3, 3) * scale,
        y: at.y + rand(-3, 3) * scale,
        z: at.z + rand(-3, 3) * scale,
        vx: vel.x * 0.3 + this.dir.x,
        vy: vel.y * 0.3 + this.dir.y,
        vz: vel.z * 0.3 + this.dir.z,
        lifeS: rand(0.5, 1.3),
        size0: rand(6, 10) * scale,
        size1: rand(18, 30) * scale,
        color: FIRE[Math.floor(Math.random() * FIRE.length)],
        alpha: 1,
        lift: 2,
        drag: 1.5,
      });
    });
    burst(22, () => {
      this.randomDir(this.dir).multiplyScalar(rand(8, 25) * scale);
      this.smoke.spawn({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: vel.x * 0.2 + this.dir.x,
        vy: vel.y * 0.2 + this.dir.y,
        vz: vel.z * 0.2 + this.dir.z,
        lifeS: rand(3, 6),
        size0: 10 * scale,
        size1: rand(35, 55) * scale,
        color: DARK_SMOKE,
        alpha: 0.85,
        lift: 3,
        drag: 0.8,
      });
    });
    this.sparks(at, 16 * scale);
  }

  /** A big blast and a ring of dust thrown out along the ground. */
  private bombBlast(at: Vector3): void {
    this.explosion(at, this.zero, 1.4);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(15, 45);
      this.smoke.spawn({ x: at.x, y: at.y + 2, z: at.z, vx: Math.cos(a) * s, vy: rand(4, 14), vz: Math.sin(a) * s, lifeS: rand(4, 8), size0: 8, size1: rand(30, 50), color: DUST, alpha: 0.7, lift: 1, drag: 0.9 });
    }
  }

  /** Damaged targets smoke; destroyed ones burn. */
  private targetSmoke(dt: number, targets: readonly GroundTargetView[]): void {
    for (const t of targets) {
      if (!t.destroyed && t.hp > 0.5 * t.maxHp) continue;
      const due = (this.targetTimers.get(t.id) ?? 0) + dt;
      if (due < (t.destroyed ? TARGET_FIRE_INTERVAL_S : TARGET_SMOKE_INTERVAL_S)) {
        this.targetTimers.set(t.id, due);
        continue;
      }
      this.targetTimers.set(t.id, 0);
      const x = t.position.x + rand(-15, 15);
      const y = t.position.y + 4;
      const z = t.position.z + rand(-15, 15);
      this.smoke.spawn({ x, y, z, vx: rand(-1, 1), vy: rand(6, 10), vz: rand(-1, 1), lifeS: rand(8, 12), size0: 8, size1: rand(40, 70), color: t.destroyed ? DARK_SMOKE : GREY_SMOKE, alpha: 0.75, lift: 2 });
      if (t.destroyed) {
        this.fire.spawn({ x, y, z, vx: 0, vy: rand(3, 6), vz: 0, lifeS: rand(0.6, 1.1), size0: rand(6, 10), size1: rand(14, 20), color: FIRE[Math.floor(Math.random() * FIRE.length)], alpha: 1, lift: 2 });
      }
    }
  }

  private sparks(at: Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      this.randomDir(this.dir).multiplyScalar(rand(60, 160));
      this.fire.spawn({ x: at.x, y: at.y, z: at.z, vx: this.dir.x, vy: this.dir.y, vz: this.dir.z, lifeS: rand(0.3, 0.8), size0: 1.5, size1: 0.5, color: SPARK, alpha: 1, lift: -9.8, drag: 0.5 });
    }
  }

  private releaseFlares(v: AircraftView): void {
    this.tailOf(v, this.tail);
    const right = this.tmp.set(1, 0, 0).applyQuaternion(v.quaternion);
    for (let i = 0; i < FLARES_PER_SALVO; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const vel = v.flight.vel.clone().multiplyScalar(0.8).addScaledVector(right, side * rand(15, 30));
      vel.y -= rand(5, 15);
      this.flares.push({ pos: this.tail.clone(), vel, ageS: 0 });
    }
  }

  /** A cloud of metal strips behind the jet: a grey haze that drifts and glints for the chaff's 4 s (spec §10.2). */
  private releaseChaff(v: AircraftView): void {
    this.tailOf(v, this.tail);
    for (let i = 0; i < CHAFF_BITS; i++) {
      this.randomDir(this.dir).multiplyScalar(rand(4, 14));
      const vx = v.flight.vel.x * 0.15 + this.dir.x;
      const vy = v.flight.vel.y * 0.15 + this.dir.y;
      const vz = v.flight.vel.z * 0.15 + this.dir.z;
      this.smoke.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx, vy, vz, lifeS: rand(3, 4), size0: 1.5, size1: rand(6, 10), color: CHAFF, alpha: 0.35, lift: -0.5, drag: 1.2 });
      if (i % 3 === 0) this.fire.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx, vy, vz, lifeS: rand(0.4, 2.5), size0: 1.2, size1: 0.6, color: CHAFF_GLINT, alpha: 0.9, lift: -1, drag: 1.2 });
    }
  }

  private updateFlares(dt: number): void {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.ageS += dt;
      if (f.ageS >= FLARE_BURN_S) {
        this.flares.splice(i, 1);
        continue;
      }
      f.vel.multiplyScalar(Math.max(0, 1 - 0.6 * dt));
      f.vel.y -= 9.8 * dt;
      f.pos.addScaledVector(f.vel, dt);
      this.fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: 0, vy: 0, vz: 0, lifeS: 0.12, size0: 6, size1: 3, color: FLARE, alpha: 1 });
      this.smoke.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: 0, vy: 0, vz: 0, lifeS: 2.5, size0: 2, size1: 9, color: TRAIL_SMOKE, alpha: 0.5, lift: 0.5 });
    }
  }

  private missileTrail(m: MissileView): void {
    if (m.velocity.lengthSq() < 1) return;
    this.dir.copy(m.velocity).normalize();
    this.tail.copy(m.position).addScaledVector(this.dir, -1.5);
    let from = this.trailFrom.get(m.id);
    if (!from) {
      from = this.tail.clone();
      this.trailFrom.set(m.id, from);
    }
    if (!m.motorBurning) {
      from.copy(this.tail);
      return;
    }
    // A bright motor and a thick, long-lived trail, so a missile can be seen coming from kilometers away (spec §15.4).
    this.fire.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx: 0, vy: 0, vz: 0, lifeS: 0.06, size0: 6, size1: 3, color: MOTOR, alpha: 1 });
    const gap = from.distanceTo(this.tail);
    const puffs = Math.floor(gap / TRAIL_SPACING_M);
    // The Lance burns longer and leaves a whiter, longer-lasting trail.
    const lance = m.kind === 'lance';
    for (let i = 1; i <= puffs; i++) {
      this.tmp.lerpVectors(from, this.tail, (i * TRAIL_SPACING_M) / gap);
      this.smoke.spawn({
        x: this.tmp.x,
        y: this.tmp.y,
        z: this.tmp.z,
        vx: rand(-1, 1),
        vy: rand(-1, 1),
        vz: rand(-1, 1),
        lifeS: lance ? rand(7, 9) : rand(5, 7),
        size0: 3,
        size1: lance ? rand(20, 26) : rand(16, 22),
        color: lance ? LANCE_SMOKE : TRAIL_SMOKE,
        alpha: lance ? 0.65 : 0.6,
        lift: 1,
      });
    }
    if (puffs > 0) from.lerpVectors(from, this.tail, (puffs * TRAIL_SPACING_M) / gap);
  }

  private damageSmoke(v: AircraftView): void {
    const state = damageState(v.hp, v.config.damage.hitPoints);
    if (state !== 'damaged' && state !== 'critical') return;
    this.tailOf(v, this.tail);
    const critical = state === 'critical';
    this.smoke.spawn({
      x: this.tail.x,
      y: this.tail.y,
      z: this.tail.z,
      vx: v.flight.vel.x * 0.1,
      vy: v.flight.vel.y * 0.1,
      vz: v.flight.vel.z * 0.1,
      lifeS: critical ? 6 : 3,
      size0: critical ? 4 : 2,
      size1: critical ? 30 : 14,
      color: critical ? DARK_SMOKE : GREY_SMOKE,
      alpha: 0.7,
      lift: 1.5,
    });
    if (critical) {
      // A fire at the engines and along a wing root, trailing thick black smoke (M5).
      const back = this.dir.set(0, 0, 1).applyQuaternion(v.quaternion);
      for (let k = 0; k < 2; k++) {
        const vx = v.flight.vel.x * 0.85 + back.x * rand(5, 20);
        const vy = v.flight.vel.y * 0.85 + back.y * rand(5, 20);
        const vz = v.flight.vel.z * 0.85 + back.z * rand(5, 20);
        this.fire.spawn({ x: this.tail.x, y: this.tail.y, z: this.tail.z, vx, vy, vz, lifeS: rand(0.25, 0.45), size0: rand(3.5, 6), size1: rand(1, 2), color: FIRE[Math.floor(Math.random() * FIRE.length)], alpha: 1 });
      }
      const wing = this.tmp.set(rand(-1, 1) * v.config.visual.spanM * 0.25, 0, 0).applyQuaternion(v.quaternion).add(v.position);
      this.fire.spawn({ x: wing.x, y: wing.y, z: wing.z, vx: v.flight.vel.x * 0.9, vy: v.flight.vel.y * 0.9, vz: v.flight.vel.z * 0.9, lifeS: 0.3, size0: rand(2, 4), size1: 1, color: FIRE[2], alpha: 0.9 });
    }
  }

  private muzzleFlash(v: AircraftView): void {
    this.dir.set(0, 0, -1).applyQuaternion(v.quaternion);
    this.tmp.copy(v.position).addScaledVector(this.dir, v.config.visual.lengthM / 2 + 1);
    this.fire.spawn({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, vx: 0, vy: 0, vz: 0, lifeS: 0.04, size0: 2.2, size1: 1.2, color: FIRE[0], alpha: 1 });
  }

  private tailOf(v: AircraftView, out: Vector3): Vector3 {
    this.dir.set(0, 0, 1).applyQuaternion(v.quaternion);
    return out.copy(v.position).addScaledVector(this.dir, v.config.visual.lengthM / 2 + 1);
  }

  private randomDir(out: Vector3): Vector3 {
    const z = rand(-1, 1);
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return out.set(r * Math.cos(a), z, r * Math.sin(a));
  }
}
