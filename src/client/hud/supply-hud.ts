import { Vector3 } from 'three';
import type { UnitSystem } from '../../shared/data/aircraft/types.ts';
import { type Airfield, airfieldWorld, type MapFeatures } from '../../shared/map/features.ts';
import { TOUCHDOWN_MAX_SINK_MS } from '../../shared/physics/ground.ts';
import { nearestFriendlyAirfield, SUPPLY_PASS_HEIGHT_M, SUPPLY_PASS_SPEED_MS } from '../../shared/world/supply.ts';
import { type Bindings, keyLabel } from '../input/bindings.ts';
import type { AircraftView } from '../session/game-session.ts';
import { drawEdgeArrow } from './combat-layer.ts';
import { BINGO_SHARE } from './flight-warnings.ts';
import { altitudeLabel, altitudeValue, formatRange, speedLabel, speedValue, verticalSpeedLabel, verticalSpeedValue } from './format.ts';
import type { HudFrame } from './hud-frame.ts';
import { AMBER, FONT, FONT_SMALL, GREEN, PRIMARY, RED } from './palette.ts';
import type { Projector, ScreenPoint } from './projector.ts';

/** Why the HUD points the way home (revision 22): weapons to reload, fuel to take on, or damage to repair. */
export type RtbReason = 'rearm' | 'fuel' | 'repair';

/** The way home shows once the gun is down to this many rounds (revision 26, at the owner's request; it was 0). */
export const REARM_ROUNDS = 40;
/** Badly damaged below this share of hit points: worth landing to repair. */
export const REPAIR_BELOW_SHARE = 0.3;
/** The approach readouts show this close to a friendly runway and this low above it. */
export const APPROACH_CUE_RANGE_M = 12000;
export const APPROACH_CUE_HEIGHT_M = 1500;
/** This close to the field the marker gives way to the runway outline. */
const ARRIVED_M = 2000;

/** The way home, for the HUD: the nearest friendly airfield and why to go there. */
export interface HomeCue {
  field: Airfield;
  distanceM: number;
  heightM: number;
  reason: RtbReason | null;
  /** close and low enough for the approach readouts */
  near: boolean;
}

export function rtbReason(v: AircraftView): RtbReason | null {
  if (!v.alive || v.config.support) return null;
  const s = v.stores;
  if (s.srm + s.mrm === 0 || s.cannonRounds <= REARM_ROUNDS) return 'rearm';
  if (s.fuelKg < BINGO_SHARE * v.config.physics.fuelKg) return 'fuel';
  if (v.hp < REPAIR_BELOW_SHARE * v.config.damage.hitPoints) return 'repair';
  return null;
}

/** The nearest friendly airfield and what the HUD should show about it; null on a map without one. */
export function homeCue(features: MapFeatures | undefined, v: AircraftView): HomeCue | null {
  if (!v.alive || v.config.support) return null;
  const p = v.flight.pos;
  const field = nearestFriendlyAirfield(features, v.team, p.x, p.z);
  if (!field) return null;
  const distanceM = Math.hypot(field.x - p.x, field.z - p.z);
  const heightM = p.y - field.elevationM;
  return { field, distanceM, heightM, reason: rtbReason(v), near: distanceM <= APPROACH_CUE_RANGE_M && heightM <= APPROACH_CUE_HEIGHT_M };
}

const REASON_TEXT: Record<RtbReason, string> = { rearm: 'RTB · REARM', fuel: 'RTB · FUEL', repair: 'RTB · REPAIR' };

/** The supply pass's two limits as the HUD shows them, rounded to the jet's units (250 KT, 500 FT). */
export function supplyLimits(units: UnitSystem): { speed: string; height: string } {
  return {
    speed: `${Math.floor(speedValue(SUPPLY_PASS_SPEED_MS, units) / 10) * 10} ${speedLabel(units)}`,
    height: `${Math.floor(altitudeValue(SUPPLY_PASS_HEIGHT_M, units) / 50) * 50} ${altitudeLabel(units)}`,
  };
}

/** The hint line on the roll-out after a landing: brake to a stop on the airfield to be repaired. */
export function landingHint(bindings: Bindings, gamepad: boolean): string {
  const brakes = gamepad ? 'D-pad up' : keyLabel(bindings.airbrake[0]);
  return `LANDED · ${brakes} brakes · stop to repair, then full power to take off`;
}

const pt: ScreenPoint = { x: 0, y: 0 };
const corner: ScreenPoint = { x: 0, y: 0 };
const world = new Vector3();

/**
 * The way home and the landing (revision 22): a marker on the nearest friendly airfield when weapons, fuel or hit
 * points run low; near it, the runway outlined, the supply pass's limits, the gear and the sink rate; and the progress
 * of a rearm or repair.
 */
export function drawSupply(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame): void {
  const v = f.view;
  const home = f.home;
  const units = v.config.hudUnits;
  if (home?.near) drawRunway(ctx, p, f, home.field);
  // Once there (taking on supplies, or over the field) the marker would only clutter the view.
  const arrived = v.supply !== null || (home !== null && home !== undefined && home.distanceM < ARRIVED_M);
  if (home && (home.reason || home.near) && !arrived) {
    const field = home.field;
    world.set(field.x, field.elevationM, field.z);
    const label = `${home.reason ? `${REASON_TEXT[home.reason]} · ` : ''}${field.name.toUpperCase()} ${formatRange(home.distanceM, units)}`;
    if (p.point(f.camera, world, pt)) {
      ctx.save();
      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - 9);
      ctx.lineTo(pt.x + 9, pt.y);
      ctx.lineTo(pt.x, pt.y + 9);
      ctx.lineTo(pt.x - 9, pt.y);
      ctx.closePath();
      ctx.stroke();
      ctx.font = FONT_SMALL;
      ctx.fillStyle = home.reason ? AMBER : PRIMARY;
      ctx.fillText(label, pt.x + 14, pt.y + 4);
      ctx.restore();
    } else if (home.reason) {
      drawEdgeArrow(ctx, p, f, world, label, AMBER);
    }
  }
  if (home?.near && !v.flight.onGround) drawApproach(ctx, f, home, p.width, p.height);
  if (v.supply) {
    const text = v.supply.kind === 'landed' ? 'REPAIRING' : 'REARMING';
    const w = 160;
    const x = p.width / 2 - w / 2;
    const y = p.height * 0.66;
    ctx.save();
    ctx.font = FONT;
    ctx.fillStyle = GREEN;
    ctx.strokeStyle = GREEN;
    ctx.fillText(`${text} ${Math.round(v.supply.progress * 100)}%`, x, y - 8);
    ctx.strokeRect(x, y, w, 8);
    ctx.fillRect(x + 2, y + 2, (w - 4) * v.supply.progress, 4);
    ctx.restore();
  }
}

/** The runway's outline on the ground, so the approach can be lined up. */
function drawRunway(ctx: CanvasRenderingContext2D, p: Projector, f: HudFrame, field: Airfield): void {
  const l = field.lengthM / 2;
  const w = field.widthM / 2;
  ctx.save();
  ctx.strokeStyle = PRIMARY;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  let drawn = 0;
  for (const [u, s] of [
    [-l, -w],
    [l, -w],
    [l, w],
    [-l, w],
  ] as const) {
    const g = airfieldWorld(field, u, s);
    if (!p.point(f.camera, world.set(g.x, field.elevationM, g.z), corner)) break;
    if (drawn === 0) ctx.moveTo(corner.x, corner.y);
    else ctx.lineTo(corner.x, corner.y);
    drawn++;
  }
  if (drawn === 4) {
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** Below the flight readouts: the supply pass's limits, met in green, and with the gear down the sink rate. */
function drawApproach(ctx: CanvasRenderingContext2D, f: HudFrame, home: HomeCue, width: number, height: number): void {
  const v = f.view;
  const units = v.config.hudUnits;
  const flight = v.flight;
  const limits = supplyLimits(units);
  const fast = flight.airspeed > SUPPLY_PASS_SPEED_MS;
  const high = home.heightM > SUPPLY_PASS_HEIGHT_M;
  const x = width / 2 - 150;
  let y = height * 0.72;
  ctx.save();
  ctx.font = FONT_SMALL;
  const parts: [string, string][] = [
    ['SUPPLY PASS  ', PRIMARY],
    [`SPD ${Math.round(speedValue(flight.airspeed, units))}/${limits.speed}  `, fast ? AMBER : GREEN],
    [`ALT ${Math.round(altitudeValue(Math.max(0, home.heightM), units))}/${limits.height}`, high ? AMBER : GREEN],
  ];
  let cx = x;
  for (const [text, color] of parts) {
    ctx.fillStyle = color;
    ctx.fillText(text, cx, y);
    cx += ctx.measureText(text).width;
  }
  y += 18;
  if (flight.gear > 0) {
    const sink = Math.max(0, -flight.vel.y);
    ctx.fillStyle = flight.gear < 1 ? AMBER : GREEN;
    const gear = flight.gear < 1 ? 'GEAR …  ' : 'GEAR DOWN  ';
    ctx.fillText(gear, x, y);
    ctx.fillStyle = sink > TOUCHDOWN_MAX_SINK_MS ? RED : sink > 0.7 * TOUCHDOWN_MAX_SINK_MS ? AMBER : GREEN;
    ctx.fillText(`SINK ${Math.round(verticalSpeedValue(sink, units))} ${verticalSpeedLabel(units)}`, x + ctx.measureText(gear).width, y);
  } else {
    ctx.fillStyle = PRIMARY;
    ctx.fillText('SLOW DOWN AND LINE UP: THE GEAR COMES DOWN BY ITSELF', x, y);
  }
  ctx.restore();
}
