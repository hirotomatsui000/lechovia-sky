import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  type PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { DEG, lerp, smoothstep } from '../../../shared/math/units.ts';
import { daylight, type EnvironmentSettings, moonDirection, sunDirection } from '../../../shared/world/time-of-day.ts';
import { CloudField, WEATHER, type WeatherPreset } from '../../../shared/world/weather.ts';
import type { NightLights } from '../world/world-features.ts';
import { CloudLayer } from './cloud-layer.ts';
import { GroundLights, updateNavLights } from './night-lights.ts';
import { NightSky } from './night-sky.ts';
import { horizonColor, type SkyParams } from './preetham.ts';
import { Rain } from './rain.ts';

/** Distance haze in clear air: ~7% at 10 km, 50% at 30 km (as with the photo sky before M4). */
const HAZE_DENSITY = 2.8e-5;
/** Inside a cloud the world fades to white within a few hundred metres. */
const WHITEOUT_DENSITY = 5e-3;
const SUN_INTENSITY = 2.6;
/**
 * Dusk and night lighting (revision 19: the owner found both too dark to see). A fill light, a brighter exposure and a
 * lighter night sky, haze and clouds keep the land, the horizon and the clouds readable; full daylight is unchanged.
 */
const MOON_INTENSITY = 1.1;
const DAY_AMBIENT = 0.06;
/** extra fill while the sun is low (dawn and dusk) and at night */
const TWILIGHT_AMBIENT = 1;
const NIGHT_AMBIENT = 2;
const TWILIGHT_EXPOSURE = 0.4;
const NIGHT_EXPOSURE = 2.3;
/** the least image-based light, and the least light on the clouds, at night */
const NIGHT_ENVIRONMENT = 0.4;
const NIGHT_CLOUD_LIGHT = 0.2;
/** the night sky's glow, this much stronger again while the sun is low, so the twilight sky is not black overhead */
const TWILIGHT_SKY_LIFT = 2;
/** The environment map is rebuilt when the sun has moved this much. */
const ENV_REBUILD_RAD = 1.5 * DEG;
/**
 * The Preetham sky is in its own units, several times brighter than the rest of the scene; this brings it to about
 * the brightness of the photographed sky used before M4. The haze takes the same scale, so land fades into the sky.
 */
const SKY_SCALE = 0.14;
/** A faint glow of the night sky, so the horizon still shows against the land. */
const NIGHT_SKY_FLOOR = new Vector3(0.008, 0.011, 0.024);
const NIGHT_HAZE = new Color(0.035, 0.045, 0.075);
const GROUND_BOUNCE = new Color('#46503c');
const MOONLIT_CLOUD = new Color(0.78, 0.84, 1);

/** A Sky whose output is scaled to the scene's brightness and never quite black. */
function scaledSky(): Sky {
  const sky = new Sky();
  const m = sky.material as ShaderMaterial;
  m.uniforms.skyScale = { value: SKY_SCALE };
  m.uniforms.skyFloor = { value: NIGHT_SKY_FLOOR.clone() };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform float skyScale;\nuniform vec3 skyFloor;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyScale + skyFloor, 1.0 );');
  return sky;
}

function skyParams(p: WeatherPreset): SkyParams {
  const turbidity = { clear: 2.2, scattered: 3, broken: 4.5, overcast: 7, rain: 9 }[p.id];
  return { turbidity, rayleigh: 1.6, mieCoefficient: 0.005, mieDirectionalG: 0.8 };
}

export interface EnvironmentOptions {
  /** cumulus are drawn within this range (graphics preset) */
  cloudRangeM: number;
  pixelRatio: number;
  /** town, street and runway lights for the night */
  lights?: { city: NightLights; runway: NightLights };
}

/**
 * Sky, sun and moon, light, haze, clouds, rain and night lights for a match's weather and clock (spec §12.3). It
 * replaces the photographed sky, which could only show one hour in one weather.
 */
export class Environment {
  readonly sunDirection = new Vector3();
  readonly moonDirection = new Vector3();
  readonly fog: FogExp2;
  readonly clouds: CloudField;
  /** 0 in daylight … 1 at night */
  night = 0;
  /** how much daylight reaches the camera, after the clouds: 0 … 1 */
  light = 1;
  /** rain is falling round the camera (for its sound, M5) */
  raining = false;
  private readonly preset: WeatherPreset;
  private readonly scene: Scene;
  private readonly renderer: WebGLRenderer;
  private readonly sky: Sky;
  private readonly sun = new DirectionalLight(0xfff2e0, SUN_INTENSITY);
  private readonly moon = new DirectionalLight(0x9fb2f2, 0);
  private readonly ambient = new HemisphereLight(0x3a4a72, 0x101318, 0);
  private readonly cloudLayer: CloudLayer;
  private readonly nightSky: NightSky;
  private readonly rain: Rain;
  private readonly groundLights: GroundLights | null;
  private readonly pmrem: PMREMGenerator;
  private readonly envScene = new Scene();
  private readonly envSky: Sky;
  private readonly envGround: Mesh;
  private readonly envGrey: Mesh;
  private envTarget: WebGLRenderTarget | null = null;
  private readonly envSun = new Vector3(0, -2, 0);
  private envUnderDeck: boolean | null = null;
  private readonly pixelRatio: number;
  private readonly horizon: [number, number, number] = [0, 0, 0];
  private readonly tmp = new Color();
  private readonly prevCamera = new Vector3();
  private readonly cameraVelocity = new Vector3();

  constructor(scene: Scene, renderer: WebGLRenderer, settings: EnvironmentSettings, mapSeed: number, opts: EnvironmentOptions) {
    this.scene = scene;
    this.renderer = renderer;
    this.pixelRatio = opts.pixelRatio;
    this.preset = WEATHER[settings.weather];
    this.clouds = new CloudField(this.preset, mapSeed);

    this.sky = scaledSky();
    this.sky.name = 'sky';
    this.sky.scale.setScalar(1000);
    this.sky.renderOrder = -2;
    this.sky.frustumCulled = false;
    const params = skyParams(this.preset);
    const u = (this.sky.material as ShaderMaterial).uniforms;
    u.turbidity.value = params.turbidity;
    u.rayleigh.value = params.rayleigh;
    u.mieCoefficient.value = params.mieCoefficient;
    u.mieDirectionalG.value = params.mieDirectionalG;
    // The sky shader's own flat layer stands in for high cirrus above the weather.
    u.cloudCoverage.value = { clear: 0, scattered: 0.12, broken: 0.25, overcast: 0.3, rain: 0.35 }[this.preset.id];
    u.cloudElevation.value = 0.2;
    u.cloudDensity.value = 0.25;
    scene.add(this.sky);

    this.fog = new FogExp2(0xa0b0c4, HAZE_DENSITY * this.preset.hazeFactor);
    scene.fog = this.fog;
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.ambient);

    this.cloudLayer = new CloudLayer(scene, this.clouds, opts.cloudRangeM);
    this.nightSky = new NightSky(scene, opts.pixelRatio);
    this.rain = new Rain(scene);
    this.groundLights = opts.lights
      ? new GroundLights(scene, [
          { lights: opts.lights.city, sizePx: 2.2 },
          { lights: opts.lights.runway, sizePx: 3 },
        ], opts.pixelRatio)
      : null;

    // The environment map: the sky above, a ground colour below (or uniform grey under an overcast deck).
    this.pmrem = new PMREMGenerator(renderer);
    this.envSky = scaledSky();
    this.envSky.scale.setScalar(50);
    const envUniforms = (this.envSky.material as ShaderMaterial).uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) envUniforms[k].value = u[k].value;
    envUniforms.showSunDisc.value = 0;
    envUniforms.cloudCoverage.value = 0;
    this.envGround = new Mesh(new SphereGeometry(10, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new MeshBasicMaterial({ color: GROUND_BOUNCE.clone(), side: BackSide }));
    this.envGrey = new Mesh(new SphereGeometry(10, 16, 8), new MeshBasicMaterial({ color: 0x808488, side: BackSide }));
    this.envScene.add(this.envSky, this.envGround, this.envGrey);
  }

  /** The cumulus range can change with the graphics preset. */
  set cloudRangeM(m: number) {
    this.cloudLayer.rangeM = m;
  }

  /**
   * `subject`: the jet the camera follows. Whether we are in cloud (the white-out) goes by where it is, not the camera
   * (revision 25): a camera trailing a jet that skims a cloud top dipped into the cloud and turned the view white.
   */
  update(hour: number, camera: PerspectiveCamera, dt: number, subject: Vector3 | null = null): void {
    const cam = camera.position;
    if (dt > 0) this.cameraVelocity.subVectors(cam, this.prevCamera).divideScalar(dt);
    this.prevCamera.copy(cam);
    const p = this.preset;
    sunDirection(hour, this.sunDirection);
    moonDirection(hour, this.moonDirection);
    const sunElevation = Math.asin(this.sunDirection.y);
    const day = daylight(sunElevation);
    this.night = 1 - day;
    const deck = p.deck && p.coverage > 0;
    const underDeck = deck && cam.y < p.cloudTopM;
    const aboveDeck = deck && !underDeck;
    // How much of the sky the camera sees: none under the deck, less under broken cloud.
    const clearSky = underDeck ? 0 : 1 - 0.4 * (p.deck ? 0 : p.coverage);
    const cloudShade = underDeck ? p.lightFactor : lerp(1, p.lightFactor, p.deck ? 0 : 0.5 * p.coverage);
    this.light = day * cloudShade;

    // Sky dome.
    this.sky.position.copy(cam);
    const u = (this.sky.material as ShaderMaterial).uniforms;
    u.sunPosition.value.copy(this.sunDirection);
    u.time.value = (u.time.value as number) + dt;
    this.sky.visible = !underDeck;

    // Sun: warmer and weaker near the horizon; the moon lights the night.
    const sunUp = smoothstep(-0.03, 0.12, this.sunDirection.y);
    const warm = smoothstep(0.02, 0.4, this.sunDirection.y);
    this.sun.color.setRGB(1, lerp(0.55, 0.95, warm), lerp(0.3, 0.88, warm));
    this.sun.intensity = SUN_INTENSITY * sunUp * cloudShade;
    this.sun.position.copy(cam).addScaledVector(this.sunDirection, 1000);
    this.sun.target.position.copy(cam);
    const moonUp = smoothstep(-0.02, 0.15, this.moonDirection.y);
    this.moon.intensity = MOON_INTENSITY * moonUp * this.night * (underDeck ? 0.3 : 1);
    this.moon.position.copy(cam).addScaledVector(this.moonDirection, 1000);
    this.moon.target.position.copy(cam);
    // Low sun: daylight still counts, but the land gets the sun's light at a grazing angle.
    const lowSun = day * (1 - smoothstep(2 * DEG, 20 * DEG, sunElevation));
    this.ambient.intensity = DAY_AMBIENT + TWILIGHT_AMBIENT * lowSun + NIGHT_AMBIENT * this.night;
    this.scene.environmentIntensity = lerp(NIGHT_ENVIRONMENT, 1, day) * (underDeck ? 0.7 : 1);
    this.renderer.toneMappingExposure = 1 + TWILIGHT_EXPOSURE * lowSun + (NIGHT_EXPOSURE - 1) * this.night;

    // Haze: the sky's horizon colour (or the grey under the deck), thicker in bad weather, white inside a cloud.
    horizonColor([this.sunDirection.x, this.sunDirection.y, this.sunDirection.z], skyParams(p), this.horizon);
    const fogColor = this.fog.color;
    // The eye adapts as the sun sets: the sky (and its haze) is drawn brighter while the sun is low.
    const skyScale = SKY_SCALE * lerp(3, 1, smoothstep(0, 25 * DEG, sunElevation));
    u.skyScale.value = skyScale;
    (u.skyFloor.value as Vector3).copy(NIGHT_SKY_FLOOR).multiplyScalar(1 + TWILIGHT_SKY_LIFT * lowSun);
    fogColor.setRGB(this.horizon[0] * skyScale, this.horizon[1] * skyScale, this.horizon[2] * skyScale);
    // One haze colour serves every direction: keep it close to neutral so it suits the side away from the sun too.
    const luma = 0.2126 * fogColor.r + 0.7152 * fogColor.g + 0.0722 * fogColor.b;
    fogColor.lerp(this.tmp.setRGB(luma, luma, luma * 1.08), 0.4);
    if (deck) {
      const grey = this.tmp.setRGB(0.62, 0.64, 0.68).multiplyScalar(lerp(NIGHT_CLOUD_LIGHT, 1, day) * (underDeck ? p.lightFactor * 1.4 : 1));
      if (underDeck) fogColor.copy(grey);
    }
    fogColor.lerp(NIGHT_HAZE, this.night * 0.9);
    const eye = subject ?? cam;
    const inCloud = this.clouds.densityAt(eye.x, eye.y, eye.z);
    let density = HAZE_DENSITY * p.hazeFactor * (aboveDeck ? 0.8 : 1);
    if (inCloud > 0) {
      density = lerp(density, WHITEOUT_DENSITY, smoothstep(0, 0.6, inCloud));
      fogColor.lerp(this.tmp.setRGB(0.8, 0.82, 0.86).multiplyScalar(lerp(NIGHT_CLOUD_LIGHT, 1, day)), smoothstep(0, 0.6, inCloud));
    }
    this.fog.density = density;

    // Clouds lit by the sun (or the moon), shadowed underneath.
    const sunLight = lerp(NIGHT_CLOUD_LIGHT, 1, day);
    this.cloudLayer.lit
      .setRGB(1, lerp(0.7, 0.98, warm), lerp(0.55, 0.95, warm))
      // By moonlight the clouds turn blue-grey rather than keeping the sunset's orange (revision 19).
      .lerp(MOONLIT_CLOUD, this.night)
      .multiplyScalar((p.deck ? 0.8 : 1.05) * sunLight + 0.04);
    this.cloudLayer.shadow.setRGB(0.55, 0.58, 0.64).multiplyScalar(sunLight * (p.deck ? 0.75 : 0.9) + 0.02);
    this.cloudLayer.update(cam);
    this.nightSky.update(cam, this.night, this.moonDirection, clearSky);
    this.raining = p.rain && cam.y < p.cloudBaseM;
    this.rain.update(dt, cam, this.cameraVelocity, this.raining, day);
    this.groundLights?.update(this.night);
    updateNavLights(this.night, performance.now() / 1000, this.pixelRatio);

    this.updateEnvironmentMap(underDeck, day);
  }

  dispose(): void {
    for (const o of [this.sun, this.sun.target, this.moon, this.moon.target, this.ambient]) o.removeFromParent();
    this.sun.dispose();
    this.moon.dispose();
    this.ambient.dispose();
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.cloudLayer.dispose();
    this.nightSky.dispose();
    this.rain.dispose();
    this.groundLights?.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.sky.removeFromParent();
    this.sky.geometry.dispose();
    (this.sky.material as ShaderMaterial).dispose();
    this.envSky.geometry.dispose();
    (this.envSky.material as ShaderMaterial).dispose();
    this.envGround.geometry.dispose();
    this.envGrey.geometry.dispose();
  }

  /** Rebuilds the image-based lighting when the sun has moved or the camera crossed the overcast deck. */
  private updateEnvironmentMap(underDeck: boolean, day: number): void {
    if (this.envUnderDeck === underDeck && this.envSun.angleTo(this.sunDirection) < ENV_REBUILD_RAD) return;
    this.envUnderDeck = underDeck;
    this.envSun.copy(this.sunDirection);
    const envUniforms = (this.envSky.material as ShaderMaterial).uniforms;
    envUniforms.sunPosition.value.copy(this.sunDirection);
    envUniforms.skyScale.value = (this.sky.material as ShaderMaterial).uniforms.skyScale.value;
    (envUniforms.skyFloor.value as Vector3).copy((this.sky.material as ShaderMaterial).uniforms.skyFloor.value as Vector3);
    (this.envGround.material as MeshBasicMaterial).color.copy(GROUND_BOUNCE).multiplyScalar(lerp(0.02, 1, day));
    (this.envGrey.material as MeshBasicMaterial).color.setRGB(0.5, 0.52, 0.55).multiplyScalar(lerp(0.02, 1, day) * this.preset.lightFactor * 1.6);
    this.envSky.visible = !underDeck;
    this.envGround.visible = !underDeck;
    this.envGrey.visible = underDeck;
    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = next.texture as Texture;
    this.envTarget?.dispose();
    this.envTarget = next;
  }
}
