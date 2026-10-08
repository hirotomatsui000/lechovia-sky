import { damageFlightEnv, damageState } from '../damage/damage.ts';
import type { AircraftConfig, TeamId } from '../data/aircraft/types.ts';
import { airfieldGroundHeight, type MapFeatures } from '../map/features.ts';
import type { ControlInput } from '../physics/controls.ts';
import { type FlightEnv, type FlightState, stepFlight } from '../physics/flight-model.ts';
import { updateStrain } from '../physics/g-tolerance.ts';
import type { WindField } from '../physics/wind.ts';
import { onApproach } from './supply.ts';

/** What flying an aircraft for one tick needs from around it: the map's airfields, the wind and the time. */
export interface FlyContext {
  features: MapFeatures | undefined;
  wind: WindField;
  /** match seconds at the start of the tick: the gusts move with it */
  timeS: number;
  /** scratch, filled in for each aircraft */
  readonly env: FlightEnv;
}

/** The part of an aircraft that flies: its state, the fuel it carries, its damage and the pilot's G strain. */
export interface FlyingAircraft {
  readonly team: TeamId;
  readonly config: AircraftConfig;
  readonly flight: FlightState;
  readonly hp: number;
  readonly stores: { fuelKg: number };
  readonly input: ControlInput;
  gStrain: number;
  /** tick at which the pilot blacked out, -1 while conscious */
  readonly blackoutTick: number;
}

/**
 * One tick of an aircraft's flight, the same for the World and for an online pilot's prediction of their own jet
 * (revision 28): its damage and an empty tank set the thrust and roll it has, the runway under it carries the wheels,
 * the wind moves the air, the fuel burnt lightens it and the gear comes down on approach to a friendly airfield; then
 * the engines burn their fuel and the pilot's G strain builds or drains. True when the pilot blacks out this tick.
 */
export function flyTick(a: FlyingAircraft, ctx: FlyContext, dt: number): boolean {
  const env = ctx.env;
  damageFlightEnv(damageState(a.hp, a.config.damage.hitPoints), env);
  // An empty tank flames the engines out (revision 16).
  if (a.stores.fuelKg <= 0) env.thrustScale = 0;
  env.groundM = airfieldGroundHeight(ctx.features, a.flight.pos.x, a.flight.pos.z);
  ctx.wind.at(a.flight.pos, ctx.timeS, env.wind);
  env.fuelUsedKg = a.config.physics.fuelKg - a.stores.fuelKg;
  env.gearWanted = onApproach(ctx.features, a.team, a.flight);
  stepFlight(a.flight, a.input, a.config.physics, dt, env);
  a.stores.fuelKg = Math.max(0, a.stores.fuelKg - a.flight.fuelFlow * dt);
  if (a.blackoutTick >= 0) return false;
  a.gStrain = updateStrain(a.gStrain, a.flight.gLoad, dt);
  return a.gStrain >= 1;
}
