import { smoothstep } from '../../shared/math/units.ts';
import { visionLoss } from '../../shared/physics/g-tolerance.ts';

/** After blacking out the view stays black this long, then the jet's fall shows through, dimmed (revision 21). */
export const BLACKOUT_HOLD_S = 2;
export const BLACKOUT_FADE_S = 1.5;
/** How dark the view stays while the blacked-out pilot's jet goes down. */
export const BLACKOUT_DIM = 0.6;
/** With reduced motion the view goes only this far toward black before the blackout itself. */
export const REDUCED_STRENGTH = 0.6;

/** What the G does to the view, drawn in this order over the scene and the HUD. */
export interface GVision {
  /** red over the whole view (alpha) */
  red: number;
  /** the clear middle of the view: 1 all of it … 0 none */
  clear: number;
  /** darkness closing in from the edges (alpha) */
  edge: number;
  /** darkness over the whole view (alpha) */
  black: number;
}

export const createGVision = (): GVision => ({ red: 0, clear: 1, edge: 0, black: 0 });

/**
 * The owner's sequence (revision 21): under G the view turns red while it darkens from the edges in, and at its
 * darkest the pilot blacks out. Then it stays black for a moment before the falling jet shows through, dim and red.
 */
export function gVision(strain: number, blackedOutS: number | null, reduceMotion: boolean, out: GVision): GVision {
  if (blackedOutS !== null) {
    out.red = 0.2;
    out.clear = 0;
    out.edge = 0;
    out.black = 1 - (1 - BLACKOUT_DIM) * smoothstep(BLACKOUT_HOLD_S, BLACKOUT_HOLD_S + BLACKOUT_FADE_S, blackedOutS);
    return out;
  }
  const loss = visionLoss(strain);
  const k = reduceMotion ? REDUCED_STRENGTH : 1;
  // Red comes first and is full by half way; the dark closes in all the way, and the last quarter goes black.
  out.red = 0.5 * Math.min(1, 2 * loss) * k;
  out.clear = 1 - loss;
  out.edge = loss > 0 ? (0.3 + 0.7 * loss) * k : 0;
  out.black = smoothstep(0.75, 1, loss) * k;
  return out;
}
