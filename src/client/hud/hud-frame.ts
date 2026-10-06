import type { PerspectiveCamera, Vector3 } from 'three';
import type { ModeStatus } from '../../shared/modes/mode.ts';
import type { WeaponSelect } from '../../shared/physics/controls.ts';
import type { AircraftView, GroundTargetView, MissileView } from '../session/game-session.ts';
import type { KillFeedLine } from './kill-feed.ts';
import type { HomeCue } from './supply-hud.ts';
import type { TrainingPrompt } from './training-prompts.ts';

/** Everything the HUD draws in one frame. */
export interface HudFrame {
  /** the local aircraft */
  view: AircraftView;
  views: readonly AircraftView[];
  missiles: readonly MissileView[];
  /** the missile the player has selected */
  weapon: WeaponSelect;
  /** the local aircraft's designated target */
  target: AircraftView | null;
  /** gun aim point for the designated target, when it is within gun range */
  leadDirection: Vector3 | null;
  /** how hard the gun aim assist pulls toward that aim point now, 0..1 (revision 20) */
  gunAssist?: number;
  camera: PerspectiveCamera;
  aimDirection: Vector3 | null;
  status: ModeStatus;
  radarAltitudeM: number;
  pullUp: boolean;
  /** large centered text, e.g. the respawn countdown */
  message: string | null;
  /** lines under the message while waiting to respawn (M5): the killer, who you watch, the next jet */
  deathInfo?: readonly string[];
  /** short notice, e.g. "MISSILE DECOYED" */
  banner: string | null;
  hint: string;
  killFeed: readonly KillFeedLine[];
  hitMarker: boolean;
  /** the local aircraft was just hit: the HIT caption for the hit sound */
  hitTaken: boolean;
  showScoreboard: boolean;
  dt: number;
  /** Strike targets (empty in other modes) */
  groundTargets: readonly GroundTargetView[];
  /** where a bomb released now would land, for an aircraft carrying bombs */
  bombImpact: Vector3 | null;
  /** the impact point is on a standing target */
  releaseCue: boolean;
  /** the lesson panel in training, otherwise null */
  training: TrainingPrompt | null;
  /** the time of day, "17:32" (M4) */
  localTime?: string;
  /** the air's velocity at the jet's height, without gusts (revision 16) */
  wind?: Vector3;
  /** what to do in a spin, under the SPIN warning (revision 16) */
  spinHint?: string;
  /** the nearest friendly airfield, for the way home and the landing (revision 22) */
  home?: HomeCue | null;
}
