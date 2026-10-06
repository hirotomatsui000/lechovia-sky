import type { DeathCause } from '../shared/world/events.ts';

/** The headline when the local pilot goes down. */
export function deathText(cause: DeathCause, killer: string | null): string {
  // Blacked out under G (revision 21): the kill feed says who forced it.
  if (cause === 'blackout') return 'BLACKED OUT (G-LOC)';
  if (killer) return `SHOT DOWN BY ${killer}`;
  if (cause === 'boundary') return 'LEFT THE COMBAT AREA';
  if (cause === 'collision') return 'MID-AIR COLLISION';
  return 'CRASHED';
}

/**
 * What follows it: the match seconds until the next jet (from the World's own clock, so a slow frame rate or a pause
 * never shows 0 while the wait goes on), or that the side has no jets left (Strike).
 */
export function respawnText(respawnInS: number | null): string {
  return respawnInS === null ? 'NO JETS LEFT' : `RESPAWN IN ${Math.max(0, Math.ceil(respawnInS))}`;
}
