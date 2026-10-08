import { describe, expect, it } from 'vitest';
import { MAX_PILOTS, newRoomCode, parseClientJson, parseRoomCode, ProtocolError, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, sanitizeCallsign, sanitizeRoomSettings } from './protocol.ts';

describe('online protocol (revision 28)', () => {
  it('parses what pilots send and folds bad values into safe ones', () => {
    expect(parseClientJson(JSON.stringify({ type: 'hello', version: 5, callsign: '<b>Ace</b>', aircraftId: 'kestrel', start: 'runway' }))).toEqual({ type: 'hello', version: 5, callsign: 'bAceb', aircraftId: 'kestrel', start: 'runway' });
    expect(parseClientJson(JSON.stringify({ type: 'hello', version: 5, aircraftId: 'kestrel', start: 'moon' }))).toMatchObject({ callsign: 'Pilot', start: 'air' });
    expect(parseClientJson('{"type":"world","weather":"rain","hour":25,"clockRunning":true}')).toEqual({ type: 'world', weather: 'rain', hour: 1, clockRunning: true });
    expect(parseClientJson('{"type":"flyFrom","x":1,"z":-2}')).toEqual({ type: 'flyFrom', x: 1, z: -2 });
  });

  it('throws on anything malformed', () => {
    for (const bad of ['nope', '[]', '{"type":"hello"}', '{"type":"chat","index":9}', '{"type":"world","weather":"snow","hour":1}', '{"type":"x"}', 'x'.repeat(5000)]) {
      expect(() => parseClientJson(bad), bad).toThrow(ProtocolError);
    }
  });

  it('keeps room settings to known values', () => {
    expect(sanitizeRoomSettings({ mode: 'strike', map: 'lechovia', teamSize: 99, botSkill: 'god', environment: { weather: 'rain', startHour: 23 } })).toEqual({
      mode: 'strike',
      map: 'test-range',
      teamSize: MAX_PILOTS,
      botSkill: 'veteran',
      environment: { weather: 'rain', startHour: 23, clockRunning: false },
    });
    expect(sanitizeRoomSettings(null)).toMatchObject({ mode: 'team-deathmatch', map: 'lechovia', teamSize: 4 });
  });

  it('makes room codes that read clearly, and reads them back from text or an invite link', () => {
    let k = 0;
    const code = newRoomCode(() => (k++ * 0.37) % 1);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    expect(parseRoomCode(code.toLowerCase())).toBe(code);
    expect(parseRoomCode('ab3-k7m')).toBe('AB3K7M');
    expect(parseRoomCode('https://lechovia-skies.github.io/._./?join=AB3K7M')).toBe('AB3K7M');
    expect(parseRoomCode('AB0K7M')).toBeNull();
    expect(parseRoomCode('ABC')).toBeNull();
  });

  it('cleans callsigns', () => {
    expect(sanitizeCallsign('  Red-1  ')).toBe('Red-1');
    expect(sanitizeCallsign(42)).toBe('Pilot');
  });
});
