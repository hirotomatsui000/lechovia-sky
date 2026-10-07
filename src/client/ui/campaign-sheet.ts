import { listAircraft, TEAM_NAMES } from '../../shared/data/aircraft/registry.ts';
import type { TeamId } from '../../shared/data/aircraft/types.ts';
import { type CampaignPilot, campaignStart, missionFacts } from '../campaign/flow.ts';
import { CAMPAIGN } from '../campaign/missions.ts';
import { type CampaignProgress, clearedCount, isUnlocked, loadCampaign, missionProgress, nextMissionIndex } from '../campaign/progress.ts';
import { loadCareer } from '../career.ts';
import { careerXp, isUnlocked as jetUnlocked, levelForXp, unlockLevel } from '../progression.ts';
import { choiceGroup, el } from './choice-group.ts';
import type { StartOptions } from './menu.ts';

const TEAMS: readonly TeamId[] = ['usa', 'russia'];

/** One line on how a pilot has done on a mission so far. */
export function progressLine(p: CampaignProgress, side: TeamId, index: number): string {
  if (!isUnlocked(p, side, index)) return `Clear mission ${index} to open this one.`;
  const r = missionProgress(p, side, CAMPAIGN[index].id);
  if (!r.cleared) return r.attempts === 0 ? 'Not flown yet.' : `Not cleared yet · ${r.attempts} ${r.attempts === 1 ? 'attempt' : 'attempts'}`;
  const deaths = r.fewestDeaths === null ? '' : ` · fewest deaths ${r.fewestDeaths}`;
  return `Cleared · ${r.attempts} ${r.attempts === 1 ? 'attempt' : 'attempts'} · most kills ${r.bestKills}${deaths}`;
}

/**
 * The title screen's Campaign sheet (revision 18): the side to fly for, the nine missions with what is cleared, open and
 * locked, and the chosen mission's briefing with a jet to fly it in. Progress is read fresh each time it opens. `pilot`
 * gives the title screen's callsign, steering and jet (the jet only picks the side for a first campaign).
 */
export function campaignSheet(pilot: () => CampaignPilot, onFly: (options: StartOptions) => void): { dialog: HTMLDialogElement; open(): void } {
  const dialog = el('dialog', 'sheet campaign-sheet');
  dialog.setAttribute('aria-labelledby', 'campaign-title');
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', 'sheet-title', 'Campaign');
  title.id = 'campaign-title';
  // Opening focuses the title, so the sheet starts at the top.
  title.tabIndex = -1;
  const note = el(
    'p',
    'sheet-note',
    'Nine missions over Lechovia, flown in order: clearing one opens the next. Progress is kept in this browser, separately for each side.',
  );
  const sideSlot = el('div');
  const body = el('div', 'campaign-body');
  const list = el('ol', 'mission-list');
  list.setAttribute('aria-label', 'Missions');
  const brief = el('section', 'briefing');
  brief.setAttribute('aria-live', 'polite');
  body.append(list, brief);
  const buttons = el('div', 'records-buttons');
  const fly = el('button', 'button', 'Fly mission');
  fly.type = 'button';
  const close = el('button', 'link', 'Close');
  close.value = 'close';
  buttons.append(fly, close);
  form.append(title, note, sideSlot, body, buttons);
  dialog.appendChild(form);

  let progress: CampaignProgress = loadCampaign();
  let side: TeamId = 'usa';
  let index = 0;
  let jet = CAMPAIGN[0].jet.usa;

  const renderSides = () => {
    sideSlot.replaceChildren(
      choiceGroup(
        'campaign-side',
        'Fly for',
        TEAMS.map((t) => ({ value: t, label: TEAM_NAMES[t], kicker: `${clearedCount(progress, t)} of ${CAMPAIGN.length} cleared` })),
        side,
        (t) => {
          side = t;
          index = nextMissionIndex(progress, side);
          jet = CAMPAIGN[index].jet[side];
          renderList();
          renderBrief();
        },
      ),
    );
  };

  const renderList = () => {
    list.replaceChildren(
      ...CAMPAIGN.map((m, i) => {
        const li = el('li');
        const open = isUnlocked(progress, side, i);
        const cleared = missionProgress(progress, side, m.id).cleared;
        const b = el('button', 'mission-item');
        b.type = 'button';
        b.disabled = !open;
        if (i === index) b.setAttribute('aria-current', 'true');
        const status = cleared ? 'Cleared' : open ? (i === nextMissionIndex(progress, side) ? 'Next' : 'Open') : 'Locked';
        b.classList.add(`is-${status.toLowerCase()}`);
        b.append(el('span', 'mission-number', String(i + 1)), el('span', 'mission-name', m.title), el('span', 'mission-status', status));
        b.addEventListener('click', () => {
          index = i;
          jet = m.jet[side];
          renderList();
          renderBrief();
          list.querySelectorAll('button')[i]?.focus();
        });
        li.appendChild(b);
        return li;
      }),
    );
  };

  const renderBrief = () => {
    const m = CAMPAIGN[index];
    const level = levelForXp(careerXp(loadCareer()));
    const facts = el('ul', 'briefing-facts');
    for (const f of missionFacts(m, side)) facts.appendChild(el('li', undefined, f));
    const jets = choiceGroup(
      'campaign-jet',
      'Jet',
      // The mission lends its own jet; the others are the pilot's open ones (revision 26).
      listAircraft(side).map((a) =>
        a.id === m.jet[side] || jetUnlocked(a.id, level)
          ? { value: a.id, label: a.name, kicker: a.id === m.jet[side] ? 'Suggested' : undefined }
          : { value: a.id, label: a.name, badge: `🔒 Lv ${unlockLevel(a.id)}`, disabled: true, title: `Unlocks at pilot level ${unlockLevel(a.id)}` },
      ),
      jet,
      (id) => {
        jet = id;
      },
    );
    brief.replaceChildren(
      el('p', 'eyebrow', `Mission ${index + 1} of ${CAMPAIGN.length}`),
      el('h3', 'briefing-title', m.title),
      facts,
      el('p', 'briefing-text', m.briefing(side)),
      el('p', 'sheet-note', progressLine(progress, side, index)),
      jets,
    );
    fly.disabled = !isUnlocked(progress, side, index);
  };

  fly.addEventListener('click', () => {
    const m = CAMPAIGN[index];
    if (!isUnlocked(progress, side, index)) return;
    dialog.close();
    const p = pilot();
    onFly(campaignStart(m, side, { ...p, aircraftId: jet }));
  });

  return {
    dialog,
    open() {
      progress = loadCampaign();
      const flown = TEAMS.some((t) => CAMPAIGN.some((m) => missionProgress(progress, t, m.id).attempts > 0));
      // A pilot who has not flown the campaign yet starts with the side of the jet chosen on the title screen.
      const chosen = listAircraft().find((a) => a.id === pilot().aircraftId)?.team ?? 'usa';
      side = flown ? progress.side : chosen;
      index = nextMissionIndex(progress, side);
      jet = CAMPAIGN[index].jet[side];
      renderSides();
      renderList();
      renderBrief();
      dialog.showModal();
      title.focus();
      dialog.scrollTop = 0;
    },
  };
}
