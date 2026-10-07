import { BufferAttribute, BufferGeometry, type Color } from 'three';
import { type MaterialKey, TILE_M } from './facade-textures.ts';

/** The buffers of one material's mesh. */
interface Part {
  p: number[];
  n: number[];
  uv: number[];
  c: number[];
}

type V3 = readonly [number, number, number];

/**
 * Merges a town's buildings into one mesh per material (revision 27). Each building is placed in turn; its parts are
 * given in its own frame (x across the front, z from the front to the back, y up from its ground) and written in the
 * town's frame, relative to the town's centre so positions keep their precision far from the map's middle. Faces are
 * flat-shaded, wound to face their outward normal, textured in metres of their material's tile, and tinted per vertex.
 */
export class TownMesh {
  private readonly parts = new Map<MaterialKey, Part>();
  private readonly originX: number;
  private readonly originZ: number;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private c = 1;
  private s = 0;

  constructor(originX: number, originZ: number) {
    this.originX = originX;
    this.originZ = originZ;
  }

  /** Sets the frame for the next parts: a building at map (x, y, z), turned by `angle` (x axis along (cos, sin)). */
  place(x: number, y: number, z: number, angle: number): void {
    this.ox = x - this.originX;
    this.oy = y;
    this.oz = z - this.originZ;
    this.c = Math.cos(angle);
    this.s = Math.sin(angle);
  }

  private part(key: MaterialKey): Part {
    let part = this.parts.get(key);
    if (!part) {
      part = { p: [], n: [], uv: [], c: [] };
      this.parts.set(key, part);
    }
    return part;
  }

  /** Local to town frame. */
  private tx(x: number, z: number): number {
    return this.ox + x * this.c - z * this.s;
  }

  private tz(x: number, z: number): number {
    return this.oz + x * this.s + z * this.c;
  }

  /**
   * A flat convex polygon in the building's frame with its texture coordinates (in tiles), tinted `color`. `outward`
   * (local) decides the winding; without it the points' own order stands.
   */
  poly(key: MaterialKey, pts: readonly V3[], uvs: readonly (readonly [number, number])[], color: Color, outward?: V3): void {
    if (pts.length < 3) return;
    const [a, b, d] = [pts[0], pts[1], pts[2]];
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    let order = pts.map((_, i) => i);
    if (outward && nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) {
      order = order.reverse();
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    // Normal into the town frame.
    const wnx = nx * this.c - nz * this.s;
    const wnz = nx * this.s + nz * this.c;
    const part = this.part(key);
    for (let k = 1; k + 1 < order.length; k++) {
      for (const i of [order[0], order[k], order[k + 1]]) {
        const [x, y, z] = pts[i];
        part.p.push(this.tx(x, z), this.oy + y, this.tz(x, z));
        part.n.push(wnx, ny, wnz);
        part.uv.push(uvs[i][0], uvs[i][1]);
        part.c.push(color.r, color.g, color.b);
      }
    }
  }

  /**
   * A vertical wall from (ax, az) to (bx, bz), from y0 to y1, facing away from (cx, cz). Its texture runs along the
   * wall from `u0` metres and up from `vBase`.
   */
  wall(key: MaterialKey, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, color: Color, o: { u0?: number; vBase?: number; cx?: number; cz?: number } = {}): void {
    const [tu, tv] = TILE_M[key];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = (o.u0 ?? 0) / tu;
    const u1 = ((o.u0 ?? 0) + len) / tu;
    const vb = o.vBase ?? 0;
    const v0 = (y0 - vb) / tv;
    const v1 = (y1 - vb) / tv;
    const mx = (ax + bx) / 2 - (o.cx ?? 0);
    const mz = (az + bz) / 2 - (o.cz ?? 0);
    this.poly(
      key,
      [
        [ax, y0, az],
        [bx, y0, bz],
        [bx, y1, bz],
        [ax, y1, az],
      ],
      [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ],
      color,
      [mx, 0, mz],
    );
  }

  /** The four walls of a w × d box centred on (cx, cz), the texture running round the corners. */
  box(key: MaterialKey, cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: Color, o: { u0?: number; vBase?: number; sides?: Partial<Record<'front' | 'back' | 'left' | 'right', MaterialKey | null>>; sideColor?: Color } = {}): void {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    let u = o.u0 ?? 0;
    const sides: ['front' | 'back' | 'left' | 'right', number, number, number, number][] = [
      ['front', x0, z0, x1, z0],
      ['right', x1, z0, x1, z1],
      ['back', x1, z1, x0, z1],
      ['left', x0, z1, x0, z0],
    ];
    for (const [name, ax, az, bx, bz] of sides) {
      const k = o.sides && name in o.sides ? o.sides[name] : key;
      if (k) this.wall(k, ax, az, bx, bz, y0, y1, name === 'left' || name === 'right' ? (o.sideColor ?? color) : color, { u0: u, vBase: o.vBase, cx, cz });
      u += Math.hypot(bx - ax, bz - az);
    }
  }

  /** A flat horizontal rectangle at height y (a flat roof or a ledge's top), textured in metres. */
  flat(key: MaterialKey, cx: number, cz: number, w: number, d: number, y: number, color: Color, down = false): void {
    const [tu, tv] = TILE_M[key];
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    this.poly(
      key,
      [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1],
      ],
      [
        [x0 / tu, z0 / tv],
        [x1 / tu, z0 / tv],
        [x1 / tu, z1 / tv],
        [x0 / tu, z1 / tv],
      ],
      color,
      [0, down ? -1 : 1, 0],
    );
  }

  /**
   * A pitched roof over a w × d box at eave height `y`: a gable roof with its ridge along x (`ridgeAlongX`) or z, or a
   * hipped one (`hip` > 0 pulls the ridge in from the ends by that share). `overhang` reaches past the walls. Gable
   * ends are walls of `gableKey`. Returns the ridge height.
   */
  roof(key: MaterialKey, cx: number, cz: number, w: number, d: number, y: number, pitchRad: number, color: Color, o: { ridgeAlongX?: boolean; hip?: number; overhang?: number; gableKey?: MaterialKey | null; gableColor?: Color; vBase?: number } = {}): number {
    const along = o.ridgeAlongX ?? true;
    const L = along ? w : d;
    const S = along ? d : w;
    const oh = o.overhang ?? 0.35;
    const rise = (S / 2) * Math.tan(pitchRad);
    const top = y + rise;
    const hipIn = Math.min(L / 2, (o.hip ?? 0) * (S / 2) * 1.0);
    // Work in (l, s) with l along the ridge and s across, then map to x, z.
    const P = (l: number, yy: number, s: number): V3 => (along ? [cx + l, yy, cz + s] : [cx + s, yy, cz + l]);
    const eaveY = y - oh * Math.tan(pitchRad);
    const Lh = L / 2 + oh;
    const Sh = S / 2 + oh;
    const [tu, tv] = TILE_M[key];
    const slope = Math.hypot(Sh, top - eaveY);
    // The two long slopes (trapezoids with a hip, rectangles without).
    for (const side of [-1, 1]) {
      const pts: V3[] = [P(-Lh, eaveY, side * Sh), P(Lh, eaveY, side * Sh), P(L / 2 - hipIn, top, 0), P(-L / 2 + hipIn, top, 0)];
      const uvs: [number, number][] = [
        [-Lh / tu, 0],
        [Lh / tu, 0],
        [(L / 2 - hipIn) / tu, slope / tv],
        [(-L / 2 + hipIn) / tu, slope / tv],
      ];
      const out: V3 = along ? [0, 1, side] : [side, 1, 0];
      this.poly(key, pts, uvs, color, out);
    }
    if (hipIn > 0) {
      // Hip ends.
      for (const end of [-1, 1]) {
        const pts: V3[] = [P(end * Lh, eaveY, -Sh), P(end * Lh, eaveY, Sh), P(end * (L / 2 - hipIn), top, 0)];
        const run = Math.hypot(Lh - (L / 2 - hipIn), top - eaveY);
        const uvs: [number, number][] = [
          [-Sh / tu, 0],
          [Sh / tu, 0],
          [0, run / tv],
        ];
        this.poly(key, pts, uvs, color, along ? [end, 1, 0] : [0, 1, end]);
      }
    } else if (o.gableKey !== null) {
      // Gable ends: triangles of wall.
      const gk = o.gableKey ?? 'trim';
      const [gu, gv] = TILE_M[gk];
      const vb = o.vBase ?? 0;
      for (const end of [-1, 1]) {
        const pts: V3[] = [P((end * L) / 2, y, -S / 2), P((end * L) / 2, y, S / 2), P((end * L) / 2, top, 0)];
        const uvs: [number, number][] = [
          [-S / 2 / gu, (y - vb) / gv],
          [S / 2 / gu, (y - vb) / gv],
          [0, (top - vb) / gv],
        ];
        this.poly(gk, pts, uvs, o.gableColor ?? color, along ? [end, 0, 0] : [0, 0, end]);
      }
    }
    return top;
  }

  /** A pyramid or spire with `sides` faces on a square or round base of half-width r, from y to y + h. */
  spire(key: MaterialKey, cx: number, cz: number, r: number, y: number, h: number, sides: number, color: Color, turn = Math.PI / sides): void {
    const [tu, tv] = TILE_M[key];
    const slant = Math.hypot(r, h);
    for (let k = 0; k < sides; k++) {
      const a0 = turn + (k / sides) * Math.PI * 2;
      const a1 = turn + ((k + 1) / sides) * Math.PI * 2;
      const rr = sides === 4 ? r * Math.SQRT2 : r;
      const p0: V3 = [cx + Math.cos(a0) * rr, y, cz + Math.sin(a0) * rr];
      const p1: V3 = [cx + Math.cos(a1) * rr, y, cz + Math.sin(a1) * rr];
      const edge = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
      const am = (a0 + a1) / 2;
      this.poly(
        key,
        [p0, p1, [cx, y + h, cz]],
        [
          [0, 0],
          [edge / tu, 0],
          [edge / 2 / tu, slant / tv],
        ],
        color,
        [Math.cos(am), r / Math.max(h, 0.01), Math.sin(am)],
      );
    }
  }

  /**
   * A body of revolution round (cx, cz): `profile` gives [radius, y] from the bottom up. Smooth-shaded, textured
   * round the circumference and up the side; `inside` also draws the inner face (an open-topped tower).
   */
  lathe(key: MaterialKey, cx: number, cz: number, profile: readonly (readonly [number, number])[], sides: number, colorAt: (y: number) => Color, inside = false): void {
    const [tu, tv] = TILE_M[key];
    const part = this.part(key);
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i];
      const [r1, y1] = profile[i + 1];
      const dr = r1 - r0;
      const dy = y1 - y0;
      const slant = Math.hypot(dr, dy) || 1;
      // Outward normal of the side in (radial, y).
      const nr = dy / slant;
      const ny = -dr / slant;
      const color = colorAt((y0 + y1) / 2);
      for (const face of inside ? [1, -1] : [1]) {
        for (let k = 0; k < sides; k++) {
          const a0 = (k / sides) * Math.PI * 2;
          const a1 = ((k + 1) / sides) * Math.PI * 2;
          const circ = (2 * Math.PI * Math.max(r0, r1)) / sides;
          const quad: [number, number, number][] = [
            [a0, r0, y0],
            [a1, r0, y0],
            [a1, r1, y1],
            [a0, r1, y1],
          ];
          // (p0, p1, p2) faces in toward the axis: the outside takes the other turn.
          const order = face === 1 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
          for (const q of order) {
            const [a, r, y] = quad[q];
            const lx = cx + Math.cos(a) * r;
            const lz = cz + Math.sin(a) * r;
            part.p.push(this.tx(lx, lz), this.oy + y, this.tz(lx, lz));
            const nx = Math.cos(a) * nr * face;
            const nz = Math.sin(a) * nr * face;
            part.n.push(nx * this.c - nz * this.s, ny * face, nx * this.s + nz * this.c);
            part.uv.push(((q === 1 || q === 2 ? k + 1 : k) * circ) / tu, y / tv);
            part.c.push(color.r, color.g, color.b);
          }
        }
      }
    }
  }

  /** A horizontal ledge (a cornice or string course) along a wall from (ax, az) to (bx, bz): out by `depth`. */
  ledge(key: MaterialKey, ax: number, az: number, bx: number, bz: number, y: number, height: number, depth: number, color: Color, cx = 0, cz = 0): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    // The side of the wall away from the centre.
    let nx = dz / len;
    let nz = -dx / len;
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const ox = nx * depth;
    const oz = nz * depth;
    const [tu] = TILE_M[key];
    const u1 = len / tu;
    // Front, top and underside.
    this.poly(
      key,
      [
        [ax + ox, y, az + oz],
        [bx + ox, y, bz + oz],
        [bx + ox, y + height, bz + oz],
        [ax + ox, y + height, az + oz],
      ],
      [
        [0, 0],
        [u1, 0],
        [u1, 0.1],
        [0, 0.1],
      ],
      color,
      [nx, 0, nz],
    );
    this.poly(
      key,
      [
        [ax, y + height, az],
        [bx, y + height, bz],
        [bx + ox, y + height, bz + oz],
        [ax + ox, y + height, az + oz],
      ],
      [
        [0, 0],
        [u1, 0],
        [u1, 0.1],
        [0, 0.1],
      ],
      color,
      [0, 1, 0],
    );
    this.poly(
      key,
      [
        [ax, y, az],
        [bx, y, bz],
        [bx + ox, y, bz + oz],
        [ax + ox, y, az + oz],
      ],
      [
        [0, 0],
        [u1, 0],
        [u1, 0.1],
        [0, 0.1],
      ],
      color,
      [0, -1, 0],
    );
  }

  /** The finished meshes' geometry, one per material used. */
  geometries(): Map<MaterialKey, BufferGeometry> {
    const out = new Map<MaterialKey, BufferGeometry>();
    for (const [key, part] of this.parts) {
      if (part.p.length === 0) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(part.p), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(part.n), 3));
      g.setAttribute('uv', new BufferAttribute(new Float32Array(part.uv), 2));
      g.setAttribute('color', new BufferAttribute(new Float32Array(part.c), 3));
      g.computeBoundingSphere();
      out.set(key, g);
    }
    return out;
  }

  /** Vertices written so far (all materials). */
  get vertexCount(): number {
    let n = 0;
    for (const part of this.parts.values()) n += part.p.length / 3;
    return n;
  }
}
