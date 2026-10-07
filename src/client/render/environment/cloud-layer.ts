import {
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Vector3,
} from 'three';
import type { CloudField } from '../../../shared/world/weather.ts';
import { CLOUD_CELL_M, cellPuffs, type Puff } from './cloud-puffs.ts';

const MAX_PUFFS = 24000;
/** The deck planes reach this far either side of the camera. */
const DECK_SIZE_M = 400000;
/**
 * …in tiles about 6 km across (revision 25): drawn as one quad 400 km across, the sheet's huge triangles came out
 * wrong close to the camera, and from just under the deck it failed to hide what lay beyond it.
 */
export const DECK_SEGMENTS = 64;

const PUFF_VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute float iSize;
attribute float iShade;
varying vec2 vUv;
varying float vShade;
varying float vFade;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vShade = iShade;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  // Puffs fade out as the camera flies into them; the whiteout haze takes over.
  vFade = smoothstep(iSize * 0.5, iSize * 1.5, length(mvPosition.xyz));
  mvPosition.xy += position.xy * iSize * 2.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

const PUFF_FRAGMENT = /* glsl */ `
uniform sampler2D uPuff;
uniform vec3 uLit;
uniform vec3 uShadow;
varying vec2 vUv;
varying float vShade;
varying float vFade;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uPuff, vUv);
  float a = t.a * vFade * 0.9;
  if (a < 0.01) discard;
  // Lighter toward the cloud top and the top of each puff.
  float light = clamp(vShade * 0.75 + (1.0 - vUv.y) * -0.25 + t.r * 0.45, 0.0, 1.0);
  gl_FragColor = vec4(mix(uShadow, uLit, light), a);
  #include <fog_fragment>
}`;

const DECK_VERTEX = /* glsl */ `
varying vec2 vWorld;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

const DECK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uContrast;
varying vec2 vWorld;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vWorld / 1800.0;
  float n = 0.5 * dNoise(p) + 0.3 * dNoise(p * 2.7 + 13.0) + 0.2 * dNoise(p * 7.1 + 41.0);
  gl_FragColor = vec4(uColor * (1.0 - uContrast + 2.0 * uContrast * n), 1.0);
  #include <fog_fragment>
}`;

/** A soft cauliflower blob: overlapping round gradients, brighter at the top. */
function puffTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const blobs: [number, number, number][] = [
    [0.5, 0.55, 0.36],
    [0.32, 0.6, 0.22],
    [0.68, 0.6, 0.24],
    [0.42, 0.4, 0.22],
    [0.6, 0.38, 0.2],
    [0.5, 0.68, 0.26],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    // Red carries the brightness (lit tops), alpha the density.
    const lit = Math.round(255 * (1 - y * 0.8));
    g.addColorStop(0, `rgba(${lit},${lit},${lit},0.85)`);
    g.addColorStop(0.6, `rgba(${lit},${lit},${lit},0.45)`);
    g.addColorStop(1, `rgba(${lit},${lit},${lit},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/**
 * The clouds of the shared cloud field (spec §12.3): cumulus clumps of soft billboards around the camera, sorted back
 * to front, or for overcast weather a deck seen from below (grey) and from above (white).
 */
export class CloudLayer {
  readonly lit = new Color(1, 1, 1);
  readonly shadow = new Color(0.6, 0.62, 0.66);
  private readonly field: CloudField;
  private readonly puffMesh: Mesh | null = null;
  private readonly geometry: InstancedBufferGeometry | null = null;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly shade: Float32Array;
  private readonly deckBottom: Mesh | null = null;
  private readonly deckTop: Mesh | null = null;
  private readonly cells = new Map<string, Puff[]>();
  private readonly puffUniforms: Record<string, { value: unknown }> = {};
  private texture: CanvasTexture | null = null;
  private lastX = Infinity;
  private lastZ = Infinity;
  private framesSince = 0;
  /** puffs are drawn within this distance (graphics preset) */
  rangeM: number;

  constructor(scene: Scene, field: CloudField, rangeM: number) {
    this.field = field;
    this.rangeM = rangeM;
    this.pos = new Float32Array(MAX_PUFFS * 3);
    this.size = new Float32Array(MAX_PUFFS);
    this.shade = new Float32Array(MAX_PUFFS);
    const p = field.preset;
    if (p.coverage <= 0) return;
    if (p.deck) {
      const make = (top: boolean) => {
        const material = new ShaderMaterial({
          uniforms: UniformsUtils.merge([UniformsLib.fog, { uColor: { value: new Color() }, uContrast: { value: top ? 0.22 : 0.2 } }]),
          vertexShader: DECK_VERTEX,
          fragmentShader: DECK_FRAGMENT,
          fog: true,
          side: DoubleSide,
        });
        const mesh = new Mesh(new PlaneGeometry(DECK_SIZE_M, DECK_SIZE_M, DECK_SEGMENTS, DECK_SEGMENTS).rotateX(top ? -Math.PI / 2 : Math.PI / 2), material);
        mesh.position.y = top ? p.cloudTopM : p.cloudBaseM;
        mesh.frustumCulled = false;
        mesh.name = top ? 'cloud-deck-top' : 'cloud-deck-base';
        scene.add(mesh);
        return mesh;
      };
      this.deckBottom = make(false);
      this.deckTop = make(true);
      return;
    }
    this.texture = puffTexture();
    const quad = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.setAttribute('iPos', new InstancedBufferAttribute(this.pos, 3));
    g.setAttribute('iSize', new InstancedBufferAttribute(this.size, 1));
    g.setAttribute('iShade', new InstancedBufferAttribute(this.shade, 1));
    g.instanceCount = 0;
    Object.assign(this.puffUniforms, UniformsUtils.merge([UniformsLib.fog, { uPuff: { value: this.texture }, uLit: { value: this.lit }, uShadow: { value: this.shadow } }]));
    const material = new ShaderMaterial({
      uniforms: this.puffUniforms,
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const mesh = new Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.name = 'cumulus';
    scene.add(mesh);
    this.geometry = g;
    this.puffMesh = mesh;
  }

  /** Follows the camera; re-sorts the puffs back to front when it has moved. */
  update(camera: Vector3): void {
    if (this.deckBottom && this.deckTop) {
      this.deckBottom.position.x = this.deckTop.position.x = camera.x;
      this.deckBottom.position.z = this.deckTop.position.z = camera.z;
      (this.deckBottom.material as ShaderMaterial).uniforms.uColor.value.copy(this.shadow);
      (this.deckTop.material as ShaderMaterial).uniforms.uColor.value.copy(this.lit);
      return;
    }
    if (!this.geometry) return;
    this.puffUniforms.uLit.value = this.lit;
    this.puffUniforms.uShadow.value = this.shadow;
    this.framesSince++;
    if (Math.hypot(camera.x - this.lastX, camera.z - this.lastZ) < 150 && this.framesSince < 30) return;
    this.lastX = camera.x;
    this.lastZ = camera.z;
    this.framesSince = 0;
    const r = Math.ceil(this.rangeM / CLOUD_CELL_M);
    const ci0 = Math.floor(camera.x / CLOUD_CELL_M);
    const cj0 = Math.floor(camera.z / CLOUD_CELL_M);
    const near: { puffs: Puff[]; d: number }[] = [];
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ci = ci0 + di;
        const cj = cj0 + dj;
        const cx = (ci + 0.5) * CLOUD_CELL_M;
        const cz = (cj + 0.5) * CLOUD_CELL_M;
        const d = Math.hypot(cx - camera.x, cz - camera.z);
        if (d > this.rangeM) continue;
        const key = `${ci},${cj}`;
        let puffs = this.cells.get(key);
        if (!puffs) {
          puffs = cellPuffs(this.field, ci, cj);
          this.cells.set(key, puffs);
        }
        if (puffs.length > 0) near.push({ puffs, d: Math.hypot(d, (puffs[0].y - camera.y) * 0.5) });
      }
    }
    // Back to front by clump; puffs inside a clump keep their order.
    near.sort((a, b) => b.d - a.d);
    let n = 0;
    for (const { puffs } of near) {
      for (const p of puffs) {
        if (n >= MAX_PUFFS) break;
        this.pos[n * 3] = p.x;
        this.pos[n * 3 + 1] = p.y;
        this.pos[n * 3 + 2] = p.z;
        this.size[n] = p.size;
        this.shade[n] = p.shade;
        n++;
      }
    }
    this.geometry.instanceCount = n;
    for (const name of ['iPos', 'iSize', 'iShade']) (this.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate = true;
    // Forget far cells now and then.
    if (this.cells.size > 20000) this.cells.clear();
  }

  dispose(): void {
    for (const m of [this.puffMesh, this.deckBottom, this.deckTop]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
    }
    this.texture?.dispose();
  }
}
