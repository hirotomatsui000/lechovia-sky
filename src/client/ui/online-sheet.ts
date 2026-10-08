import { DIFFICULTIES, type DifficultyId } from '../../shared/ai/difficulty.ts';
import type { MapId } from '../../shared/data/maps/registry.ts';
import { type OnlineModeId, ONLINE_MODES, parseRoomCode, ROOM_CODE_LENGTH, type RoomSettings, sanitizeRoomSettings } from '../../shared/net/protocol.ts';
import type { EnvironmentSettings } from '../../shared/world/time-of-day.ts';
import { choiceGroup, el } from './choice-group.ts';
import { MISSION_LABELS } from './records-format.ts';
import { loadSetting, saveSetting } from './storage.ts';

/** What the title screen gives a room: the world chosen on it (map, time, weather). */
export interface OnlineWorld {
  map: MapId;
  environment: EnvironmentSettings;
}

export type OnlineStart = { role: 'host'; settings: RoomSettings } | { role: 'join'; code: string };

const SEATS = ['1', '2', '4'] as const;
type Seats = (typeof SEATS)[number];

/**
 * The title screen's Online sheet (revision 28): host a room (mode, seats per side filled by AI pilots, their skill;
 * the world comes from the title screen) or join one with its code. `?join=CODE` opens it with the code filled in.
 */
export function onlineSheet(world: () => OnlineWorld, onGo: (start: OnlineStart) => void): { dialog: HTMLDialogElement; open(code?: string, error?: string): void } {
  const dialog = el('dialog', 'sheet online-sheet');
  dialog.setAttribute('aria-labelledby', 'online-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Online');
  title.id = 'online-title';
  title.tabIndex = -1;
  const note = el(
    'p',
    'sheet-note',
    "Fly with friends: one of you hosts a room, the others join it with its code. The match runs in the host's browser, so the host keeps the game open in front. Empty seats are flown by AI pilots.",
  );
  const error = el('p', 'notice online-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  // Host.
  const host = el('section', 'online-part');
  host.appendChild(el('h3', 'eyebrow', 'Host a room'));
  let mode: OnlineModeId = ONLINE_MODES.find((m) => m === loadSetting<unknown>('onlineMode', 'team-deathmatch')) ?? 'team-deathmatch';
  let seats: Seats = SEATS.find((s) => s === String(loadSetting<unknown>('onlineSeats', '2'))) ?? '2';
  let skill: DifficultyId = (Object.keys(DIFFICULTIES) as DifficultyId[]).find((d) => d === loadSetting<unknown>('onlineSkill', 'veteran')) ?? 'veteran';
  const modes = choiceGroup(
    'online-mode',
    'Mode',
    ONLINE_MODES.map((m) => ({ value: m, label: MISSION_LABELS[m] })),
    mode,
    (m) => {
      mode = m;
      saveSetting('onlineMode', m);
    },
  );
  const seatGroup = choiceGroup(
    'online-seats',
    'Pilots per side',
    SEATS.map((n) => ({ value: n, label: `${n} v ${n}` })),
    seats,
    (n) => {
      seats = n;
      saveSetting('onlineSeats', n);
    },
  );
  seatGroup.title = 'Seats on each side: the ones no one takes are flown by AI pilots';
  const skillGroup = choiceGroup(
    'online-skill',
    'AI pilots',
    Object.values(DIFFICULTIES).map((d) => ({ value: d.id, label: d.label })),
    skill,
    (d) => {
      skill = d;
      saveSetting('onlineSkill', d);
    },
  );
  const hostButton = el('button', 'button', 'Host a room');
  hostButton.type = 'button';
  const hostRow = el('div', 'online-row');
  hostRow.append(seatGroup, skillGroup);
  host.append(modes, hostRow, el('p', 'sheet-note', 'Map, start and time of day: as chosen on the title screen. Your jet: the one selected there.'), hostButton);

  // Join.
  const join = el('section', 'online-part');
  join.appendChild(el('h3', 'eyebrow', 'Join a room'));
  const codeLabel = el('label', 'online-code');
  codeLabel.appendChild(el('span', 'sr-only', 'Room code'));
  const code = el('input', 'online-code-input');
  code.placeholder = 'ROOM CODE';
  code.maxLength = 64;
  code.autocomplete = 'off';
  code.spellcheck = false;
  code.setAttribute('autocapitalize', 'characters');
  codeLabel.appendChild(code);
  const joinButton = el('button', 'button', 'Join');
  joinButton.type = 'button';
  const joinRow = el('div', 'online-join-row');
  joinRow.append(codeLabel, joinButton);
  join.append(joinRow, el('p', 'sheet-note', `The ${ROOM_CODE_LENGTH}-letter code the host gives you, or their invite link.`));

  const privacy = el(
    'p',
    'sheet-note',
    'Online play links the browsers in a room directly (WebRTC): they meet through public relays, and the others can see your IP address, as in most peer-to-peer games. Some networks do not allow direct links.',
  );
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  form.append(title, note, error, host, join, privacy, close);
  dialog.appendChild(form);

  const showError = (text: string | undefined) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };
  const tryJoin = () => {
    const parsed = parseRoomCode(code.value);
    if (!parsed) {
      showError(`A room code is ${ROOM_CODE_LENGTH} letters and digits, like K7QF3M.`);
      code.focus();
      return;
    }
    dialog.close();
    onGo({ role: 'join', code: parsed });
  };
  hostButton.addEventListener('click', () => {
    const w = world();
    dialog.close();
    onGo({ role: 'host', settings: sanitizeRoomSettings({ mode, map: w.map, environment: w.environment, teamSize: Number(seats), botSkill: skill }) });
  });
  joinButton.addEventListener('click', tryJoin);
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryJoin();
    }
  });
  code.addEventListener('input', () => showError(undefined));

  return {
    dialog,
    open(prefill?: string, message?: string) {
      if (prefill) code.value = prefill;
      showError(message);
      dialog.showModal();
      if (prefill) joinButton.focus();
      else title.focus();
    },
  };
}
