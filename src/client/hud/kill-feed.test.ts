import { describe, expect, it } from 'vitest';
import { describeDeath, KILL_FEED_LIFETIME_S, KILL_FEED_MAX_LINES, KillFeed } from './kill-feed.ts';

describe('kill feed', () => {
  it('describes kills, maneuver kills and solo deaths', () => {
    expect(describeDeath('[BOT] Grom', 'Pilot', 'missile')).toBe('Pilot → [BOT] Grom · missile');
    expect(describeDeath('[BOT] Grom', 'Pilot', 'cannon')).toBe('Pilot → [BOT] Grom · gun');
    expect(describeDeath('Pilot', '[BOT] Grom', 'crash')).toBe('[BOT] Grom → Pilot · forced a crash');
    expect(describeDeath('Pilot', null, 'crash')).toBe('Pilot crashed');
    expect(describeDeath('Pilot', null, 'blackout')).toBe('Pilot blacked out and crashed');
    expect(describeDeath('Pilot', '[BOT] Grom', 'blackout')).toBe('[BOT] Grom → Pilot · forced a G-LOC');
    expect(describeDeath('Pilot', null, 'boundary')).toBe('Pilot left the combat area');
  });

  it('shows the newest line first, keeps a few and lets them expire', () => {
    const feed = new KillFeed();
    for (let i = 0; i < KILL_FEED_MAX_LINES + 2; i++) feed.add(`line ${i}`, 'usa', false);
    expect(feed.lines).toHaveLength(KILL_FEED_MAX_LINES);
    expect(feed.lines[0].text).toBe(`line ${KILL_FEED_MAX_LINES + 1}`);
    feed.update(KILL_FEED_LIFETIME_S - 1);
    feed.add('fresh', 'russia', true);
    feed.update(1.5);
    expect(feed.lines.map((l) => l.text)).toEqual(['fresh']);
  });
});
