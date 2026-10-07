import type { Road, Settlement } from '../../../../shared/map/features.ts';
import type { LandCover } from '../../../../shared/map/land-cover.ts';
import { Rng } from '../../../../shared/math/rng.ts';
import { type Ground, nameSeed } from '../feature-layout.ts';

/*
 * Polish towns (revision 27, at the owner's request: "really realistic Polish buildings"). Each settlement is laid out
 * the way Polish towns grew, in plan only (the meshes are built from the plan elsewhere):
 * - an old town (Stare Miasto) of perimeter blocks lined with tenement houses (kamienice), around a market square
 *   (rynek) with the town hall (ratusz) and its tower in the middle and a Gothic brick church at a corner, the nave
 *   running east–west; in the coastal city the houses are Hanseatic, their gables to the street;
 * - estates (osiedla) of prefabricated panel blocks (bloki): long five-storey slabs, eleven-storey slabs and
 *   sixteen-storey point towers in parallel rows;
 * - suburbs of detached houses, the square "Polish cube" (kostka) and steep-roofed newer ones;
 * - an industrial edge of halls and striped chimneys, and in Odrzyn a power station with cooling towers;
 * - in the capital, the palace-of-culture tower on its square and a cluster of glass towers;
 * - villages strung along their road (ulicówka): farmhouses facing it with barns behind, a white church with a
 *   baroque tower; in the mountains, highlander houses of dark timber under steep shingle roofs, and a wooden church;
 * - a red-brick castle by the river near the coastal city.
 * Everything stands on town ground (barns also on fields), off roads and water, and is the same every time.
 */

export type StructureKind =
  | 'kamienica'
  | 'hanseatic'
  | 'ratusz'
  | 'church'
  | 'village-church'
  | 'wooden-church'
  | 'blok'
  | 'punktowiec'
  | 'kostka'
  | 'house'
  | 'highlander'
  | 'barn'
  | 'factory'
  | 'chimney'
  | 'cooling-tower'
  | 'palace'
  | 'glass-tower'
  | 'castle'
  | 'square';

/**
 * One building. Local axes: `w` along (cos angle, sin angle) in x, z and `d` along (−sin angle, cos angle); the front
 * faces −d (a street, the square, or the road). Churches run along `w`, east at angle 0, the tower at −w. `y` is the
 * lowest ground under the footprint.
 */
export interface Structure {
  kind: StructureKind;
  x: number;
  z: number;
  y: number;
  angle: number;
  w: number;
  d: number;
  /** storeys (houses, blocks) or height in metres (chimneys, towers, the palace) */
  floors: number;
  /** 0 … 1: colour and detail choices */
  tint: number;
  style: number;
  /** a paved square's ground: (n + 1)² heights over its footprint above `y`, row by row along d, each row along w */
  relief?: number[];
}

/** Storey heights: the tall ground floor and upper floors of a tenement, a panel block's storey, a house's. */
export const TENEMENT_GROUND_M = 4.4;
export const TENEMENT_FLOOR_M = 3.5;
export const BLOCK_FLOOR_M = 2.8;
export const HOUSE_FLOOR_M = 2.9;

/** A building's wall height from its storeys. */
export function wallHeight(s: Pick<Structure, 'kind' | 'floors'>): number {
  switch (s.kind) {
    case 'kamienica':
    case 'hanseatic':
      return TENEMENT_GROUND_M + (s.floors - 1) * TENEMENT_FLOOR_M;
    case 'blok':
    case 'punktowiec':
      return s.floors * BLOCK_FLOOR_M + 0.8;
    case 'kostka':
    case 'house':
    case 'highlander':
      return s.floors * HOUSE_FLOOR_M + 0.4;
    default:
      return s.floors;
  }
}

const DRY_TOWN: ReadonlySet<LandCover> = new Set(['urban']);
const FARMLAND: ReadonlySet<LandCover> = new Set(['urban', 'field', 'meadow']);
/** Industry sits on the town's edge, on town ground or the fields beyond. */
const EDGE = FARMLAND;

/** How far a footprint keeps from a road's centre line: the drawn ribbon's half-width (12 m highways, 6 m local roads) and a kerb. */
const ROAD_CLEAR_M: Readonly<Record<Road['kind'], number>> = { highway: 6 + 3, local: 3 + 2.5 };
const ROAD_BIN_M = 250;

/** The roads, their segments binned on a grid, to keep footprints off them exactly. */
export class RoadIndex {
  readonly roads: readonly Road[];
  /** per bin: ax, az, bx, bz, clearance per segment */
  private readonly bins = new Map<string, number[]>();

  constructor(roads: readonly Road[]) {
    this.roads = roads;
    for (const r of roads) {
      const clear = ROAD_CLEAR_M[r.kind];
      for (let k = 0; k + 3 < r.points.length; k += 2) {
        const [ax, az, bx, bz] = [r.points[k], r.points[k + 1], r.points[k + 2], r.points[k + 3]];
        for (let i = Math.floor((Math.min(ax, bx) - clear) / ROAD_BIN_M); i <= Math.floor((Math.max(ax, bx) + clear) / ROAD_BIN_M); i++) {
          for (let j = Math.floor((Math.min(az, bz) - clear) / ROAD_BIN_M); j <= Math.floor((Math.max(az, bz) + clear) / ROAD_BIN_M); j++) {
            const key = `${i},${j}`;
            let bin = this.bins.get(key);
            if (!bin) this.bins.set(key, (bin = []));
            bin.push(ax, az, bx, bz, clear);
          }
        }
      }
    }
  }

  /** Whether a w × d footprint at (x, z), turned by `angle`, keeps clear of every road. */
  clear(x: number, z: number, angle: number, w: number, d: number): boolean {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const reach = Math.hypot(w, d) / 2 + 10;
    for (let i = Math.floor((x - reach) / ROAD_BIN_M); i <= Math.floor((x + reach) / ROAD_BIN_M); i++) {
      for (let j = Math.floor((z - reach) / ROAD_BIN_M); j <= Math.floor((z + reach) / ROAD_BIN_M); j++) {
        const bin = this.bins.get(`${i},${j}`);
        if (!bin) continue;
        for (let k = 0; k < bin.length; k += 5) {
          // The segment in the footprint's frame, against the footprint grown by the road's clearance.
          const ax = bin[k] - x;
          const az = bin[k + 1] - z;
          const bx = bin[k + 2] - x;
          const bz = bin[k + 3] - z;
          const hu = w / 2 + bin[k + 4];
          const hv = d / 2 + bin[k + 4];
          if (segmentHitsBox(ax * c + az * s, -ax * s + az * c, bx * c + bz * s, -bx * s + bz * c, hu, hv)) return false;
        }
      }
    }
    return true;
  }
}

/** Whether the segment (u0, v0)–(u1, v1) passes through the box |u| ≤ hu, |v| ≤ hv (Liang–Barsky clipping). */
function segmentHitsBox(u0: number, v0: number, u1: number, v1: number, hu: number, hv: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const du = u1 - u0;
  const dv = v1 - v0;
  for (const [p, q] of [
    [-du, u0 + hu],
    [du, hu - u0],
    [-dv, v0 + hv],
    [dv, hv - v0],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Places structures for one settlement, keeping each on allowed ground and off the roads and the others. */
class Planner {
  readonly out: Structure[] = [];
  private readonly taken = new Set<string>();
  private readonly ground: Ground;
  private readonly roads: RoadIndex;

  constructor(ground: Ground, roads: RoadIndex) {
    this.ground = ground;
    this.roads = roads;
  }

  /** The footprint's sample points: centre, corners and, on long sides, points between. */
  private samples(x: number, z: number, angle: number, w: number, d: number): [number, number][] {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const pts: [number, number][] = [[x, z]];
    const nu = Math.max(1, Math.ceil(w / 40));
    const nv = Math.max(1, Math.ceil(d / 40));
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        if (i !== 0 && i !== nu && j !== 0 && j !== nv) continue;
        const lu = (i / nu - 0.5) * w;
        const lv = (j / nv - 0.5) * d;
        pts.push([x + lu * ux - lv * uz, z + lu * uz + lv * ux]);
      }
    }
    return pts;
  }

  /**
   * Adds a structure if its footprint is on allowed ground, off roads (unless `onRoads`) and clear of what is already
   * placed; a terrace house (`row`) may stand wall to wall with its neighbours, so only marks the ground it takes.
   */
  add(kind: StructureKind, x: number, z: number, angle: number, w: number, d: number, floors: number, tint: number, style: number, allowed = DRY_TOWN, onRoads = false, row = false): boolean {
    if (!onRoads && !this.roads.clear(x, z, angle, w, d)) return false;
    const pts = this.samples(x, z, angle, w, d);
    let y = Infinity;
    const cells: string[] = [];
    for (const [px, pz] of pts) {
      if (!allowed.has(this.ground.coverAt(px, pz))) return false;
      y = Math.min(y, this.ground.heightAt(px, pz));
    }
    // Clear of what stands already, on a grid of 10 m cells under the footprint.
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    for (let lu = -w / 2 + 2; lu <= w / 2 - 2 + 1e-6; lu += Math.max(4, Math.min(10, w / 2))) {
      for (let lv = -d / 2 + 2; lv <= d / 2 - 2 + 1e-6; lv += Math.max(4, Math.min(10, d / 2))) {
        const key = `${Math.floor((x + lu * ux - lv * uz) / 10)},${Math.floor((z + lu * uz + lv * ux) / 10)}`;
        if (!row && this.taken.has(key)) return false;
        cells.push(key);
      }
    }
    for (const c of cells) this.taken.add(c);
    this.out.push({ kind, x, z, y, angle, w, d, floors, tint, style });
    return true;
  }

  /** Paves a square, following the ground under it on an n × n grid. */
  pave(x: number, z: number, angle: number, w: number, d: number, n = 8): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const heights: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const lu = (i / n - 0.5) * w;
        const lv = (j / n - 0.5) * d;
        heights.push(this.ground.heightAt(x + lu * c - lv * s, z + lu * s + lv * c));
      }
    }
    const y = Math.min(...heights);
    this.out.push({ kind: 'square', x, z, y, angle, w, d, floors: 0, tint: 0, style: 0, relief: heights.map((h) => h - y) });
  }

  /** Marks ground as used (a square, a yard) so nothing is built there. */
  reserve(x: number, z: number, angle: number, w: number, d: number): void {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    for (let lu = -w / 2; lu <= w / 2; lu += 5) {
      for (let lv = -d / 2; lv <= d / 2; lv += 5) this.taken.add(`${Math.floor((x + lu * ux - lv * uz) / 10)},${Math.floor((z + lu * uz + lv * ux) / 10)}`);
    }
  }

  /** Whether a footprint keeps clear of the roads. */
  clearOfRoads(x: number, z: number, angle: number, w: number, d: number): boolean {
    return this.roads.clear(x, z, angle, w, d);
  }

  /** Whether the ground within `radius` is all of the allowed kinds (town ground by default). */
  dry(x: number, z: number, radius: number, allowed = DRY_TOWN): boolean {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const r of [0, radius * 0.5, radius]) if (!allowed.has(this.ground.coverAt(x + Math.cos(a) * r, z + Math.sin(a) * r))) return false;
    }
    return true;
  }
}

/** The facing angle of a building whose front looks along the unit direction (nx, nz). */
export function facing(nx: number, nz: number): number {
  return Math.atan2(nx, -nz);
}

/** A point in a frame turned by `angle` about (cx, cz): u along (cos, sin), v along (−sin, cos). */
function frame(cx: number, cz: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: (u: number, v: number) => cx + u * c - v * s,
    z: (u: number, v: number) => cz + u * s + v * c,
    /** the world direction of local (du, dv) */
    dir: (du: number, dv: number): [number, number] => [du * c - dv * s, du * s + dv * c],
  };
}

/** The city's heart: the nearest spot to its centre with dry town ground all round (rivers run through cities). */
function findCore(p: Planner, s: Settlement, radius: number): { x: number; z: number } {
  for (let r = 0; r <= s.radiusM * 0.6; r += 150) {
    const steps = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 150);
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      if (p.dry(x, z, radius)) return { x, z };
    }
  }
  return { x: s.x, z: s.z };
}

/** Lines one side of a perimeter block with houses facing out: from (u0, v) to (u1, v) in the frame, front toward n. */
function lineSide(p: Planner, rng: Rng, f: ReturnType<typeof frame>, along: 'u' | 'v', a0: number, a1: number, at: number, out: number, depth: number, kind: 'kamienica' | 'hanseatic', floors: [number, number]): void {
  const [nx, nz] = along === 'u' ? f.dir(0, out) : f.dir(out, 0);
  const angle = facing(nx, nz);
  let a = a0;
  while (a < a1 - 6) {
    const width = Math.min(a1 - a, kind === 'hanseatic' ? rng.range(7, 10) : rng.range(9, 15));
    if (width < 6) break;
    const mid = a + width / 2;
    // The house's centre sits half its depth in from the street line.
    const u = along === 'u' ? mid : at - out * (depth / 2);
    const v = along === 'u' ? at - out * (depth / 2) : mid;
    p.add(kind, f.x(u, v), f.z(u, v), angle, width, depth, Math.floor(rng.range(floors[0], floors[1] + 0.999)), rng.next(), rng.next(), DRY_TOWN, false, true);
    a += width;
  }
}

/** The old town: a grid of perimeter blocks of tenements round the market square, the town hall and the church. */
function oldTown(p: Planner, rng: Rng, s: Settlement, core: { x: number; z: number }, grid: number, hanseatic: boolean): void {
  const angle = rng.range(0, Math.PI / 2);
  const f = frame(core.x, core.z, angle);
  const bw = 92;
  const bd = 72;
  const street = 16;
  const floors: [number, number] = s.capital ? [4, 6] : [3, 5];
  const half = Math.floor(grid / 2);
  // The square: the middle cell, its streets included; the town hall stands in it, along the long side.
  const sqW = bw + street;
  const sqD = bd + street;
  // The roads that meet in the square run past it where they can.
  const hallFloors = s.capital ? 64 : 52;
  const [hallTint, hallStyle] = [rng.next(), rng.next()];
  const spots: [number, number][] = [[0, 0], [0, 22], [0, -22], [26, 0], [-26, 0], [26, 22], [-26, 22], [26, -22], [-26, -22]];
  if (!spots.some(([u, v]) => p.add('ratusz', f.x(u, v), f.z(u, v), angle, 44, 18, hallFloors, hallTint, hallStyle))) {
    p.add('ratusz', f.x(0, 0), f.z(0, 0), angle, 44, 18, hallFloors, hallTint, hallStyle, DRY_TOWN, true);
  }
  p.reserve(core.x, core.z, angle, sqW - 4, sqD - 4);
  p.pave(core.x, core.z, angle, sqW + 6, sqD + 6);
  // The church: on the block at a corner of the square, the nave east–west (its tower to the west).
  const churchCell = [1, -1] as const;
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      if (i === 0 && j === 0) continue;
      const cu = i * (bw + street);
      const cv = j * (bd + street);
      if (i === churchCell[0] && j === churchCell[1]) {
        // The nave runs along w, east (+x) to the altar, the tower at the west end; off the roads where it can be.
        const towers = s.capital || s.radiusM > 3200 ? 2 : 1;
        const [tint, style] = [rng.next(), rng.next()];
        const nudge: [number, number][] = [[0, 0], [0, 18], [0, -18], [18, 0], [-18, 0]];
        if (!nudge.some(([du, dv]) => p.add('church', f.x(cu + du, cv + dv), f.z(cu + du, cv + dv), 0, 58, 20, towers, tint, style))) {
          p.add('church', f.x(cu, cv), f.z(cu, cv), 0, 58, 20, towers, tint, style, DRY_TOWN, true);
        }
        continue;
      }
      const depth = rng.range(15, 19);
      const u0 = cu - bw / 2;
      const u1 = cu + bw / 2;
      const v0 = cv - bd / 2;
      const v1 = cv + bd / 2;
      const kind = hanseatic ? 'hanseatic' : 'kamienica';
      lineSide(p, rng, f, 'u', u0, u1, v0, -1, depth, kind, floors);
      lineSide(p, rng, f, 'u', u0, u1, v1, 1, depth, kind, floors);
      lineSide(p, rng, f, 'v', v0 + depth, v1 - depth, u0, -1, depth, kind, floors);
      lineSide(p, rng, f, 'v', v0 + depth, v1 - depth, u1, 1, depth, kind, floors);
    }
  }
}

/** An estate of panel blocks in parallel rows, with a few point towers. */
function estate(p: Planner, rng: Rng, x: number, z: number, size: number, tall: number): void {
  const angle = rng.range(0, Math.PI);
  const f = frame(x, z, angle);
  const rows = Math.floor(size / 52);
  for (let r = 0; r < rows; r++) {
    const v = -size / 2 + 26 + r * 52;
    let u = -size / 2;
    while (u < size / 2 - 30) {
      const point = rng.next() < 0.18;
      const high = !point && rng.next() < tall;
      const length = point ? 24 : high ? rng.range(48, 72) : rng.range(60, 110);
      const depth = point ? 24 : rng.range(11.5, 13);
      const floors = point ? rng.int(4) + 14 : high ? (rng.next() < 0.5 ? 10 : 11) : rng.next() < 0.7 ? 5 : 4;
      const kind = point ? 'punktowiec' : 'blok';
      const along = Math.min(length, size / 2 - u);
      if (along > 20) p.add(kind, f.x(u + along / 2, v), f.z(u + along / 2, v), angle, along, depth, floors, rng.next(), rng.next());
      u += along + rng.range(22, 40);
    }
  }
}

/** Detached houses on a loose grid round a point: Polish cubes and steep-roofed newer houses. */
function suburb(p: Planner, rng: Rng, x: number, z: number, radius: number, count: number, mountains: boolean): void {
  const angle = rng.range(0, Math.PI / 2);
  for (let k = 0, placed = 0; k < count * 4 && placed < count; k++) {
    const r = radius * Math.sqrt(rng.next());
    const a = rng.range(0, Math.PI * 2);
    const hx = x + Math.cos(a) * r;
    const hz = z + Math.sin(a) * r;
    const turn = angle + Math.round(rng.range(0, 3.99)) * (Math.PI / 2) + rng.range(-0.06, 0.06);
    const kind = mountains ? 'highlander' : rng.next() < 0.45 ? 'kostka' : 'house';
    const w = kind === 'kostka' ? rng.range(9, 11) : rng.range(9, 13);
    const d = kind === 'kostka' ? rng.range(9, 11) : rng.range(8, 10);
    if (p.add(kind, hx, hz, turn, w, d, kind === 'kostka' ? 2 : rng.next() < 0.6 ? 1 : 2, rng.next(), rng.next())) placed++;
  }
}

/** An industrial edge: halls and a chimney or two; `power` adds a power station's cooling towers. */
function industry(p: Planner, rng: Rng, x: number, z: number, power: boolean): void {
  const angle = rng.range(0, Math.PI);
  const f = frame(x, z, angle);
  for (let k = 0; k < 6; k++) {
    const u = rng.range(-180, 180);
    const v = rng.range(-140, 140);
    p.add('factory', f.x(u, v), f.z(u, v), angle, rng.range(60, 130), rng.range(30, 60), rng.range(10, 16), rng.next(), rng.next(), EDGE);
  }
  const stacks = power ? 2 : 1 + rng.int(2);
  for (let k = 0; k < stacks; k++) {
    const u = rng.range(-120, 120);
    const v = rng.range(-120, 120);
    p.add('chimney', f.x(u, v), f.z(u, v), 0, 10, 10, power ? 260 : rng.range(90, 160), rng.next(), rng.next(), EDGE);
  }
  if (power) {
    for (let k = 0; k < 4; k++) {
      const u = 200 + (k % 2) * 130;
      const v = -70 + Math.floor(k / 2) * 140;
      p.add('cooling-tower', f.x(u, v), f.z(u, v), 0, 110, 110, 125, rng.next(), rng.next(), EDGE);
    }
  }
}

/** The capital's centre: the palace-of-culture tower on its square, and glass towers round it. */
function capitalCentre(p: Planner, rng: Rng, s: Settlement, core: { x: number; z: number }): void {
  // A kilometre or so from the old town, on dry ground.
  const angle = rng.range(0, Math.PI / 2);
  let at: { x: number; z: number } | null = null;
  // Off the roads if it can be, else where the roads allow least badly.
  for (const roadsToo of [true, false]) {
    for (let k = 0; k < 48 && !at; k++) {
      const a = (k / 48) * Math.PI * 2;
      const r = 1100 + (k % 3) * 250;
      const x = core.x + Math.cos(a) * r;
      const z = core.z + Math.sin(a) * r;
      if (p.dry(x, z, 380) && Math.hypot(x - s.x, z - s.z) < s.radiusM * 0.6 && (!roadsToo || p.clearOfRoads(x, z, angle, 170, 120))) at = { x, z };
    }
  }
  if (!at) return;
  p.add('palace', at.x, at.z, angle, 170, 120, 231, rng.next(), rng.next(), DRY_TOWN, true);
  p.reserve(at.x, at.z, angle, 330, 330);
  const f = frame(at.x, at.z, angle);
  const heights = [230, 205, 192, 170, 155, 140, 128, 116, 104, 96];
  let placed = 0;
  for (let k = 0; k < 80 && placed < heights.length; k++) {
    const u = rng.range(-480, 480);
    const v = rng.range(-480, 480);
    if (Math.abs(u) < 200 && Math.abs(v) < 200) continue;
    const size = rng.range(32, 48);
    if (p.add('glass-tower', f.x(u, v), f.z(u, v), angle + rng.range(-0.2, 0.2), size, size * rng.range(0.7, 1), heights[placed], rng.next(), rng.next())) placed++;
  }
}

/** Points along the village's roads within its radius, with the road's direction there. */
function roadPoints(s: Settlement, roads: readonly Road[], step: number): { x: number; z: number; dx: number; dz: number }[] {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  for (const r of roads) {
    for (let k = 0; k + 3 < r.points.length; k += 2) {
      const [ax, az, bx, bz] = [r.points[k], r.points[k + 1], r.points[k + 2], r.points[k + 3]];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const n = Math.ceil(len / step);
      for (let i = 0; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const z = az + ((bz - az) * i) / n;
        if (Math.hypot(x - s.x, z - s.z) <= s.radiusM * 1.05) out.push({ x, z, dx: (bx - ax) / len, dz: (bz - az) / len });
      }
    }
  }
  return out;
}

/** A street village: farmhouses facing the road on both sides with barns behind, and a church near the middle. */
function village(p: Planner, rng: Rng, s: Settlement, roads: readonly Road[], mountains: boolean): void {
  const church = mountains ? 'wooden-church' : 'village-church';
  // The church near the middle, its nave east–west and the tower at the west end.
  for (let k = 0; k < 24; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(40, s.radiusM * 0.35);
    if (p.add(church, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 0, mountains ? 22 : 30, mountains ? 11 : 13, mountains ? 26 : 34, rng.next(), rng.next())) break;
  }
  const along = roadPoints(s, roads, rng.range(30, 42));
  for (const pt of along) {
    for (const side of [-1, 1]) {
      if (rng.next() < 0.22) continue;
      // Left of the road is (dz, −dx).
      const nx = pt.dz * side;
      const nz = -pt.dx * side;
      const off = rng.range(17, 24);
      const hx = pt.x + nx * off;
      const hz = pt.z + nz * off;
      const kind = mountains ? 'highlander' : rng.next() < 0.5 ? 'kostka' : 'house';
      const w = kind === 'kostka' ? rng.range(9, 11) : rng.range(10, 13);
      const d = kind === 'kostka' ? rng.range(9, 11) : rng.range(8, 10);
      // The house faces the road.
      if (!p.add(kind, hx, hz, facing(-nx, -nz), w, d, kind === 'kostka' ? 2 : rng.next() < 0.6 ? 1 : 2, rng.next(), rng.next(), FARMLAND)) continue;
      if (rng.next() < 0.75) {
        const back = off + rng.range(26, 38);
        p.add('barn', pt.x + nx * back, pt.z + nz * back, facing(-nx, -nz), rng.range(18, 30), rng.range(9, 12), rng.range(6, 8), rng.next(), rng.next(), FARMLAND);
      }
    }
  }
  // Villages off the road network, or thin ones, fill in round the middle.
  const houses = p.out.filter((b) => b.kind !== 'barn').length;
  const want = Math.round(24 + s.radiusM / 25);
  if (houses < want) suburb(p, rng, s.x, s.z, s.radiusM * 0.8, want - houses, mountains);
}

/** Villages this high above the sea are in the mountains: highlander houses and a wooden church. */
export const MOUNTAIN_VILLAGE_M = 280;

/**
 * Everything to build for a settlement. Cities: the old town, estates, suburbs, industry, and the capital's centre;
 * the coastal city's old town is Hanseatic; Odrzyn has the power station. Villages: houses along their roads.
 */
export function planTown(s: Settlement, ground: Ground, roads: RoadIndex): Structure[] {
  const p = new Planner(ground, roads);
  const rng = new Rng(nameSeed(s.name));
  if (s.kind === 'village') {
    village(p, rng, s, roads.roads, ground.heightAt(s.x, s.z) > MOUNTAIN_VILLAGE_M);
    return p.out;
  }
  const scale = s.radiusM / 3500;
  const mountains = ground.heightAt(s.x, s.z) > MOUNTAIN_VILLAGE_M;
  const core = findCore(p, s, s.capital ? 330 : 260);
  oldTown(p, rng, s, core, s.capital ? 5 : s.radiusM >= 3500 ? 5 : 3, s.name === 'Morzysko');
  if (s.capital) capitalCentre(p, rng, s, core);
  // Estates in a ring round the old town.
  const estates = Math.round((s.capital ? 16 : 7) * scale);
  for (let k = 0, placed = 0; k < estates * 6 && placed < estates; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = s.radiusM * rng.range(0.28, 0.72);
    const x = s.x + Math.cos(a) * r;
    const z = s.z + Math.sin(a) * r;
    if (!p.dry(x, z, 180)) continue;
    const before = p.out.length;
    estate(p, rng, x, z, rng.range(300, 480), s.capital ? 0.45 : 0.3);
    if (p.out.length > before + 3) placed++;
  }
  // Houses toward the edge.
  const suburbs = Math.round((s.capital ? 22 : 12) * scale);
  for (let k = 0; k < suburbs; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = s.radiusM * rng.range(0.55, 0.92);
    // The mountain city's outskirts are highlander country.
    suburb(p, rng, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, rng.range(220, 380), Math.round(rng.range(30, 60)), mountains && rng.next() < 0.6);
  }
  // Industry on the edge.
  const zones = s.capital ? 2 : 1;
  const power = s.name === 'Odrzyn';
  for (let k = 0, placed = 0; k < 160 && placed < zones; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = s.radiusM * rng.range(0.6, 1.15);
    const x = s.x + Math.cos(a) * r;
    const z = s.z + Math.sin(a) * r;
    if (!p.dry(x, z, power && placed === 0 ? 380 : 180, EDGE)) continue;
    const before = p.out.length;
    industry(p, rng, x, z, power && placed === 0);
    if (p.out.length > before + 1) placed++;
  }
  return p.out;
}

/**
 * The castle: a red-brick fortress by the river near the coastal city (after the great castles of the Baltic
 * coast), on dry ground a few kilometres upstream; null when there is no room.
 */
export function planCastle(city: Settlement, ground: Ground, roads: RoadIndex): Structure | null {
  const p = new Planner(ground, roads);
  const rng = new Rng(nameSeed(city.name) ^ 0x51ed);
  for (let k = 0; k < 400; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = city.radiusM + rng.range(1500, 6000);
    const x = city.x + Math.cos(a) * r;
    const z = city.z + Math.sin(a) * r;
    // Beside water, on dry flat land.
    let water = false;
    for (let j = 0; j < 8; j++) {
      const c = ground.coverAt(x + Math.cos((j / 8) * Math.PI * 2) * 260, z + Math.sin((j / 8) * Math.PI * 2) * 260);
      if (c === 'river' || c === 'lake' || c === 'sea') water = true;
    }
    if (!water) continue;
    const h = [ground.heightAt(x - 70, z - 70), ground.heightAt(x + 70, z - 70), ground.heightAt(x - 70, z + 70), ground.heightAt(x + 70, z + 70)];
    if (Math.max(...h) - Math.min(...h) > 12) continue;
    if (p.add('castle', x, z, rng.range(0, Math.PI / 2), 150, 120, 30, rng.next(), rng.next(), FARMLAND)) return p.out[0];
  }
  return null;
}
