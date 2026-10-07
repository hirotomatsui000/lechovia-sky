import { Color } from 'three';
import { DEG } from '../../../../shared/math/units.ts';
import { TILE_M } from './facade-textures.ts';
import type { TownMesh } from './mesh-builder.ts';
import { type Structure, TENEMENT_GROUND_M, wallHeight } from './town-plan.ts';

/*
 * How each kind of Polish building is built (revision 27), in the building's own frame: x across its front, z from
 * the front (−d/2) to the back, y up from its lowest ground. Walls reach 3 m into the ground so slopes never show a
 * gap under them. Colours follow what one sees from the air over Poland: pastel tenements under red tiles, white and
 * pastel-striped panel blocks, grey-plastered cube houses, red-brick Gothic churches with copper-green spires.
 */

const SINK = 3;

const palette = (...hex: string[]) => hex.map((h) => new Color(h));
/** Old-town tenements: ochre, salmon, pistachio, pale teal, cream, rose … */
const TENEMENT = palette('#e8c97a', '#e7b38f', '#d98e73', '#c9d6a8', '#a9c6c9', '#f0e2c4', '#e4a8a0', '#d7c08a', '#b8c4d8', '#efd9a2', '#c98f62', '#e9e4d8', '#f2c9a0', '#cfd8b0');
/** Hanseatic houses of the coast: brick red, ochre, burnt orange, cream, sage. */
const HANSEATIC = palette('#b5523b', '#c96f4a', '#d8b26a', '#e3cfa6', '#a3483a', '#e0b7a0', '#93a27f', '#d49a5c', '#c4a77d');
const BLOCK_BASE = palette('#efece4', '#e4e1d8', '#f2ead0', '#e2e8d6', '#ece2d2', '#dde3ea', '#d6d2c8');
const BLOCK_ACCENT = palette('#f2c14e', '#8fbf6a', '#f09a5b', '#6fa8c9', '#d9534f', '#b48ec4', '#f3d27a', '#7fc4b0');
const HOUSE = palette('#efe9dc', '#e6dcc6', '#d9cfb8', '#f3eee4', '#e8d8b0', '#cfc8b8', '#e9e2d2', '#f0dcc0');
/** The "Polish cube": grey textured plaster. */
const KOSTKA = palette('#bdb8ad', '#c9c2b2', '#a9a49a', '#d6cfbf', '#b7ae9c', '#c2b8a6');
const CLAY = palette('#c25a3a', '#cf6c42', '#b24d32', '#bd5f3c', '#a8492f', '#d27c4a', '#b9553a', '#c76a48');
const HOUSE_ROOF = palette('#a8462c', '#8e3a26', '#4a4744', '#5c3b30', '#6b2e22', '#3d3d3f', '#b55a34', '#2f3b46');
const SHEET = palette('#7d7f80', '#8a5a3c', '#5c6b5a', '#8e3b2e', '#9a9c9c', '#6b6152');
const TIMBER = palette('#b8895a', '#a6784c', '#c49a66', '#94693f', '#b07f50');
const BARN = palette('#7a5a3a', '#6b5238', '#8a7a68', '#5e4632', '#9a8f80');
const INDUSTRIAL = palette('#cfd4d6', '#b9c6cf', '#d9d2c2', '#c4c9c0', '#aab4bd');
const BRICK = new Color('#ffffff');
const BRICK_DARK = new Color('#d8c8c0');
const COPPER = new Color('#5f9e83');
const COPPER_DARK = new Color('#3e6b5c');
const WHITE = new Color('#f6f4ee');
const CREAM = new Color('#efe3c4');
const STONE = new Color('#fff6e0');
const GLASS = new Color('#ffffff');
/** Curtain walls: clear blue, sea green, silver, steel blue. */
const GLASS_TINT = palette('#ffffff', '#dcecff', '#e2f2e8', '#eeeef2', '#cfdcf0', '#f2f6ff');
const DARK = new Color('#3b3a38');
const CONCRETE = new Color('#d8d6d0');
const RED = new Color('#c8372d');
const SPIRE_GREY = new Color('#9aa0a4');
const PAVING = new Color('#ffffff');

function pick(list: readonly Color[], t: number): Color {
  return list[Math.floor(t * list.length) % list.length];
}

function shade(c: Color, k: number): Color {
  return c.clone().multiplyScalar(k);
}

/** Builds one structure into the town's mesh. */
export function emitStructure(m: TownMesh, s: Structure): void {
  m.place(s.x, s.y, s.z, s.angle);
  switch (s.kind) {
    case 'kamienica':
      return tenement(m, s);
    case 'hanseatic':
      return hanseatic(m, s);
    case 'ratusz':
      return townHall(m, s);
    case 'church':
      return gothicChurch(m, s);
    case 'village-church':
      return villageChurch(m, s);
    case 'wooden-church':
      return woodenChurch(m, s);
    case 'blok':
    case 'punktowiec':
      return panelBlock(m, s);
    case 'kostka':
      return cubeHouse(m, s);
    case 'house':
      return house(m, s);
    case 'highlander':
      return highlander(m, s);
    case 'barn':
      return barn(m, s);
    case 'factory':
      return factory(m, s);
    case 'chimney':
      return chimney(m, s);
    case 'cooling-tower':
      return coolingTower(m, s);
    case 'palace':
      return palace(m, s);
    case 'glass-tower':
      return glassTower(m, s);
    case 'castle':
      return castle(m, s);
    case 'square':
      return square(m, s);
  }
}

/** A brick chimney stack on a roof. */
function stack(m: TownMesh, x: number, z: number, y0: number, y1: number): void {
  m.box('brickPlain', x, z, 0.7, 0.7, y0, y1, BRICK_DARK);
  m.flat('trim', x, z, 0.9, 0.9, y1, DARK);
}

/** A dormer on a front slope rising from the eave at (z = −d/2, y = eave): its window from the tenement's top floor. */
function dormer(m: TownMesh, x: number, d: number, eave: number, pitch: number, color: Color, roof: Color): void {
  const zf = -d / 2 + 1.1;
  const ys = eave + 1.1 * Math.tan(pitch);
  const top = ys + 1.9;
  const zb = -d / 2 + (top - eave) / Math.tan(pitch);
  const hw = 0.95;
  m.poly(
    'tenement',
    [
      [x - hw, ys - 0.1, zf],
      [x + hw, ys - 0.1, zf],
      [x + hw, top, zf],
      [x - hw, top, zf],
    ],
    [
      [0.06, 0.8],
      [0.19, 0.8],
      [0.19, 0.95],
      [0.06, 0.95],
    ],
    color,
    [0, 0, -1],
  );
  for (const side of [-1, 1]) {
    m.poly(
      'trim',
      [
        [x + side * hw, ys - 0.1, zf],
        [x + side * hw, top, zf],
        [x + side * hw, top, zb],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      color,
      [side, 0, 0],
    );
  }
  m.poly(
    'sheet',
    [
      [x - hw - 0.15, top, zf - 0.2],
      [x + hw + 0.15, top, zf - 0.2],
      [x + hw + 0.15, top, zb],
      [x - hw - 0.15, top, zb],
    ],
    [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [0, 0.5],
    ],
    roof,
    [0, 1, 0],
  );
}

/** The front of a tenement: the shop floor, the upper floors, a string course and the cornice. */
function tenementFront(m: TownMesh, w: number, d: number, h: number, wall: Color, trim: Color, u0: number): void {
  m.wall('shopfront', -w / 2, -d / 2, w / 2, -d / 2, -SINK, TENEMENT_GROUND_M, wall, { u0, vBase: 0 });
  m.wall('tenement', -w / 2, -d / 2, w / 2, -d / 2, TENEMENT_GROUND_M, h, wall, { u0, vBase: TENEMENT_GROUND_M });
  m.ledge('trim', -w / 2, -d / 2, w / 2, -d / 2, TENEMENT_GROUND_M - 0.08, 0.24, 0.16, trim);
}

/** A kamienica: a pastel tenement of three to six storeys under a red tiled roof, its eaves to the street. */
function tenement(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  const wall = pick(TENEMENT, s.tint);
  const trim = shade(wall, 1.12);
  const u0 = s.style * 12.8;
  tenementFront(m, w, d, h, wall, trim, u0);
  m.wall('tenement', w / 2, d / 2, -w / 2, d / 2, -SINK, h, shade(wall, 0.93), { u0: u0 + 3.2, vBase: 0.9 });
  const sideKey = s.style > 0.5 ? 'tenement' : 'trim';
  m.wall(sideKey, w / 2, -d / 2, w / 2, d / 2, -SINK, h, shade(wall, 0.9), { vBase: 0.9 });
  m.wall(sideKey, -w / 2, d / 2, -w / 2, -d / 2, -SINK, h, shade(wall, 0.9), { vBase: 0.9 });
  m.ledge('trim', -w / 2, -d / 2, w / 2, -d / 2, h - 0.6, 0.6, 0.45, trim);
  const pitch = (34 + 14 * s.style) * DEG;
  const roof = pick(CLAY, s.tint * 3.7);
  m.roof('roofTiles', 0, 0, w, d, h, pitch, roof, { ridgeAlongX: true, hip: s.style < 0.15 ? 0.9 : 0, overhang: 0.3, gableKey: 'trim', gableColor: shade(wall, 0.85) });
  if (w >= 10 && s.style > 0.4) {
    dormer(m, -w / 4, d, h, pitch, trim, DARK);
    if (w >= 13) dormer(m, w / 4, d, h, pitch, trim, DARK);
  }
  if (s.style > 0.3) stack(m, w * 0.3, d * 0.15, h, h + (d / 2) * Math.tan(pitch) * 0.8);
}

/** A Hanseatic house of the coast: narrow and tall, its stepped gable to the street. */
function hanseatic(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  const wall = pick(HANSEATIC, s.tint);
  const trim = shade(wall, 1.15);
  const u0 = s.style * 12.8;
  tenementFront(m, w, d, h, wall, trim, u0);
  m.wall('tenement', w / 2, d / 2, -w / 2, d / 2, -SINK, h, shade(wall, 0.9), { u0: u0 + 3.2, vBase: 0.9 });
  m.wall('trim', w / 2, -d / 2, w / 2, d / 2, -SINK, h, shade(wall, 0.88));
  m.wall('trim', -w / 2, d / 2, -w / 2, -d / 2, -SINK, h, shade(wall, 0.88));
  const pitch = 56 * DEG;
  const rise = (w / 2) * Math.tan(pitch);
  m.roof('roofTiles', 0, 0, w, d, h, pitch, pick(CLAY, s.tint * 5.3), { ridgeAlongX: false, overhang: 0, gableKey: null });
  // The stepped gable in front, standing above the roof line; windows go on up it.
  const steps = 4;
  const sw = w / 2 / (steps + 0.5);
  const sh = rise / (steps + 1);
  const piece = (x0: number, x1: number, top: number) => m.wall('tenement', x0, -d / 2, x1, -d / 2, h, top, wall, { u0: u0 + (x0 + w / 2), vBase: TENEMENT_GROUND_M });
  for (let i = 0; i < steps; i++) {
    const top = h + (i + 1.6) * sh;
    piece(-w / 2 + i * sw, -w / 2 + (i + 1) * sw, top);
    piece(w / 2 - (i + 1) * sw, w / 2 - i * sw, top);
    m.flat('trim', -w / 2 + (i + 0.5) * sw, -d / 2 + 0.25, sw, 0.5, top, trim);
    m.flat('trim', w / 2 - (i + 0.5) * sw, -d / 2 + 0.25, sw, 0.5, top, trim);
  }
  const peak = h + (steps + 1.6) * sh;
  piece(-w / 2 + steps * sw, w / 2 - steps * sw, peak);
  m.spire('trim', 0, -d / 2 + 0.2, 0.25, peak, 1.4, 4, trim);
  // The back gable.
  m.poly(
    'trim',
    [
      [w / 2, h, d / 2],
      [-w / 2, h, d / 2],
      [0, h + rise, d / 2],
    ],
    [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ],
    shade(wall, 0.85),
    [0, 0, 1],
  );
}

/** A baroque helmet: a bell swelling over the base, a lantern, then a needle. */
function helmet(m: TownMesh, x: number, z: number, r: number, y: number, h: number, color: Color): void {
  const k = h / 14;
  m.lathe(
    'sheet',
    x,
    z,
    [
      [r * 1.05, y],
      [r * 1.05, y + 0.6 * k],
      [r * 0.55, y + 2.6 * k],
      [r * 0.9, y + 4.6 * k],
      [r * 0.35, y + 7 * k],
      [r * 0.2, y + 8.4 * k],
      [r * 0.42, y + 9.6 * k],
      [r * 0.12, y + 11 * k],
      [0.04, y + h],
    ],
    12,
    () => color,
  );
}

/** The town hall in the square: a long block under a hipped roof and its tall brick tower with a belfry and helmet. */
function townHall(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const wallH = 15;
  m.box('tenement', 0, 0, w, d, -SINK, wallH, CREAM, { u0: s.style * 12.8, vBase: 1.5 });
  m.ledge('trim', -w / 2, -d / 2, w / 2, -d / 2, wallH - 0.7, 0.7, 0.5, WHITE);
  m.ledge('trim', w / 2, d / 2, -w / 2, d / 2, wallH - 0.7, 0.7, 0.5, WHITE);
  m.roof('roofTiles', 0, 0, w, d, wallH, 42 * DEG, pick(CLAY, s.tint), { hip: 0.85, overhang: 0.5 });
  const tx = w / 2 - 6;
  const ts = 9.5;
  const helmetH = 16;
  const shaft = s.floors - helmetH - 9;
  m.box('brickPlain', tx, 0, ts, ts, -SINK, shaft, BRICK);
  m.ledge('trim', tx - ts / 2, -ts / 2, tx + ts / 2, -ts / 2, shaft - 0.6, 0.6, 0.4, WHITE, tx, 0);
  m.box('whiteChurch', tx, 0, ts - 1.4, ts - 1.4, shaft, shaft + 9, WHITE, { vBase: shaft - 1 });
  m.flat('trim', tx, 0, ts - 1.2, ts - 1.2, shaft + 9, WHITE);
  helmet(m, tx, 0, (ts - 1.4) / 2, shaft + 9, helmetH, COPPER);
}

/** Half an octagon of wall round (cx, 0) toward +x, with a roof of triangles to an apex: a church's apse. */
function apse(m: TownMesh, key: 'brick' | 'whiteChurch' | 'logs', cx: number, r: number, wallH: number, rise: number, wall: Color, roofKey: 'roofTiles' | 'shingle', roof: Color): void {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 4; k++) {
    const a = -Math.PI / 2 + (k / 4) * Math.PI;
    pts.push([cx + Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    m.wall(key, ax, az, bx, bz, -SINK, wallH, wall, { cx, cz: 0, u0: k * 6 });
    const am = (Math.atan2(az, ax - cx) + Math.atan2(bz, bx - cx)) / 2;
    m.poly(
      roofKey,
      [
        [ax + Math.cos(am) * 0.3, wallH, az + Math.sin(am) * 0.3],
        [bx + Math.cos(am) * 0.3, wallH, bz + Math.sin(am) * 0.3],
        [cx, wallH + rise, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [1, rise / 2],
      ],
      roof,
      [Math.cos(am), 1, Math.sin(am)],
    );
  }
}

/** Buttresses along a long wall at z = side · d/2, every `step` metres from x0 to x1. */
function buttresses(m: TownMesh, x0: number, x1: number, d: number, side: number, h: number, step: number): void {
  for (let x = x0 + step / 2; x < x1 - 1; x += step) {
    const z = side * (d / 2 + 0.7);
    m.box('brickPlain', x, z, 1.3, 1.4, -SINK, h, BRICK_DARK);
    m.flat('brickPlain', x, z, 1.3, 1.4, h, BRICK_DARK);
  }
}

/**
 * A Gothic brick church (after the great brick churches of the Polish towns): a high nave under a steep roof,
 * buttresses, a polygonal apse to the east, and a west tower with a copper spire, or two unequal towers.
 */
function gothicChurch(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const twin = s.floors >= 2;
  const towerS = twin ? 10 : 12;
  const apseR = d / 2 - 1.5;
  const x0 = -w / 2 + (twin ? towerS * 0.8 : towerS);
  const x1 = w / 2 - apseR;
  const naveH = 21;
  const roofColor = s.style < 0.2 ? COPPER_DARK : pick(CLAY, s.tint);
  m.box('brick', (x0 + x1) / 2, 0, x1 - x0, d, -SINK, naveH, BRICK, { u0: s.style * 6, vBase: 0 });
  buttresses(m, x0, x1, d, -1, naveH - 3, 7);
  buttresses(m, x0, x1, d, 1, naveH - 3, 7);
  m.roof('roofTiles', (x0 + x1) / 2, 0, x1 - x0, d, naveH, 58 * DEG, roofColor, { ridgeAlongX: true, overhang: 0.4, gableKey: 'brickPlain', gableColor: BRICK });
  apse(m, 'brick', x1, apseR, naveH - 2, apseR * 1.4, BRICK, 'roofTiles', roofColor);
  const towerX = -w / 2 + towerS / 2;
  const tower = (z: number, shaft: number, belfry: number, top: 'spire' | 'helmet', topH: number) => {
    m.box('brickPlain', towerX, z, towerS, towerS, -SINK, shaft, BRICK);
    m.box('brick', towerX, z, towerS - 0.6, towerS - 0.6, shaft, shaft + belfry, BRICK, { vBase: shaft + belfry - 12 });
    m.ledge('trim', towerX - towerS / 2, z - towerS / 2, towerX + towerS / 2, z - towerS / 2, shaft - 0.5, 0.5, 0.35, CREAM, towerX, z);
    const y = shaft + belfry;
    m.flat('brickPlain', towerX, z, towerS - 0.6, towerS - 0.6, y, BRICK);
    if (top === 'spire') {
      m.spire('sheet', towerX, z, towerS / 2 - 0.6, y, topH, 8, COPPER);
      for (const [px, pz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        m.spire('sheet', towerX + px * (towerS / 2 - 1), z + pz * (towerS / 2 - 1), 0.8, y, 6, 4, COPPER);
      }
    } else {
      helmet(m, towerX, z, towerS / 2 - 0.6, y, topH, COPPER);
    }
  };
  if (twin) {
    // Two unequal towers, the taller with a spire, the other with a helmet.
    tower(-(d / 2 - towerS / 2), 52, 12, 'spire', 18);
    tower(d / 2 - towerS / 2, 46, 10, 'helmet', 13);
  } else {
    tower(0, 44, 12, 'spire', 28);
  }
}

/** A white baroque village church: a plastered nave and apse under red tiles, the west tower with an onion helmet. */
function villageChurch(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const towerS = 7.5;
  const apseR = d / 2 - 1;
  const x0 = -w / 2 + towerS;
  const x1 = w / 2 - apseR;
  const naveH = 10;
  const roof = pick(CLAY, s.tint);
  m.box('whiteChurch', (x0 + x1) / 2, 0, x1 - x0, d, -SINK, naveH, WHITE, { vBase: 0 });
  m.roof('roofTiles', (x0 + x1) / 2, 0, x1 - x0, d, naveH, 45 * DEG, roof, { ridgeAlongX: true, gableKey: 'whiteChurch', gableColor: WHITE });
  apse(m, 'whiteChurch', x1, apseR, naveH - 1, apseR, WHITE, 'roofTiles', roof);
  const tx = -w / 2 + towerS / 2;
  const helmetH = 11;
  const top = s.floors - helmetH;
  m.box('whiteChurch', tx, 0, towerS, towerS, -SINK, top, WHITE, { vBase: top - 10 });
  m.ledge('trim', tx - towerS / 2, -towerS / 2, tx + towerS / 2, -towerS / 2, top - 0.5, 0.5, 0.3, CREAM, tx, 0);
  m.flat('trim', tx, 0, towerS, towerS, top, WHITE);
  helmet(m, tx, 0, towerS / 2, top, helmetH, s.style < 0.5 ? COPPER_DARK : DARK);
}

/** A wooden highland church: dark log walls, a steep shingle roof to low eaves, a boarded tower with a shingle spire. */
function woodenChurch(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const towerS = 6;
  const x0 = -w / 2 + towerS;
  const x1 = w / 2;
  const logs = pick(TIMBER, s.tint);
  const roof = new Color('#5a534c');
  m.box('logs', (x0 + x1) / 2, 0, x1 - x0, d, -SINK, 5, shade(logs, 0.8));
  m.roof('shingle', (x0 + x1) / 2, 0, x1 - x0, d, 5, 58 * DEG, roof, { ridgeAlongX: true, overhang: 0.9, gableKey: 'planks', gableColor: shade(logs, 0.7) });
  const tx = -w / 2 + towerS / 2;
  const top = s.floors - 9;
  m.box('planks', tx, 0, towerS, towerS, -SINK, top, shade(logs, 0.75));
  m.spire('shingle', tx, 0, towerS / 2 + 0.4, top, 9, 4, roof);
}

/** A panel block (wielka płyta): a slab or point tower of PVC windows and loggias, pastel stripes, a flat roof. */
function panelBlock(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  const base = pick(BLOCK_BASE, s.tint);
  const accent = pick(BLOCK_ACCENT, s.style * 1.7);
  const striped = s.style > 0.3;
  const point = s.kind === 'punktowiec';
  const segment = 14.4;
  const front = (z: number) => {
    // The plinth, then the storeys in segments; every third segment (the staircases) in the accent colour.
    m.wall('trim', z < 0 ? -w / 2 : w / 2, z, z < 0 ? w / 2 : -w / 2, z, -SINK, 0.6, shade(base, 0.62));
    const n = Math.max(1, Math.round(w / segment));
    const step = w / n;
    for (let k = 0; k < n; k++) {
      const xa = -w / 2 + k * step;
      const xb = xa + step;
      const color = striped && k % 3 === 1 ? accent : base;
      if (z < 0) m.wall('block', xa, z, xb, z, 0.6, h, color, { u0: s.style * 14.4 + k * step, vBase: 0.6 });
      else m.wall('block', xb, z, xa, z, 0.6, h, color, { u0: s.style * 14.4 + k * step, vBase: 0.6 });
    }
  };
  front(-d / 2);
  front(d / 2);
  // The ends: blank on slabs (a painted gable now and then), windows on point towers.
  const endKey = point ? 'block' : 'trim';
  const endColor = point ? base : striped && s.tint > 0.5 ? accent : shade(base, 0.95);
  m.wall(endKey, w / 2, -d / 2, w / 2, d / 2, -SINK, h, endColor, { vBase: 0.6 });
  m.wall(endKey, -w / 2, d / 2, -w / 2, -d / 2, -SINK, h, endColor, { vBase: 0.6 });
  // The parapet and the roof.
  for (const [ax, az, bx, bz] of [
    [-w / 2, -d / 2, w / 2, -d / 2],
    [w / 2, -d / 2, w / 2, d / 2],
    [w / 2, d / 2, -w / 2, d / 2],
    [-w / 2, d / 2, -w / 2, -d / 2],
  ] as const) {
    m.ledge('trim', ax, az, bx, bz, h - 0.55, 0.55, 0.22, shade(base, 0.9));
  }
  m.flat('flatRoof', 0, 0, w, d, h - 0.25, CONCRETE);
  if (s.floors >= 10) {
    for (const x of point ? [0] : [-w / 4, w / 4]) {
      m.box('trim', x, 0, 6, 4.5, h - 0.25, h + 2.4, shade(base, 0.85));
      m.flat('flatRoof', x, 0, 6, 4.5, h + 2.4, CONCRETE);
    }
  }
}

/** The "Polish cube": a two-storey square house of grey plaster under a low hipped roof, a brick chimney. */
function cubeHouse(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  m.box('house', 0, 0, w, d, -SINK, h, pick(KOSTKA, s.tint), { u0: s.style * 12, vBase: 0.3 });
  const top = m.roof(s.style < 0.5 ? 'sheet' : 'roofTiles', 0, 0, w, d, h, 22 * DEG, pick(HOUSE_ROOF, s.style * 2.3), { hip: 1, overhang: 0.55 });
  stack(m, w * 0.18, -d * 0.12, h, top + 0.6);
}

/** A newer detached house: light plaster, a steep tiled gable roof (an attic storey on bungalows), a chimney. */
function house(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  const wall = pick(HOUSE, s.tint);
  m.box('house', 0, 0, w, d, -SINK, h, wall, { u0: s.style * 12, vBase: 0.3 });
  const pitch = (s.floors === 1 ? 44 : 36) * DEG;
  const top = m.roof('roofTiles', 0, 0, w, d, h, pitch, pick(HOUSE_ROOF, s.style * 3.1), { ridgeAlongX: true, overhang: 0.5, gableKey: s.floors === 1 ? 'house' : 'trim', gableColor: wall, vBase: 0.3 });
  stack(m, w * 0.22, d * 0.1, h, top + 0.4);
}

/** A highlander house (after the timber houses of the Tatra foothills): log walls, a very steep shingle roof. */
function highlander(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = wallHeight(s);
  const logs = pick(TIMBER, s.tint);
  m.box('logs', 0, 0, w, d, -SINK, h, logs, { u0: s.style * 6, vBase: 0.4 });
  // A stone plinth.
  m.box('concrete', 0, 0, w + 0.2, d + 0.2, -SINK, 0.5, new Color('#a8a49c'));
  const top = m.roof('shingle', 0, 0, w, d, h, 58 * DEG, new Color('#857b70'), { ridgeAlongX: true, overhang: 0.9, hip: 0.22, gableKey: 'planks', gableColor: shade(logs, 0.8) });
  stack(m, w * 0.2, 0, h, top + 0.3);
}

/** A barn: boards or brick under a metal-sheet gable roof. */
function barn(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = s.floors;
  const brick = s.style < 0.3;
  const wall = brick ? BRICK : pick(BARN, s.tint);
  m.box(brick ? 'brickPlain' : 'planks', 0, 0, w, d, -SINK, h, wall);
  m.roof('sheet', 0, 0, w, d, h, 35 * DEG, pick(SHEET, s.style * 2.9), { ridgeAlongX: true, overhang: 0.4, gableKey: brick ? 'brickPlain' : 'planks', gableColor: wall });
}

/** A factory hall: metal cladding, a flat roof with rows of glazed roof lights. */
function factory(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const h = s.floors;
  const wall = pick(INDUSTRIAL, s.tint);
  m.box('industrial', 0, 0, w, d, -SINK, h, wall, { u0: s.style * 6, vBase: h - 6 });
  m.flat('flatRoof', 0, 0, w, d, h, CONCRETE);
  for (let x = -w / 2 + 8; x < w / 2 - 4; x += 12) {
    const len = d - 6;
    for (const side of [-1, 1]) {
      m.poly(
        'glass',
        [
          [x + side * 1.6, h, -len / 2],
          [x + side * 1.6, h, len / 2],
          [x, h + 1.5, len / 2],
          [x, h + 1.5, -len / 2],
        ],
        [
          [0, 0],
          [len / 6, 0],
          [len / 6, 0.3],
          [0, 0.3],
        ],
        GLASS,
        [side, 1, 0],
      );
    }
  }
}

/** A tall chimney: a tapering concrete shaft, its top third banded red and white for aviation. */
function chimney(m: TownMesh, s: Structure): void {
  const H = s.floors;
  const from = H * 0.62;
  const bands = 6;
  const band = (H - from) / bands;
  const r = (y: number) => 5.6 - (2.3 * Math.max(0, y)) / H;
  const profile: [number, number][] = [
    [5.6, -SINK],
    [5.6, 0],
  ];
  for (let k = 0; k <= bands; k++) profile.push([r(from + k * band), from + k * band]);
  profile.push([3.55, H], [3.55, H + 0.8]);
  m.lathe('concrete', 0, 0, profile, 16, (y) => (y > from && y < H ? (Math.floor((y - from) / band) % 2 === 0 ? RED : WHITE) : CONCRETE));
}

/** A power station's cooling tower: a hyperboloid shell of concrete, open at the top. */
function coolingTower(m: TownMesh, s: Structure): void {
  const H = s.floors;
  const base = s.w / 2;
  const throat = base * 0.6;
  const at = H * 0.78;
  const profile: [number, number][] = [[base, -SINK]];
  for (let k = 0; k <= 12; k++) {
    const y = (k / 12) * H;
    const r = throat * Math.sqrt(1 + ((y - at) / (at * 0.62)) ** 2);
    profile.push([Math.min(base, r), y]);
  }
  m.lathe('concrete', 0, 0, profile, 32, (y) => (y > H - 6 ? shade(CONCRETE, 0.8) : CONCRETE), true);
}

/**
 * The palace-of-culture tower (after the capital's great socialist-realist tower): a sandstone base with wings, a
 * stepped tower with pinnacles at each setback, and a spire.
 */
function palace(m: TownMesh, s: Structure): void {
  const stone = STONE;
  const trim = new Color('#fbf3dc');
  // The wings and the base.
  m.box('stone', -58, 0, 46, 104, -SINK, 26, stone, { vBase: 0 });
  m.flat('flatRoof', -58, 0, 46, 104, 26, CONCRETE);
  m.box('stone', 58, 0, 46, 104, -SINK, 26, stone, { vBase: 0 });
  m.flat('flatRoof', 58, 0, 46, 104, 26, CONCRETE);
  m.box('stone', 0, 0, 74, 74, -SINK, 40, stone, { vBase: 0 });
  // The stepped tower.
  const stages: [number, number, number][] = [
    [56, 40, 104],
    [46, 104, 130],
    [38, 130, 152],
    [30, 152, 170],
    [22, 170, 184],
    [15, 184, 196],
  ];
  m.flat('flatRoof', 0, 0, 74, 74, 40, CONCRETE);
  for (const [size, y0, y1] of stages) {
    m.box('stone', 0, 0, size, size, y0, y1, stone, { vBase: 0 });
    for (const [ax, az, bx, bz] of [
      [-size / 2, -size / 2, size / 2, -size / 2],
      [size / 2, -size / 2, size / 2, size / 2],
      [size / 2, size / 2, -size / 2, size / 2],
      [-size / 2, size / 2, -size / 2, -size / 2],
    ] as const) {
      m.ledge('trim', ax, az, bx, bz, y1 - 1, 1, 0.6, trim);
    }
    m.flat('flatRoof', 0, 0, size, size, y1, CONCRETE);
    // Pinnacles at the corners of the setback.
    if (size >= 22) {
      for (const [px, pz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        m.box('stone', (px * size) / 2 - px * 1.5, (pz * size) / 2 - pz * 1.5, 2.6, 2.6, y1, y1 + 4, stone);
        m.spire('stone', (px * size) / 2 - px * 1.5, (pz * size) / 2 - pz * 1.5, 1.4, y1 + 4, 5, 4, trim);
      }
    }
  }
  m.lathe(
    'sheet',
    0,
    0,
    [
      [5, 196],
      [4.4, 201],
      [1.4, 222],
      [0.1, s.floors],
    ],
    12,
    () => SPIRE_GREY,
  );
}

/** A glass tower of the capital's skyline: curtain walls, sometimes a setback, a crown and on the tallest a mast. */
function glassTower(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const H = s.floors;
  const setback = s.style < 0.35;
  const glass = pick(GLASS_TINT, s.tint);
  const h1 = setback ? H * 0.7 : H - 5;
  m.box('glass', 0, 0, w, d, -SINK, h1, glass, { u0: s.style * 6, vBase: 0 });
  let top = h1;
  if (setback) {
    m.flat('flatRoof', 0, 0, w, d, h1, CONCRETE);
    m.box('glass', 0, 0, w * 0.78, d * 0.78, h1, H - 5, glass, { u0: s.style * 6, vBase: 0 });
    top = H - 5;
  }
  const cw = setback ? w * 0.78 : w;
  const cd = setback ? d * 0.78 : d;
  m.box('industrial', 0, 0, cw - 0.4, cd - 0.4, top, H, new Color('#9aa3a8'), { vBase: H - 6 });
  m.flat('flatRoof', 0, 0, cw - 0.4, cd - 0.4, H, CONCRETE);
  if (H >= 200)
    m.lathe(
      'sheet',
      0,
      0,
      [
        [1.2, H],
        [0.5, H + 30],
        [0.05, H + 36],
      ],
      8,
      () => SPIRE_GREY,
    );
}

/** A red-brick castle (after the great castles of the Baltic coast): curtain walls and towers, the high castle, its keep. */
function castle(m: TownMesh, s: Structure): void {
  const { w, d } = s;
  const wallH = 13;
  const roof = new Color('#9a3c26');
  // The curtain wall, outside and in, with a walk on top.
  for (const [ax, az, bx, bz] of [
    [-w / 2, -d / 2, w / 2, -d / 2],
    [w / 2, -d / 2, w / 2, d / 2],
    [w / 2, d / 2, -w / 2, d / 2],
    [-w / 2, d / 2, -w / 2, -d / 2],
  ] as const) {
    m.wall('brickPlain', ax, az, bx, bz, -SINK, wallH, BRICK);
    // The inner face, 2.5 m in, facing the courtyard (away from a point beyond the wall).
    const ix = (v: number) => v - Math.sign(v) * 2.5;
    m.wall('brickPlain', ix(bx), ix(bz), ix(ax), ix(az), 0, wallH, BRICK_DARK, { cx: ax + bx, cz: az + bz });
    m.flat('brickPlain', (ax + bx) / 2 - Math.sign(ax + bx) * 1.25, (az + bz) / 2 - Math.sign(az + bz) * 1.25, Math.abs(bx - ax) || 2.5, Math.abs(bz - az) || 2.5, wallH, BRICK_DARK);
  }
  // Corner towers with pyramid roofs.
  for (const [px, pz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const x = (px * w) / 2;
    const z = (pz * d) / 2;
    m.box('brickPlain', x, z, 11, 11, -SINK, 24, BRICK);
    m.spire('roofTiles', x, z, 6, 24, 10, 4, roof);
  }
  // The gate tower on the front.
  m.box('brick', 0, -d / 2, 12, 10, -SINK, 22, BRICK, { vBase: 22 - 12 });
  m.roof('roofTiles', 0, -d / 2, 12, 10, 22, 50 * DEG, roof, { ridgeAlongX: true, gableKey: 'brickPlain', gableColor: BRICK });
  // The high castle at the back, and its keep.
  const hz = d / 2 - 28;
  m.box('brick', -w / 4, hz, 64, 44, -SINK, 24, BRICK, { vBase: 0 });
  m.roof('roofTiles', -w / 4, hz, 64, 44, 24, 52 * DEG, roof, { ridgeAlongX: true, gableKey: 'brickPlain', gableColor: BRICK });
  m.box('brickPlain', w / 8, hz + 8, 13, 13, -SINK, 52, BRICK);
  m.spire('roofTiles', w / 8, hz + 8, 7, 52, 16, 4, roof);
}

/** A paved market square laid over the ground (its relief), a little above it, under the roads that cross it. */
function square(m: TownMesh, s: Structure): void {
  const lift = 0.5;
  const relief = s.relief ?? [0, 0, 0, 0];
  const n = Math.round(Math.sqrt(relief.length)) - 1;
  const [tu, tv] = TILE_M.paving;
  const at = (i: number, j: number) => {
    const x = (i / n - 0.5) * s.w;
    const z = (j / n - 0.5) * s.d;
    return { p: [x, relief[j * (n + 1) + i] + lift, z] as const, uv: [x / tu, z / tv] as const };
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      m.poly(
        'paving',
        q.map((v) => v.p),
        q.map((v) => v.uv),
        PAVING,
        [0, 1, 0],
      );
    }
  }
}
