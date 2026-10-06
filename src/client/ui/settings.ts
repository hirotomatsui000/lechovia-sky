import { type Bindings, DEFAULT_BINDINGS, sanitizeBindings } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import {
  type AxisCalibration,
  AXIS_ROLES,
  type CustomPadProfile,
  DEFAULT_PAD_SETTINGS,
  PAD_ACTIONS,
  type PadSettings,
} from '../input/gamepad.ts';
import { QUALITY_LEVELS, type QualityLevel } from '../render/quality.ts';
import type { TeamColorScheme } from '../hud/palette.ts';
import { loadSetting, saveSetting } from './storage.ts';

export type HudColor = 'green' | 'amber' | 'white';
export const HUD_COLORS: readonly HudColor[] = ['green', 'amber', 'white'];
export type GraphicsSetting = 'auto' | QualityLevel;
export const GRAPHICS_SETTINGS: readonly GraphicsSetting[] = ['auto', ...QUALITY_LEVELS];

/** Everything the settings screen changes (spec §24, M1c). Persisted in localStorage. */
export interface Settings {
  /** master volume, 0..1 */
  volume: number;
  /** the mute toggle */
  sound: boolean;
  /** the soundtrack on or off */
  music: boolean;
  /** the soundtrack's share of the master volume, 0..1 */
  musicVolume: number;
  controlMode: ControlMode;
  /** multiplier on the base mouse sensitivity, 0.25..3 */
  mouseSensitivity: number;
  /** mouse up = nose down (mouse-aim and look) */
  invertY: boolean;
  keys: Bindings;
  hudColor: HudColor;
  /** 0.8..1.4 */
  hudScale: number;
  graphics: GraphicsSetting;
  /** the level Auto settled on, remembered for the next visit */
  autoGraphics: QualityLevel | null;
  /** camera shake, the G effect before a blackout and the red-out, and the kill cam's camera move (M5) */
  reduceMotion: boolean;
  /** steady HUD warnings and no strobe lights (M5) */
  reduceFlashing: boolean;
  /** friend and foe colours: blue/red, or a colour-blind safe blue/orange (M5) */
  teamColors: TeamColorScheme;
  gamepad: PadSettings;
  /** finished the training flight at least once (the title screen stops pointing at it) */
  trainingDone: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  sound: true,
  music: true,
  musicVolume: 0.6,
  controlMode: 'mouse-aim',
  mouseSensitivity: 1,
  invertY: false,
  keys: DEFAULT_BINDINGS,
  hudColor: 'green',
  hudScale: 1,
  graphics: 'auto',
  autoGraphics: null,
  reduceMotion: false,
  reduceFlashing: false,
  teamColors: 'standard',
  gamepad: DEFAULT_PAD_SETTINGS,
  trainingDone: false,
};

export const MOUSE_SENSITIVITY_RANGE = { min: 0.25, max: 3 } as const;
export const HUD_SCALE_RANGE = { min: 0.8, max: 1.4 } as const;

const number = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.find((a) => a === v) ?? fallback;
const index = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= -1 && (v as number) < 64 ? (v as number) : fallback);
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function sanitizePad(stored: unknown): PadSettings {
  const raw = record(stored);
  const custom = record(raw.custom);
  const axes = record(custom.axes);
  const invert = record(custom.invert);
  const buttons = record(custom.buttons);
  const d = DEFAULT_PAD_SETTINGS.custom;
  const profile: CustomPadProfile = {
    axes: { roll: d.axes.roll, pitch: d.axes.pitch, yaw: d.axes.yaw, throttle: d.axes.throttle },
    invert: { roll: false, pitch: false, yaw: false, throttle: false },
    buttons: { ...d.buttons },
  };
  for (const r of AXIS_ROLES) {
    profile.axes[r] = index(axes[r], d.axes[r]);
    profile.invert[r] = bool(invert[r], d.invert[r]);
  }
  for (const a of PAD_ACTIONS) profile.buttons[a] = index(buttons[a], d.buttons[a]);
  const calibration: AxisCalibration[] = [];
  if (Array.isArray(raw.calibration)) {
    for (const c of raw.calibration.slice(0, 16)) {
      const cal = record(c);
      const center = number(cal.center, 0, -1, 1);
      calibration.push({ center, min: number(cal.min, -1, -1, center), max: number(cal.max, 1, center, 1) });
    }
  }
  return { custom: profile, calibration };
}

/** Repairs anything read from storage: unknown fields dropped, every value valid. */
export function sanitizeSettings(stored: unknown): Settings {
  const raw = record(stored);
  const d = DEFAULT_SETTINGS;
  return {
    volume: number(raw.volume, d.volume, 0, 1),
    sound: bool(raw.sound, d.sound),
    music: bool(raw.music, d.music),
    musicVolume: number(raw.musicVolume, d.musicVolume, 0, 1),
    controlMode: oneOf(raw.controlMode, ['mouse-aim', 'direct'] as const, d.controlMode),
    mouseSensitivity: number(raw.mouseSensitivity, d.mouseSensitivity, MOUSE_SENSITIVITY_RANGE.min, MOUSE_SENSITIVITY_RANGE.max),
    invertY: bool(raw.invertY, d.invertY),
    keys: sanitizeBindings(raw.keys),
    hudColor: oneOf(raw.hudColor, HUD_COLORS, d.hudColor),
    hudScale: number(raw.hudScale, d.hudScale, HUD_SCALE_RANGE.min, HUD_SCALE_RANGE.max),
    graphics: oneOf(raw.graphics, GRAPHICS_SETTINGS, d.graphics),
    autoGraphics: QUALITY_LEVELS.find((l) => l === raw.autoGraphics) ?? null,
    reduceMotion: bool(raw.reduceMotion, d.reduceMotion),
    reduceFlashing: bool(raw.reduceFlashing, d.reduceFlashing),
    teamColors: oneOf(raw.teamColors, ['standard', 'colorblind'] as const, d.teamColors),
    gamepad: sanitizePad(raw.gamepad),
    trainingDone: bool(raw.trainingDone, d.trainingDone),
  };
}

const KEY = 'settings';

/** Stored settings, or (first run after M1c) the three settings earlier versions kept under their own keys. */
export function loadSettings(): Settings {
  const stored = loadSetting<unknown>(KEY, null);
  if (stored !== null) return sanitizeSettings(stored);
  return sanitizeSettings({
    sound: loadSetting<unknown>('sound', true),
    reduceMotion: loadSetting<unknown>('reduceMotion', false),
    controlMode: loadSetting<unknown>('controlMode', 'mouse-aim'),
    autoGraphics: null,
  });
}

export type SettingsListener = (settings: Readonly<Settings>) => void;

/** The live settings: every change is validated, saved and announced to the parts of the game that use it. */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<SettingsListener>();
  private readonly persist: boolean;

  constructor(initial: Settings = loadSettings(), persist = true) {
    this.value = initial;
    this.persist = persist;
  }

  get current(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    if (this.persist) saveSetting(KEY, this.value);
    for (const fn of this.listeners) fn(this.value);
  }

  /** Calls `fn` on every change; returns the unsubscribe function. */
  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
