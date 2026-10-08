import { el } from './choice-group.ts';

/** What the room panel shows. */
export interface RoomInfo {
  code: string;
  /** "You are hosting" or "Hosted by …" */
  line: string;
  invite: string;
}

/**
 * The room in the pause menu (revision 28): its code, who hosts it and how many fly in it, and a button that copies the
 * invite link for friends.
 */
export function onlinePanel(info: () => RoomInfo): { element: HTMLElement; refresh(): void } {
  const box = el('div', 'online-panel');
  const code = el('p', 'online-panel-code');
  const line = el('p', 'online-panel-line');
  const copy = el('button', 'button secondary', 'Copy invite link');
  copy.type = 'button';
  const done = el('span', 'online-panel-done');
  done.setAttribute('aria-live', 'polite');
  const row = el('div', 'online-panel-row');
  row.append(copy, done);
  box.append(el('p', 'eyebrow', 'Room'), code, line, row);
  copy.addEventListener('click', () => {
    const link = info().invite;
    const shown = () => {
      done.textContent = 'Copied';
      setTimeout(() => (done.textContent = ''), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(shown, () => (done.textContent = link));
    } else {
      done.textContent = link;
    }
  });
  const refresh = () => {
    const i = info();
    code.textContent = i.code;
    line.textContent = i.line;
    done.textContent = '';
  };
  refresh();
  return { element: box, refresh };
}
