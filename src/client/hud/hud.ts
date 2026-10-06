import { Vector3 } from 'three';
import { clamp, DEG, RAD } from '../../shared/math/units.ts';
import { visionLoss } from '../../shared/physics/g-tolerance.ts';
import { WARNING_CAPTIONS } from './captions.ts';
import { drawCombatLayer } from './combat-layer.ts';
import {
  altitudeLabel,
  altitudeValue,
  formatMach,
  headingDegrees,
  headingLabel,
  speedLabel,
  speedValue,
  verticalSpeedLabel,
  verticalSpeedValue,
} from './format.ts';
import { drawGameLayer } from './game-layer.ts';
import { createGVision, gVision } from './g-vision.ts';
import { BINGO_SHARE, formatFuel, formatWind } from './flight-warnings.ts';
import { drawDatalink, drawObjective, drawZones } from './objective-layer.ts';
import type { HudFrame } from './hud-frame.ts';
import { AMBER, FONT, FONT_BIG, FONT_SMALL, GREEN, PRIMARY, RED, SHADOW, WHITE } from './palette.ts';
import { Projector, type ScreenPoint } from './projector.ts';
import { drawRadarScope } from './radar-scope.ts';
import { drawStrikeMarkers, drawStrikeStatus } from './strike-layer.ts';
import { drawTrainingLayer } from './training-layer.ts';

export type { HudFrame } from './hud-frame.ts';

const RADAR_ALT_SHOW_M = 1500;
const SCOPE_RADIUS_PX = 80;

/** Canvas 2-D fighter HUD overlay. */
export class Hud {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly projector = new Projector();
  /** layout size in HUD units: CSS pixels divided by the HUD scale */
  private width = 0;
  private height = 0;
  private scale = 1;
  private maxG = 1;
  private clock = 0;
  /** steady warnings instead of blinking ones (M5) */
  reduceFlashing = false;
  /** a softer G effect before a blackout, and red-out (M5; the blackout itself stays black) */
  reduceMotion = false;
  private readonly vision = createGVision();
  private readonly dir = new Vector3();
  private readonly onResize = () => this.resize();

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-canvas';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resetMaxG(): void {
    this.maxG = 1;
  }

  /** HUD size from the settings (0.8–1.4): everything scales together around the same layout. */
  setScale(scale: number): void {
    this.scale = scale;
    this.resize();
  }

  /** Dims the HUD at night so it does not dazzle (spec §12.3): 0 day … 1 night. */
  setNight(night: number): void {
    const brightness = (1 - 0.35 * Math.max(0, Math.min(1, night))).toFixed(2);
    if (this.canvas.style.opacity !== brightness) this.canvas.style.opacity = brightness;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.canvas.remove();
  }

  draw(f: HudFrame | null): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!f) return;
    this.clock += f.dt;
    // With reduced flashing every blink holds its "on" phase.
    const blink = this.reduceFlashing ? 0.05 : this.clock;
    if (f.view.alive) this.maxG = Math.max(this.maxG, f.view.flight.gLoad);
    // A blacked-out pilot sees none of the HUD (revision 21).
    const conscious = f.view.blackedOutS === null;
    ctx.save();
    ctx.font = FONT;
    ctx.fillStyle = PRIMARY;
    ctx.strokeStyle = PRIMARY;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 3;
    if (f.view.alive && conscious) {
      this.drawBoresight(f);
      this.drawFlightPathMarker(f);
      this.drawAimReticle(f);
      this.drawHeadingTape(f);
      this.drawSpeed(f);
      this.drawAltitude(f);
      this.drawThrottle(f);
      this.drawStatus(f);
      this.drawWarnings(f, blink);
      if (f.status.modeId !== 'free-flight' || f.status.drones) {
        drawDatalink(ctx, this.projector, f);
        drawCombatLayer(ctx, this.projector, f, blink);
        drawRadarScope(ctx, 100 + SCOPE_RADIUS_PX, this.height - 40 - SCOPE_RADIUS_PX, SCOPE_RADIUS_PX, f);
        if (f.status.strike) drawStrikeMarkers(ctx, this.projector, f, f.status.strike, blink);
      }
    }
    drawGameLayer(ctx, this.width, this.height, f);
    if (f.status.strike) drawStrikeStatus(ctx, f, f.status.strike);
    if (f.status.zones) drawZones(ctx, this.projector, f, f.status.zones, this.width);
    if (f.status.objective) drawObjective(ctx, this.projector, f, f.status.objective);
    if (f.training) drawTrainingLayer(ctx, this.projector, f, f.training, this.width);
    // The G takes the view over the scene and everything above, but the messages stay readable.
    if (f.view.alive) this.drawGEffects(f);
    this.drawModeAndHint(f);
    if (f.banner) this.drawCenterText(f.banner, this.height * 0.3, AMBER, FONT_BIG);
    if (f.message) this.drawCenterText(f.message, this.height * 0.38, WHITE, FONT_BIG);
    if (f.message) (f.deathInfo ?? []).forEach((line, i) => this.drawCenterText(line, this.height * 0.38 + 34 + i * 24, WHITE, FONT));
    ctx.restore();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.width = cssW / this.scale;
    this.height = cssH / this.scale;
    this.projector.setSize(this.width, this.height);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
  }

  private drawBoresight(f: HudFrame): void {
    const p: ScreenPoint = { x: 0, y: 0 };
    this.dir.set(0, 0, -1).applyQuaternion(f.view.quaternion);
    if (!this.projector.direction(f.camera, this.dir, p)) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y);
    ctx.lineTo(p.x - 8, p.y);
    ctx.lineTo(p.x - 4, p.y + 6);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + 4, p.y + 6);
    ctx.lineTo(p.x + 8, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.stroke();
  }

  private drawFlightPathMarker(f: HudFrame): void {
    const v = f.view.flight.vel;
    if (v.lengthSq() < 1) return;
    const p: ScreenPoint = { x: 0, y: 0 };
    if (!this.projector.direction(f.camera, this.dir.copy(v).normalize(), p)) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.moveTo(p.x - 7, p.y);
    ctx.lineTo(p.x - 18, p.y);
    ctx.moveTo(p.x + 7, p.y);
    ctx.lineTo(p.x + 18, p.y);
    ctx.moveTo(p.x, p.y - 7);
    ctx.lineTo(p.x, p.y - 14);
    ctx.stroke();
  }

  private drawAimReticle(f: HudFrame): void {
    if (!f.aimDirection) return;
    const p: ScreenPoint = { x: 0, y: 0 };
    if (!this.projector.direction(f.camera, f.aimDirection, p)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawHeadingTape(f: HudFrame): void {
    const ctx = this.ctx;
    const nose = this.dir.set(0, 0, -1).applyQuaternion(f.view.quaternion);
    const heading = headingDegrees(Math.atan2(nose.x, -nose.z));
    const cx = this.width / 2;
    const y = 46;
    const pxPerDeg = 7;
    ctx.beginPath();
    for (let d = Math.ceil((heading - 30) / 5) * 5; d <= heading + 30; d += 5) {
      const x = cx + (d - heading) * pxPerDeg;
      const major = ((d % 10) + 10) % 10 === 0;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - (major ? 10 : 5));
      if (major) {
        ctx.font = FONT_SMALL;
        const label = headingLabel(d);
        ctx.fillText(label, x - ctx.measureText(label).width / 2, y - 14);
      }
    }
    ctx.stroke();
    ctx.font = FONT;
    const text = String(heading).padStart(3, '0');
    const w = ctx.measureText(text).width + 12;
    ctx.strokeRect(cx - w / 2, y + 6, w, 22);
    ctx.fillText(text, cx - w / 2 + 6, y + 22);
  }

  private drawSpeed(f: HudFrame): void {
    const units = f.view.config.hudUnits;
    const flight = f.view.flight;
    // Stay on screen in narrow windows.
    const x = Math.max(16, this.width / 2 - 290);
    const y = this.height / 2;
    this.drawValueBox(x, y, String(Math.round(speedValue(flight.airspeed, units))), speedLabel(units));
    const ctx = this.ctx;
    ctx.fillText(formatMach(flight.mach), x, y + 44);
    // The G readout warns as the strain starts to take the view (revision 21).
    const loss = visionLoss(f.view.gStrain);
    ctx.save();
    if (loss > 0) ctx.fillStyle = loss > 0.5 ? RED : AMBER;
    ctx.fillText(`G ${flight.gLoad.toFixed(1)}  ${this.maxG.toFixed(1)}`, x, y + 64);
    ctx.restore();
    ctx.fillText(`α ${(flight.alpha * RAD).toFixed(1)}`, x, y + 84);
    // Ground speed differs from airspeed by the wind (revision 16).
    ctx.fillText(`GS ${Math.round(speedValue(flight.vel.length(), units))}`, x, y + 104);
  }

  private drawAltitude(f: HudFrame): void {
    const units = f.view.config.hudUnits;
    const flight = f.view.flight;
    const x = Math.min(this.width - 120, this.width / 2 + 200);
    const y = this.height / 2;
    const alt = altitudeValue(flight.pos.y, units);
    this.drawValueBox(x, y, String(Math.round(alt / 10) * 10), altitudeLabel(units));
    const ctx = this.ctx;
    const vs = verticalSpeedValue(flight.vel.y, units);
    ctx.fillText(`${vs >= 0 ? '+' : ''}${Math.round(vs)} ${verticalSpeedLabel(units)}`, x, y + 44);
    if (f.radarAltitudeM < RADAR_ALT_SHOW_M) {
      ctx.fillText(`R ${Math.round(altitudeValue(f.radarAltitudeM, units))}`, x, y + 64);
    }
    if (f.wind) {
      ctx.font = FONT_SMALL;
      ctx.fillText(formatWind(f.wind.x, f.wind.z, units), x, y + 84);
      ctx.font = FONT;
    }
  }

  private drawValueBox(x: number, y: number, value: string, label: string): void {
    const ctx = this.ctx;
    ctx.font = FONT_SMALL;
    ctx.fillText(label, x, y - 22);
    ctx.font = FONT_BIG;
    const w = Math.max(90, ctx.measureText(value).width + 16);
    ctx.strokeRect(x - 6, y - 18, w, 30);
    ctx.fillText(value, x + 2, y + 5);
    ctx.font = FONT;
  }

  private drawThrottle(f: HudFrame): void {
    const ctx = this.ctx;
    const t = f.view.flight.throttle;
    const x = 36;
    const h = 150;
    const y = this.height - 60 - h;
    ctx.strokeRect(x, y, 16, h);
    const ab = t > 0.9;
    ctx.save();
    ctx.fillStyle = ab ? AMBER : PRIMARY;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + 2, y + h - (h - 4) * t - 2, 12, (h - 4) * t);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h * 0.1);
    ctx.lineTo(x + 20, y + h * 0.1);
    ctx.stroke();
    ctx.fillText(ab ? 'AB' : `${Math.round((t / 0.9) * 100)}%`, x - 4, y + h + 22);
    ctx.font = FONT_SMALL;
    ctx.fillText('THR', x - 2, y - 8);
    // Fuel (revision 16): amber from BINGO, red when the tank is dry.
    const v = f.view;
    const share = v.stores.fuelKg / v.config.physics.fuelKg;
    ctx.save();
    if (share < BINGO_SHARE) ctx.fillStyle = v.stores.fuelKg <= 0 ? RED : AMBER;
    ctx.fillText(formatFuel(v.stores.fuelKg, v.config.physics.fuelKg), x - 2, y - 26);
    ctx.restore();
    ctx.font = FONT;
  }

  private drawStatus(f: HudFrame): void {
    const ctx = this.ctx;
    const v = f.view;
    const x = this.width - 230;
    const y = this.height - 120;
    ctx.fillText(v.config.name.toUpperCase(), x, y);
    const frac = clamp(v.hp / v.config.damage.hitPoints, 0, 1);
    ctx.strokeRect(x, y + 10, 180, 10);
    ctx.save();
    ctx.fillStyle = frac >= 0.6 ? GREEN : frac >= 0.3 ? AMBER : RED;
    ctx.fillRect(x + 2, y + 12, 176 * frac, 6);
    ctx.restore();
    if (v.flight.airbrake > 0.1) ctx.fillText('AIRBRAKE', x + 100, y);
  }

  private drawWarnings(f: HudFrame, clock: number): void {
    const blinkOn = clock % 0.6 < 0.4;
    const flight = f.view.flight;
    const stalled = flight.alpha > f.view.config.physics.alphaMaxDeg * DEG;
    if (f.hitTaken) this.drawCenterText(WARNING_CAPTIONS['hit-taken'], this.height / 2 + 150, RED, FONT_BIG);
    if (flight.spin !== 0) {
      // A spin outranks the stall it came from (revision 16); the recovery line stays steady to be readable.
      if (blinkOn) this.drawCenterText('SPIN', this.height / 2 + 110, RED, FONT_BIG);
      if (f.spinHint) this.drawCenterText(f.spinHint, this.height / 2 + 134, RED, FONT);
    } else if (f.pullUp && blinkOn) this.drawCenterText('PULL UP', this.height / 2 + 110, RED, FONT_BIG);
    else if (stalled && blinkOn) this.drawCenterText('STALL', this.height / 2 + 110, AMBER, FONT_BIG);
    if (f.view.stores.fuelKg <= 0) this.drawCenterText('FLAMEOUT', this.height / 2 + 186, RED, FONT_BIG);
    const left = f.view.boundarySecondsLeft;
    if (left !== null) this.drawCenterText(`RETURN TO COMBAT AREA  ${Math.ceil(left)}`, this.height * 0.28, AMBER, FONT_BIG);
  }

  private drawModeAndHint(f: HudFrame): void {
    const ctx = this.ctx;
    ctx.font = FONT_SMALL;
    ctx.fillText(`${f.status.label.toUpperCase()}  ·  ${f.view.callsign}${f.localTime ? `  ·  ${f.localTime}` : ''}`, 16, 22);
    ctx.globalAlpha = 0.75;
    ctx.fillText(f.hint, this.width / 2 - ctx.measureText(f.hint).width / 2, this.height - 16);
    ctx.globalAlpha = 1;
    ctx.font = FONT;
  }

  private drawCenterText(text: string, y: number, color: string, font: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, this.width / 2 - ctx.measureText(text).width / 2, y);
    ctx.restore();
  }

  /** The G on the view (revision 21): red, darkening from the edges, black at G-LOC; and red-out under negative G. */
  private drawGEffects(f: HudFrame): void {
    const v = gVision(f.view.gStrain, f.view.blackedOutS, this.reduceMotion, this.vision);
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.shadowBlur = 0;
    if (v.red > 0) {
      ctx.fillStyle = `rgba(150, 0, 0, ${v.red})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (v.edge > 0) {
      const r = Math.hypot(w, h) / 2;
      const inner = 0.9 * r * v.clear;
      const grad = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, inner + 0.6 * r);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${v.edge})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    if (v.black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${v.black})`;
      ctx.fillRect(0, 0, w, h);
    }
    const g = f.view.flight.gLoad;
    if (g < -2.5) {
      ctx.fillStyle = `rgba(160, 0, 0, ${clamp((-2.5 - g) / 1.5, 0, 0.5) * (this.reduceMotion ? 0.35 : 1)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
    if (f.view.blackedOutS !== null) {
      this.drawCenterText('G-LOC', h * 0.42, RED, FONT_BIG);
      this.drawCenterText('BLACKED OUT · NO CONTROL', h * 0.42 + 30, WHITE, FONT);
    }
  }
}
