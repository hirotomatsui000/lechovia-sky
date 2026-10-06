import { listAircraft, opposingTeam } from '../data/aircraft/registry.ts';
import type { TeamId } from '../data/aircraft/types.ts';
import type { GroundTargetSpec, MapDefinition, SpawnSpec } from '../data/maps/map-definition.ts';
import { headingRad } from '../physics/flight-model.ts';
import type { AircraftEntity } from '../world/entities.ts';
import type { GameMode, ModeContext, ModeDirector, ModeStatus } from './mode.ts';

/** Target drones in Free Flight (M5): this many at a time, round the player. */
export const FREE_FLIGHT_DRONES = 4;
/** A shot-down drone is cleared after this long (its wreck has fallen) and replaced this long after it died. */
const DRONE_CLEAR_S = 2;
export const DRONE_REPLACE_S = 10;
const DRONE_DISTANCE_M = 6000;
const DRONE_ORBIT_M = 3500;
const DRONE_MIN_ALTITUDE_M = 1500;

interface DroneSlot {
  id: number | null;
  /** tick the drone died, or -1 */
  diedTick: number;
}

/**
 * Sightseeing and flight testing: no scoring, no enemies and quick respawns (spec §13). Offline the pilot can call up
 * target drones (M5): four unarmed enemy jets orbiting round them, replaced 10 s after each is shot down. Weapons work
 * only while the drones fly.
 */
export class FreeFlightMode implements GameMode {
  readonly id = 'free-flight' as const;
  readonly runwayStarts: boolean = true;
  /** Sightseeing goes anywhere on the map (revision 22): the map screen flies you from wherever you click. */
  readonly wholeMap = true;
  readonly respawnDelayS = 3;
  private drones = false;
  private readonly slots: DroneSlot[] = [];
  private placed = 0;
  /** the player's spawn the drones were placed round: a new spawn (or "fly from here") brings them along */
  private playerGen = -1;

  get combatEnabled(): boolean {
    return this.drones;
  }

  /** Turns the target drones on or off (offline only); they appear on the next tick. */
  setDrones(on: boolean): void {
    this.drones = on;
  }

  spawnPoint(map: MapDefinition, team: TeamId): SpawnSpec {
    return map.spawns[team];
  }

  groundTargets(): readonly GroundTargetSpec[] {
    return [];
  }

  bombLoad(): number {
    return 0;
  }

  canRespawn(): boolean {
    return true;
  }

  onAircraftDestroyed(ctx: ModeContext, victim: AircraftEntity): void {
    const slot = this.slots.find((s) => s.id === victim.id);
    if (slot) slot.diedTick = ctx.tick;
  }

  update(): void {}

  direct(d: ModeDirector): void {
    if (!this.drones) {
      for (const s of this.slots) if (s.id !== null) d.removeAircraft(s.id);
      this.slots.length = 0;
      return;
    }
    const player = this.player(d);
    if (!player) return;
    if (player.spawnGen !== this.playerGen) {
      this.playerGen = player.spawnGen;
      for (const s of this.slots) if (s.id !== null) d.removeAircraft(s.id);
      this.slots.length = 0;
    }
    while (this.slots.length < FREE_FLIGHT_DRONES) this.slots.push({ id: null, diedTick: -1 });
    for (const s of this.slots) {
      const since = s.diedTick < 0 ? 0 : (d.tick - s.diedTick) / d.tickRate;
      if (s.id !== null && s.diedTick >= 0 && since >= DRONE_CLEAR_S) {
        d.removeAircraft(s.id);
        s.id = null;
      }
      if (s.id === null && (s.diedTick < 0 || since >= DRONE_REPLACE_S) && player.alive) {
        s.id = this.launch(d, player);
        s.diedTick = -1;
      }
    }
  }

  status(): ModeStatus {
    return { modeId: this.id, label: 'Free Flight', scores: null, timeLeftS: null, winner: null, drones: this.drones };
  }

  /** The human pilot: the first aircraft that is neither a bot nor a support aircraft. */
  private player(d: ModeDirector): AircraftEntity | null {
    for (const a of d.aircraftList()) if (!a.isBot && !a.support) return a;
    return null;
  }

  /** A drone 6 km from the player on a bearing that turns a quarter circle with each one placed. */
  private launch(d: ModeDirector, player: AircraftEntity): number {
    const k = this.placed++;
    const enemy = opposingTeam(player.team);
    const jets = listAircraft(enemy);
    const f = player.flight;
    const bearing = headingRad(f) + (k % 4) * (Math.PI / 2);
    const x = f.pos.x + Math.sin(bearing) * DRONE_DISTANCE_M;
    const z = f.pos.z - Math.cos(bearing) * DRONE_DISTANCE_M;
    const altitudeM = Math.max(f.pos.y + ((k % 3) - 1) * 400, DRONE_MIN_ALTITUDE_M);
    return d.addDrone({
      team: enemy,
      aircraftId: jets[k % jets.length].id,
      callsign: `[BOT] Drone ${(k % 9) + 1}`,
      x,
      z,
      altitudeM,
      headingRad: bearing + Math.PI / 2,
      orbit: { radiusM: DRONE_ORBIT_M, speedMs: 180 + 15 * (k % 4) },
    }).id;
  }
}
