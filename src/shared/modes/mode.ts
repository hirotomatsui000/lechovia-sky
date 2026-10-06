import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { DeathCause, GameEvent } from '../world/events.ts';
import type { GroundTarget } from '../world/ground-targets.ts';
import type { Missile } from '../weapons/missile.ts';

export type ModeId = 'free-flight' | 'team-deathmatch' | 'air-superiority' | 'team-objective' | 'strike' | 'training';

export type StrikeEndReason = 'targets-destroyed' | 'targets-held' | 'out-of-aircraft';

/** Strike details for the HUD and the match-end screen (spec §13.1). */
export interface StrikeStatus {
  attacker: TeamId;
  defender: TeamId;
  aircraftLeft: Record<TeamId, number>;
  targetsDestroyed: number;
  targetsToWin: number;
  reason: StrikeEndReason | null;
}

/** Training progress for the HUD (spec §24, M1c). */
export interface TrainingStatus {
  step: TrainingStepId;
  /** 1-based number of the current lesson, `total` when finished */
  index: number;
  total: number;
  /** the next ring to fly through (step "fly") */
  ring: { x: number; y: number; z: number } | null;
  ringsPassed: number;
  ringsTotal: number;
  /** the drone of the current lesson */
  droneId: number | null;
  /** how many times the current lesson has started (2+ after being shot down) */
  attempt: number;
}

export type TrainingStepId = 'fly' | 'gun' | 'missile' | 'defend' | 'done';

/** An Air Superiority capture zone (spec §13, M5): a vertical cylinder. */
export interface ZoneSpec {
  id: string;
  x: number;
  z: number;
  radiusM: number;
  floorM: number;
  ceilingM: number;
}

export interface ZoneStatus extends ZoneSpec {
  /** −1 Russia … +1 USA; a side owns the zone once it reaches its end */
  progress: number;
  owner: TeamId | null;
  /** living aircraft of each side inside the zone */
  inside: Record<TeamId, number>;
}

/** A Team Objective Sentinel for the HUD (spec §13, M5). */
export interface SentinelStatus {
  id: number;
  team: TeamId;
  alive: boolean;
  /** seconds until it returns, while destroyed */
  returnInS: number | null;
}

export interface ObjectiveStatus {
  sentinels: SentinelStatus[];
  /** seconds each team's datalink stays down (0 = up) */
  datalinkDownS: Record<TeamId, number>;
  /** enemy Sentinels each team has destroyed */
  sentinelsDestroyed: Record<TeamId, number>;
}

export interface ModeStatus {
  modeId: ModeId;
  label: string;
  scores: Record<TeamId, number> | null;
  timeLeftS: number | null;
  winner: TeamId | 'draw' | null;
  strike?: StrikeStatus;
  training?: TrainingStatus;
  /** Air Superiority (M5) */
  zones?: ZoneStatus[];
  /** Team Objective (M5) */
  objective?: ObjectiveStatus;
  /** Free Flight (M5): target drones are flying */
  drones?: boolean;
}

/** The part of the World a mode may read. Keeps modes independent of World internals. */
export interface ModeContext {
  readonly tick: number;
  readonly tickRate: number;
  aircraftList(): Iterable<AircraftEntity>;
  groundTargetList(): readonly GroundTarget[];
  /** game events for the clients (zone captures); the World provides it, unit tests may leave it out */
  emit?(event: GameEvent): void;
}

/** A mode-flown support aircraft (Team Objective's Sentinels, M5): it orbits, never fights and returns after a delay. */
export interface SupportSpec {
  team: TeamId;
  aircraftId: string;
  callsign: string;
  orbit: { x: number; z: number; radiusM: number; altitudeM: number; speedMs: number };
  respawnDelayS: number;
  /** hit points instead of the aircraft's own (Team Objective, revision 19) */
  hitPoints?: number;
}

/** Where a bot should be when it has nothing to fight (M5): a point to fly to and circle at. */
export interface BotGoal {
  x: number;
  z: number;
  altitudeM: number;
  /** circle within this radius once there */
  radiusM: number;
}

/** A target drone flying a level right-hand orbit that starts at (x, z) along `headingRad`. */
export interface DroneSpec {
  team: TeamId;
  aircraftId: string;
  callsign: string;
  x: number;
  z: number;
  altitudeM: number;
  /** 0 = north (-z), PI/2 = east (+x) */
  headingRad: number;
  orbit: { radiusM: number; speedMs: number };
}

/** World powers a scripted mode (training) may use each tick, through `GameMode.direct`. */
export interface ModeDirector extends ModeContext {
  getAircraft(id: number): AircraftEntity | undefined;
  missileList(): readonly Missile[];
  addDrone(spec: DroneSpec): AircraftEntity;
  removeAircraft(id: number): boolean;
  /** Fires a short-range missile from `shooterId` at `targetId` without a lock; returns the missile id. */
  launchMissileAt(shooterId: number, targetId: number): number | null;
  /** Full hit points and stores, as on a fresh spawn, without moving the aircraft. */
  restock(id: number): void;
}

export interface GameMode {
  readonly id: ModeId;
  /** weapons and sensors run (Free Flight turns them on only while target drones fly) */
  readonly combatEnabled: boolean;
  readonly respawnDelayS: number;
  /** Called once by the World before anything else, with the map the match flies on. */
  prepare?(map: MapDefinition): void;
  /** Aircraft the mode itself flies, added when the World starts (Team Objective's Sentinels). */
  supportAircraft?(map: MapDefinition): readonly SupportSpec[];
  /** Where a bot goes when it has nothing within reach to fight (Air Superiority zones, Sentinels); null = patrol. */
  botGoal?(ctx: ModeContext, bot: AircraftEntity): BotGoal | null;
  /** False while a team's datalink is down (Team Objective); up when left out. */
  datalinkUp?(team: TeamId): boolean;
  /** Pilots who ask for it start on their team's runway (M4); others always start in the air. */
  readonly runwayStarts?: boolean;
  /** The whole map is open: only its edge, not the combat area, is the boundary (Free Flight, revision 22). */
  readonly wholeMap?: boolean;
  /** Where a team spawns; most modes use the map's spawn lines. */
  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec;
  /** Ground targets the World places at the start (Strike); none elsewhere. */
  groundTargets(map: MapDefinition): readonly GroundTargetSpec[];
  /** Bombs on each new aircraft of a team (Strike attackers); 0 elsewhere. */
  bombLoad(team: TeamId): number;
  /** Lances on every new fighter when the mode sets one load for all (Team Objective); each jet's own when left out. */
  lanceLoad?(): number;
  /** False once a team has no aircraft left (Strike). */
  canRespawn(team: TeamId): boolean;
  onAircraftDestroyed(ctx: ModeContext, victim: AircraftEntity, killer: AircraftEntity | null, cause: DeathCause): void;
  update(ctx: ModeContext): void;
  status(ctx: ModeContext): ModeStatus;
  /** Scripted modes act on the World here, after `update`, once per tick. */
  direct?(director: ModeDirector): void;
}
