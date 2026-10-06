import { describe, expect, it } from 'vitest';
import { deathText, respawnText } from './death-text.ts';

describe('death message', () => {
  it('names the killer, or what went wrong', () => {
    expect(deathText('cannon', 'Grom')).toBe('SHOT DOWN BY Grom');
    expect(deathText('boundary', null)).toBe('LEFT THE COMBAT AREA');
    expect(deathText('collision', null)).toBe('MID-AIR COLLISION');
    expect(deathText('crash', null)).toBe('CRASHED');
    // Blacked out under G (revision 21), whoever gets the credit.
    expect(deathText('blackout', null)).toBe('BLACKED OUT (G-LOC)');
    expect(deathText('blackout', 'Grom')).toBe('BLACKED OUT (G-LOC)');
  });

  it('counts down the match seconds to the next jet, or says none is left', () => {
    expect(respawnText(4.2)).toBe('RESPAWN IN 5');
    expect(respawnText(0)).toBe('RESPAWN IN 0');
    expect(respawnText(null)).toBe('NO JETS LEFT');
  });
});
