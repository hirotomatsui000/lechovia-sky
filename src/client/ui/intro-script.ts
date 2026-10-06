import { clamp, lerp } from '../../shared/math/units.ts';

/*
 * The opening's script (revision 24): what happens when, and where things are, as pure functions of the time since the
 * page opened. The footage is gun-camera film: the HUD boots, a bandit overtakes overhead with its burners lit and
 * settles ahead, the HUD locks it, a missile leaves the rail, and the bandit goes up in a fireball out of which the
 * title comes. Positions are camera-relative, in the bandit's wingspans: x right, y up, z ahead.
 */

/** The footage runs this long; then it cuts to the title screen as soon as the scenery and the jets have loaded. */
export const INTRO_S = 5;
/** It waits for loading no longer than this; the title screen's own load bar carries on from there. */
export const INTRO_MAX_S = 9;
/** The cut to the title screen: a white flash and a fade. Shorter when skipped. */
export const INTRO_OUT_S = 0.7;
export const INTRO_SKIP_OUT_S = 0.4;

/** The beats, in seconds from the start. */
export const BEAT = {
  /** the bandit comes over the top of the frame... */
  banditIn: 0.9,
  /** ...and has settled ahead */
  banditSettled: 2.9,
  /** the seeker starts to track it */
  seeker: 1.6,
  lock: 2.25,
  fire: 2.5,
  hit: 3.0,
  splash: 3.2,
  /** the title slams in once the fireball has had its moment */
  title: 3.4,
  streamer: 3.6,
  tagline: 3.8,
  /** the light sweeps across the title */
  sweep: 3.95,
  /** two brief glitches of the colour fringes while it holds */
  glitches: [4.15, 4.6],
} as const;

/** The camera flies forward at this speed: what stays put in the air (smoke, contrails, the fireball) comes closer. */
export const CAMERA_SPEED = 2.5;
/** The bandit starts at, and settles at, these distances. */
const BANDIT_NEAR = 0.3;
const BANDIT_FAR = 9;
/** Where the missile leaves the rail: under the camera ship's left wing. */
const MISSILE_FROM = { x: -0.55, y: -0.4, z: 0.5 };

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** bank, radians, right wing down positive */
  roll: number;
}

export function easeOutCubic(u: number): number {
  const v = 1 - clamp(u, 0, 1);
  return 1 - v * v * v;
}

export function easeOutQuad(u: number): number {
  const v = 1 - clamp(u, 0, 1);
  return 1 - v * v;
}

/** When the footage hands over to the title screen: after INTRO_S once everything has loaded, or at INTRO_MAX_S. */
export function revealAt(elapsedS: number, loaded: boolean): boolean {
  return elapsedS >= INTRO_MAX_S || (elapsedS >= INTRO_S && loaded);
}

/**
 * The bandit: from just over the camera's right shoulder it pulls away and settles ahead with a gentle weave. Its
 * distance grows geometrically, so its size on screen shrinks smoothly. Null before it comes into the frame and from
 * the hit on, when it is gone.
 */
export function banditPose(t: number): Pose | null {
  return t < BEAT.banditIn || t >= BEAT.hit ? null : banditPath(t);
}

/** Where the bandit is at the moment of the hit, which is where the fireball starts. */
export function hitPoint(): Pose {
  return banditPath(BEAT.hit);
}

function banditPath(t: number): Pose {
  const s = easeOutQuad((t - BEAT.banditIn) / (BEAT.banditSettled - BEAT.banditIn));
  const weave = (t - BEAT.banditIn) * 1.7;
  return {
    x: lerp(1.3, 0.35 * Math.sin(weave), s),
    y: lerp(0.55, 0.5, s),
    z: BANDIT_NEAR * (BANDIT_FAR / BANDIT_NEAR) ** s,
    roll: lerp(0.6, -0.22 * Math.cos(weave), s),
  };
}

/**
 * The missile from the rail to the bandit, curving up on the way, between the shot and the hit; null otherwise. It
 * moves in screen terms (x/z, y/z) so it stays on the line of sight to where the bandit will be.
 */
export function missilePose(t: number): Pose | null {
  if (t < BEAT.fire || t >= BEAT.hit) return null;
  const s = (t - BEAT.fire) / (BEAT.hit - BEAT.fire);
  const target = hitPoint();
  const e = easeOutQuad(s);
  const arc = Math.sin(Math.PI * s);
  const z = MISSILE_FROM.z * (target.z / MISSILE_FROM.z) ** (s ** 1.15);
  const sx = lerp(MISSILE_FROM.x / MISSILE_FROM.z, target.x / target.z, e) + 0.08 * arc;
  const sy = lerp(MISSILE_FROM.y / MISSILE_FROM.z, target.y / target.z, e) + 0.14 * arc;
  return { x: sx * z, y: sy * z, z, roll: 0 };
}

/** A point on the bandit (x right, y up, z to the nose, in wingspans) relative to the camera, banked with it. */
export function jetPoint(pose: Pose, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const c = Math.cos(pose.roll);
  const s = Math.sin(pose.roll);
  return { x: pose.x + x * c + y * s, y: pose.y - x * s + y * c, z: pose.z + z };
}

/** The first characters of `text` typed from `startS` at `cps` characters a second. */
export function typed(text: string, startS: number, t: number, cps = 60): string {
  if (t <= startS) return '';
  return text.slice(0, Math.floor((t - startS) * cps));
}

/** A film timecode, hours:minutes:seconds:frames at 24 frames a second. */
export function timecode(t: number): string {
  const frames = Math.floor(Math.max(0, t) * 24);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(frames / 86400))}:${pad(Math.floor(frames / 1440) % 60)}:${pad(Math.floor(frames / 24) % 60)}:${pad(frames % 24)}`;
}

/** The loading line under the footage. */
export function loadLabel(done: number, total: number): string {
  return done >= total ? 'SYSTEMS READY' : `LOADING ${done}/${total}`;
}

/** How hard the camera shakes, in pixels: the bandit's pass overhead, the blast, and the title slamming in. */
export function shakeAt(t: number): number {
  const pass = 9 * Math.exp(-(((t - 1.3) / 0.2) ** 2));
  const blast = t >= BEAT.hit ? 16 * Math.exp(-(t - BEAT.hit) * 5) : 0;
  const slam = t >= BEAT.title ? 6 * Math.exp(-(t - BEAT.title) * 8) : 0;
  return pass + blast + slam;
}
