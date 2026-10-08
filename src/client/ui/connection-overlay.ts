/** "The room has closed" (revision 28): why, and a way back to the title screen. */
export class ConnectionOverlay {
  private readonly overlay = document.createElement('div');
  private readonly title = document.createElement('h2');
  private readonly text = document.createElement('p');
  private readonly buttons = document.createElement('div');

  constructor(root: HTMLElement) {
    this.overlay.className = 'overlay translucent';
    this.overlay.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'panel narrow stack';
    this.text.className = 'subtitle';
    this.text.setAttribute('aria-live', 'polite');
    this.buttons.className = 'stack';
    panel.append(this.title, this.text, this.buttons);
    this.overlay.appendChild(panel);
    root.appendChild(this.overlay);
  }

  get visible(): boolean {
    return !this.overlay.hidden;
  }

  show(title: string, text: string, actions: readonly [label: string, run: () => void][] = []): void {
    this.title.textContent = title;
    this.text.textContent = text;
    this.buttons.replaceChildren(
      ...actions.map(([label, run], i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = i === 0 ? 'button' : 'button secondary';
        b.textContent = label;
        b.addEventListener('click', run);
        return b;
      }),
    );
    this.overlay.hidden = false;
  }

  dispose(): void {
    this.overlay.remove();
  }
}
