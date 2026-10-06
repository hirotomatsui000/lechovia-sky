import type { TeamId } from '../data/aircraft/types.ts';
import { AIRFIELD_GROUND_HALF_WIDTH_M, AIRFIELD_GROUND_OVERRUN_M, type Airfield, airfieldLocal, type MapFeatures } from '../map/features.ts';
import type { FlightState } from '../physics/flight-model.ts';
import type { AircraftEntity } from './entities.ts';

/*
 * Rearming at an airfield (revision 22). The owner asked for a way to fly home and take on missiles and gun rounds
 * again. Over a friendly runway (the team's own field or a neutral one), low and slow, a jet takes on missiles, gun
 * rounds, flares and fuel: a low pass does it, and so does the roll-out after a landing. Landed and stopped there it
 * is repaired as well. Bombs belong to a Strike sortie and are not reloaded.
 */

/** A supply pass: over the runway, no higher above it and no faster than these, for this long. */
export const SUPPLY_PASS_HEIGHT_M = 150;
export const SUPPLY_PASS_SPEED_MS = 130;
export const SUPPLY_PASS_HALF_WIDTH_M = 250;
export const SUPPLY_PASS_S = 3;
/** On the wheels this slow counts as stopped; stopped this long on a friendly airfield, the jet is repaired too. */
export const SUPPLY_STOPPED_MS = 5;
export const SUPPLY_LANDED_S = 5;
/** Below this share of fuel a supply pass is worth making for the fuel alone. */
export const REFUEL_BELOW_SHARE = 0.9;
/**
 * On approach the gear comes down by itself: within this far of a friendly runway's ends, this far either side of its
 * centre line, this low above it and this slow, and not climbing away.
 */
export const APPROACH_RANGE_M = 6000;
export const APPROACH_HALF_WIDTH_M = 1500;
export const APPROACH_HEIGHT_M = 450;
export const APPROACH_SPEED_MS = 140;
const APPROACH_MAX_CLIMB_MS = 2;

export type SupplyKind = 'pass' | 'landed';

/** A team takes on supplies at its own airfields and at neutral ones, never at the enemy's. */
export function friendlyAirfield(field: Airfield, team: TeamId): boolean {
  return field.team === null || field.team === team;
}

/** The nearest friendly airfield to (x, z), or null on a map without any. */
export function nearestFriendlyAirfield(features: MapFeatures | undefined, team: TeamId, x: number, z: number): Airfield | null {
  let best: Airfield | null = null;
  let bestD = Infinity;
  for (const field of features?.airfields ?? []) {
    if (!friendlyAirfield(field, team)) continue;
    const d = Math.hypot(field.x - x, field.z - z);
    if (d < bestD) {
      bestD = d;
      best = field;
    }
  }
  return best;
}

/**
 * How the jet is taking on supplies now: on a supply pass over the runway; on the wheels anywhere on the airfield's
 * ground, rolling out (counted as a pass) or stopped; or not at all.
 */
export function supplyAt(features: MapFeatures | undefined, team: TeamId, f: FlightState): SupplyKind | null {
  for (const field of features?.airfields ?? []) {
    if (!friendlyAirfield(field, team)) continue;
    const { u, v } = airfieldLocal(field, f.pos.x, f.pos.z);
    if (f.onGround) {
      // On the wheels anywhere on the airfield's ground: a jet that has turned off the runway still counts.
      if (Math.abs(u) > field.lengthM / 2 + AIRFIELD_GROUND_OVERRUN_M || Math.abs(v) > AIRFIELD_GROUND_HALF_WIDTH_M) continue;
      return Math.hypot(f.vel.x, f.vel.z) <= SUPPLY_STOPPED_MS ? 'landed' : f.airspeed <= SUPPLY_PASS_SPEED_MS ? 'pass' : null;
    }
    if (Math.abs(u) > field.lengthM / 2 || Math.abs(v) > SUPPLY_PASS_HALF_WIDTH_M) continue;
    if (f.pos.y - field.elevationM <= SUPPLY_PASS_HEIGHT_M && f.airspeed <= SUPPLY_PASS_SPEED_MS) return 'pass';
  }
  return null;
}

/** On approach to a friendly airfield: the gear should come down. */
export function onApproach(features: MapFeatures | undefined, team: TeamId, f: FlightState): boolean {
  if (f.onGround || f.airspeed > APPROACH_SPEED_MS || f.vel.y > APPROACH_MAX_CLIMB_MS) return false;
  for (const field of features?.airfields ?? []) {
    if (!friendlyAirfield(field, team) || f.pos.y - field.elevationM > APPROACH_HEIGHT_M) continue;
    const { u, v } = airfieldLocal(field, f.pos.x, f.pos.z);
    if (Math.abs(u) <= field.lengthM / 2 + APPROACH_RANGE_M && Math.abs(v) <= APPROACH_HALF_WIDTH_M) return true;
  }
  return false;
}

/** Whether a stop would give the jet anything: weapons or flares used, fuel low, or (stopped) damage to repair. */
export function needsSupply(a: AircraftEntity, repair: boolean): boolean {
  const full = a.config.stores;
  const s = a.stores;
  return (
    s.cannonRounds < full.cannonRounds ||
    s.srm < full.srm ||
    s.mrm < (a.lanceLoad ?? full.mrm) ||
    s.countermeasures < full.countermeasures ||
    s.fuelKg < REFUEL_BELOW_SHARE * a.config.physics.fuelKg ||
    (repair && a.hp < a.config.damage.hitPoints)
  );
}

/** Missiles, gun rounds, flares and fuel back to a fresh jet's; with `repair`, its hit points too. Bombs stay. */
export function resupply(a: AircraftEntity, repair: boolean): void {
  const full = a.config.stores;
  a.stores.cannonRounds = full.cannonRounds;
  a.stores.srm = full.srm;
  a.stores.mrm = a.lanceLoad ?? full.mrm;
  a.stores.countermeasures = full.countermeasures;
  a.stores.fuelKg = a.config.physics.fuelKg;
  if (repair) a.hp = a.config.damage.hitPoints;
}
