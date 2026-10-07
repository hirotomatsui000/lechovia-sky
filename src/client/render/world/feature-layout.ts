import type { Airfield, Road } from '../../../shared/map/features.ts';
import { airfieldWorld } from '../../../shared/map/features.ts';
import type { LandCover } from '../../../shared/map/land-cover.ts';

export interface Ground {
  heightAt(x: number, z: number): number;
  coverAt(x: number, z: number): LandCover;
}

/** A stable seed from a name. */
export function nameSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A road as a ribbon draped over the terrain, sampled every `stepM`: x, y, z of the left and right edges per sample.
 * Over water the deck runs level between the banks (a bridge).
 */
export function roadRibbon(road: Road, ground: Ground, widthM: number, stepM = 30, liftM = 1): Float32Array {
  const pts: [number, number][] = [];
  for (let p = 0; p + 3 < road.points.length; p += 2) {
    const [ax, az, bx, bz] = [road.points[p], road.points[p + 1], road.points[p + 2], road.points[p + 3]];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / stepM));
    for (let s = 0; s < n; s++) pts.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  pts.push([road.points.at(-2)!, road.points.at(-1)!]);
  const wet = pts.map(([x, z]) => {
    const c = ground.coverAt(x, z);
    return c === 'river' || c === 'lake' || c === 'sea';
  });
  const heights = pts.map(([x, z]) => ground.heightAt(x, z));
  // Bridges: level between the last dry point before the water and the first after it, a little higher.
  for (let i = 0; i < pts.length; i++) {
    if (!wet[i]) continue;
    let j = i;
    while (j < pts.length && wet[j]) j++;
    const from = heights[Math.max(0, i - 1)];
    const to = heights[Math.min(pts.length - 1, j)];
    for (let k = i; k < j; k++) heights[k] = Math.max(from, to) + 4;
    i = j;
  }
  const out = new Float32Array(pts.length * 6);
  for (let i = 0; i < pts.length; i++) {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    const rx = (-(nz - pz) / len) * (widthM / 2);
    const rz = ((nx - px) / len) * (widthM / 2);
    const [x, z] = pts[i];
    const y = heights[i] + liftM;
    out.set([x - rx, y, z - rz, x + rx, y, z + rz], i * 6);
  }
  return out;
}

/** The airfield's pieces in runway coordinates (u along the take-off direction, v to its right), metres. */
export interface AirfieldLayout {
  /** paved rectangles: centre u, v, length, width */
  paved: { u: number; v: number; length: number; width: number; kind: 'runway' | 'taxiway' | 'apron' }[];
  hangars: { u: number; v: number }[];
  tower: { u: number; v: number };
  /** edge lights along both sides of the runway, every 60 m */
  edgeLights: [number, number][];
  /** threshold (green) lights at the start, end (red) lights at the far end */
  thresholdLights: [number, number][];
  endLights: [number, number][];
}

export const TAXIWAY_OFFSET_M = 180;
export const APRON_OFFSET_M = 320;

export function airfieldLayout(a: Airfield): AirfieldLayout {
  const half = a.lengthM / 2;
  const edgeLights: [number, number][] = [];
  for (let u = -half; u <= half + 1e-6; u += 60) edgeLights.push([u, -a.widthM / 2 - 1], [u, a.widthM / 2 + 1]);
  const across = (u: number) => Array.from({ length: 9 }, (_, k): [number, number] => [u, -a.widthM / 2 + (k * a.widthM) / 8]);
  return {
    paved: [
      { u: 0, v: 0, length: a.lengthM, width: a.widthM, kind: 'runway' },
      { u: 0, v: TAXIWAY_OFFSET_M, length: a.lengthM - 200, width: 23, kind: 'taxiway' },
      // Links from the runway edge to the taxiway, and from the taxiway to the apron; none overlap.
      ...[-half + 100, 0, half - 100].map((u) => ({ u, v: (a.widthM / 2 + TAXIWAY_OFFSET_M - 11.5) / 2, length: 23, width: TAXIWAY_OFFSET_M - 11.5 - a.widthM / 2, kind: 'taxiway' as const })),
      ...[-150, 150].map((u) => ({ u, v: (TAXIWAY_OFFSET_M + 11.5 + APRON_OFFSET_M - 75) / 2, length: 23, width: APRON_OFFSET_M - 75 - TAXIWAY_OFFSET_M - 11.5, kind: 'taxiway' as const })),
      { u: 0, v: APRON_OFFSET_M, length: 460, width: 150, kind: 'apron' },
    ],
    hangars: [-180, -90, 90, 180].map((u) => ({ u, v: APRON_OFFSET_M + 105 })),
    tower: { u: 260, v: APRON_OFFSET_M + 40 },
    edgeLights,
    thresholdLights: across(-half),
    endLights: across(half),
  };
}

/** Runway-relative to map coordinates, for meshes and lights. */
export function airfieldPoint(a: Airfield, u: number, v: number): { x: number; z: number } {
  return airfieldWorld(a, u, v);
}

/** The runway designator painted at the threshold: the take-off heading in tens of degrees ("09"). */
export function runwayNumber(headingRad: number): string {
  const deg = (((headingRad * 180) / Math.PI) % 360 + 360) % 360;
  const n = Math.round(deg / 10) || 36;
  return String(n).padStart(2, '0');
}
