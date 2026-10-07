import { Vector3 } from 'three';
import type { AircraftPhysics, TeamId } from '../data/aircraft/types.ts';
import type { MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import { type Airfield, airfieldWorld } from '../map/features.ts';
import type { Terrain } from '../map/terrain.ts';
import { trimAlpha } from '../physics/aero.ts';
import { atmosphere } from '../physics/atmosphere.ts';
import { createFlightState, type FlightState } from '../physics/flight-model.ts';
import { restingHeight } from '../physics/ground.ts';

export const SPAWN_SPEED = 250;
export const SPAWN_SLOT_SPACING = 600;
const MIN_SPAWN_CLEARANCE = 1500;

/**
 * Airborne spawn on a spawn line, trimmed for 1 G level flight.
 * Slots alternate right/left of the line center.
 */
export function spawnFlightState(spec: SpawnSpec, terrain: Terrain, slot: number, physics: AircraftPhysics): FlightState {
  const side = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2);
  const offset = side * SPAWN_SLOT_SPACING;
  const x = spec.x + Math.cos(spec.headingRad) * offset;
  const z = spec.z + Math.sin(spec.headingRad) * offset;
  const altitude = Math.max(spec.altitudeM, terrain.surfaceAt(x, z) + MIN_SPAWN_CLEARANCE);
  const alphaRad = trimAlpha(physics, SPAWN_SPEED, atmosphere(altitude).density);
  return createFlightState({
    position: new Vector3(x, altitude, z),
    headingRad: spec.headingRad,
    speed: SPAWN_SPEED,
    throttle: 0.8,
    alphaRad,
  });
}

/** Where a pilot starts: on the spawn line in the air, or on the team's runway (spec §13, M4). */
export type SpawnStart = 'air' | 'runway';
export const SPAWN_STARTS: readonly SpawnStart[] = ['air', 'runway'];

/**
 * Runway starts: the first jet of a team (the player's, or the lead's) on the centre line at the threshold; the rest
 * behind it in rows 300 m apart, two to a row 12 m either side of the centre line. Revision 26: the first jet used to
 * stand in the left lane, so the player started off to the left of the runway.
 */
export const RUNWAY_LANE_OFFSET_M = 12;
export const RUNWAY_ROW_SPACING_M = 300;
const RUNWAY_THRESHOLD_M = 150;
const RUNWAY_ROWS = 6;
/** Slots on one runway before they start again at the threshold. */
const RUNWAY_SLOTS = 1 + 2 * (RUNWAY_ROWS - 1);

/** Where runway slot `slot` stands: `row` from the threshold and `lane` to the right of the centre line, metres. */
export function runwaySlot(slot: number): { row: number; lane: number } {
  const s = slot % RUNWAY_SLOTS;
  if (s === 0) return { row: 0, lane: 0 };
  return { row: Math.ceil(s / 2), lane: s % 2 === 1 ? -RUNWAY_LANE_OFFSET_M : RUNWAY_LANE_OFFSET_M };
}
/** Full military power: the jet rolls at once; the pilot adds afterburner or brakes. */
const RUNWAY_THROTTLE = 0.9;

/** The airfield a team starts from, if the map has one. */
export function teamAirfield(map: MapDefinition, team: TeamId): Airfield | null {
  return map.features?.airfields.find((a) => a.team === team) ?? null;
}

/** A jet standing on the runway at its slot, gear down, facing the take-off direction. */
export function runwayFlightState(field: Airfield, slot: number): FlightState {
  const { row, lane } = runwaySlot(slot);
  const { x, z } = airfieldWorld(field, -field.lengthM / 2 + RUNWAY_THRESHOLD_M + row * RUNWAY_ROW_SPACING_M, lane);
  return createFlightState({
    position: new Vector3(x, restingHeight(field.elevationM), z),
    headingRad: field.headingRad,
    speed: 0,
    throttle: RUNWAY_THROTTLE,
    onGround: true,
  });
}
