/**
 * Keeps an online match running while its tab is hidden (revision 28). Browsers stop drawing frames in a hidden tab
 * and slow its timers to once a second, but not a worker's: a tiny worker ticks, and each tick runs a step on the page.
 * Without workers it falls back to a plain timer (the match then runs slowly in the background).
 */
export class BackgroundTicker {
  private readonly onTick: () => void;
  private readonly periodMs: number;
  private worker: Worker | null = null;
  private url: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(onTick: () => void, periodMs = 20) {
    this.onTick = onTick;
    this.periodMs = periodMs;
  }

  get running(): boolean {
    return this.worker !== null || this.timer !== null;
  }

  start(): void {
    if (this.running) return;
    try {
      this.url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${this.periodMs});`], { type: 'text/javascript' }));
      this.worker = new Worker(this.url);
      this.worker.onmessage = () => this.onTick();
    } catch {
      this.stop();
      this.timer = setInterval(() => this.onTick(), this.periodMs);
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
