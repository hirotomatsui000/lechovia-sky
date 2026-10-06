import type { Quaternion, Vector3 } from 'three';
import type { AircraftConfig, TeamId } from '../../shared/data/aircraft/types.ts';
import type { GroundTargetKind, MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { ControlInput } from '../../shared/physics/controls.ts';
import type { FlightState } from '../../shared/physics/flight-model.ts';
import type { MissileKind } from '../../shared/data/weapons.ts';
import type { SeekerState } from '../../shared/targeting/ir-seeker.ts';
import type { RadarLockState } from '../../shared/targeting/radar-lock.ts';
import type { Contact } from '../../shared/targeting/sensors.ts';
import type { MissileWarning } from '../../shared/targeting/warnings.ts';
import type { SteadyWind } from '../../shared/physics/wind.ts';
import type { EnvironmentSettings } from '../../shared/world/time-of-day.ts';
import type { WeatherId } from '../../shared/world/weather.ts';
import type { StoresState } from '../../shared/world/entities.ts';
import type { GameEvent } from '../../shared/world/events.ts';

/** What the renderer and HUD may know about an aircraft. */
export interface AircraftView {
  readonly id: number;
  readonly callsign: string;
  readonly team: TeamId;
  /** changes when the pilot respawns in another jet (M5) */
  config: AircraftConfig;
  readonly isLocal: boolean;
  readonly isBot: boolean;
  alive: boolean;
  hp: number;
  spawnGen: number;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  /** interpolated for smooth rendering */
  readonly quaternion: Quaternion;
  /** latest simulated state, for HUD readouts */
  flight: FlightState;
  boundarySecondsLeft: number | null;
  /** match seconds until a shot-down aircraft flies again; null while alive or with no aircraft left */
  respawnInS: number | null;
  /** the pilot's G strain, 0 clear … 1 blacked out (revision 21) */
  gStrain: number;
  /** match seconds since the pilot blacked out (G-LOC); null while conscious */
  blackedOutS: number | null;
  kills: number;
  deaths: number;
  firingCannon: boolean;
  stores: Readonly<StoresState>;
  /** bombs each new aircraft of this one carries in this mode; 0 = none */
  readonly bombLoad: number;
  /** designated target */
  targetId: number | null;
  contacts: readonly Contact[];
  /** enemies on teammates' radar (datalink, M5); filled for the local aircraft */
  datalink: readonly number[];
  seeker: Readonly<SeekerState>;
  /** the Lance's radar lock */
  radarLock: Readonly<RadarLockState>;
  /** RWR: an enemy radar lock, or a Lance its launcher still guides, is on this aircraft */
  lockedByRadar: boolean;
  /** nearest missile guiding on this aircraft inside warning range */
  incoming: MissileWarning | null;
}

export interface MissileView {
  readonly id: number;
  readonly kind: MissileKind;
  readonly team: TeamId;
  readonly ownerId: number;
  targetId: number | null;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
  motorBurning: boolean;
}

/** A Strike target as the renderer and HUD see it. */
export interface GroundTargetView {
  readonly id: string;
  readonly kind: GroundTargetKind;
  readonly label: string;
  /** center, on the ground */
  readonly position: Vector3;
  readonly maxHp: number;
  hp: number;
  destroyed: boolean;
}

export interface BombView {
  readonly id: number;
  readonly team: TeamId;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
}

export interface ProjectileView {
  team: TeamId;
  /** interpolated for smooth rendering */
  readonly position: Vector3;
  readonly velocity: Vector3;
  /** seconds since it left the gun, at the drawn position */
  ageS: number;
}

export interface GameSession {
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly localId: number | null;
  /** weather and clock of this match (M4); a new object when Free Flight changes them (M5) */
  readonly environment: EnvironmentSettings;
  /** the match's wind, without gusts (revision 16): the HUD, the bomb sight and drifting smoke */
  readonly wind: SteadyWind;
  /** the local hour now (M4) */
  hour(): number;
  update(frameDtS: number, input: ControlInput): void;
  views(): Iterable<AircraftView>;
  localView(): AircraftView | null;
  view(id: number): AircraftView | null;
  missiles(): Iterable<MissileView>;
  projectiles(): Iterable<ProjectileView>;
  groundTargets(): readonly GroundTargetView[];
  bombs(): Iterable<BombView>;
  drainEvents(): GameEvent[];
  modeStatus(): ModeStatus;
  /** The jet the local pilot flies from the next respawn on: one of their team's (M5). */
  chooseNextJet(aircraftId: string): void;
  /** Free Flight (M5): new weather and the hour it is now. */
  changeWorld(weather: WeatherId, hour: number, clockRunning: boolean): void;
  /** Free Flight (M5): fly from a point of the map, or its runway when the point is on an airfield. */
  flyFrom(x: number, z: number): void;
  /** Free Flight target drones (M5): only in Free Flight. */
  readonly canCallDrones: boolean;
  setDrones(on: boolean): void;
  dispose(): void;
}
