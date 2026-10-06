import type { TeamId } from '../data/aircraft/types.ts';
import type { MissileKind } from '../data/weapons.ts';

/** 'blackout': the jet hit the ground with its pilot blacked out by G (G-LOC, revision 21). */
export type DeathCause = 'crash' | 'blackout' | 'collision' | 'boundary' | 'cannon' | 'missile';
export type WeaponKind = 'cannon' | 'missile';

export type GameEvent =
  | { type: 'spawned'; aircraftId: number; spawnGen: number }
  | { type: 'destroyed'; aircraftId: number; cause: DeathCause; killerId: number | null }
  /** the pilot blacked out under G (G-LOC, revision 21): the stick no longer answers */
  | { type: 'blackout'; aircraftId: number }
  /** missiles, gun rounds, flares and fuel taken on at a friendly airfield; `repaired` after a landing (revision 22) */
  | { type: 'resupplied'; aircraftId: number; repaired: boolean }
  | { type: 'hit'; aircraftId: number; attackerId: number | null; weapon: WeaponKind; damage: number }
  | { type: 'missileLaunched'; missileId: number; shooterId: number; targetId: number; kind: MissileKind }
  | { type: 'missileDetonated'; missileId: number; x: number; y: number; z: number; nearAircraft: boolean }
  | { type: 'missileDecoyed'; missileId: number; targetId: number }
  | { type: 'countermeasures'; aircraftId: number }
  | { type: 'bombReleased'; bombId: number; aircraftId: number }
  | { type: 'bombImpact'; bombId: number; x: number; y: number; z: number }
  | { type: 'targetHit'; targetId: string; attackerId: number | null; damage: number }
  | { type: 'targetDestroyed'; targetId: string; attackerId: number | null }
  /** an Air Superiority zone changed hands (M5): captured by `owner`, or neutralized (owner null) from `previous` */
  | { type: 'zone'; zoneId: string; owner: TeamId | null; previous: TeamId | null };
