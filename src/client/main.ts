import './ui/styles.css';
import { MusicPlayer } from './audio/music.ts';
import { startGame } from './game.ts';
import { type AircraftMeshes, IMPORTED_MODELS, loadAircraftMeshes } from './render/aircraft-meshes.ts';
import { loadSceneryTextures, type SceneryTextures } from './render/assets.ts';
import { LoadProgress } from './render/load-progress.ts';
import { QUALITY_PRESETS, resolveQuality } from './render/quality.ts';
import { Renderer } from './render/renderer.ts';
import { Showcase } from './render/showcase.ts';
import { type LoadedMap, loadMap } from './render/terrain/map-loader.ts';
import { showIntro } from './ui/intro-screen.ts';
import { showLoadBar } from './ui/load-bar.ts';
import { type OnlineOpening, type StartOptions, showStartMenu } from './ui/menu.ts';
import { parseRoomCode } from '../shared/net/protocol.ts';
import { SettingsStore } from './ui/settings.ts';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element in index.html`);
  return el;
}

const app = requireElement('app');

function showError(message: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel narrow stack';
  const heading = document.createElement('h2');
  heading.textContent = 'Something went wrong';
  const text = document.createElement('p');
  text.className = 'notice';
  text.textContent = message;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = 'Reload';
  button.addEventListener('click', () => location.reload());
  panel.append(heading, text, button);
  overlay.appendChild(panel);
  app.appendChild(overlay);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function run(scenery: Promise<SceneryTextures>, world: Promise<LoadedMap>, aircraftMeshes: Promise<AircraftMeshes>, settings: SettingsStore, progress: LoadProgress): void {
  const music = new MusicPlayer(settings);
  const launch = (options: StartOptions): void => {
    music.setScene('flight');
    startGame(app, options, { onQuit: () => showMenu(), onRestart: launch }, scenery, aircraftMeshes, settings, progress).catch((err: unknown) => {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      // Online (revision 28): back to the title screen, with the reason in the Online sheet.
      if (options.online) showMenu({ code: options.online.role === 'join' ? options.online.code : undefined, error: message });
      else showError(message);
    });
  };

  function showMenu(online?: OnlineOpening): void {
    music.setScene('menu');
    const s = settings.current;
    const quality = QUALITY_PRESETS[resolveQuality(s.graphics, s.autoGraphics, window.innerWidth, window.innerHeight, window.devicePixelRatio)];
    const showcase = new Showcase(app, scenery, world, aircraftMeshes, prefersReducedMotion(), quality);
    const close = showStartMenu(app, {
      onPreview: (id) => showcase.setAircraft(id),
      onWorld: (environment) => showcase.setEnvironment(environment),
      onStart: (options) => {
        close();
        showcase.dispose();
        launch(options);
      },
    }, settings, online);
  }

  // An invite link (revision 28): the title screen opens on the Online sheet with the room's code.
  const invited = new URLSearchParams(location.search).get('join');
  const code = invited ? parseRoomCode(invited) : null;
  showMenu(code ? { code } : undefined);
}

if (Renderer.isWebGLAvailable()) {
  // Start decoding the scenery photos and the jet models, and generating Lechovia, now: the title screen shows them,
  // and the match reuses them.
  const progress = new LoadProgress();
  showLoadBar(app, progress);
  run(loadSceneryTextures(progress), loadMap('lechovia', progress), loadAircraftMeshes(IMPORTED_MODELS, progress), new SettingsStore(), progress);
  // The opening plays over the title screen, which is built underneath it meanwhile (revision 24).
  void showIntro(app, progress, prefersReducedMotion());
} else {
  showError('WebGL is not available. Use a current desktop Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
}
