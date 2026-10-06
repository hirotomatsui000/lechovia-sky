import { ACTION_LABELS, BINDABLE_ACTIONS, canBind, DEFAULT_BINDINGS, type KeyAction, keysLabel, rebind } from '../input/bindings.ts';
import type { ControlMode } from '../input/control-mapper.ts';
import {
  AXIS_ROLES,
  type AxisRole,
  CalibrationRecorder,
  DEFAULT_PAD_SETTINGS,
  firstNewButton,
  mostMovedAxis,
  PAD_ACTIONS,
  type PadAction,
  type PadState,
  pollGamepad,
} from '../input/gamepad.ts';
import { GAMEPAD_HELP } from './controls-help.ts';
import { GRAPHICS_SETTINGS, type GraphicsSetting, HUD_COLORS, HUD_SCALE_RANGE, type HudColor, MOUSE_SENSITIVITY_RANGE, type SettingsStore } from './settings.ts';

export type SettingsTab = 'controls' | 'keys' | 'gamepad' | 'display' | 'sound';
const TABS: readonly [SettingsTab, string][] = [
  ['controls', 'Controls'],
  ['keys', 'Keys'],
  ['gamepad', 'Gamepad'],
  ['display', 'Display'],
  ['sound', 'Sound'],
];

const PAD_ACTION_LABELS: Readonly<Record<PadAction, string>> = {
  cannon: 'Cannon',
  missile: 'Missile',
  flares: 'Flares',
  nextTarget: 'Next target',
  bomb: 'Bomb',
  airbrake: 'Airbrake',
  pause: 'Pause',
  scores: 'Scores',
  rudderLeft: 'Rudder left',
  rudderRight: 'Rudder right',
  throttleUp: 'Throttle up',
  throttleDown: 'Throttle down',
  weaponSrm: 'Select SRM',
  weaponMrm: 'Select MRM',
};
const AXIS_LABELS: Readonly<Record<AxisRole, string>> = { roll: 'Roll', pitch: 'Pitch', yaw: 'Rudder', throttle: 'Throttle' };
const GRAPHICS_LABELS: Readonly<Record<GraphicsSetting, string>> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };
const STEERING_LABELS: Readonly<Record<ControlMode, string>> = { 'mouse-aim': 'Mouse aim', direct: 'Keyboard' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

let radioGroupId = 0;

/** A row of radio choices drawn like the title screen's designation boxes. */
function radios<T extends string>(legend: string, choices: readonly [T, string][], value: T, onChange: (v: T) => void): HTMLFieldSetElement {
  const set = el('fieldset', 'pick');
  set.appendChild(el('legend', 'eyebrow', legend));
  const row = el('div', 'options');
  const name = `settings-radio-${radioGroupId++}`;
  for (const [v, label] of choices) {
    const input = el('input', 'sr-only');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}-${v}`;
    input.checked = v === value;
    input.addEventListener('change', () => input.checked && onChange(v));
    const l = el('label', 'option');
    l.htmlFor = input.id;
    l.appendChild(el('span', 'option-name', label));
    row.append(input, l);
  }
  set.appendChild(row);
  return set;
}

function slider(label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void): HTMLLabelElement {
  const row = el('label', 'setting-row');
  const name = el('span', 'setting-name', label);
  const input = el('input', 'setting-range');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', 'setting-value', format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  row.append(name, input, out);
  return row;
}

function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const row = el('label', 'setting-row setting-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(input, el('span', 'setting-name', label));
  return row;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The settings dialog (spec §24, M1c): every change applies at once and is saved. Opened from the title screen and
 * the pause menu. Returns a function that closes it; `onClose` runs however it closes.
 */
export function openSettings(root: HTMLElement, store: SettingsStore, tab: SettingsTab = 'controls', onClose?: () => void): () => void {
  const dialog = el('dialog', 'sheet settings');
  dialog.setAttribute('aria-labelledby', 'settings-title');
  const title = el('h2', 'sheet-title', 'Settings');
  title.id = 'settings-title';
  const tabBar = el('div', 'tabs');
  tabBar.setAttribute('role', 'tablist');
  const body = el('div', 'tab-body');
  const close = button('Done', 'button', () => dialog.close());
  dialog.append(title, tabBar, body, close);

  let current: SettingsTab = tab;
  /** per-frame work of the open tab (live gamepad readouts) */
  let tick: (() => void) | null = null;
  /** a pending "press a key" capture, cancelled when the tab changes */
  let cancelCapture: (() => void) | null = null;
  let raf = 0;

  const tabButtons = TABS.map(([id, label]) => {
    const b = button(label, 'tab', () => show(id));
    b.setAttribute('role', 'tab');
    tabBar.appendChild(b);
    return [id, b] as const;
  });

  function show(id: SettingsTab): void {
    cancelCapture?.();
    current = id;
    tick = null;
    for (const [tid, b] of tabButtons) b.setAttribute('aria-selected', String(tid === id));
    body.replaceChildren(...renderTab(id));
  }

  function renderTab(id: SettingsTab): HTMLElement[] {
    const s = store.current;
    switch (id) {
      case 'controls':
        return [
          radios('Steering', [['mouse-aim', STEERING_LABELS['mouse-aim']], ['direct', STEERING_LABELS.direct]], s.controlMode, (m) => store.update({ controlMode: m })),
          el('p', 'sheet-note', 'Mouse aim: point where you want to go and the jet flies there. Keyboard: fly the stick yourself with the pitch and roll keys.'),
          slider('Mouse sensitivity', MOUSE_SENSITIVITY_RANGE.min, MOUSE_SENSITIVITY_RANGE.max, 0.05, s.mouseSensitivity, percent, (v) => store.update({ mouseSensitivity: v })),
          checkbox('Invert mouse (mouse up = nose down)', s.invertY, (v) => store.update({ invertY: v })),
        ];
      case 'keys':
        return renderKeys();
      case 'gamepad':
        return renderGamepad();
      case 'display':
        return [
          radios('Graphics', GRAPHICS_SETTINGS.map((g) => [g, GRAPHICS_LABELS[g]] as [GraphicsSetting, string]), s.graphics, (g) => store.update({ graphics: g })),
          el('p', 'sheet-note', s.autoGraphics ? `Auto lowers the detail if the game runs slowly. It last settled on ${GRAPHICS_LABELS[s.autoGraphics]}.` : 'Auto lowers the detail if the game runs slowly.'),
          radios('HUD color', HUD_COLORS.map((c) => [c, c[0].toUpperCase() + c.slice(1)] as [HudColor, string]), s.hudColor, (c) => store.update({ hudColor: c })),
          slider('HUD size', HUD_SCALE_RANGE.min, HUD_SCALE_RANGE.max, 0.05, s.hudScale, percent, (v) => store.update({ hudScale: v })),
          radios('Team colours', [['standard', 'Blue / red'], ['colorblind', 'Blue / orange']] as const, s.teamColors, (c) => store.update({ teamColors: c })),
          checkbox('Reduce motion (camera shake, G effect, kill cam)', s.reduceMotion, (v) => store.update({ reduceMotion: v })),
          checkbox('Reduce flashing (steady warnings, no strobe lights)', s.reduceFlashing, (v) => store.update({ reduceFlashing: v })),
        ];
      case 'sound':
        return [
          checkbox('Sound on', s.sound, (v) => store.update({ sound: v })),
          slider('Volume', 0, 1, 0.05, s.volume, percent, (v) => store.update({ volume: v })),
          checkbox('Music', s.music, (v) => store.update({ music: v })),
          slider('Music volume', 0, 1, 0.05, s.musicVolume, percent, (v) => store.update({ musicVolume: v })),
          el('p', 'sheet-note', 'Every warning sound is also shown as text on the HUD: MISSILE, SRM TRK, SRM LOCK and HIT.'),
        ];
    }
  }

  function renderKeys(): HTMLElement[] {
    const list = el('dl', 'keys rebind');
    for (const action of BINDABLE_ACTIONS) {
      const keysText = keysLabel(store.current.keys[action]);
      const change = button(keysText, 'keycap', () => captureKey(action, change));
      change.setAttribute('aria-label', `${ACTION_LABELS[action]}: ${keysText}. Change`);
      const dd = el('dd');
      dd.appendChild(change);
      list.append(el('dt', undefined, ACTION_LABELS[action]), dd);
    }
    return [
      el('p', 'sheet-note', 'Click a key, then press the new one. A key another action uses swaps over. Esc always pauses.'),
      list,
      button('Reset keys', 'link', () => {
        store.update({ keys: DEFAULT_BINDINGS });
        show('keys');
      }),
    ];
  }

  function captureKey(action: KeyAction, target: HTMLButtonElement): void {
    cancelCapture?.();
    target.textContent = 'Press a key…';
    target.classList.add('listening');
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') return finish();
      if (!canBind(e.code) || e.ctrlKey || e.metaKey) return;
      store.update({ keys: rebind(store.current.keys, action, e.code) });
      finish();
      show('keys');
    };
    const finish = () => {
      window.removeEventListener('keydown', onKey, true);
      cancelCapture = null;
      target.classList.remove('listening');
      target.textContent = keysLabel(store.current.keys[action]);
    };
    window.addEventListener('keydown', onKey, true);
    cancelCapture = finish;
  }

  function renderGamepad(): HTMLElement[] {
    const status = el('p', 'pad-status');
    const detail = el('div', 'pad-detail');
    let shownLayout = '';
    let latest: PadState | null = null;
    let mode: { kind: 'idle' } | { kind: 'calibrate'; rec: CalibrationRecorder } | { kind: 'axis'; role: AxisRole; rest: PadState } | { kind: 'button'; action: PadAction; prev: PadState } = { kind: 'idle' };
    const meters = new Map<number, HTMLElement>();

    const renderCustom = (first: PadState) => {
      const now = () => latest ?? first;
      const g = store.current.gamepad;
      const rows: HTMLElement[] = [el('p', 'sheet-note', 'This device has no standard layout (a flight stick, for example). Assign its axes and buttons, then calibrate.')];
      const axes = el('dl', 'keys rebind');
      for (const role of AXIS_ROLES) {
        const index = g.custom.axes[role];
        const dd = el('dd', 'pad-axis');
        const meter = el('span', 'meter');
        meter.appendChild(el('span', 'meter-fill'));
        if (index >= 0) meters.set(index, meter);
        dd.append(
          button(index >= 0 ? `Axis ${index + 1}` : 'None', 'keycap', () => {
            mode = { kind: 'axis', role, rest: now() };
            detail.querySelectorAll('.listening').forEach((n) => n.classList.remove('listening'));
            (dd.firstElementChild as HTMLElement).textContent = 'Move it…';
            (dd.firstElementChild as HTMLElement).classList.add('listening');
          }),
          meter,
          checkbox('Invert', g.custom.invert[role], (v) => store.update({ gamepad: { ...g, custom: { ...g.custom, invert: { ...g.custom.invert, [role]: v } } } })),
        );
        axes.append(el('dt', undefined, AXIS_LABELS[role]), dd);
      }
      const buttons = el('dl', 'keys rebind');
      for (const action of PAD_ACTIONS) {
        const index = g.custom.buttons[action];
        const dd = el('dd');
        const b = button(index >= 0 ? `Button ${index + 1}` : 'None', 'keycap', () => {
          mode = { kind: 'button', action, prev: now() };
          b.textContent = 'Press it…';
          b.classList.add('listening');
        });
        dd.appendChild(b);
        buttons.append(el('dt', undefined, PAD_ACTION_LABELS[action]), dd);
      }
      const calibrate = button(g.calibration.length > 0 ? 'Calibrate again' : 'Calibrate', 'button secondary', () => {
        if (mode.kind === 'calibrate') {
          const throttle = store.current.gamepad.custom.axes.throttle;
          const calibration = mode.rec.finish(now(), throttle >= 0 ? [throttle] : []);
          mode = { kind: 'idle' };
          store.update({ gamepad: { ...store.current.gamepad, calibration } });
          shownLayout = '';
          return;
        }
        mode = { kind: 'calibrate', rec: new CalibrationRecorder() };
        calibrate.textContent = 'Done';
        hint.textContent = 'Move the stick, rudder and throttle through their full travel. Then let go of the stick and rudder and press Done.';
      });
      const hint = el('p', 'sheet-note', g.calibration.length > 0 ? 'Calibrated.' : 'Not calibrated: raw axis values are used.');
      const reset = button('Reset assignments', 'link', () => {
        store.update({ gamepad: DEFAULT_PAD_SETTINGS });
        shownLayout = '';
      });
      rows.push(el('h3', 'eyebrow', 'Axes'), axes, el('h3', 'eyebrow', 'Buttons'), buttons, calibrate, hint, reset);
      return rows;
    };

    tick = () => {
      const state = pollGamepad();
      latest = state;
      const layout = state ? (state.mapping === 'standard' ? `standard:${state.id}` : `custom:${state.id}`) : 'none';
      if (layout !== shownLayout) {
        shownLayout = layout;
        meters.clear();
        mode = { kind: 'idle' };
        if (!state) {
          status.textContent = 'No controller found. Connect one and press any of its buttons.';
          detail.replaceChildren();
        } else if (state.mapping === 'standard') {
          status.textContent = `Connected: ${state.id}`;
          const list = el('dl', 'keys');
          for (const [k, a] of GAMEPAD_HELP) list.append(el('dt', undefined, k), el('dd', undefined, a));
          detail.replaceChildren(list);
        } else {
          status.textContent = `Connected: ${state.id}`;
          detail.replaceChildren(...renderCustom(state));
        }
      }
      if (!state || state.mapping === 'standard') return;
      for (const [i, meter] of meters) {
        const v = state.axes[i] ?? 0;
        (meter.firstElementChild as HTMLElement).style.transform = `scaleX(${(v + 1) / 2})`;
      }
      const g = store.current.gamepad;
      if (mode.kind === 'calibrate') {
        mode.rec.sample(state);
      } else if (mode.kind === 'axis') {
        const axis = mostMovedAxis(mode.rest, state);
        if (axis >= 0) {
          store.update({ gamepad: { ...g, custom: { ...g.custom, axes: { ...g.custom.axes, [mode.role]: axis } } } });
          shownLayout = '';
        }
      } else if (mode.kind === 'button') {
        const index = firstNewButton(mode.prev, state);
        if (index >= 0) {
          store.update({ gamepad: { ...g, custom: { ...g.custom, buttons: { ...g.custom.buttons, [mode.action]: index } } } });
          shownLayout = '';
        } else {
          mode.prev = state;
        }
      }
    };
    return [status, detail];
  }

  const loop = () => {
    tick?.();
    raf = requestAnimationFrame(loop);
  };

  const onClosed = () => {
    cancelCapture?.();
    cancelAnimationFrame(raf);
    dialog.remove();
    onClose?.();
  };
  dialog.addEventListener('close', onClosed, { once: true });
  // Keys pressed in the dialog must not fly the jet or toggle the pause menu underneath.
  dialog.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' && e.code !== 'Tab' && e.code !== 'Enter' && e.code !== 'Space') e.stopPropagation();
  });

  root.appendChild(dialog);
  show(current);
  dialog.showModal();
  raf = requestAnimationFrame(loop);
  return () => {
    if (dialog.open) dialog.close();
  };
}
