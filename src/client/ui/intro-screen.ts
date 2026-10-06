import { clamp, lerp, smoothstep } from '../../shared/math/units.ts';
import type { LoadProgress } from '../render/load-progress.ts';
import {
  BEAT,
  banditPose,
  CAMERA_SPEED,
  easeOutCubic,
  hitPoint,
  INTRO_OUT_S,
  INTRO_SKIP_OUT_S,
  jetPoint,
  loadLabel,
  missilePose,
  type Pose,
  revealAt,
  shakeAt,
  timecode,
  typed,
} from './intro-script.ts';

/*
 * The opening (revision 24): at the owner's request, about five seconds of gun-camera footage on a 2D canvas before the
 * title screen, while the scenery and the jets load (the script is in intro-script.ts). The title screen is built
 * underneath from the start, so the footage cuts to it ready. A click, a tap or any key skips it, and the keys it
 * takes never reach the title screen's FLY button. With reduced motion the jets, the blast and the shake stay out:
 * the sky, the HUD and the title fade in.
 */

const HUD = '#63ff95';
const CANOPY = '#f2f5f7';
const GHOST = '#9fb0bd';
const STREAMER = '#cf2330';
const DISPLAY = "Rajdhani, 'Arial Narrow', system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const BOOT: readonly string[] = ['FCS ........ ONLINE', 'INS ALIGN .. OK', 'RADAR ...... OK', 'IFF ........ OK', 'MASTER ARM . ON'];
const TAGLINE = 'JET DOGFIGHT AGAINST AI PILOTS';
const LOAD_SEGMENTS = 24;
/** Nothing nearer than this is drawn; the frame's focal length is this share of its height. */
const NEAR_Z = 0.35;
const FOCAL = 0.9;
/** The ground lies this far below the camera, and the air streaks rush past at this speed. */
const GROUND_Y = -3;
const STREAK_SPEED = 14;

/*
 * The bandit: a small twin-tailed fighter in wingspans (x right, y up, z to the nose), drawn as flat-shaded faces so
 * it reads as a solid jet from any angle as it pulls away.
 */
type V3 = readonly [number, number, number];
interface Face {
  pts: readonly V3[];
  rgb: readonly [number, number, number];
}
const PAINT = [122, 136, 150] as const;
const SOOT = [34, 37, 41] as const;
const GLASS = [86, 112, 132] as const;
/** The key light comes from above, right and behind the bandit, over the camera's shoulder. */
const KEY = normalize([0.35, 0.75, -0.55]);
const NOZZLES: readonly V3[] = [
  [-0.035, 0, -0.43],
  [0.035, 0, -0.43],
];
const WING_TIPS: readonly V3[] = [
  [-0.5, -0.01, -0.25],
  [0.5, -0.01, -0.25],
];
const JET_FACES: readonly Face[] = buildJet();

function buildJet(): Face[] {
  const ring = (z: number, w: number, h: number, y = 0): V3[] => [
    [-w / 2, y, z],
    [-w / 4, y + h / 2, z],
    [w / 4, y + h / 2, z],
    [w / 2, y, z],
    [w / 4, y - h / 2, z],
    [-w / 4, y - h / 2, z],
  ];
  const mirror = (pts: readonly V3[]): V3[] => pts.map(([x, y, z]): V3 => [-x, y, z]).reverse();
  const tail = ring(-0.42, 0.15, 0.08);
  const mid = ring(-0.05, 0.21, 0.12);
  const cockpit = ring(0.3, 0.12, 0.11, 0.01);
  const nose: V3 = [0, 0, 0.62];
  const faces: Face[] = [];
  for (const [a, b] of [
    [tail, mid],
    [mid, cockpit],
  ]) {
    for (let k = 0; k < 6; k++) faces.push({ pts: [a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k]], rgb: PAINT });
  }
  for (let k = 0; k < 6; k++) faces.push({ pts: [cockpit[k], cockpit[(k + 1) % 6], nose], rgb: PAINT });
  faces.push({ pts: tail, rgb: SOOT });
  const wing: V3[] = [
    [0.09, 0, 0.18],
    [0.5, -0.01, -0.17],
    [0.5, -0.01, -0.25],
    [0.09, 0, -0.32],
  ];
  const stab: V3[] = [
    [0.07, -0.01, -0.3],
    [0.25, -0.02, -0.42],
    [0.25, -0.02, -0.48],
    [0.07, -0.01, -0.46],
  ];
  const fin: V3[] = [
    [0.055, 0.05, -0.1],
    [0.125, 0.25, -0.3],
    [0.125, 0.25, -0.38],
    [0.055, 0.05, -0.4],
  ];
  const canopy: V3[] = [
    [0, 0.11, 0.1],
    [0, 0.11, 0.3],
    [0.04, 0.065, 0.36],
    [0.04, 0.065, 0.06],
  ];
  for (const part of [wing, stab, fin]) faces.push({ pts: part, rgb: PAINT }, { pts: mirror(part), rgb: PAINT });
  faces.push({ pts: canopy, rgb: GLASS }, { pts: mirror(canopy), rgb: GLASS });
  return faces;
}

function normalize([x, y, z]: readonly number[]): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

interface Pt {
  x: number;
  y: number;
}
/** Smoke and contrails stay put in the air: their distance shrinks as the camera flies on. */
interface Puff {
  x: number;
  y: number;
  z: number;
  born: number;
  size: number;
  grow: number;
  life: number;
  dark: boolean;
}
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
  life: number;
}

/** Plays the opening over `root`; resolves once it has cut to whatever is underneath. */
export function showIntro(root: HTMLElement, progress: LoadProgress, reducedMotion: boolean): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('role', 'progressbar');
  overlay.setAttribute('aria-label', 'Loading Lechovia Skies');
  const canvas = document.createElement('canvas');
  overlay.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve();
  root.appendChild(overlay);
  const film = new IntroFilm(ctx, reducedMotion);

  return new Promise((resolve) => {
    let t = 0;
    let last = -1;
    let outStart = -1;
    let outLength = INTRO_OUT_S;
    // Keys the opening took, held until they come up so a held Enter or Space never presses FLY underneath.
    const held = new Set<string>();

    const skip = (): void => {
      if (outStart < 0) {
        outStart = t;
        outLength = INTRO_SKIP_OUT_S;
      }
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (held.has(e.code)) {
        e.preventDefault();
        return;
      }
      if (!overlay.isConnected || e.ctrlKey || e.metaKey || e.altKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      held.add(e.code);
      skip();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (!held.delete(e.code)) return;
      e.preventDefault();
      if (held.size === 0 && !overlay.isConnected) unlisten();
    };
    const unlisten = (): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
    const onResize = (): void => film.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('resize', onResize);
    overlay.addEventListener('pointerdown', skip);
    onResize();
    // The title is drawn in the fallback face until Rajdhani has loaded, then again in it.
    Promise.all([document.fonts.load(`700 100px ${DISPLAY}`), document.fonts.load(`600 20px ${DISPLAY}`)])
      .then(() => film.fontsReady())
      .catch(() => {});

    const frame = (now: number): void => {
      // Real time, so a slow machine still sees about five seconds; a gap of over a second is a hidden tab, which
      // pauses the footage instead of running it out unseen.
      const gap = last < 0 ? 0 : Math.max(0, (now - last) / 1000);
      const dt = gap > 1 ? 1 / 60 : gap;
      last = now;
      t += dt;
      if (outStart < 0 && revealAt(t, progress.complete)) outStart = t;
      const out = outStart < 0 ? 0 : clamp((t - outStart) / outLength, 0, 1);
      film.draw(t, dt, progress, out);
      overlay.style.opacity = String(1 - smoothstep(0.35, 1, out));
      const percent = String(Math.round(progress.fraction * 100));
      if (overlay.getAttribute('aria-valuenow') !== percent) overlay.setAttribute('aria-valuenow', percent);
      if (out >= 1) {
        window.removeEventListener('resize', onResize);
        overlay.remove();
        if (held.size === 0) unlisten();
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/** The footage itself: one canvas, redrawn from the time since the start. */
class IntroFilm {
  private w = 1;
  private h = 1;
  private dpr = 1;
  private cx = 0;
  private hy = 0;
  private f = 1;
  private bar = 0;
  private loadShown = 0;
  private readonly stars: { x: number; y: number; a: number; tw: number }[] = [];
  private readonly lights: { x: number; z: number; warm: boolean }[] = [];
  private readonly streaks: { x: number; y: number; z: number }[] = [];
  private readonly trails: [Puff[], Puff[]] = [[], []];
  private readonly missileTrail: Puff[] = [];
  private readonly smoke: Puff[] = [];
  private readonly sparks: Particle[] = [];
  private readonly debris: Particle[] = [];
  private readonly blobs: { dx: number; dy: number; r: number; d: number }[] = [];
  private readonly ridgePhase = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
  private exploded = false;
  private grain: CanvasPattern | null = null;
  private scan: CanvasPattern | null = null;
  private readonly title = document.createElement('canvas');
  private readonly titleRed = document.createElement('canvas');
  private readonly titleCyan = document.createElement('canvas');
  private readonly sweep = document.createElement('canvas');
  private titleSize = { w: 0, h: 0, word: 0, bottom: 0, size: 0 };
  private readonly canBlur: boolean;
  private readonly p: Pt = { x: 0, y: 0 };
  private readonly q: Pt = { x: 0, y: 0 };
  private readonly ctx: CanvasRenderingContext2D;
  /** reduced motion: no jets, blast or shake */
  private readonly calm: boolean;

  constructor(ctx: CanvasRenderingContext2D, calm: boolean) {
    this.ctx = ctx;
    this.calm = calm;
    this.canBlur = 'filter' in ctx;
    for (let i = 0; i < 150; i++) this.stars.push({ x: Math.random() * 2 - 0.5, y: Math.random(), a: 0.25 + Math.random() * 0.75, tw: Math.random() * 6 });
    for (let i = 0; i < 46; i++) this.lights.push({ x: (Math.random() * 2 - 1) * 14, z: 4 + Math.random() * 46, warm: Math.random() < 0.8 });
    for (let i = 0; i < 56; i++) this.streaks.push(this.newStreak(2 + Math.random() * 30));
    for (let i = 0; i < 6; i++) this.blobs.push({ dx: (Math.random() - 0.5) * 0.7, dy: (Math.random() - 0.5) * 0.5, r: 0.4 + Math.random() * 0.4, d: Math.random() * 0.15 });
    this.grain = this.makeGrain();
    this.scan = this.makeScanlines();
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    // At most about 2.6 million pixels: a 4K screen draws at a lower ratio.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2_600_000 / (this.w * this.h)));
    const c = this.ctx.canvas;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    this.cx = this.w / 2;
    this.hy = this.h * 0.56;
    this.f = this.h * FOCAL;
    this.renderTitle();
  }

  fontsReady(): void {
    this.renderTitle();
  }

  draw(t: number, dt: number, progress: LoadProgress, out: number): void {
    const { ctx, w, h } = this;
    this.update(t, dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // The world, banking gently and shaken by the pass and the blast.
    const shake = this.calm ? 0 : shakeAt(t);
    const sx = shake * (Math.sin(t * 91.7) + Math.sin(t * 53.3)) * 0.5;
    const sy = shake * (Math.sin(t * 77.1) + Math.sin(t * 41.9)) * 0.5;
    const roll = this.calm ? 0 : 0.05 * Math.sin(t * 0.8) - 0.02;
    ctx.save();
    ctx.translate(this.cx + sx, this.hy + sy);
    ctx.rotate(roll);
    ctx.translate(-this.cx, -this.hy);
    this.drawSky(t);
    this.drawGround(t);
    if (!this.calm) {
      this.drawStreaks(t);
      this.drawTrail(this.trails[0], t, '238,244,255', 0.45);
      this.drawTrail(this.trails[1], t, '238,244,255', 0.45);
      this.drawTrail(this.missileTrail, t, '205,212,220', 0.4);
      this.drawSmoke(t);
      this.drawBandit(t);
      this.drawMissile(t);
      this.drawExplosion(t);
    }
    // The picture comes up out of black as the camera powers on.
    const dark = 1 - smoothstep(0.05, 0.9, t);
    if (dark > 0) {
      ctx.globalAlpha = dark;
      ctx.fillStyle = '#000';
      ctx.fillRect(-w, -h, w * 3, h * 3);
      ctx.globalAlpha = 1;
    }
    // The HUD steps back once the title is up.
    const titleUp = this.calm ? 0.6 : BEAT.hit;
    const hudAlpha = smoothstep(0.45, 0.9, t) * (1 - 0.75 * smoothstep(titleUp, titleUp + 0.4, t));
    this.drawLadder(t, hudAlpha);
    if (!this.calm) this.drawTargeting(t);
    ctx.restore();

    this.drawHud(t, hudAlpha);
    this.drawTitle(t, out);
    if (!this.calm) this.drawFlash(t);
    this.drawFilm(t);
    this.drawBars(t, progress, out, dt);
    if (out > 0) {
      ctx.globalAlpha = (this.calm ? 0.35 : 0.9) * smoothstep(0, 0.3, out);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Simulation of what is in the air ----------

  private update(t: number, dt: number): void {
    for (const s of this.streaks) {
      s.z -= STREAK_SPEED * dt;
      if (s.z < NEAR_Z) Object.assign(s, this.newStreak(26 + Math.random() * 6));
    }
    for (const l of this.lights) {
      l.z -= CAMERA_SPEED * dt * (this.calm ? 0.3 : 1);
      if (l.z < 2.5) {
        l.z += 48;
        l.x = (Math.random() * 2 - 1) * 14;
      }
    }
    if (this.calm) return;
    // Vapour off the bandit's wing tips while it pulls.
    const b = banditPose(t);
    if (b && b.z > 0.6) {
      WING_TIPS.forEach(([x, y, z], i) => {
        const p = jetPoint(b, x, y, z);
        this.trails[i].push({ ...p, born: t, size: 0.01, grow: 0.025, life: 1.5, dark: false });
      });
    }
    // The missile's smoke.
    const m = missilePose(t);
    if (m) this.missileTrail.push({ x: m.x, y: m.y, z: m.z, born: t, size: 0.02, grow: 0.09, life: 1.8, dark: false });
    for (const trail of [...this.trails, this.missileTrail]) {
      while (trail.length && (t - trail[0].born > trail[0].life || this.puffZ(trail[0], t) < NEAR_Z)) trail.shift();
    }
    // The hit: sparks, three burning pieces and the fireball.
    if (!this.exploded && t >= BEAT.hit) {
      this.exploded = true;
      const e = hitPoint();
      for (let i = 0; i < 64; i++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const v = 0.8 + Math.random() * 2.6;
        this.sparks.push({ x: e.x, y: e.y, z: e.z, vx: r * Math.cos(a) * v, vy: u * v + 0.4, vz: r * Math.sin(a) * v, born: t, life: 0.6 + Math.random() * 1.1 });
      }
      for (const [vx, vy, vz] of [
        [-0.75, 0.55, 0.2],
        [0.85, 0.3, -0.3],
        [0.15, -0.1, -0.8],
      ]) {
        this.debris.push({ x: e.x, y: e.y, z: e.z, vx, vy, vz, born: t, life: 2.4 });
      }
    }
    for (const list of [this.sparks, this.debris]) {
      for (const p of list) {
        p.vy -= 1.4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += (p.vz - CAMERA_SPEED) * dt;
      }
    }
    for (const d of this.debris) {
      if (t - d.born < d.life && d.z > NEAR_Z && Math.random() < 0.5) this.smoke.push({ x: d.x, y: d.y, z: d.z, born: t, size: 0.03, grow: 0.16, life: 1.6, dark: true });
    }
    removeWhere(this.sparks, (p) => t - p.born > p.life || p.z < NEAR_Z);
    removeWhere(this.smoke, (p) => t - p.born > p.life || this.puffZ(p, t) < NEAR_Z);
  }

  private newStreak(z: number): { x: number; y: number; z: number } {
    // Keep them off the middle of the frame, where the bandit and the title are.
    let x = 0;
    let y = 0;
    do {
      x = (Math.random() * 2 - 1) * 5;
      y = Math.random() * 6 - 2.5;
    } while (Math.abs(x) < 1.2 && Math.abs(y) < 0.9);
    return { x, y, z };
  }

  private puffZ(p: Puff, t: number): number {
    return p.z - CAMERA_SPEED * (t - p.born);
  }

  /** Camera-relative (x, y, z) to the frame, before the bank and shake; false when it is behind the camera. */
  private project(x: number, y: number, z: number, out: Pt): boolean {
    if (z < NEAR_Z) return false;
    out.x = this.cx + (x / z) * this.f;
    out.y = this.hy - (y / z) * this.f;
    return true;
  }

  // ---------- The world ----------

  private drawSky(t: number): void {
    const { ctx, w, h, hy } = this;
    const sky = ctx.createLinearGradient(0, hy - h, 0, hy);
    sky.addColorStop(0, '#010309');
    sky.addColorStop(0.5, '#06111d');
    sky.addColorStop(0.82, '#13263a');
    sky.addColorStop(0.96, '#3b3c4a');
    sky.addColorStop(1, '#6a4a3e');
    ctx.fillStyle = sky;
    ctx.fillRect(-w, hy - h * 2, w * 3, h * 2);
    // Dawn just below the horizon, right of the nose.
    const sunX = this.cx + w * 0.24;
    const sunY = hy - h * 0.008;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.75);
    glow.addColorStop(0, 'rgba(255,196,120,0.55)');
    glow.addColorStop(0.18, 'rgba(255,128,64,0.22)');
    glow.addColorStop(1, 'rgba(255,96,48,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-w, hy - h * 2, w * 3, h * 2);
    for (const s of this.stars) {
      const y = hy - h * 1.05 * s.y - h * 0.04;
      const a = s.a * smoothstep(hy - h * 0.12, hy - h * 0.5, y) * (0.75 + 0.25 * Math.sin(t * 3 + s.tw));
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(s.x * w, y, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.03);
    sun.addColorStop(0, 'rgba(255,250,235,1)');
    sun.addColorStop(0.35, 'rgba(255,214,150,0.85)');
    sun.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sunX - h * 0.03, sunY - h * 0.03, h * 0.06, h * 0.06);
    // Two ranges of hills against the dawn, the nearer one drifting faster.
    this.drawRidge(t * 0.006, hy + h * 0.002, h * 0.026, '#111d29', 0);
    this.drawRidge(t * 0.016, hy + h * 0.012, h * 0.04, '#070d14', 3);
  }

  private drawRidge(shift: number, base: number, height: number, color: string, k: number): void {
    const { ctx, w, h } = this;
    const ph = this.ridgePhase;
    ctx.beginPath();
    ctx.moveTo(-w, base + h);
    for (let x = -w; x <= w * 2; x += w / 60) {
      const u = x / w + shift;
      const n = 0.5 + 0.25 * Math.sin(u * 7.1 + ph[k]) + 0.17 * Math.sin(u * 16.3 + ph[k + 1]) + 0.08 * Math.sin(u * 41 + ph[k + 2]);
      ctx.lineTo(x, base - height * n);
    }
    ctx.lineTo(w * 2, base + h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private drawGround(t: number): void {
    const { ctx, w, h, hy } = this;
    const ground = ctx.createLinearGradient(0, hy, 0, hy + h * 0.5);
    ground.addColorStop(0, 'rgba(10,18,26,0)');
    ground.addColorStop(1, 'rgba(2,4,7,0.9)');
    ctx.fillStyle = ground;
    ctx.fillRect(-w, hy + h * 0.012, w * 3, h * 2);
    // Village lights streaming under the nose.
    for (const l of this.lights) {
      if (!this.project(l.x, GROUND_Y, l.z, this.p)) continue;
      const a = smoothstep(50, 30, l.z) * (0.7 + 0.3 * Math.sin(t * 9 + l.x));
      const r = clamp(18 / l.z, 1, 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = l.warm ? '#ffcf8a' : '#cfe2ff';
      ctx.fillRect(this.p.x - r / 2, this.p.y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }

  private drawStreaks(t: number): void {
    const { ctx } = this;
    // Faster-looking while the bandit rushes past.
    const boost = 1 + 1.5 * Math.exp(-(((t - 1.2) / 0.35) ** 2));
    ctx.strokeStyle = '#d6e6ff';
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      if (!this.project(s.x, s.y, s.z, this.p) || !this.project(s.x, s.y, s.z + 0.7 * boost, this.q)) continue;
      ctx.globalAlpha = 0.16 * smoothstep(30, 6, s.z) * smoothstep(0.3, 1.2, t);
      ctx.lineWidth = clamp(4 / s.z, 0.5, 3);
      ctx.beginPath();
      ctx.moveTo(this.p.x, this.p.y);
      ctx.lineTo(this.q.x, this.q.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A trail left in the air, widening with age and fading out as the camera flies into it. */
  private drawTrail(trail: readonly Puff[], t: number, rgb: string, alpha: number): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgb(${rgb})`;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      const za = this.puffZ(a, t);
      const zb = this.puffZ(b, t);
      if (!this.project(a.x, a.y, za, this.p) || !this.project(b.x, b.y, zb, this.q)) continue;
      const age = t - b.born;
      ctx.globalAlpha = alpha * (1 - age / b.life) * smoothstep(0.5, 2.5, zb);
      if (ctx.globalAlpha < 0.01) continue;
      ctx.lineWidth = Math.max(0.6, ((b.size + b.grow * age) / zb) * this.f);
      ctx.beginPath();
      ctx.moveTo(this.p.x, this.p.y);
      ctx.lineTo(this.q.x, this.q.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawSmoke(t: number): void {
    const { ctx } = this;
    for (const s of this.smoke) {
      const z = this.puffZ(s, t);
      if (!this.project(s.x, s.y, z, this.p)) continue;
      const age = t - s.born;
      const r = ((s.size + s.grow * age) / z) * this.f;
      ctx.globalAlpha = (s.dark ? 0.35 : 0.3) * (1 - age / s.life) * smoothstep(0.4, 1.2, z);
      ctx.fillStyle = s.dark ? '#1c1d21' : '#c9d0d8';
      ctx.beginPath();
      ctx.arc(this.p.x, this.p.y, Math.max(0.8, r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBandit(t: number): void {
    const pose = banditPose(t);
    if (!pose || pose.z < NEAR_Z) return;
    // Close by, a little motion blur: two fainter copies where it just was.
    if (pose.z < 1.6) {
      for (const [lag, a] of [
        [0.024, 0.18],
        [0.012, 0.35],
      ]) {
        const ghost = banditPose(t - lag);
        if (ghost) this.drawJet(ghost, a, t, false);
      }
    }
    this.drawJet(pose, 1, t, true);
  }

  /** The bandit's faces, far ones first, lit by the key light; then its burners and lights. */
  private drawJet(pose: Pose, alpha: number, t: number, lit: boolean): void {
    const { ctx } = this;
    const drawn: { depth: number; pts: Pt[]; fill: string }[] = [];
    for (const face of JET_FACES) {
      const cam = face.pts.map(([x, y, z]) => jetPoint(pose, x, y, z));
      if (cam.some((v) => v.z < NEAR_Z)) continue;
      const [a, b, c] = cam;
      let n = normalize(cross([b.x - a.x, b.y - a.y, b.z - a.z], [c.x - a.x, c.y - a.y, c.z - a.z]));
      // Light the side the camera sees.
      if (n[0] * a.x + n[1] * a.y + n[2] * a.z > 0) n = [-n[0], -n[1], -n[2]];
      const light = 0.5 + 0.7 * Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]);
      const pts = cam.map((v) => {
        const p = { x: 0, y: 0 };
        this.project(v.x, v.y, v.z, p);
        return p;
      });
      const [r, g, bl] = face.rgb;
      drawn.push({
        depth: cam.reduce((sum, v) => sum + v.z, 0) / cam.length,
        pts,
        fill: `rgb(${Math.round(r * light)},${Math.round(g * light)},${Math.round(bl * light)})`,
      });
    }
    drawn.sort((p, q) => q.depth - p.depth);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.8;
    for (const d of drawn) {
      ctx.beginPath();
      d.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = d.fill;
      ctx.strokeStyle = d.fill;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    if (!lit) return;

    // Burners, wing-tip lights and the strobe, in screen space so they stay points of light far away.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, z] of NOZZLES) {
      const v = jetPoint(pose, x, y, z);
      if (!this.project(v.x, v.y, v.z, this.q)) continue;
      const s = this.f / v.z;
      const flick = 0.85 + 0.3 * Math.random();
      const r = Math.max(5, 0.065 * s) * flick;
      glow(ctx, this.q.x, this.q.y, r * 2, 'rgba(255,130,50,0.4)', 'rgba(255,80,30,0)');
      const core = ctx.createRadialGradient(this.q.x, this.q.y, 0, this.q.x, this.q.y, r);
      core.addColorStop(0, 'rgba(255,255,244,1)');
      core.addColorStop(0.35, 'rgba(255,216,150,0.95)');
      core.addColorStop(1, 'rgba(255,110,40,0)');
      ctx.fillStyle = core;
      ctx.fillRect(this.q.x - r, this.q.y - r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(150,180,255,0.5)';
      ctx.lineWidth = Math.max(1, 0.006 * s);
      ctx.beginPath();
      ctx.arc(this.q.x, this.q.y, Math.max(2, 0.032 * s), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Close by, the burners throw a horizontal lens streak.
    if (pose.z < 3) {
      const v = jetPoint(pose, 0, 0, -0.43);
      if (this.project(v.x, v.y, v.z, this.q)) lensStreak(ctx, this.q.x, this.q.y, this.w * 0.7, 0.35 * (1 - pose.z / 3), '160,190,255');
    }
    const s = this.f / pose.z;
    const lightR = Math.max(1.5, 0.012 * s);
    WING_TIPS.forEach(([x, y, z], i) => {
      const v = jetPoint(pose, x, y, z + 0.06);
      if (this.project(v.x, v.y, v.z, this.q)) glow(ctx, this.q.x, this.q.y, lightR * 3, i === 0 ? 'rgba(255,60,60,0.95)' : 'rgba(80,255,140,0.95)', 'rgba(0,0,0,0)');
    });
    if (Math.floor(t * 2.2) % 2 === 0) {
      for (const side of [-1, 1]) {
        const v = jetPoint(pose, side * 0.125, 0.25, -0.36);
        if (this.project(v.x, v.y, v.z, this.q)) glow(ctx, this.q.x, this.q.y, lightR * 4, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
      }
    }
    ctx.restore();
  }

  private drawMissile(t: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The flash on the rail as it fires.
    const sinceFire = t - BEAT.fire;
    if (sinceFire >= 0 && sinceFire < 0.3 && this.project(-0.55, -0.4, 0.5, this.p)) {
      const a = 1 - sinceFire / 0.3;
      glow(ctx, this.p.x, this.p.y, this.h * 0.35 * (0.6 + a * 0.4), `rgba(255,200,120,${0.6 * a})`, 'rgba(255,120,40,0)');
    }
    const m = missilePose(t);
    if (m && this.project(m.x, m.y, m.z, this.p)) {
      const r = Math.max(4, (0.06 / m.z) * this.f);
      glow(ctx, this.p.x, this.p.y, r * 3, 'rgba(255,170,90,0.5)', 'rgba(255,100,40,0)');
      glow(ctx, this.p.x, this.p.y, r, 'rgba(255,255,240,1)', 'rgba(255,220,160,0)');
    }
    ctx.restore();
  }

  private drawExplosion(t: number): void {
    if (!this.exploded) return;
    const { ctx } = this;
    const age = t - BEAT.hit;
    const e = hitPoint();
    const z = e.z - CAMERA_SPEED * age;
    if (!this.project(e.x, e.y, z, this.p)) return;
    const ex = this.p.x;
    const ey = this.p.y;
    const s = this.f / z;
    // The smoke the fireball leaves.
    const smokeA = 0.6 * smoothstep(0.1, 0.6, age) * (1 - smoothstep(1.4, 3.2, age));
    if (smokeA > 0) {
      const r = (0.7 + 0.45 * age) * s;
      const g = ctx.createRadialGradient(ex, ey - age * 0.05 * s, 0, ex, ey - age * 0.05 * s, r);
      g.addColorStop(0, `rgba(58,46,40,${smokeA})`);
      g.addColorStop(0.6, `rgba(30,30,34,${smokeA * 0.8})`);
      g.addColorStop(1, 'rgba(20,20,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ex - r, ey - r - age * 0.05 * s, r * 2, r * 2);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The fireball: a few blobs that swell and cool.
    const heat = Math.exp(-age * 1.5);
    for (const b of this.blobs) {
      const grow = 1 - Math.exp(-(age - b.d) * 6);
      if (grow <= 0) continue;
      const r = (0.25 + 1.5 * b.r * grow) * s;
      const bx = ex + b.dx * s * grow;
      const by = ey + b.dy * s * grow;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, `rgba(255,252,230,${heat})`);
      g.addColorStop(0.3, `rgba(255,196,90,${0.85 * heat})`);
      g.addColorStop(0.65, `rgba(255,90,24,${0.45 * heat})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    // The shock ring.
    const u = age / 0.65;
    if (u < 1) {
      ctx.strokeStyle = `rgba(255,240,220,${0.55 * (1 - u)})`;
      ctx.lineWidth = 1.5 + 5 * (1 - u);
      ctx.beginPath();
      ctx.arc(ex, ey, easeOutCubic(u) * Math.max(this.w, this.h) * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Sparks, drawn as short streaks along their flight.
    ctx.lineCap = 'round';
    for (const p of this.sparks) {
      const k = (t - p.born) / p.life;
      const back = 0.05;
      if (!this.project(p.x, p.y, p.z, this.p) || !this.project(p.x - p.vx * back, p.y - p.vy * back, p.z - (p.vz - CAMERA_SPEED) * back, this.q)) continue;
      ctx.strokeStyle = k < 0.4 ? 'rgba(255,240,190,0.95)' : `rgba(255,150,60,${0.9 * (1 - k)})`;
      ctx.lineWidth = Math.max(1, (0.012 / p.z) * this.f);
      ctx.beginPath();
      ctx.moveTo(this.q.x, this.q.y);
      ctx.lineTo(this.p.x, this.p.y);
      ctx.stroke();
    }
    // The burning pieces.
    for (const d of this.debris) {
      const k = (t - d.born) / d.life;
      if (k >= 1 || !this.project(d.x, d.y, d.z, this.p)) continue;
      const r = Math.max(3, (0.07 / d.z) * this.f) * (0.8 + 0.4 * Math.random());
      glow(ctx, this.p.x, this.p.y, r, `rgba(255,190,100,${1 - k})`, 'rgba(255,90,30,0)');
    }
    lensStreak(ctx, ex, ey, this.w * 1.2, 0.8 * Math.exp(-age * 3), '255,200,150');
    ctx.restore();
  }

  // ---------- The HUD ----------

  /** The pitch ladder banks with the world. */
  private drawLadder(t: number, alpha: number): void {
    if (alpha <= 0) return;
    const { ctx, cx, hy, f } = this;
    const e = easeOutCubic((t - 0.6) / 0.6);
    ctx.save();
    hudStyle(ctx, alpha);
    ctx.beginPath();
    ctx.moveTo(cx - 40, hy);
    ctx.lineTo(cx - 40 - 210 * e, hy);
    ctx.moveTo(cx + 40, hy);
    ctx.lineTo(cx + 40 + 210 * e, hy);
    ctx.stroke();
    ctx.font = `11px ${MONO}`;
    ctx.textBaseline = 'middle';
    for (const deg of [-10, -5, 5, 10]) {
      const y = hy - Math.tan((deg * Math.PI) / 180) * f;
      const len = 54 * e;
      ctx.setLineDash(deg < 0 ? [6, 5] : []);
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(cx + side * 34, y + (deg > 0 ? 7 : -7));
        ctx.lineTo(cx + side * 34, y);
        ctx.lineTo(cx + side * (34 + len), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (e > 0.9) {
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.abs(deg)), cx - 40 - len, y);
        ctx.textAlign = 'left';
        ctx.fillText(String(Math.abs(deg)), cx + 40 + len, y);
      }
    }
    ctx.restore();
  }

  /** The seeker hunts for the bandit, locks it, and the box flashes. */
  private drawTargeting(t: number): void {
    if (t < BEAT.seeker || t >= BEAT.hit) return;
    const pose = banditPose(t);
    if (!pose || !this.project(pose.x, pose.y, pose.z, this.p)) return;
    const { ctx } = this;
    const half = clamp((0.36 / pose.z) * this.f, 16, 90);
    ctx.save();
    hudStyle(ctx, 1);
    ctx.font = `bold 12px ${MONO}`;
    ctx.textAlign = 'center';
    if (t < BEAT.lock) {
      const u = easeOutCubic((t - BEAT.seeker) / (BEAT.lock - BEAT.seeker));
      const x = this.p.x + (1 - u) * 18 * Math.sin(t * 23);
      const y = this.p.y + (1 - u) * 14 * Math.cos(t * 17);
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.arc(x, y, lerp(90, half * 1.3, u), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const since = t - BEAT.lock;
      if (since > 0.3 || Math.floor(since * 16) % 2 === 0) {
        const x = this.p.x;
        const y = this.p.y;
        const k = Math.min(12, half * 0.6);
        ctx.beginPath();
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          ctx.moveTo(x + sx * half, y + sy * (half - k));
          ctx.lineTo(x + sx * half, y + sy * half);
          ctx.lineTo(x + sx * (half - k), y + sy * half);
        }
        ctx.stroke();
        ctx.fillText('LOCK', x, y - half - 9);
        ctx.font = `11px ${MONO}`;
        ctx.fillText(`R ${(pose.z * 0.11).toFixed(1)}`, x, y + half + 14);
      }
    }
    ctx.restore();
  }

  private drawHud(t: number, alpha: number): void {
    const { ctx, cx, hy, w, h } = this;
    ctx.save();
    // The boot check list, typed as the systems come up.
    const bootA = smoothstep(0, 0.2, t) * (1 - 0.6 * smoothstep(2.2, 2.8, t));
    hudStyle(ctx, bootA);
    ctx.font = `12px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const left = clamp(w * 0.03, 16, 40);
    // On a narrow screen the heading tape takes the top, so the list goes under it.
    const top = this.bar + (w < 640 ? 76 : 30);
    BOOT.forEach((line, i) => {
      ctx.fillText(typed(line, 0.15 + i * 0.17, t, 70), left, top + i * 17);
    });
    if (alpha > 0) {
      hudStyle(ctx, alpha);
      // The flight path marker.
      ctx.beginPath();
      ctx.arc(cx, hy, 7, 0, Math.PI * 2);
      ctx.moveTo(cx - 7, hy);
      ctx.lineTo(cx - 18, hy);
      ctx.moveTo(cx + 7, hy);
      ctx.lineTo(cx + 18, hy);
      ctx.moveTo(cx, hy - 7);
      ctx.lineTo(cx, hy - 14);
      ctx.stroke();
      this.drawHeading(t);
      // Speed, altitude and G, spinning up as the instruments come on line.
      const on = easeOutCubic((t - 0.55) / 0.9);
      const kt = Math.round(on * 512 + 6 * Math.sin(t * 2));
      const alt = Math.round((on * 18450 + 40 * Math.sin(t * 1.3)) / 10) * 10;
      const g = 1.1 + 4.6 * smoothstep(1.3, 2.0, t) * (1 - smoothstep(2.4, 3.0, t));
      const off = Math.min(w * 0.3, 300);
      ctx.font = `bold 15px ${MONO}`;
      ctx.textBaseline = 'middle';
      ctx.strokeRect(cx - off - 66, hy - 13, 66, 26);
      ctx.strokeRect(cx + off, hy - 13, 80, 26);
      ctx.textAlign = 'right';
      ctx.fillText(String(kt), cx - off - 8, hy + 1);
      ctx.fillText(alt.toLocaleString('en-US').replace(',', ' '), cx + off + 72, hy + 1);
      ctx.font = `11px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText('KT', cx - off - 66, hy - 24);
      ctx.fillText('ALT', cx + off, hy - 24);
      ctx.fillText(`G ${g.toFixed(1)}`, cx - off - 66, hy + 30);
      ctx.fillText(`M ${(0.78 * on + 0.02 * Math.sin(t)).toFixed(2).slice(1)}`, cx - off - 66, hy + 46);
    }
    // FOX 2 as the missile goes, SPLASH ONE after the hit.
    const callY = h - this.bar - clamp(h * 0.05, 24, 44);
    ctx.font = `bold ${clamp(w * 0.02, 15, 22)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (!this.calm && t >= BEAT.fire && t < BEAT.hit + 0.1 && Math.floor((t - BEAT.fire) * 10) % 3 !== 2) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = CANOPY;
      ctx.shadowBlur = 0;
      spaced(ctx, 'FOX 2', cx, callY, 6);
    }
    if (!this.calm && t >= BEAT.splash) {
      hudStyle(ctx, smoothstep(BEAT.splash, BEAT.splash + 0.1, t) * (1 - smoothstep(4.4, 4.8, t)));
      spaced(ctx, 'SPLASH ONE', cx, callY, 6);
    }
    ctx.restore();
  }

  private drawHeading(t: number): void {
    const { ctx, cx } = this;
    const y = this.bar + 30;
    const hdg = (352 + t * 3) % 360;
    const perDeg = 6;
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.beginPath();
    for (let d = Math.ceil((hdg - 24) / 5) * 5; d <= hdg + 24; d += 5) {
      const x = cx + (d - hdg) * perDeg;
      const major = ((d % 10) + 10) % 10 === 0;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (major ? 8 : 4));
      if (major) ctx.fillText(String((((d / 10) % 36) + 36) % 36).padStart(2, '0'), x, y - 4);
    }
    ctx.moveTo(cx - 5, y + 17);
    ctx.lineTo(cx, y + 11);
    ctx.lineTo(cx + 5, y + 17);
    ctx.stroke();
  }

  // ---------- The title ----------

  /** The lock-up of the title screen (LECHOVIA spread over SKIES), drawn once per size in white, red and cyan. */
  private renderTitle(): void {
    const size = clamp(Math.min(this.w * 0.25, this.h * 0.26), 60, 230);
    const kick = size * 0.15;
    const m = this.ctx;
    m.save();
    m.font = `700 ${size}px ${DISPLAY}`;
    const wm = m.measureText('SKIES');
    m.font = `600 ${kick}px ${DISPLAY}`;
    const km = m.measureText('L');
    m.restore();
    const word = wm.width;
    const asc = wm.actualBoundingBoxAscent || size * 0.7;
    const desc = wm.actualBoundingBoxDescent || 0;
    const kAsc = km.actualBoundingBoxAscent || kick * 0.7;
    const pad = size * 0.3;
    const cw = word + pad * 2;
    const ch = kAsc + kick * 0.55 + asc + desc + pad * 2;
    for (const c of [this.title, this.titleRed, this.titleCyan, this.sweep]) {
      c.width = Math.max(1, Math.round(cw * this.dpr));
      c.height = Math.max(1, Math.round(ch * this.dpr));
    }
    const g = this.title.getContext('2d');
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = CANOPY;
    g.textBaseline = 'alphabetic';
    g.font = `600 ${kick}px ${DISPLAY}`;
    const letters = [...'LECHOVIA'];
    const widths = letters.map((l) => g.measureText(l).width);
    const span = word - kick * 0.24;
    const gap = (span - widths.reduce((a, b) => a + b, 0)) / (letters.length - 1);
    let x = pad + kick * 0.12;
    letters.forEach((l, i) => {
      g.fillText(l, x, pad + kAsc);
      x += widths[i] + gap;
    });
    g.font = `700 ${size}px ${DISPLAY}`;
    const baseline = pad + kAsc + kick * 0.55 + asc;
    g.fillText('SKIES', pad, baseline);
    for (const [c, color] of [
      [this.titleRed, 'rgb(255,40,70)'],
      [this.titleCyan, 'rgb(40,230,255)'],
    ] as const) {
      const k = c.getContext('2d');
      if (!k) continue;
      k.drawImage(this.title, 0, 0);
      k.globalCompositeOperation = 'source-in';
      k.fillStyle = color;
      k.fillRect(0, 0, c.width, c.height);
    }
    this.titleSize = { w: cw, h: ch, word, bottom: baseline + desc - ch / 2, size };
  }

  private drawTitle(t: number, out: number): void {
    const start = this.calm ? 0.6 : BEAT.title;
    if (t < start) return;
    const { ctx, cx } = this;
    const ts = this.titleSize;
    const age = t - start;
    const ty = this.h * 0.42;
    const slam = this.calm ? 0 : 1 - easeOutCubic(age / 0.22);
    const scale = 1 + 0.6 * slam + 0.035 * smoothstep(0, 2.5, age) + 0.06 * out;
    const alpha = this.calm ? smoothstep(0, 0.8, age) : smoothstep(0, 0.08, age);
    // Red and cyan fringes that close up, with two glitches while it holds.
    const glitch = !this.calm && BEAT.glitches.some((g) => t > g && t < g + 0.05) ? 4 : 0;
    const split = this.calm ? 0 : 16 * Math.exp(-age * 7) + glitch;
    const dw = ts.w * scale;
    const dh = ts.h * scale;
    const x = cx - dw / 2;
    const y = ty - dh / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this.canBlur) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${Math.round(ts.size * 0.09)}px)`;
      ctx.globalAlpha = alpha * (0.3 + 0.5 * Math.exp(-age * 3));
      ctx.drawImage(this.titleRed, x, y, dw, dh);
      ctx.filter = 'none';
      ctx.globalAlpha = alpha;
    }
    if (split > 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.titleRed, x - split, y, dw, dh);
      ctx.drawImage(this.titleCyan, x + split, y, dw, dh);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.title, x, y, dw, dh);
    // A bar of light runs across the letters.
    const sweepU = (t - BEAT.sweep) / 0.7;
    if (!this.calm && sweepU > 0 && sweepU < 1) {
      const k = this.sweep.getContext('2d');
      if (k) {
        const sw = this.sweep.width;
        const sh = this.sweep.height;
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.globalCompositeOperation = 'source-over';
        k.clearRect(0, 0, sw, sh);
        k.drawImage(this.title, 0, 0);
        k.globalCompositeOperation = 'source-atop';
        const bx = lerp(-0.3, 1.3, sweepU) * sw;
        const band = k.createLinearGradient(bx - sh * 0.6, 0, bx + sh * 0.2, sh);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, 'rgba(255,236,200,1)');
        band.addColorStop(1, 'rgba(255,255,255,0)');
        k.fillStyle = band;
        k.fillRect(0, 0, sw, sh);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.sweep, x, y, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // The red streamer under the word, and the tag line typed below it.
    const streamerY = ty + ts.bottom * scale + ts.size * 0.1;
    const sw = ts.word * scale * easeOutCubic((t - (this.calm ? 1 : BEAT.streamer)) / 0.45);
    if (sw > 0) {
      ctx.fillStyle = STREAMER;
      ctx.fillRect(cx - sw / 2, streamerY, sw, Math.max(3, ts.size * 0.03));
    }
    const tag = this.calm ? TAGLINE : typed(TAGLINE, BEAT.tagline, t, 40);
    if (tag) {
      ctx.font = `500 ${clamp(this.w * 0.012, 10, 14)}px ${MONO}`;
      ctx.fillStyle = GHOST;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const spacing = clamp(this.w * 0.004, 2, 5);
      const full = spacedWidth(ctx, TAGLINE, spacing);
      const tx = cx - full / 2;
      const end = spaced(ctx, tag, tx, streamerY + 30, spacing, 'left');
      if (tag.length < TAGLINE.length && Math.floor(t * 8) % 2 === 0) ctx.fillRect(end + 2, streamerY + 19, 8, 13);
    }
    ctx.restore();
  }

  // ---------- Light, film and frame ----------

  /** The white flash of the hit, and a fainter one as the title slams in. */
  private drawFlash(t: number): void {
    const hit = t - BEAT.hit;
    const slam = t - BEAT.title;
    const a = (hit >= 0 ? 0.85 * Math.exp(-hit * 9) : 0) + (slam >= 0 ? 0.3 * Math.exp(-slam * 12) : 0);
    if (a < 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff6e8';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  /** Grain, scan lines and a vignette: it is film from a gun camera. */
  private drawFilm(t: number): void {
    const { ctx, w, h } = this;
    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      const ox = Math.floor(Math.random() * 128);
      const oy = Math.floor(Math.random() * 128);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, w + ox, h + oy);
      ctx.restore();
    }
    if (this.scan) {
      ctx.fillStyle = this.scan;
      ctx.fillRect(0, 0, w, h);
    }
    const r = Math.hypot(w, h) / 2;
    const v = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    // The odd flicker of old film.
    if (!this.calm && Math.sin(t * 37) > 0.97) {
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /** Letterbox bars: the camera's caption on top, the loading progress and the skip hint below. */
  private drawBars(t: number, progress: LoadProgress, out: number, dt: number): void {
    const { ctx, w, h } = this;
    const full = clamp(h * 0.085, 34, 84);
    this.bar = full * easeOutCubic(t / 0.6) * (1 - smoothstep(0, 0.6, out));
    const bar = this.bar;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    const textA = smoothstep(0.3, 0.7, t) * (1 - smoothstep(0, 0.3, out));
    if (textA <= 0) return;
    const narrow = w < 640;
    const edge = clamp(w * 0.03, 16, 40);
    ctx.save();
    ctx.globalAlpha = textA;
    ctx.font = `500 11px ${MONO}`;
    ctx.textBaseline = 'middle';
    const top = bar / 2;
    const bottom = h - bar / 2;
    ctx.fillStyle = GHOST;
    ctx.textAlign = 'left';
    spaced(ctx, narrow ? 'GUN CAM' : 'GUN CAMERA · SORTIE 0417', edge, top, 2.2, 'left');
    const tc = timecode(t);
    const tcW = spacedWidth(ctx, tc, 2.2);
    spaced(ctx, tc, w - edge - tcW, top, 2.2, 'left');
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = STREAMER;
      ctx.beginPath();
      ctx.arc(w - edge - tcW - 14, top, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The progress, eased so a step in the count slides rather than jumps.
    this.loadShown += (progress.fraction - this.loadShown) * (1 - Math.exp(-dt / 0.2));
    const barW = narrow ? w * 0.4 : Math.min(320, w * 0.3);
    const bx = narrow ? edge : this.cx - barW / 2;
    const lit = Math.round(this.loadShown * LOAD_SEGMENTS);
    const gapPx = 2;
    const seg = (barW - gapPx * (LOAD_SEGMENTS - 1)) / LOAD_SEGMENTS;
    for (let i = 0; i < LOAD_SEGMENTS; i++) {
      ctx.fillStyle = i < lit ? HUD : 'rgba(255,255,255,0.13)';
      ctx.fillRect(bx + i * (seg + gapPx), bottom - 3, seg, 6);
    }
    ctx.fillStyle = HUD;
    spaced(ctx, `${Math.round(this.loadShown * 100)}%`, bx + barW + 10, bottom, 2, 'left');
    ctx.fillStyle = GHOST;
    if (!narrow) spaced(ctx, loadLabel(progress.done, progress.total), edge, bottom, 2.2, 'left');
    if (t > 0.8) {
      const hint = narrow ? 'TAP TO SKIP' : 'CLICK OR PRESS ANY KEY TO SKIP';
      ctx.globalAlpha = textA * 0.7;
      spaced(ctx, hint, w - edge - spacedWidth(ctx, hint, 2.2), bottom, 2.2, 'left');
    }
    ctx.restore();
  }

  private makeGrain(): CanvasPattern | null {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return this.ctx.createPattern(c, 'repeat');
  }

  private makeScanlines(): CanvasPattern | null {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 3;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(0, 0, 4, 1);
    return this.ctx.createPattern(c, 'repeat');
  }
}

function hudStyle(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = HUD;
  ctx.fillStyle = HUD;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(99,255,149,0.7)';
  ctx.shadowBlur = 6;
}

function cross(a: readonly number[], b: readonly number[]): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** An anamorphic lens streak: a thin horizontal line of light through (x, y). */
function lensStreak(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, alpha: number, rgb: string): void {
  if (alpha <= 0.01) return;
  const g = ctx.createLinearGradient(x - length / 2, 0, x + length / 2, 0);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.5, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - length / 2, y - 1.5, length, 3);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x - length / 4, y - 5, length / 2, 10);
  ctx.globalAlpha = 1;
}

/** Text with extra space between letters; returns the x where it ends. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' = 'center'): number {
  const saved = ctx.textAlign;
  ctx.textAlign = 'left';
  let at = align === 'center' ? x - spacedWidth(ctx, text, spacing) / 2 : x;
  for (const ch of text) {
    ctx.fillText(ch, at, y);
    at += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = saved;
  return at - spacing;
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

function removeWhere<T>(list: T[], gone: (item: T) => boolean): void {
  let j = 0;
  for (const item of list) if (!gone(item)) list[j++] = item;
  list.length = j;
}
