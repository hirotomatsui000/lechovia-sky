import { describe, expect, it } from 'vitest';
import { emitStructure } from './archetypes.ts';
import { TownMesh } from './mesh-builder.ts';
import { type Structure, type StructureKind, wallHeight } from './town-plan.ts';

const KINDS: [StructureKind, number, number, number][] = [
  ['kamienica', 12, 14, 4],
  ['hanseatic', 8, 16, 5],
  ['ratusz', 44, 18, 64],
  ['church', 58, 20, 1],
  ['church', 58, 20, 2],
  ['village-church', 30, 13, 34],
  ['wooden-church', 22, 11, 26],
  ['blok', 58, 12, 11],
  ['punktowiec', 22, 20, 16],
  ['kostka', 10, 10, 2],
  ['house', 12, 9, 1],
  ['highlander', 11, 9, 2],
  ['barn', 24, 10, 7],
  ['factory', 90, 40, 12],
  ['chimney', 10, 10, 160],
  ['cooling-tower', 110, 110, 125],
  ['palace', 170, 120, 231],
  ['glass-tower', 40, 34, 230],
  ['castle', 150, 120, 30],
  ['square', 114, 94, 0],
];

function structure(kind: StructureKind, w: number, d: number, floors: number, angle = 0.6): Structure {
  return { kind, x: 5000, z: -3000, y: 120, angle, w, d, floors, tint: 0.37, style: 0.62 };
}

/** Builds one structure alone and returns its triangles' positions and normals, in the town frame. */
function build(s: Structure) {
  const m = new TownMesh(4900, -3100);
  emitStructure(m, s);
  const positions: number[] = [];
  const normals: number[] = [];
  for (const g of m.geometries().values()) {
    positions.push(...(g.getAttribute('position').array as Float32Array));
    normals.push(...(g.getAttribute('normal').array as Float32Array));
  }
  return { positions, normals };
}

describe('Polish building archetypes (revision 27)', () => {
  it('builds every kind from finite, outward-facing triangles where it stands', () => {
    for (const [kind, w, d, floors] of KINDS) {
      const s = structure(kind, w, d, floors);
      const { positions, normals } = build(s);
      expect(positions.length, kind).toBeGreaterThan(0);
      expect(positions.length % 9, kind).toBe(0);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 9) {
        const a = positions.slice(i, i + 3);
        const b = positions.slice(i + 3, i + 6);
        const c = positions.slice(i + 6, i + 9);
        for (const v of [...a, ...b, ...c, ...normals.slice(i, i + 9)]) expect(Number.isFinite(v), kind).toBe(true);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (Math.hypot(nx, ny, nz) < 1e-6) continue;
        // The winding agrees with the shading normal (averaged over the triangle for smooth shapes).
        const sx = normals[i] + normals[i + 3] + normals[i + 6];
        const sy = normals[i + 1] + normals[i + 4] + normals[i + 7];
        const sz = normals[i + 2] + normals[i + 5] + normals[i + 8];
        expect(nx * sx + ny * sy + nz * sz, `${kind} triangle ${i / 9}`).toBeGreaterThan(0);
        for (const p of [a, b, c]) {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minZ = Math.min(minZ, p[2]);
          maxZ = Math.max(maxZ, p[2]);
        }
      }
      // Centred where it stands (relative to the town's origin), within its footprint's reach.
      // Corner towers and eaves reach a little past the footprint.
      const reach = Math.hypot(w, d) / 2 + 12;
      expect(Math.abs((minX + maxX) / 2 - 100), kind).toBeLessThan(reach);
      expect(Math.abs((minZ + maxZ) / 2 - 100), kind).toBeLessThan(reach);
      expect(Math.max(maxX - minX, maxZ - minZ), kind).toBeLessThan(2 * reach);
    }
  });

  it('reaches the heights of the real thing', () => {
    const top = (s: Structure) => {
      const { positions } = build(s);
      let max = -Infinity;
      for (let i = 1; i < positions.length; i += 3) max = Math.max(max, positions[i]);
      return max - s.y;
    };
    expect(top(structure('palace', 170, 120, 231))).toBeCloseTo(231, 0);
    // The taller of the twin towers of the great brick church, about 82 m.
    expect(top(structure('church', 58, 20, 2))).toBeGreaterThan(78);
    expect(top(structure('church', 58, 20, 2))).toBeLessThan(86);
    const blok = structure('blok', 58, 12, 11);
    expect(top(blok)).toBeGreaterThan(wallHeight(blok));
    expect(top(blok)).toBeLessThan(wallHeight(blok) + 3);
    expect(top(structure('chimney', 10, 10, 160))).toBeCloseTo(160.8, 1);
    expect(top(structure('cooling-tower', 110, 110, 125))).toBeCloseTo(125, 1);
    const tenement = structure('kamienica', 12, 14, 4);
    expect(top(tenement)).toBeGreaterThan(wallHeight(tenement) + 3);
    expect(top(tenement)).toBeLessThan(wallHeight(tenement) + 10);
  });

  it('keeps a kamienica to a few hundred vertices, so a capital stays light', () => {
    const m = new TownMesh(0, 0);
    emitStructure(m, structure('kamienica', 12, 14, 4));
    expect(m.vertexCount).toBeLessThan(400);
  });
});
