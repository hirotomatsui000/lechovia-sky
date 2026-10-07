import { describe, expect, it } from 'vitest';
import { canFullscreen, type FullscreenDocument, fullscreenLabel, isFullscreen, toggleFullscreen } from './fullscreen.ts';

/** A stand-in document: fullscreen on the page element, or off. */
function fakeDocument(enabled = true): FullscreenDocument & { fullscreenElement: Element | null } {
  const d = {
    fullscreenElement: null as Element | null,
    fullscreenEnabled: enabled,
    documentElement: {
      requestFullscreen: async () => {
        d.fullscreenElement = {} as Element;
      },
    },
    exitFullscreen: async () => {
      d.fullscreenElement = null;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return d;
}

describe('fullscreen (revision 26)', () => {
  it('goes into fullscreen and back out', async () => {
    const d = fakeDocument();
    expect(canFullscreen(d)).toBe(true);
    expect(isFullscreen(d)).toBe(false);
    await toggleFullscreen(d);
    expect(isFullscreen(d)).toBe(true);
    await toggleFullscreen(d);
    expect(isFullscreen(d)).toBe(false);
  });

  it('names what the button will do', () => {
    expect(fullscreenLabel(false)).toBe('Fullscreen');
    expect(fullscreenLabel(true)).toBe('Exit fullscreen');
  });

  it('knows where it is not available, and survives a refusal', async () => {
    expect(canFullscreen(fakeDocument(false))).toBe(false);
    expect(canFullscreen(null)).toBe(false);
    const d = fakeDocument();
    d.documentElement.requestFullscreen = () => Promise.reject(new Error('not allowed'));
    await expect(toggleFullscreen(d)).resolves.toBeUndefined();
    expect(isFullscreen(d)).toBe(false);
  });

  it('uses the webkit names on older Safari', async () => {
    let on = false;
    const d: FullscreenDocument = {
      get webkitFullscreenElement() {
        return on ? ({} as Element) : null;
      },
      webkitFullscreenEnabled: true,
      documentElement: { webkitRequestFullscreen: () => void (on = true) },
      webkitExitFullscreen: () => void (on = false),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    expect(canFullscreen(d)).toBe(true);
    await toggleFullscreen(d);
    expect(isFullscreen(d)).toBe(true);
    await toggleFullscreen(d);
    expect(isFullscreen(d)).toBe(false);
  });
});
