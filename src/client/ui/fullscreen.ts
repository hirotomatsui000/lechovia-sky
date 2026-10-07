/*
 * Fullscreen (revision 26, at the owner's request): a button on the title screen and in the pause menu puts the whole
 * page in fullscreen and back. Esc (the browser's own way out) also leaves it, and pauses the game as before.
 */

/** The parts of `document` fullscreen needs, so tests can stand in for it; Safari before 16.4 has the webkit names. */
export interface FullscreenDocument {
  readonly fullscreenElement?: Element | null;
  readonly webkitFullscreenElement?: Element | null;
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  readonly documentElement: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

const doc = (): FullscreenDocument | null => (typeof document === 'undefined' ? null : (document as unknown as FullscreenDocument));

/** Whether this browser can put the page in fullscreen (iPhone Safari cannot). */
export function canFullscreen(d: FullscreenDocument | null = doc()): boolean {
  if (!d) return false;
  const el = d.documentElement;
  return (d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false) && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function');
}

export function isFullscreen(d: FullscreenDocument | null = doc()): boolean {
  return !!d && (d.fullscreenElement ?? d.webkitFullscreenElement ?? null) !== null;
}

/** Into fullscreen, or out of it. A browser that refuses (no user gesture, a policy) leaves things as they are. */
export async function toggleFullscreen(d: FullscreenDocument | null = doc()): Promise<void> {
  if (!d) return;
  try {
    if (isFullscreen(d)) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else {
      const el = d.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    }
  } catch {
    // Refused: nothing to undo.
  }
}

export function fullscreenLabel(on: boolean): string {
  return on ? 'Exit fullscreen' : 'Fullscreen';
}

/**
 * A button that toggles fullscreen and names what it will do; hidden where fullscreen is not available. Call the
 * returned function to stop it following fullscreen changes.
 */
export function fullscreenButton(className: string): { button: HTMLButtonElement; dispose: () => void } {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const d = doc();
  const update = (): void => {
    button.textContent = fullscreenLabel(isFullscreen(d));
  };
  update();
  button.hidden = !canFullscreen(d);
  button.addEventListener('click', () => void toggleFullscreen(d));
  d?.addEventListener('fullscreenchange', update);
  d?.addEventListener('webkitfullscreenchange', update);
  return {
    button,
    dispose: () => {
      d?.removeEventListener('fullscreenchange', update);
      d?.removeEventListener('webkitfullscreenchange', update);
    },
  };
}
