import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { MapDefinition } from '../../shared/data/maps/map-definition.ts';
import { airfieldWorld } from '../../shared/map/features.ts';
import type { LandCover } from '../../shared/map/land-cover.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import { headingRad } from '../../shared/physics/flight-model.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import { friendlyAirfield } from '../../shared/world/supply.ts';
import { FOE, FRIEND } from '../hud/palette.ts';
import type { AircraftView, GroundTargetView } from '../session/game-session.ts';

/** Land-cover colours of the map screen, chart-like rather than photographic. */
export const MAP_COLORS: Readonly<Record<LandCover, readonly [number, number, number]>> = {
  sea: [38, 72, 112],
  lake: [52, 98, 150],
  river: [52, 98, 150],
  beach: [214, 200, 150],
  field: [182, 176, 120],
  meadow: [146, 170, 104],
  forest: [62, 104, 62],
  rock: [128, 120, 110],
  snow: [236, 238, 242],
  marsh: [104, 122, 96],
  urban: [150, 140, 136],
  airfield: [170, 170, 160],
};

/** Map coordinates (metres, centred) to image pixels for a square image of `px` pixels. */
export function mapToPixel(x: number, z: number, sizeM: number, px: number): { u: number; v: number } {
  return { u: ((x + sizeM / 2) / sizeM) * px, v: ((z + sizeM / 2) / sizeM) * px };
}

/** A land-cover colour, shaded by a hill-shade factor (1 = flat). */
export function shadedColor(cover: LandCover, shade: number): [number, number, number] {
  const c = MAP_COLORS[cover];
  const water = cover === 'sea' || cover === 'lake' || cover === 'river';
  const s = water ? 1 : Math.max(0.55, Math.min(1.35, shade));
  return [Math.min(255, Math.round(c[0] * s)), Math.min(255, Math.round(c[1] * s)), Math.min(255, Math.round(c[2] * s))];
}

const IMAGE_PX = 1024;
/** A click this close to an airfield picks its runway (Free Flight, M5). */
export const AIRFIELD_PICK_M = 2500;

/** The map point under a click at (u, v) in 0..1 across the map image, snapped onto a nearby airfield (M5). */
export function pickPoint(def: MapDefinition, u: number, v: number): { x: number; z: number; airfield: string | null } {
  const x = (u - 0.5) * def.sizeM;
  const z = (v - 0.5) * def.sizeM;
  for (const a of def.features?.airfields ?? []) {
    if (Math.hypot(a.x - x, a.z - z) <= AIRFIELD_PICK_M) return { x: a.x, z: a.z, airfield: a.name };
  }
  return { x, z, airfield: null };
}
/** Team colours follow the HUD's friend/foe choice (M5: colour-blind safe option). */
const teamColor = (team: TeamId, mine: TeamId) => (team === mine ? FRIEND : FOE);
const AIRFIELD_TEAM_COLORS: Record<TeamId, string> = { usa: '#5aa7ff', russia: '#ff5a4f' };

/** The map image: land cover with hill shading, roads, towns and airfields. Drawn once per map (about 0.2 s). */
function drawBase(def: MapDefinition, terrain: Terrain): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_PX;
  canvas.height = IMAGE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(IMAGE_PX, IMAGE_PX);
  const step = def.sizeM / IMAGE_PX;
  const half = def.sizeM / 2;
  for (let j = 0; j < IMAGE_PX; j++) {
    const z = -half + (j + 0.5) * step;
    for (let i = 0; i < IMAGE_PX; i++) {
      const x = -half + (i + 0.5) * step;
      const h = terrain.heightAt(x, z);
      // Light from the north-west.
      const dx = terrain.heightAt(x + step, z) - h;
      const dz = terrain.heightAt(x, z + step) - h;
      const shade = 1 + (-dx - dz) * (6 / step);
      const [r, g, b] = shadedColor(def.landCover(x, z, h, 0), shade);
      const k = (j * IMAGE_PX + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const f = def.features;
  if (!f) return canvas;
  const at = (x: number, z: number) => mapToPixel(x, z, def.sizeM, IMAGE_PX);
  for (const road of f.roads) {
    ctx.beginPath();
    for (let p = 0; p < road.points.length; p += 2) {
      const { u, v } = at(road.points[p], road.points[p + 1]);
      if (p === 0) ctx.moveTo(u, v);
      else ctx.lineTo(u, v);
    }
    ctx.strokeStyle = road.kind === 'highway' ? '#f2c14e' : 'rgba(90,70,50,0.7)';
    ctx.lineWidth = road.kind === 'highway' ? 2.2 : 1;
    ctx.stroke();
  }
  for (const a of f.airfields) {
    const p0 = airfieldWorld(a, -a.lengthM / 2, 0);
    const p1 = airfieldWorld(a, a.lengthM / 2, 0);
    const u0 = at(p0.x, p0.z);
    const u1 = at(p1.x, p1.z);
    ctx.strokeStyle = '#1b1d20';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(u0.u, u0.v);
    ctx.lineTo(u1.u, u1.v);
    ctx.stroke();
  }
  return canvas;
}

/** The four points of the compass on the map's edges (north is up, east right): label and where it goes, pixels. */
export function cardinalMarks(px: number, s: number): { label: 'N' | 'E' | 'S' | 'W'; u: number; v: number }[] {
  const edge = 22 * s;
  return [
    { label: 'N', u: px / 2, v: edge },
    { label: 'E', u: px - edge, v: px / 2 + 6 * s },
    { label: 'S', u: px / 2, v: px - edge + 12 * s },
    { label: 'W', u: edge, v: px / 2 + 6 * s },
  ];
}

/** A compass rose: a ring, a red north needle, and N, E, S and W around it. */
function compassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(8,16,24,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Ticks every 45°.
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const inner = k % 2 === 0 ? r * 0.72 : r * 0.84;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * inner, -Math.cos(a) * inner);
    ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    ctx.stroke();
  }
  // The needle: red to the north, white to the south.
  const w = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.lineTo(w, 0);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fillStyle = '#ff4d4d';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, r * 0.62);
  ctx.lineTo(w, 0);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fillStyle = '#f2f5f7';
  ctx.fill();
  ctx.font = `800 ${Math.round(11 * s)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const at = r + 9 * s;
  for (const [text, a] of [
    ['N', 0],
    ['E', Math.PI / 2],
    ['S', Math.PI],
    ['W', (3 * Math.PI) / 2],
  ] as const) {
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, Math.sin(a) * at, -Math.cos(a) * at);
    ctx.fillStyle = text === 'N' ? '#ff6b6b' : '#fff';
    ctx.fillText(text, Math.sin(a) * at, -Math.cos(a) * at);
  }
  ctx.restore();
}

/**
 * The map screen (M, spec §15.3): the whole map with towns, roads and airfields, the combat area, and live markers
 * for the player, teammates, known enemies and Strike targets. The match keeps running behind it.
 */
export class MapScreen {
  private readonly overlay: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly def: MapDefinition;
  private readonly terrain: Terrain;
  /** the dashed combat area; Free Flight opens the whole map (revision 22) */
  private readonly combatArea: boolean;
  private base: HTMLCanvasElement | null = null;
  open = false;
  private pick: ((x: number, z: number) => void) | null = null;

  constructor(root: HTMLElement, def: MapDefinition, terrain: Terrain, options: { combatArea?: boolean } = {}) {
    this.def = def;
    this.terrain = terrain;
    this.combatArea = options.combatArea ?? true;
    this.overlay = document.createElement('div');
    this.overlay.className = 'map-screen';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'img');
    this.overlay.setAttribute('aria-label', `Map of ${def.name}`);
    this.canvas = document.createElement('canvas');
    this.overlay.appendChild(this.canvas);
    this.canvas.addEventListener('click', (e) => {
      if (!this.pick) return;
      const r = this.canvas.getBoundingClientRect();
      const p = pickPoint(this.def, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      this.pick(p.x, p.z);
    });
    root.appendChild(this.overlay);
  }

  /** Free Flight (M5): a click on the map flies the jet from there. */
  get onPick(): ((x: number, z: number) => void) | null {
    return this.pick;
  }

  /** The overlay lets clicks through to the game; a pickable map takes them itself. */
  set onPick(fn: ((x: number, z: number) => void) | null) {
    this.pick = fn;
    this.canvas.classList.toggle('pickable', fn !== null);
  }

  toggle(): void {
    this.open = !this.open;
    this.overlay.hidden = !this.open;
    if (this.open && !this.base) this.base = drawBase(this.def, this.terrain);
  }

  draw(me: AircraftView | null, views: Iterable<AircraftView>, targets: readonly GroundTargetView[], status: ModeStatus | null = null): void {
    if (!this.open || !this.base) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.86);
    if (this.canvas.width !== Math.round(css * dpr)) {
      this.canvas.width = this.canvas.height = Math.round(css * dpr);
      this.canvas.style.width = this.canvas.style.height = `${css}px`;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const px = this.canvas.width;
    const s = px / IMAGE_PX;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0, px, px);
    const at = (x: number, z: number) => mapToPixel(x, z, this.def.sizeM, px);
    const def = this.def;
    // Combat area.
    if (this.combatArea) {
      const c = at(def.combatArea.x, def.combatArea.z);
      ctx.setLineDash([8 * s, 6 * s]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.arc(c.u, c.v, (def.combatArea.radiusM / def.sizeM) * px, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const label = (text: string, u: number, v: number, font: string, color = '#fff') => {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(text, u, v);
      ctx.fillStyle = color;
      ctx.fillText(text, u, v);
    };
    const f = def.features;
    if (f) {
      for (const t of f.settlements) {
        const p = at(t.x, t.z);
        ctx.fillStyle = t.kind === 'city' ? '#2b2b2b' : 'rgba(40,40,40,0.8)';
        ctx.beginPath();
        ctx.arc(p.u, p.v, (t.kind === 'city' ? 4 : 2) * s, 0, Math.PI * 2);
        ctx.fill();
        if (t.kind === 'city') label(t.name, p.u, p.v - 8 * s, `700 ${Math.round((t.capital ? 17 : 14) * s)}px system-ui, sans-serif`);
      }
      for (const a of f.airfields) {
        const p = at(a.x, a.z);
        const color = a.team ? AIRFIELD_TEAM_COLORS[a.team] : '#e8e8e8';
        // Where you can rearm (revision 22): how far it is from you.
        const away = me && me.alive && friendlyAirfield(a, me.team) ? ` · ${Math.round(Math.hypot(a.x - me.position.x, a.z - me.position.z) / 1000)} km` : '';
        label(`✈ ${a.name}${away}`, p.u, p.v + 16 * s, `600 ${Math.round(11 * s)}px system-ui, sans-serif`, color);
      }
      for (const r of f.rivers) {
        // A third of the way from the source keeps the name clear of the capital in the middle.
        const k = Math.floor(r.points.length / 6) * 2;
        const p = at(r.points[k], r.points[k + 1]);
        label(r.name, p.u + 18 * s, p.v, `italic 600 ${Math.round(12 * s)}px system-ui, sans-serif`, '#bfe0ff');
      }
    }
    for (const t of targets) {
      const p = at(t.position.x, t.position.z);
      label(t.destroyed ? `✕${t.id}` : t.id, p.u, p.v + 5 * s, `700 ${Math.round(14 * s)}px system-ui, sans-serif`, t.destroyed ? '#999' : '#ffc14d');
    }
    const mine: TeamId = me?.team ?? 'usa';
    // Air Superiority zones (M5): filled by owner, with the letter.
    for (const z of status?.zones ?? []) {
      const p = at(z.x, z.z);
      const r = (z.radiusM / def.sizeM) * px;
      const color = z.owner ? teamColor(z.owner, mine) : '#e8e8e8';
      ctx.fillStyle = color;
      ctx.globalAlpha = z.owner ? 0.3 : 0.12;
      ctx.beginPath();
      ctx.arc(p.u, p.v, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      label(z.id, p.u, p.v + 6 * s, `700 ${Math.round(16 * s)}px system-ui, sans-serif`, color);
    }
    // Aircraft: teammates always, enemies while they are contacts or on the datalink (hollow).
    const known = new Set(me ? me.contacts.map((k) => k.id) : []);
    const linked = new Set(me ? me.datalink : []);
    for (const v of views) {
      if (!v.alive || (me && v.id === me.id)) continue;
      const enemy = me !== null && v.team !== me.team;
      if (enemy && !known.has(v.id) && !linked.has(v.id)) continue;
      const p = at(v.position.x, v.position.z);
      const color = teamColor(v.team, mine);
      if (v.config.support) {
        // Sentinels (M5): a ringed dot, named.
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(p.u, p.v, 7 * s, 0, Math.PI * 2);
        ctx.stroke();
        label('SENTINEL', p.u, p.v - 11 * s, `700 ${Math.round(10 * s)}px system-ui, sans-serif`, color);
        continue;
      }
      this.marker(ctx, p, headingRad(v.flight), color, 6 * s, false, enemy && !known.has(v.id));
    }
    if (me && me.alive) this.marker(ctx, at(me.position.x, me.position.z), headingRad(me.flight), '#63ff95', 9 * s, true);
    if (this.pick) label('CLICK TO FLY FROM THERE · AN AIRFIELD STARTS ON ITS RUNWAY', px / 2, px - 40 * s, `700 ${Math.round(13 * s)}px system-ui, sans-serif`, '#63ff95');
    // The compass (revision 26): a rose in the corner and the four points on the map's edges; then the scale.
    compassRose(ctx, 46 * s, 46 * s, 30 * s, s);
    for (const m of cardinalMarks(px, s)) label(m.label, m.u, m.v, `800 ${Math.round(18 * s)}px system-ui, sans-serif`, m.label === 'N' ? '#ff6b6b' : '#fff');
    const km = def.sizeM > 100000 ? 20 : 5;
    const len = ((km * 1000) / def.sizeM) * px;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - len - 20 * s, px - 22 * s, len, 3 * s);
    label(`${km} km`, px - len / 2 - 20 * s, px - 28 * s, `600 ${Math.round(12 * s)}px system-ui, sans-serif`);
  }

  dispose(): void {
    this.overlay.remove();
  }

  private marker(ctx: CanvasRenderingContext2D, p: { u: number; v: number }, heading: number, color: string, size: number, me: boolean, hollow = false): void {
    ctx.save();
    ctx.translate(p.u, p.v);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.8);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(-size * 0.7, size * 0.8);
    ctx.closePath();
    if (hollow) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = me ? 2 : 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  }
}
