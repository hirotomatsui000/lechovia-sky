import { describe, expect, it } from 'vitest';
import { createLechovia } from '../../../../shared/data/maps/lechovia/index.ts';
import { buildTerrain } from '../../../../shared/data/maps/map-definition.ts';
import { type Ground } from '../feature-layout.ts';
import { MOUNTAIN_VILLAGE_M, planCastle, planTown, RoadIndex, type Structure, type StructureKind } from './town-plan.ts';

const map = createLechovia();
const terrain = buildTerrain(map);
const features = map.features!;
const ground: Ground = { heightAt: (x, z) => terrain.heightAt(x, z), coverAt: (x, z) => map.landCover(x, z, 0, 0) };
const roads = new RoadIndex(features.roads);
const plans = new Map(features.settlements.map((s) => [s.name, planTown(s, ground, roads)]));

/** Points every 2 m along every road, binned on 100 m cells, to check footprints against independently. */
const roadPoints = new Map<string, number[]>();
for (const r of features.roads) {
  for (let k = 0; k + 3 < r.points.length; k += 2) {
    const [ax, az, bx, bz] = [r.points[k], r.points[k + 1], r.points[k + 2], r.points[k + 3]];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      const key = `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
      const bin = roadPoints.get(key) ?? [];
      bin.push(x, z);
      roadPoints.set(key, bin);
    }
  }
}

/** Whether any road's centre line runs within `margin` of a footprint. */
function onARoad(b: Structure, margin: number): boolean {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  const reach = Math.hypot(b.w, b.d) / 2 + margin;
  for (let i = Math.floor((b.x - reach) / 100); i <= Math.floor((b.x + reach) / 100); i++) {
    for (let j = Math.floor((b.z - reach) / 100); j <= Math.floor((b.z + reach) / 100); j++) {
      const bin = roadPoints.get(`${i},${j}`) ?? [];
      for (let k = 0; k < bin.length; k += 2) {
        const dx = bin[k] - b.x;
        const dz = bin[k + 1] - b.z;
        if (Math.abs(dx * c + dz * s) < b.w / 2 + margin && Math.abs(-dx * s + dz * c) < b.d / 2 + margin) return true;
      }
    }
  }
  return false;
}
const cities = features.settlements.filter((s) => s.kind === 'city');
const villages = features.settlements.filter((s) => s.kind === 'village');

/** The roads run through the old square, where these stand. */
const ON_THE_SQUARE: ReadonlySet<StructureKind> = new Set(['ratusz', 'church', 'palace', 'square']);

const count = (plan: readonly Structure[], kind: StructureKind) => plan.filter((b) => b.kind === kind).length;

/** The four corners of a footprint, in map x, z. */
function corners(b: Structure): [number, number][] {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => [b.x + ((u * b.w) / 2) * c - ((v * b.d) / 2) * s, b.z + ((u * b.w) / 2) * s + ((v * b.d) / 2) * c]);
}

describe('Polish towns (revision 27)', () => {
  it('gives every city an old town with its town hall, tenements and a brick church', () => {
    for (const s of cities) {
      const plan = plans.get(s.name)!;
      expect(count(plan, 'ratusz'), s.name).toBe(1);
      expect(count(plan, 'square'), s.name).toBe(1);
      expect(count(plan, 'church'), s.name).toBeGreaterThanOrEqual(1);
      expect(count(plan, 'kamienica') + count(plan, 'hanseatic'), s.name).toBeGreaterThan(60);
      expect(count(plan, 'blok') + count(plan, 'punktowiec'), s.name).toBeGreaterThan(40);
      expect(count(plan, 'kostka') + count(plan, 'house') + count(plan, 'highlander'), s.name).toBeGreaterThan(100);
      expect(count(plan, 'factory'), s.name).toBeGreaterThan(0);
    }
  });

  it('builds the capital its palace tower and glass towers, the coast its Hanseatic houses and Odrzyn its power station', () => {
    const capital = plans.get(cities.find((s) => s.capital)!.name)!;
    expect(count(capital, 'palace')).toBe(1);
    expect(count(capital, 'glass-tower')).toBeGreaterThanOrEqual(8);
    expect(capital.find((b) => b.kind === 'palace')!.floors).toBe(231);
    expect(count(capital, 'blok')).toBeGreaterThan(300);
    expect(count(plans.get('Morzysko')!, 'hanseatic')).toBeGreaterThan(100);
    expect(count(plans.get('Morzysko')!, 'kamienica')).toBe(0);
    expect(count(plans.get('Odrzyn')!, 'cooling-tower')).toBe(2);
  });

  it('strings villages along their road, with barns behind and a church; timber in the mountains', () => {
    let highland = 0;
    for (const s of villages) {
      const plan = plans.get(s.name)!;
      const mountains = terrain.heightAt(s.x, s.z) > MOUNTAIN_VILLAGE_M;
      if (mountains) highland++;
      expect(count(plan, mountains ? 'wooden-church' : 'village-church') + count(plan, mountains ? 'village-church' : 'wooden-church'), s.name).toBeLessThanOrEqual(1);
      if (mountains) expect(count(plan, 'kostka') + count(plan, 'house'), s.name).toBe(0);
      else expect(count(plan, 'highlander'), s.name).toBe(0);
    }
    expect(highland).toBeGreaterThan(0);
    const all = villages.flatMap((s) => plans.get(s.name)!);
    expect(count(all, 'village-church')).toBeGreaterThan(20);
    expect(count(all, 'wooden-church')).toBeGreaterThan(0);
    expect(count(all, 'barn')).toBeGreaterThan(100);
    expect(count(all, 'highlander')).toBeGreaterThan(20);
  });

  it('stands everything on dry ground, off the roads (bar the landmarks on the old square), on its lowest ground', () => {
    for (const [name, plan] of plans) {
      for (const b of plan) {
        for (const [x, z] of corners(b)) {
          const cover = ground.coverAt(x, z);
          expect(['urban', 'field', 'meadow'], `${name} ${b.kind}`).toContain(cover);
          expect(b.y, `${name} ${b.kind}`).toBeLessThanOrEqual(terrain.heightAt(x, z) + 1e-6);
        }
        if (ON_THE_SQUARE.has(b.kind)) continue;
        // Clear of the 6 m ribbon of a local road (and further from highways).
        expect(onARoad(b, 3), `${name} ${b.kind} at ${Math.round(b.x)}, ${Math.round(b.z)}`).toBe(false);
      }
    }
  });

  it('keeps buildings apart', () => {
    for (const s of cities) {
      const plan = plans.get(s.name)!;
      const seen = new Set<string>();
      for (const b of plan) {
        if (b.kind === 'square') continue;
        const key = `${Math.round(b.x)},${Math.round(b.z)}`;
        expect(seen.has(key), `${s.name} ${b.kind}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('lines the old town streets wall to wall', () => {
    const plan = plans.get(cities[0].name)!.filter((b) => b.kind === 'kamienica');
    // Each tenement has a neighbour sharing a party wall: its side, one half-width plus the other's away along the row.
    let joined = 0;
    for (const b of plan) {
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      if (plan.some((o) => o !== b && Math.abs(o.angle - b.angle) < 1e-6 && Math.abs(Math.abs((o.x - b.x) * c + (o.z - b.z) * s) - (o.w + b.w) / 2) < 0.01 && Math.abs(-(o.x - b.x) * s + (o.z - b.z) * c) < 3)) joined++;
    }
    expect(joined / plan.length).toBeGreaterThan(0.85);
  });

  it('keeps footprints clear of roads by their kerbs', () => {
    const index = new RoadIndex([{ kind: 'local', points: [0, 0, 100, 0] }]);
    expect(index.clear(50, 0, 0, 10, 10)).toBe(false);
    expect(index.clear(50, 9, 0, 10, 10)).toBe(false);
    expect(index.clear(50, 11, 0, 10, 10)).toBe(true);
    expect(index.clear(115, 0, 0, 10, 10)).toBe(true);
    expect(index.clear(50, 30, Math.PI / 2, 60, 6)).toBe(false);
  });

  it('is the same every time', () => {
    const s = cities[1];
    expect(planTown(s, ground, roads)).toEqual(plans.get(s.name));
  });

  it('puts the castle by the water near the coastal city', () => {
    const coast = cities.find((s) => s.name === 'Morzysko')!;
    const castle = planCastle(coast, ground, roads)!;
    expect(castle.kind).toBe('castle');
    const d = Math.hypot(castle.x - coast.x, castle.z - coast.z);
    expect(d).toBeGreaterThan(coast.radiusM);
    expect(d).toBeLessThan(coast.radiusM + 6500);
    expect(planCastle(coast, ground, roads)).toEqual(castle);
  });
});
