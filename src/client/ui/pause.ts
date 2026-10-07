import { fullscreenButton } from './fullscreen.ts';

export interface PauseHandlers {
  onResume(): void;
  onSettings(): void;
  onQuit(): void;
}

export interface PauseOptions {
  /** an extra section under the buttons (Free Flight's sky and drones, M5) */
  extra?: { element: HTMLElement; refresh(): void };
}

/** Resume, Settings (the same dialog as the title screen's) and Quit. */
export class PauseMenu {
  private readonly overlay = document.createElement('div');
  private readonly extra: PauseOptions['extra'];
  private readonly fullscreen = fullscreenButton('button secondary');

  constructor(root: HTMLElement, handlers: PauseHandlers, options: PauseOptions = {}) {
    this.extra = options.extra;
    this.overlay.className = 'overlay translucent';
    this.overlay.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'panel narrow stack';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    title.style.margin = '0 0 8px';
    panel.appendChild(title);
    panel.append(
      this.button('Resume', 'button', () => handlers.onResume()),
      this.button('Settings', 'button secondary', () => handlers.onSettings()),
      this.fullscreen.button,
      this.button('Quit to menu', 'button secondary', () => handlers.onQuit()),
    );
    if (options.extra) panel.appendChild(options.extra.element);
    this.overlay.appendChild(panel);
    root.appendChild(this.overlay);
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  show(): void {
    this.extra?.refresh();
    this.overlay.hidden = false;
  }

  hide(): void {
    this.overlay.hidden = true;
  }

  dispose(): void {
    this.fullscreen.dispose();
    this.overlay.remove();
  }

  private button(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }
}
