import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { Rng } from '../../../../shared/math/rng.ts';

/*
 * The buildings' surfaces (revision 27), painted on canvases when the first town is built: facades with their windows
 * at true size (a tenement's tall windows in stone surrounds over a rusticated shop floor, a panel block's PVC windows
 * and loggias, red brick with Gothic lancets, sandstone, glass curtain walls, timber), and roofs of clay tiles,
 * shingles, metal sheet and tar paper. Each repeats over a known size in metres, so the windows keep their size on
 * every wall. The colours are mostly neutral: each building's paint comes from its vertex colours. Facades with
 * windows have a second canvas of lit windows, shown at night.
 */

export type MaterialKey =
  | 'tenement'
  | 'shopfront'
  | 'block'
  | 'house'
  | 'brick'
  | 'brickPlain'
  | 'stone'
  | 'glass'
  | 'industrial'
  | 'planks'
  | 'logs'
  | 'whiteChurch'
  | 'roofTiles'
  | 'shingle'
  | 'sheet'
  | 'flatRoof'
  | 'concrete'
  | 'paving'
  | 'trim';

export const MATERIAL_KEYS: readonly MaterialKey[] = [
  'tenement',
  'shopfront',
  'block',
  'house',
  'brick',
  'brickPlain',
  'stone',
  'glass',
  'industrial',
  'planks',
  'logs',
  'whiteChurch',
  'roofTiles',
  'shingle',
  'sheet',
  'flatRoof',
  'concrete',
  'paving',
  'trim',
];

/** Metres covered by one repeat of each texture (along the wall or slope, and up it); `trim` has no texture. */
export const TILE_M: Readonly<Record<MaterialKey, readonly [number, number]>> = {
  tenement: [12.8, 14],
  shopfront: [12.8, 4.4],
  block: [14.4, 11.2],
  house: [12, 5.8],
  brick: [6, 12],
  brickPlain: [4, 4],
  stone: [4, 4],
  glass: [6, 8],
  industrial: [6, 6],
  planks: [3, 3],
  logs: [6, 3],
  whiteChurch: [8, 10],
  roofTiles: [2, 2],
  shingle: [2, 2],
  sheet: [4, 4],
  flatRoof: [8, 8],
  concrete: [4, 4],
  paving: [8, 8],
  trim: [1, 1],
};

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, w: number, h: number, ppm: number, rng: Rng, lit: boolean) => void;

/** Pixels per metre each texture is painted at. */
const PPM: Readonly<Record<MaterialKey, number>> = {
  tenement: 40,
  shopfront: 40,
  block: 40,
  house: 40,
  brick: 48,
  brickPlain: 48,
  stone: 48,
  glass: 40,
  industrial: 32,
  planks: 48,
  logs: 48,
  whiteChurch: 32,
  roofTiles: 64,
  shingle: 64,
  sheet: 32,
  flatRoof: 16,
  concrete: 32,
  paving: 32,
  trim: 1,
};

/** A lit window's glow on the night canvas: warm lamplight or cool office light, brighter or dimmer. */
function litColor(rng: Rng, warm: boolean): string {
  const k = 0.55 + 0.45 * rng.next();
  const [r, g, b] = warm ? [255, 196 + 30 * rng.next(), 112 + 50 * rng.next()] : [214, 228, 255];
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

function speckle(ctx: Ctx, w: number, h: number, rng: Rng, n: number, light: string, dark: string, size = 2): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? light : dark;
    ctx.fillRect(rng.next() * w, rng.next() * h, size, size);
  }
}

/** A window: a surround, the glass with a reflection, white frames and a sill; lit, only the panes, warm or cool. */
function windowAt(ctx: Ctx, x: number, y: number, w: number, h: number, ppm: number, rng: Rng, lit: boolean, o: { surround?: number; sill?: boolean; cross?: boolean; litChance?: number; warm?: boolean; frame?: string } = {}): void {
  const s = (o.surround ?? 0.12) * ppm;
  const f = Math.max(2, 0.05 * ppm);
  if (lit) {
    if (rng.next() < (o.litChance ?? 0.35)) {
      ctx.fillStyle = litColor(rng, o.warm !== false);
      ctx.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
    }
    return;
  }
  if (s > 0) {
    ctx.fillStyle = 'rgba(255,255,250,0.85)';
    ctx.fillRect(x - s, y - s, w + 2 * s, h + 2 * s);
  }
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  const sky = rng.next();
  g.addColorStop(0, `rgb(${70 + 40 * sky},${88 + 40 * sky},${104 + 40 * sky})`);
  g.addColorStop(0.5, '#2a343c');
  g.addColorStop(1, '#1d252b');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Curtains in some.
  if (rng.next() < 0.4) {
    ctx.fillStyle = 'rgba(230,226,215,0.35)';
    ctx.fillRect(x + f, y + f, w * 0.22, h - 2 * f);
    ctx.fillRect(x + w - f - w * 0.22, y + f, w * 0.22, h - 2 * f);
  }
  ctx.strokeStyle = o.frame ?? '#f4f2ec';
  ctx.lineWidth = f;
  ctx.strokeRect(x + f / 2, y + f / 2, w - f, h - f);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  if (o.cross !== false) {
    ctx.moveTo(x, y + h * 0.32);
    ctx.lineTo(x + w, y + h * 0.32);
  }
  ctx.stroke();
  if (o.sill !== false) {
    ctx.fillStyle = 'rgba(200,198,190,0.95)';
    ctx.fillRect(x - s - 0.06 * ppm, y + h + s, w + 2 * s + 0.12 * ppm, 0.08 * ppm);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x - s, y + h + s + 0.08 * ppm, w + 2 * s, 0.06 * ppm);
  }
}

function plaster(ctx: Ctx, w: number, h: number, rng: Rng, base = '#f1eee7'): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rng, (w * h) / 40, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.05)');
  // Weathering: faint streaks down from the windows' sills and a darker plinth.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0.07)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const PAINTERS: Readonly<Record<Exclude<MaterialKey, 'trim'>, Painter>> = {
  /** Four bays by four floors of a tenement: tall windows in stone surrounds, string courses, pediments up top. */
  tenement(ctx, w, h, ppm, rng, lit) {
    if (!lit) plaster(ctx, w, h, rng);
    const bay = 3.2 * ppm;
    const floor = 3.5 * ppm;
    for (let f = 0; f < 4; f++) {
      const y0 = h - (f + 1) * floor;
      if (!lit) {
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.fillRect(0, y0 + floor - 0.18 * ppm, w, 0.18 * ppm);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, y0 + floor - 0.24 * ppm, w, 0.06 * ppm);
      }
      for (let b = 0; b < 4; b++) {
        const ww = 1.25 * ppm;
        const wh = (f === 3 ? 1.7 : 2.05) * ppm;
        const x = b * bay + (bay - ww) / 2;
        const y = y0 + floor - 0.9 * ppm - wh;
        windowAt(ctx, x, y, ww, wh, ppm, rng, lit, { surround: 0.13 });
        if (!lit && f === 1) {
          // A triangular pediment over the piano nobile.
          ctx.fillStyle = 'rgba(255,255,250,0.85)';
          ctx.beginPath();
          ctx.moveTo(x - 0.2 * ppm, y - 0.18 * ppm);
          ctx.lineTo(x + ww / 2, y - 0.62 * ppm);
          ctx.lineTo(x + ww + 0.2 * ppm, y - 0.18 * ppm);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x - 0.2 * ppm, y - 0.18 * ppm, ww + 0.4 * ppm, 0.05 * ppm);
        }
      }
    }
  },
  /** A tenement's ground floor: rusticated stone, shop windows under a fascia, and a gateway with an arch. */
  shopfront(ctx, w, h, ppm, rng, lit) {
    const bay = 3.2 * ppm;
    if (!lit) {
      ctx.fillStyle = '#e4ddcf';
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, rng, (w * h) / 30, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.06)');
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      for (let y = 0.5 * ppm; y < h; y += 0.5 * ppm) ctx.fillRect(0, y, w, 0.04 * ppm);
      // The cornice band over the ground floor.
      ctx.fillStyle = 'rgba(255,255,250,0.9)';
      ctx.fillRect(0, 0, w, 0.32 * ppm);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0.32 * ppm, w, 0.08 * ppm);
    }
    for (let b = 0; b < 4; b++) {
      const x0 = b * bay;
      if (b === 2) {
        // The gateway.
        const gw = 1.9 * ppm;
        const gh = 3.1 * ppm;
        const gx = x0 + (bay - gw) / 2;
        const gy = h - gh;
        if (lit) continue;
        ctx.fillStyle = 'rgba(250,248,240,0.9)';
        ctx.beginPath();
        ctx.moveTo(gx - 0.2 * ppm, h);
        ctx.lineTo(gx - 0.2 * ppm, gy + gw / 2);
        ctx.arc(gx + gw / 2, gy + gw / 2, gw / 2 + 0.2 * ppm, Math.PI, 0);
        ctx.lineTo(gx + gw + 0.2 * ppm, h);
        ctx.fill();
        ctx.fillStyle = '#3a2a1e';
        ctx.beginPath();
        ctx.moveTo(gx, h);
        ctx.lineTo(gx, gy + gw / 2);
        ctx.arc(gx + gw / 2, gy + gw / 2, gw / 2, Math.PI, 0);
        ctx.lineTo(gx + gw, h);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx + gw / 2, h);
        ctx.lineTo(gx + gw / 2, gy + gw / 2);
        ctx.stroke();
        continue;
      }
      const sw = 2.3 * ppm;
      const sh = 2.6 * ppm;
      const sx = x0 + (bay - sw) / 2;
      const sy = h - sh - 0.15 * ppm;
      if (lit) {
        if (rng.next() < 0.6) {
          ctx.fillStyle = litColor(rng, rng.next() < 0.7);
          ctx.fillRect(sx, sy, sw, sh);
        }
        continue;
      }
      // Fascia with a sign.
      const hues = ['#2f4f4f', '#6b2b2b', '#2b3f6b', '#3d3d3d', '#5a4a2a', '#1f4a33'];
      ctx.fillStyle = hues[rng.int(hues.length)];
      ctx.fillRect(sx - 0.1 * ppm, sy - 0.55 * ppm, sw + 0.2 * ppm, 0.42 * ppm);
      ctx.fillStyle = 'rgba(255,255,240,0.75)';
      ctx.fillRect(sx + 0.4 * ppm, sy - 0.42 * ppm, sw - 0.8 * ppm, 0.12 * ppm);
      const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      g.addColorStop(0, '#5c6f7c');
      g.addColorStop(0.4, '#26313a');
      g.addColorStop(1, '#1b2228');
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, sw, sh);
      // Goods behind the glass.
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = `rgba(${150 + rng.int(100)},${120 + rng.int(100)},${90 + rng.int(100)},0.35)`;
        ctx.fillRect(sx + rng.next() * sw * 0.8, sy + sh * 0.55 + rng.next() * sh * 0.3, sw * 0.15, sh * 0.15);
      }
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.07 * ppm;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.beginPath();
      ctx.moveTo(sx + sw * 0.62, sy);
      ctx.lineTo(sx + sw * 0.62, sy + sh);
      ctx.stroke();
    }
  },
  /** A panel block: four bays by four storeys, windows and loggias (some glazed), the panel joints showing. */
  block(ctx, w, h, ppm, rng, lit) {
    const bay = 3.6 * ppm;
    const floor = 2.8 * ppm;
    if (!lit) {
      plaster(ctx, w, h, rng, '#ebe9e3');
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let b = 0; b <= 4; b++) ctx.fillRect(b * bay - 1, 0, 2, h);
      for (let f = 0; f <= 4; f++) ctx.fillRect(0, f * floor - 1, w, 2);
    }
    for (let f = 0; f < 4; f++) {
      const y0 = h - (f + 1) * floor;
      for (let b = 0; b < 4; b++) {
        const x0 = b * bay;
        const loggia = (b + (f % 2 === 0 ? 0 : 0)) % 2 === 1;
        if (!loggia) {
          windowAt(ctx, x0 + (bay - 1.5 * ppm) / 2, y0 + 0.5 * ppm, 1.5 * ppm, 1.45 * ppm, ppm, rng, lit, { surround: 0, cross: false, litChance: 0.4 });
          continue;
        }
        const lx = x0 + 0.5 * ppm;
        const lw = bay - 1.0 * ppm;
        const glazed = rng.next() < 0.35;
        if (lit) {
          if (rng.next() < 0.4) {
            ctx.fillStyle = litColor(rng, true);
            ctx.fillRect(lx + 0.35 * ppm, y0 + 0.25 * ppm, lw * 0.35, 2.0 * ppm);
          }
          continue;
        }
        // The recess, the door and window behind, the balustrade slab in front.
        ctx.fillStyle = '#6f6a62';
        ctx.fillRect(lx, y0 + 0.15 * ppm, lw, 2.5 * ppm);
        ctx.fillStyle = '#2b333a';
        ctx.fillRect(lx + 0.35 * ppm, y0 + 0.25 * ppm, lw * 0.35, 2.0 * ppm);
        ctx.fillRect(lx + 0.35 * ppm + lw * 0.42, y0 + 0.45 * ppm, lw * 0.4, 1.2 * ppm);
        if (glazed) {
          ctx.fillStyle = 'rgba(150,180,200,0.55)';
          ctx.fillRect(lx, y0 + 0.15 * ppm, lw, 1.6 * ppm);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 2;
          for (let k = 1; k < 4; k++) {
            ctx.beginPath();
            ctx.moveTo(lx + (lw * k) / 4, y0 + 0.15 * ppm);
            ctx.lineTo(lx + (lw * k) / 4, y0 + 1.75 * ppm);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#d9d6ce';
        ctx.fillRect(lx - 0.1 * ppm, y0 + 1.75 * ppm, lw + 0.2 * ppm, 1.0 * ppm);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(lx - 0.1 * ppm, y0 + 2.7 * ppm, lw + 0.2 * ppm, 0.06 * ppm);
        // Laundry on a line, now and then.
        if (rng.next() < 0.15) {
          ctx.fillStyle = ['#c0392b', '#2980b9', '#f1c40f', '#ecf0f1'][rng.int(4)];
          ctx.fillRect(lx + rng.next() * lw * 0.7, y0 + 1.55 * ppm, 0.4 * ppm, 0.3 * ppm);
        }
      }
    }
  },
  /** A detached house: three windows by two floors, white frames, roller-shutter boxes, sills. */
  house(ctx, w, h, ppm, rng, lit) {
    if (!lit) plaster(ctx, w, h, rng, '#f2efe8');
    const bay = 4 * ppm;
    const floor = 2.9 * ppm;
    for (let f = 0; f < 2; f++) {
      const y0 = h - (f + 1) * floor;
      for (let b = 0; b < 3; b++) {
        const ww = 1.3 * ppm;
        const wh = 1.4 * ppm;
        const x = b * bay + (bay - ww) / 2;
        const y = y0 + 0.65 * ppm;
        if (!lit) {
          ctx.fillStyle = 'rgba(120,118,112,0.9)';
          ctx.fillRect(x - 0.05 * ppm, y - 0.28 * ppm, ww + 0.1 * ppm, 0.22 * ppm);
        }
        windowAt(ctx, x, y, ww, wh, ppm, rng, lit, { surround: 0, litChance: 0.3 });
      }
    }
  },
  /** Gothic red brick: brick courses of varied colour and a tall pointed lancet with tracery. */
  brick(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    bricks(ctx, w, h, ppm, rng);
    const lw = 1.9 * ppm;
    const lh = 7.4 * ppm;
    const x = (w - lw) / 2;
    const y = h - 2.6 * ppm - lh;
    // Stone surround, then the lancet.
    ctx.fillStyle = '#c9b89a';
    lancet(ctx, x - 0.18 * ppm, y - 0.18 * ppm, lw + 0.36 * ppm, lh + 0.36 * ppm);
    const g = ctx.createLinearGradient(x, y, x + lw, y + lh);
    g.addColorStop(0, '#4a5866');
    g.addColorStop(1, '#1e252c');
    ctx.fillStyle = g;
    lancet(ctx, x, y, lw, lh);
    ctx.strokeStyle = 'rgba(190,180,160,0.9)';
    ctx.lineWidth = 0.06 * ppm;
    ctx.beginPath();
    ctx.moveTo(x + lw / 2, y + lw * 0.5);
    ctx.lineTo(x + lw / 2, y + lh);
    for (let k = 1; k < 7; k++) {
      ctx.moveTo(x, y + lw * 0.6 + (k * (lh - lw * 0.6)) / 7);
      ctx.lineTo(x + lw, y + lw * 0.6 + (k * (lh - lw * 0.6)) / 7);
    }
    ctx.stroke();
    // A buttress shadow at the bay's edges.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, 0.35 * ppm, h);
    ctx.fillRect(w - 0.35 * ppm, 0, 0.35 * ppm, h);
  },
  brickPlain(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    bricks(ctx, w, h, ppm, rng);
  },
  /** Socialist-realist sandstone: ashlar courses and narrow tall windows in stepped surrounds. */
  stone(ctx, w, h, ppm, rng, lit) {
    const ww = 0.95 * ppm;
    const wh = 2.5 * ppm;
    const x = (w - ww) / 2;
    const y = (h - wh) / 2;
    if (lit) {
      windowAt(ctx, x, y, ww, wh, ppm, rng, true, { litChance: 0.4, warm: rng.next() < 0.6 });
      return;
    }
    ctx.fillStyle = '#e1d4b4';
    ctx.fillRect(0, 0, w, h);
    for (let y0 = 0; y0 < h; y0 += 0.5 * ppm) {
      for (let x0 = (Math.round(y0 / (0.5 * ppm)) % 2) * 0.6 * ppm - 0.6 * ppm; x0 < w; x0 += 1.2 * ppm) {
        const k = rng.next();
        ctx.fillStyle = `rgba(${200 + 30 * k},${185 + 30 * k},${150 + 30 * k},0.6)`;
        ctx.fillRect(x0 + 1, y0 + 1, 1.2 * ppm - 2, 0.5 * ppm - 2);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x - 0.3 * ppm, y - 0.3 * ppm, ww + 0.6 * ppm, wh + 0.6 * ppm);
    ctx.fillStyle = '#efe6cf';
    ctx.fillRect(x - 0.2 * ppm, y - 0.2 * ppm, ww + 0.4 * ppm, wh + 0.4 * ppm);
    windowAt(ctx, x, y, ww, wh, ppm, rng, false, { surround: 0, sill: false });
  },
  /** A glass curtain wall: two panels by two floors, mullions, dark spandrels, the sky reflected in streaks. */
  glass(ctx, w, h, ppm, rng, lit) {
    const panel = 1.5 * ppm;
    const floor = 4 * ppm;
    if (lit) {
      for (let f = 0; f < 2; f++) {
        for (let p = 0; p < 4; p++) {
          if (rng.next() < 0.45) {
            ctx.fillStyle = litColor(rng, false);
            ctx.fillRect(p * panel + 3, f * floor + 0.9 * ppm, panel - 6, floor - 1.1 * ppm);
          }
        }
      }
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#b4cfdf');
    g.addColorStop(0.35, '#6f93a8');
    g.addColorStop(0.65, '#94b6ca');
    g.addColorStop(1, '#5d8096');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.08 * rng.next()})`;
      ctx.beginPath();
      const x0 = rng.next() * w;
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + 0.3 * w, 0);
      ctx.lineTo(x0 - 0.2 * w, h);
      ctx.lineTo(x0 - 0.5 * w, h);
      ctx.fill();
    }
    for (let f = 0; f < 2; f++) {
      ctx.fillStyle = 'rgba(40,58,70,0.55)';
      ctx.fillRect(0, f * floor, w, 0.8 * ppm);
    }
    ctx.fillStyle = '#c6ccd0';
    for (let p = 0; p <= 4; p++) ctx.fillRect(p * panel - 1.5, 0, 3, h);
    for (let f = 0; f <= 2; f++) ctx.fillRect(0, f * floor - 1.5, w, 3);
  },
  /** Trapezoid metal cladding with a band of windows near the top. */
  industrial(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    ctx.fillStyle = '#b3b9bb';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 0.25 * ppm) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(x, 0, 0.06 * ppm, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 0.08 * ppm, 0, 0.04 * ppm, h);
    }
    ctx.fillStyle = '#3a4650';
    ctx.fillRect(0, 0.6 * ppm, w, 1.0 * ppm);
    ctx.fillStyle = '#c9cfd1';
    for (let x = 0; x < w; x += 1.5 * ppm) ctx.fillRect(x, 0.6 * ppm, 2, 1.0 * ppm);
    speckle(ctx, w, h, rng, 200, 'rgba(255,255,255,0.05)', 'rgba(90,50,20,0.12)', 3);
  },
  /** Vertical boards with dark gaps: barns and sheds. */
  planks(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    const board = 0.2 * ppm;
    for (let x = 0; x < w; x += board) {
      const k = rng.next();
      ctx.fillStyle = `rgb(${200 + 40 * k},${195 + 40 * k},${185 + 40 * k})`;
      ctx.fillRect(x, 0, board, h);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, 0, 2, h);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x + 3 + rng.next() * (board - 6), rng.next() * h, 1, h * 0.2);
      }
    }
  },
  /** Highlander timber: round logs with light chinking and one small window. */
  logs(ctx, w, h, ppm, rng, lit) {
    const ww = 0.9 * ppm;
    const wh = 1.05 * ppm;
    const x = w * 0.5 - ww / 2;
    const y = h - 1.9 * ppm;
    if (lit) {
      windowAt(ctx, x, y, ww, wh, ppm, rng, true, { litChance: 0.45 });
      return;
    }
    const log = 0.26 * ppm;
    for (let y0 = 0; y0 < h; y0 += log) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + log);
      g.addColorStop(0, '#f2e6d0');
      g.addColorStop(0.15, '#d7c3a2');
      g.addColorStop(0.55, '#c2a982');
      g.addColorStop(1, '#8c7356');
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, w, log);
      ctx.fillStyle = 'rgba(245,240,225,0.85)';
      ctx.fillRect(0, y0 + log - 2, w, 2);
    }
    windowAt(ctx, x, y, ww, wh, ppm, rng, false, { surround: 0.1 });
  },
  /** A white baroque church wall: plaster, pilasters and a tall round-arched window. */
  whiteChurch(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    plaster(ctx, w, h, rng, '#f5f3ee');
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, 0.6 * ppm, h);
    ctx.fillRect(w - 0.6 * ppm, 0, 0.6 * ppm, h);
    const ww = 1.6 * ppm;
    const wh = 4.2 * ppm;
    const x = (w - ww) / 2;
    const y = h - 2.6 * ppm - wh;
    ctx.fillStyle = 'rgba(225,215,190,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - 0.2 * ppm, y + wh + 0.2 * ppm);
    ctx.lineTo(x - 0.2 * ppm, y + ww / 2);
    ctx.arc(x + ww / 2, y + ww / 2, ww / 2 + 0.2 * ppm, Math.PI, 0);
    ctx.lineTo(x + ww + 0.2 * ppm, y + wh + 0.2 * ppm);
    ctx.fill();
    ctx.fillStyle = '#2b3540';
    ctx.beginPath();
    ctx.moveTo(x, y + wh);
    ctx.lineTo(x, y + ww / 2);
    ctx.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
    ctx.lineTo(x + ww, y + wh);
    ctx.fill();
  },
  /** Clay roof tiles in rows, each with a rounded lower edge and its shadow; neutral, tinted per roof. */
  roofTiles(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    const row = 0.26 * ppm;
    const tile = 0.21 * ppm;
    ctx.fillStyle = '#d9d0c8';
    ctx.fillRect(0, 0, w, h);
    for (let y0 = 0, r = 0; y0 < h; y0 += row, r++) {
      for (let x0 = (r % 2) * (tile / 2) - tile; x0 < w; x0 += tile) {
        const k = 0.82 + 0.3 * rng.next();
        ctx.fillStyle = `rgb(${Math.round(240 * k)},${Math.round(232 * k)},${Math.round(224 * k)})`;
        ctx.beginPath();
        ctx.moveTo(x0 + 1, y0);
        ctx.lineTo(x0 + tile - 1, y0);
        ctx.lineTo(x0 + tile - 1, y0 + row * 0.75);
        ctx.quadraticCurveTo(x0 + tile / 2, y0 + row * 1.08, x0 + 1, y0 + row * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x0 + 1, y0 + row * 0.9, tile - 2, row * 0.12);
      }
    }
    // Moss and soot here and there.
    speckle(ctx, w, h, rng, 60, 'rgba(90,100,60,0.18)', 'rgba(30,30,30,0.15)', 4);
  },
  /** Small wooden shingles, staggered rows, weathered grey-brown. */
  shingle(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    const row = 0.16 * ppm;
    ctx.fillStyle = '#7d756c';
    ctx.fillRect(0, 0, w, h);
    for (let y0 = 0, r = 0; y0 < h; y0 += row, r++) {
      let x0 = (r % 2) * 0.05 * ppm - 0.1 * ppm;
      while (x0 < w) {
        const sw = (0.08 + 0.06 * rng.next()) * ppm;
        const k = 0.75 + 0.45 * rng.next();
        ctx.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(140 * k)},${Math.round(128 * k)})`;
        ctx.fillRect(x0 + 1, y0, sw - 1, row - 1);
        x0 += sw;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, y0 + row - 2, w, 2);
    }
  },
  /** Trapezoid metal sheet down the slope: ribs with light and shadow, some streaks. */
  sheet(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    ctx.fillStyle = '#d5d5d2';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 0.33 * ppm) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, 0, 0.05 * ppm, h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 0.08 * ppm, 0, 0.05 * ppm, h);
    }
    speckle(ctx, w, h, rng, 80, 'rgba(255,255,255,0.08)', 'rgba(110,60,30,0.15)', 3);
  },
  /** Tar paper and gravel on a flat roof, with seams, patches and a vent or two. */
  flatRoof(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    ctx.fillStyle = '#6b6965';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, (w * h) / 6, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)', 1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < w; x += 1 * ppm) ctx.fillRect(x, 0, 1, h);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = `rgba(${40 + rng.int(40)},${40 + rng.int(40)},${40 + rng.int(40)},0.35)`;
      ctx.fillRect(rng.next() * w, rng.next() * h, (0.8 + rng.next()) * ppm, (0.8 + rng.next()) * ppm);
    }
    ctx.fillStyle = '#9a9894';
    ctx.fillRect(w * 0.3, h * 0.6, 0.5 * ppm, 0.5 * ppm);
  },
  /** Board-marked concrete. */
  concrete(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    ctx.fillStyle = '#c7c4bd';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, (w * h) / 8, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.07)', 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < h; y += 1 * ppm) ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = 'rgba(70,60,50,0.08)';
    for (let k = 0; k < 10; k++) ctx.fillRect(rng.next() * w, 0, 2 + rng.next() * 4, h);
  },
  /** A market square: granite setts in staggered rows, crossed by faint bands of pale stone slabs every 8 m. */
  paving(ctx, w, h, ppm, rng, lit) {
    if (lit) return;
    ctx.fillStyle = '#7d7871';
    ctx.fillRect(0, 0, w, h);
    const sett = 0.16 * ppm;
    for (let r = 0; r * sett < h; r++) {
      for (let x = (r % 2) * (sett / 2) - sett; x < w; x += sett) {
        const g = 128 + 56 * rng.next();
        ctx.fillStyle = `rgb(${Math.round(g + 6)},${Math.round(g + 2)},${Math.round(g - 6)})`;
        ctx.fillRect(x + 0.6, r * sett + 0.6, sett - 1.2, sett - 1.2);
      }
    }
    ctx.fillStyle = 'rgba(206,198,184,0.55)';
    ctx.fillRect(0, 0, 0.4 * ppm, h);
    ctx.fillRect(0, 0, w, 0.4 * ppm);
  },
};

function bricks(ctx: Ctx, w: number, h: number, ppm: number, rng: Rng): void {
  const course = 0.075 * ppm;
  const brick = 0.26 * ppm;
  ctx.fillStyle = '#b8a28a';
  ctx.fillRect(0, 0, w, h);
  for (let y0 = 0, r = 0; y0 < h; y0 += course, r++) {
    for (let x0 = (r % 2) * (brick / 2) - brick; x0 < w; x0 += brick) {
      const k = rng.next();
      const dark = rng.next() < 0.12;
      const red = dark ? 105 + 25 * k : 150 + 40 * k;
      ctx.fillStyle = `rgb(${Math.round(red)},${Math.round(red * 0.42 + 8 * k)},${Math.round(red * 0.3)})`;
      ctx.fillRect(x0 + 1, y0 + 1, brick - 1, course - 1);
    }
  }
}

function lancet(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w * 0.6);
  ctx.quadraticCurveTo(x, y, x + w / 2, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.6);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/** The facades that glow at night: the lit windows get a canvas of their own. */
export const LIT_KEYS: ReadonlySet<MaterialKey> = new Set(['tenement', 'shopfront', 'block', 'house', 'stone', 'glass', 'logs']);

/** How each surface takes the light. */
const SURFACE: Readonly<Record<MaterialKey, { roughness: number; metalness: number }>> = {
  tenement: { roughness: 0.88, metalness: 0 },
  shopfront: { roughness: 0.8, metalness: 0 },
  block: { roughness: 0.9, metalness: 0 },
  house: { roughness: 0.9, metalness: 0 },
  brick: { roughness: 0.92, metalness: 0 },
  brickPlain: { roughness: 0.92, metalness: 0 },
  stone: { roughness: 0.85, metalness: 0 },
  glass: { roughness: 0.2, metalness: 0.4 },
  industrial: { roughness: 0.55, metalness: 0.35 },
  planks: { roughness: 0.95, metalness: 0 },
  logs: { roughness: 0.92, metalness: 0 },
  whiteChurch: { roughness: 0.9, metalness: 0 },
  roofTiles: { roughness: 0.8, metalness: 0 },
  shingle: { roughness: 0.95, metalness: 0 },
  sheet: { roughness: 0.5, metalness: 0.45 },
  flatRoof: { roughness: 0.97, metalness: 0 },
  concrete: { roughness: 0.95, metalness: 0 },
  paving: { roughness: 0.9, metalness: 0 },
  trim: { roughness: 0.85, metalness: 0 },
};

function paint(key: Exclude<MaterialKey, 'trim'>, lit: boolean): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const [um, vm] = TILE_M[key];
  const ppm = PPM[key];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(um * ppm);
  canvas.height = Math.round(vm * ppm);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (lit) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // The same seed for the day and night canvases of a facade keeps the lit windows where the windows are.
  PAINTERS[key](ctx, canvas.width, canvas.height, ppm, new Rng(0x5eed + MATERIAL_KEYS.indexOf(key) * 7919 + (lit ? 1 : 0)), lit);
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let materials: Record<MaterialKey, MeshStandardMaterial> | null = null;

/**
 * The building materials, made once per page and shared by every town (the title screen's and the match's): each
 * textured surface takes its tint from vertex colours; the lit-window canvases are the emissive maps, off by day.
 */
export function buildingMaterials(): Record<MaterialKey, MeshStandardMaterial> {
  if (materials) return materials;
  const out = {} as Record<MaterialKey, MeshStandardMaterial>;
  for (const key of MATERIAL_KEYS) {
    const map = key === 'trim' ? null : paint(key, false);
    const lit = LIT_KEYS.has(key) && key !== 'trim' ? paint(key, true) : null;
    out[key] = new MeshStandardMaterial({
      map,
      vertexColors: true,
      roughness: SURFACE[key].roughness,
      metalness: SURFACE[key].metalness,
      emissive: lit ? new Color(1, 1, 1) : new Color(0, 0, 0),
      emissiveMap: lit,
      emissiveIntensity: 0,
    });
    out[key].name = `building-${key}`;
  }
  materials = out;
  return out;
}

/** Windows light up after dusk: 0 by day, 1 at night. */
export function setWindowLight(night: number): void {
  if (!materials) return;
  const k = Math.max(0, Math.min(1, (night - 0.2) / 0.6));
  for (const key of LIT_KEYS) materials[key].emissiveIntensity = 1.35 * k;
}
