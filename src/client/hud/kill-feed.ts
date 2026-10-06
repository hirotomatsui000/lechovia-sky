import type { TeamId } from '../../shared/data/aircraft/types.ts';
import type { DeathCause } from '../../shared/world/events.ts';

export interface KillFeedLine {
  text: string;
  /** team of the pilot who gets the credit, or of the victim when nobody does */
  team: TeamId;
  involvesLocal: boolean;
  ageS: number;
}

export const KILL_FEED_LIFETIME_S = 6;
export const KILL_FEED_MAX_LINES = 5;

const WEAPON_TEXT: Partial<Record<DeathCause, string>> = { cannon: 'gun', missile: 'missile', crash: 'forced a crash', blackout: 'forced a G-LOC' };
const SOLO_TEXT: Record<DeathCause, string> = {
  crash: 'crashed',
  blackout: 'blacked out and crashed',
  collision: 'collided',
  boundary: 'left the combat area',
  cannon: 'was shot down',
  missile: 'was shot down',
};

/** One kill-feed line, for example "Pilot → [BOT] Grom · missile" or "[BOT] Grom crashed". */
export function describeDeath(victim: string, killer: string | null, cause: DeathCause): string {
  if (killer === null) return `${victim} ${SOLO_TEXT[cause]}`;
  return `${killer} → ${victim} · ${WEAPON_TEXT[cause] ?? cause}`;
}

export class KillFeed {
  readonly lines: KillFeedLine[] = [];

  clear(): void {
    this.lines.length = 0;
  }

  add(text: string, team: TeamId, involvesLocal: boolean): void {
    this.lines.unshift({ text, team, involvesLocal, ageS: 0 });
    if (this.lines.length > KILL_FEED_MAX_LINES) this.lines.length = KILL_FEED_MAX_LINES;
  }

  update(dt: number): void {
    for (const line of this.lines) line.ageS += dt;
    while (this.lines.length > 0 && this.lines[this.lines.length - 1].ageS > KILL_FEED_LIFETIME_S) this.lines.pop();
  }
}
