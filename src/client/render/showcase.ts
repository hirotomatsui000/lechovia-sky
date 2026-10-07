import { Matrix4, Quaternion, Vector3 } from 'three';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { DEG, G0 } from '../../shared/math/units.ts';
import { type AircraftMeshes, aircraftModelFor } from './aircraft-meshes.ts';
import type { AircraftModel } from './aircraft-model.ts';
import type { SceneryTextures } from './assets.ts';
import type { QualityPreset } from './quality.ts';
import { Renderer } from './renderer.ts';
import { Sea } from './sea.ts';
import type { LoadedMap } from './terrain/map-loader.ts';
import { TerrainLod } from './terrain/terrain-lod.ts';
import { WorldFeatures } from './world/world-features.ts';
import { Environment } from './environment/environment.ts';
import { setAfterburner } from './effects/afterburner.ts';
import type { EnvironmentSettings } from '../../shared/world/time-of-day.ts';
import { createTerrainMaterial } from './terrain-material.ts';

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
}

// The title-screen jet flies a steady right-hand turn over Lechovia's lake district.
const ORBIT_CENTER_X = 42000;
const ORBIT_CENTER_Z = -42000;
const ORBIT_RADIUS_M = 7000;
const ORBIT_ALTITUDE_M = 1500;
const ORBIT_SPEED_MS = 200;
/** A coordinated turn: the bank that balances this speed on this radius. */
const BANK_RAD = Math.atan((ORBIT_SPEED_MS * ORBIT_SPEED_MS) / (G0 * ORBIT_RADIUS_M));

// The camera laps the jet once every 50 s, starting from a three-quarter rear view and bobbing gently above it.
const CAMERA_DISTANCE_M = 38;
const CAMERA_LAP_S = 50;
const CAMERA_START_RAD = 0.6;
const CAMERA_ELEVATION_RAD = 6 * DEG;
const CAMERA_BOB_RAD = 5 * DEG;
const CAMERA_BOB_S = 23;

const forward = new Vector3();
const inward = new Vector3();
const up = new Vector3();
const ahead = new Vector3();
const back = new Vector3();
const right = new Vector3();
const basis = new Matrix4();

export function showcaseJetPose(timeS: number, out: Pose): Pose {
  const angle = (ORBIT_SPEED_MS / ORBIT_RADIUS_M) * timeS;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out.position.set(ORBIT_CENTER_X + ORBIT_RADIUS_M * c, ORBIT_ALTITUDE_M, ORBIT_CENTER_Z + ORBIT_RADIUS_M * s);
  forward.set(-s, 0, c);
  inward.set(-c, 0, -s);
  up.set(0, Math.cos(BANK_RAD), 0).addScaledVector(inward, Math.sin(BANK_RAD));
  basis.lookAt(out.position, ahead.copy(out.position).add(forward), up);
  out.quaternion.setFromRotationMatrix(basis);
  return out;
}

/** The camera orbits in the jet's heading frame, so it stays level while the jet banks. */
export function showcaseCameraPosition(timeS: number, jet: Pose, out: Vector3): Vector3 {
  const azimuth = CAMERA_START_RAD + (2 * Math.PI * timeS) / CAMERA_LAP_S;
  const elevation = CAMERA_ELEVATION_RAD + CAMERA_BOB_RAD * Math.sin((2 * Math.PI * timeS) / CAMERA_BOB_S);
  back.set(0, 0, 1).applyQuaternion(jet.quaternion);
  back.y = 0;
  back.normalize();
  right.set(back.z, 0, -back.x);
  out
    .copy(back)
    .multiplyScalar(Math.cos(azimuth))
    .addScaledVector(right, Math.sin(azimuth))
    .multiplyScalar(Math.cos(elevation));
  out.y = Math.sin(elevation);
  return out.multiplyScalar(CAMERA_DISTANCE_M).add(jet.position);
}

/** A longer lens than the game's, for a calmer, more cinematic picture. */
const SHOWCASE_FOV = 45;
/** On wide screens the jet sits in the right-hand third, clear of the menu column. */
const WIDE_LAYOUT_PX = 900;
const FRAME_SHIFT = 0.17;
const AFTERBURNER = 0.5;

/** The live scene behind the title screen: the chosen jet circling over Lechovia. */
export class Showcase {
  private readonly renderer: Renderer;
  private readonly pose: Pose = { position: new Vector3(), quaternion: new Quaternion() };
  private model: AircraftModel | null = null;
  private aircraftId: string | null = null;
  /** null until the jet models have loaded, so the generated model never flashes up first */
  private meshes: AircraftMeshes | null = null;
  private sea: Sea | null = null;
  private ground: TerrainLod | null = null;
  private environment: Environment | null = null;
  private map: LoadedMap | null = null;
  private settings: EnvironmentSettings = { weather: 'scattered', startHour: 12, clockRunning: false };
  private lastFrameMs = 0;
  private features: WorldFeatures | null = null;
  private running = true;
  private rafId = 0;
  private startMs = 0;
  private readonly still: boolean;
  private readonly detail: number;
  private readonly cloudRangeM: number;

  /** `still`: the system asks for reduced motion, so show one fixed shot. */
  constructor(root: HTMLElement, scenery: Promise<SceneryTextures>, world: Promise<LoadedMap>, aircraftMeshes: Promise<AircraftMeshes>, still: boolean, quality?: QualityPreset) {
    this.still = still;
    this.renderer = new Renderer(root, quality);
    this.renderer.webgl.domElement.classList.add('showcase');
    this.renderer.camera.fov = SHOWCASE_FOV;
    this.renderer.camera.updateProjectionMatrix();
    this.detail = quality?.terrainDetail ?? 1.6;
    this.cloudRangeM = quality?.cloudRangeM ?? 30000;
    Promise.all([scenery, world]).then(
      ([textures, map]) => {
        if (this.running) void this.build(textures, map);
      },
      (err: unknown) => console.error('The title-screen scenery could not load; the menu still works.', err),
    );
    void aircraftMeshes.then((meshes) => {
      this.meshes = meshes;
      this.showAircraft();
    });
  }

  /** Shows the chosen weather and time of day behind the menu. */
  setEnvironment(settings: EnvironmentSettings): void {
    this.settings = { ...settings };
    if (this.map) this.buildEnvironment(this.map);
  }

  setAircraft(id: string): void {
    if (id === this.aircraftId) return;
    this.aircraftId = id;
    this.showAircraft();
  }

  private showAircraft(): void {
    if (!this.running || !this.meshes || this.aircraftId === null) return;
    if (this.model) this.renderer.scene.remove(this.model.root);
    this.model = aircraftModelFor(getAircraft(this.aircraftId), this.meshes);
    this.renderer.scene.add(this.model.root);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.ground?.dispose();
    this.features?.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
  }

  private buildEnvironment(map: LoadedMap): void {
    this.environment?.dispose();
    this.environment = new Environment(this.renderer.scene, this.renderer.webgl, this.settings, map.def.seed, {
      cloudRangeM: this.cloudRangeM,
      pixelRatio: this.renderer.webgl.getPixelRatio(),
      lights: this.features ? { city: this.features.cityLights, runway: this.features.runwayLights } : undefined,
    });
  }

  private async build(textures: SceneryTextures, map: LoadedMap): Promise<void> {
    const scene = this.renderer.scene;
    this.map = map;
    this.ground = new TerrainLod(map, createTerrainMaterial(textures), this.detail);
    scene.add(this.ground.group);
    this.features = new WorldFeatures(map.def, map.terrain);
    scene.add(this.features.group);
    this.buildEnvironment(map);
    this.sea = new Sea(textures.waterNormals);
    scene.add(this.sea.mesh);
    // The ground under the first shot, before the scene fades in.
    await this.ground.prepare(showcaseJetPose(0, this.pose).position);
    if (!this.running) return;
    this.startMs = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const t = this.still ? 0 : (now - this.startMs) / 1000;
    const camera = this.renderer.camera;
    showcaseJetPose(t, this.pose);
    if (this.model) {
      this.model.root.position.copy(this.pose.position);
      this.model.root.quaternion.copy(this.pose.quaternion);
      for (const flame of this.model.afterburners) setAfterburner(flame, AFTERBURNER, t);
    }
    showcaseCameraPosition(t, this.pose, camera.position);
    camera.lookAt(this.pose.position);
    this.ground?.update(camera.position);
    this.features?.update(camera.position);
    const frameS = this.lastFrameMs === 0 ? 0 : Math.min(0.1, (now - this.lastFrameMs) / 1000);
    this.lastFrameMs = now;
    this.environment?.update(this.settings.startHour, camera, this.still ? 0 : frameS);
    if (this.environment) this.features?.setNight(this.environment.night);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w >= WIDE_LAYOUT_PX) camera.setViewOffset(w, h, -w * FRAME_SHIFT, 0, w, h);
    else camera.clearViewOffset();
    this.sea?.update(t);
    this.renderer.render();
    this.renderer.webgl.domElement.classList.add('ready');
    this.rafId = requestAnimationFrame(this.frame);
  };
}
