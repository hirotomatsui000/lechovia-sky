import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import type { MapDefinition } from '../../../shared/data/maps/map-definition.ts';
import type { Airfield } from '../../../shared/map/features.ts';
import type { Terrain } from '../../../shared/map/terrain.ts';
import { Rng } from '../../../shared/math/rng.ts';
import { emitStructure } from './buildings/archetypes.ts';
import { buildingMaterials, setWindowLight } from './buildings/facade-textures.ts';
import { TownMesh } from './buildings/mesh-builder.ts';
import { planCastle, planTown, RoadIndex, type Structure, wallHeight } from './buildings/town-plan.ts';
import { airfieldLayout, airfieldPoint, type Ground, nameSeed, roadRibbon, runwayNumber } from './feature-layout.ts';

/** Settlements and roads disappear beyond these distances (their ground tint and night lights stay). */
const CITY_RANGE_M = 45000;
const VILLAGE_RANGE_M = 18000;
const CASTLE_RANGE_M = 25000;
/** A town's meshes are built a little each frame, at most this long, so flying toward a city never stutters. */
const BUILD_BUDGET_MS = 4;
/** A built town is freed this far beyond its range (a share of it), and built again on the way back. */
const FREE_MARGIN = 1.25;
const HIGHWAY_RANGE_M = 30000;
const LOCAL_ROAD_RANGE_M = 14000;
const AIRFIELD_RANGE_M = 40000;
/** Paved surfaces float this far above the flattened ground, clear of depth fighting. */
const PAVED_LIFT_M = 0.35;

/** Night lights of the world, for the environment to show after dusk (M4). */
export interface NightLights {
  /** x, y, z per light */
  positions: Float32Array;
  /** r, g, b per light */
  colors: Float32Array;
}

const highwayMaterial = new MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.92 });
const localRoadMaterial = new MeshStandardMaterial({ color: 0x5f5a52, roughness: 0.95 });
const concreteMaterial = new MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.95 });
const hangarMaterial = new MeshStandardMaterial({ color: 0x6d7466, roughness: 0.7, metalness: 0.3, side: DoubleSide });
const towerMaterial = new MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.85 });
const glassMaterial = new MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.15, metalness: 0.6 });

interface Ranged {
  object: Object3D;
  center: Vector3;
  range: number;
}

/** A settlement's buildings: planned at once, built into one mesh per material when the camera comes near. */
interface Town {
  name: string;
  center: Vector3;
  range: number;
  plan: readonly Structure[];
  group: Group | null;
}

/** Kinds whose windows light up at night, seen from afar as points of light. */
const LIT_KINDS: ReadonlySet<Structure['kind']> = new Set(['kamienica', 'hanseatic', 'ratusz', 'blok', 'punktowiec', 'kostka', 'house', 'highlander', 'glass-tower', 'palace']);
/** Tall things that carry a red aviation light on top. */
const BEACON_KINDS: ReadonlySet<Structure['kind']> = new Set(['chimney', 'cooling-tower', 'palace', 'glass-tower']);

/**
 * Airfields, towns and roads on Lechovia (spec §12.3): runways with markings, taxiways, aprons, hangars and towers;
 * Polish towns and villages (revision 27: old towns of tenements round a market square, panel-block estates, houses,
 * churches, industry, the capital's palace and towers, a castle); road ribbons. Distant ones are hidden; a town's
 * meshes are built when the camera comes within range and freed when it leaves. Also collects the night lights.
 */
export class WorldFeatures {
  readonly group = new Group();
  readonly cityLights: NightLights;
  readonly runwayLights: NightLights;
  private readonly ranged: Ranged[] = [];
  private readonly textures: CanvasTexture[] = [];
  private readonly towns: Town[] = [];
  /** the town whose meshes are being built, and how far through its plan */
  private building: { town: Town; mesh: TownMesh; next: number } | null = null;
  /** the first update builds every town in range at once, before the first frame shows */
  private started = false;

  constructor(def: MapDefinition, terrain: Terrain) {
    this.group.name = 'world-features';
    const features = def.features;
    const city: number[] = [];
    const cityColors: number[] = [];
    const runway: number[] = [];
    const runwayColors: number[] = [];
    if (features) {
      const ground: Ground = { heightAt: (x, z) => terrain.heightAt(x, z), coverAt: (x, z) => def.landCover(x, z, 0, 0) };
      const roads = new RoadIndex(features.roads);
      for (const s of features.settlements) {
        const plan = planTown(s, ground, roads);
        this.addTown(s.name, s.x, s.z, ground.heightAt(s.x, s.z), s.kind === 'city' ? CITY_RANGE_M : VILLAGE_RANGE_M, plan);
        townLights(plan, new Rng(nameSeed(s.name) ^ 0x9e3779b9), s.kind === 'city' ? 0.8 : 0.6, city, cityColors);
      }
      // The castle by the river near the coastal city.
      const coast = features.settlements.find((s) => s.name === 'Morzysko');
      const castle = coast ? planCastle(coast, ground, roads) : null;
      if (castle) this.addTown('castle', castle.x, castle.z, castle.y, CASTLE_RANGE_M, [castle]);
      for (const road of features.roads) {
        const ribbon = roadRibbon(road, ground, road.kind === 'highway' ? 12 : 6);
        this.addRoad(ribbon, road.kind === 'highway');
        // Sodium street lights where a road runs through a town.
        for (let i = 0; i < ribbon.length; i += 6 * 2) {
          const x = ribbon[i];
          const z = ribbon[i + 2];
          if (ground.coverAt(x, z) !== 'urban') continue;
          city.push(x, ribbon[i + 1] + 8, z);
          cityColors.push(1, 0.62, 0.25);
        }
      }
      for (const a of features.airfields) this.addAirfield(a, runway, runwayColors);
    }
    this.cityLights = { positions: new Float32Array(city), colors: new Float32Array(cityColors) };
    this.runwayLights = { positions: new Float32Array(runway), colors: new Float32Array(runwayColors) };
  }

  /** Hides features far from the camera; builds the towns it comes near, a little each frame, and frees those left behind. */
  update(camera: Vector3): void {
    for (const r of this.ranged) r.object.visible = r.center.distanceToSquared(camera) < r.range * r.range;
    for (const t of this.towns) {
      if (!t.group) continue;
      const d2 = t.center.distanceToSquared(camera);
      t.group.visible = d2 < t.range * t.range;
      if (d2 > (t.range * FREE_MARGIN) ** 2) this.free(t);
    }
    const until = this.started ? performance.now() + BUILD_BUDGET_MS : Infinity;
    this.started = true;
    while (performance.now() < until) {
      if (!this.building) {
        const town = this.nearestUnbuilt(camera);
        if (!town) return;
        this.building = { town, mesh: new TownMesh(town.center.x, town.center.z), next: 0 };
      }
      const b = this.building;
      if (b.town.center.distanceToSquared(camera) > (b.town.range * FREE_MARGIN) ** 2) {
        // Flown away from before it was finished.
        this.building = null;
        continue;
      }
      const plan = b.town.plan;
      while (b.next < plan.length && performance.now() < until) {
        for (const end = Math.min(plan.length, b.next + 24); b.next < end; b.next++) emitStructure(b.mesh, plan[b.next]);
      }
      if (b.next < plan.length) return;
      this.finish(b.town, b.mesh);
      this.building = null;
    }
  }

  /** Lights the windows after dusk: `night` 0 by day … 1 at night. */
  setNight(night: number): void {
    setWindowLight(night);
  }

  dispose(): void {
    // The building materials are shared by every town on the page and stay; their meshes' geometry goes.
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const t of this.textures) t.dispose();
    for (const t of this.towns) t.group = null;
    this.building = null;
    this.group.clear();
  }

  private addTown(name: string, x: number, z: number, y: number, range: number, plan: readonly Structure[]): void {
    if (plan.length === 0) return;
    this.towns.push({ name, center: new Vector3(x, y, z), range, plan, group: null });
  }

  private nearestUnbuilt(camera: Vector3): Town | null {
    let best: Town | null = null;
    let bestD2 = Infinity;
    for (const t of this.towns) {
      if (t.group) continue;
      const d2 = t.center.distanceToSquared(camera);
      if (d2 < t.range * t.range && d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  }

  private finish(town: Town, mesh: TownMesh): void {
    const group = new Group();
    group.name = `town-${town.name}`;
    const materials = buildingMaterials();
    for (const [key, geometry] of mesh.geometries()) {
      const part = new Mesh(geometry, materials[key]);
      part.name = `${group.name}-${key}`;
      group.add(part);
    }
    group.position.set(town.center.x, 0, town.center.z);
    this.group.add(group);
    town.group = group;
  }

  private free(town: Town): void {
    if (!town.group) return;
    for (const part of town.group.children) if (part instanceof Mesh) part.geometry.dispose();
    this.group.remove(town.group);
    town.group = null;
  }

  private track(object: Object3D, x: number, y: number, z: number, range: number): void {
    this.group.add(object);
    this.ranged.push({ object, center: new Vector3(x, y, z), range });
  }

  private addRoad(ribbon: Float32Array, highway: boolean): void {
    const count = ribbon.length / 3;
    if (count < 4) return;
    // Positions relative to the road's middle keep float precision far from the map centre.
    const mid = Math.floor(count / 4) * 2;
    const cx = ribbon[mid * 3];
    const cz = ribbon[mid * 3 + 2];
    const local = new Float32Array(ribbon.length);
    for (let i = 0; i < ribbon.length; i += 3) {
      local[i] = ribbon[i] - cx;
      local[i + 1] = ribbon[i + 1];
      local[i + 2] = ribbon[i + 2] - cz;
    }
    const indices: number[] = [];
    for (let k = 0; k + 3 < count; k += 2) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(local, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    // Ribbons can wind either way: make every normal point up.
    const n = g.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, highway ? highwayMaterial : localRoadMaterial);
    mesh.material.side = DoubleSide;
    mesh.position.set(cx, 0, cz);
    mesh.name = highway ? 'highway' : 'road';
    const sphere = g.boundingSphere!;
    this.track(mesh, cx + sphere.center.x, sphere.center.y, cz + sphere.center.z, (highway ? HIGHWAY_RANGE_M : LOCAL_ROAD_RANGE_M) + sphere.radius);
  }

  private addAirfield(a: Airfield, lights: number[], colors: number[]): void {
    const layout = airfieldLayout(a);
    const field = new Group();
    field.name = `airfield-${a.id}`;
    // Local frame: u (take-off direction) along −z, v (right of it) along +x, like a jet facing the heading.
    field.position.set(a.x, a.elevationM, a.z);
    field.rotation.y = -a.headingRad;
    const at = (u: number, v: number, y: number) => new Vector3(v, y, -u);
    for (const p of layout.paved) {
      const plane = new PlaneGeometry(p.width, p.length).rotateX(-Math.PI / 2);
      const material = p.kind === 'runway' ? this.runwayMaterial(a) : concreteMaterial;
      const mesh = new Mesh(plane, material);
      mesh.position.copy(at(p.u, p.v, PAVED_LIFT_M + (p.kind === 'runway' ? 0.1 : 0)));
      mesh.name = p.kind;
      field.add(mesh);
    }
    for (const h of layout.hangars) {
      // An arched hangar 30 m across and 40 m deep, its open side toward the apron.
      const arch = new CylinderGeometry(15, 15, 40, 18, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
      const hangar = new Mesh(arch, hangarMaterial);
      hangar.position.copy(at(h.u, h.v, 0));
      field.add(hangar);
      const back = new Mesh(new BoxGeometry(0.5, 15, 30), hangarMaterial);
      back.position.copy(at(h.u, h.v + 20, 7.5));
      field.add(back);
    }
    const tower = new Mesh(new BoxGeometry(8, 18, 8).translate(0, 9, 0), towerMaterial);
    tower.position.copy(at(layout.tower.u, layout.tower.v, 0));
    const cab = new Mesh(new BoxGeometry(11, 4, 11).translate(0, 20, 0), glassMaterial);
    cab.position.copy(tower.position);
    const roof = new Mesh(new BoxGeometry(12, 0.8, 12).translate(0, 22.4, 0), towerMaterial);
    roof.position.copy(tower.position);
    field.add(tower, cab, roof);
    this.track(field, a.x, a.elevationM, a.z, AIRFIELD_RANGE_M);

    const add = (list: [number, number][], r: number, g: number, b: number) => {
      for (const [u, v] of list) {
        const p = airfieldPoint(a, u, v);
        lights.push(p.x, a.elevationM + 0.8, p.z);
        colors.push(r, g, b);
      }
    };
    add(layout.edgeLights, 1, 0.95, 0.8);
    add(layout.thresholdLights, 0.2, 1, 0.35);
    add(layout.endLights, 1, 0.15, 0.1);
  }

  /** Asphalt with white markings: edge lines, centre-line dashes, threshold bars, aiming points and numbers. */
  private runwayMaterial(a: Airfield): MeshStandardMaterial {
    const W = 256;
    const H = 4096;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.9 });
    const sx = W / a.widthM;
    const sy = H / a.lengthM;
    ctx.fillStyle = '#2b2b2d';
    ctx.fillRect(0, 0, W, H);
    // Wear: darker tyre marks down the middle near each end.
    ctx.fillStyle = 'rgba(10,10,10,0.35)';
    ctx.fillRect(W * 0.3, 0, W * 0.4, 600 * sy);
    ctx.fillRect(W * 0.3, H - 600 * sy, W * 0.4, 600 * sy);
    ctx.fillStyle = '#e8e8e2';
    const rect = (u0: number, v0: number, du: number, dv: number) => ctx.fillRect((v0 + a.widthM / 2) * sx, u0 * sy, dv * sx, du * sy);
    rect(0, -a.widthM / 2 + 1, a.lengthM, 0.9);
    rect(0, a.widthM / 2 - 1.9, a.lengthM, 0.9);
    for (let u = 120; u < a.lengthM - 120; u += 60) rect(u, -0.45, 30, 0.9);
    for (const end of [0, a.lengthM - 36]) {
      for (let k = 0; k < 8; k++) {
        rect(end + 6, -a.widthM / 2 + 3 + k * 2.4, 30, 1.8);
        rect(end + 6, a.widthM / 2 - 4.8 - k * 2.4, 30, 1.8);
      }
    }
    for (const u of [300, a.lengthM - 345]) {
      rect(u, -9, 45, 6);
      rect(u, 3, 45, 6);
    }
    // Numbers. The canvas runs from the take-off threshold (top) to the far end (bottom), squeezed along the length,
    // and its x is the right of the take-off direction: each number is flipped to read upright for a pilot lined up
    // on its end.
    const drawNumber = (text: string, u: number, fromFarEnd: boolean) => {
      ctx.save();
      ctx.translate(W / 2, u * sy);
      ctx.scale(fromFarEnd ? -sx : sx, fromFarEnd ? sy : -sy);
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    drawNumber(runwayNumber(a.headingRad), 55, false);
    drawNumber(runwayNumber(a.headingRad + Math.PI), a.lengthM - 55, true);
    const texture = new CanvasTexture(canvas);
    // Unflipped, the top row lies at the threshold (local +z after the plane is laid flat).
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    this.textures.push(texture);
    return new MeshStandardMaterial({ map: texture, roughness: 0.9 });
  }
}

/** Night lights of a town's buildings: one in most lit buildings (two in the big ones), red beacons on the tall. */
function townLights(plan: readonly Structure[], rng: Rng, share: number, positions: number[], colors: number[]): void {
  for (const b of plan) {
    const h = wallHeight(b);
    if (BEACON_KINDS.has(b.kind)) {
      positions.push(b.x, b.y + h + (b.kind === 'palace' ? 0 : 1), b.z);
      colors.push(1, 0.12, 0.08);
    }
    if (!LIT_KINDS.has(b.kind) || b.kind === 'palace') continue;
    const n = b.w * b.d > 900 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (rng.next() > share) continue;
      const along = rng.range(-0.45, 0.45) * b.w;
      const c = Math.cos(b.angle);
      const sn = Math.sin(b.angle);
      // On the front, at a random storey.
      const ax = along * c + (b.d / 2 + 0.5) * sn;
      const az = along * sn - (b.d / 2 + 0.5) * c;
      positions.push(b.x + ax, b.y + Math.min(h - 1, 2 + rng.range(0, Math.max(0, h - 3))), b.z + az);
      const warm = rng.next();
      colors.push(1, 0.72 + 0.2 * warm, 0.4 + 0.35 * warm);
    }
  }
}
