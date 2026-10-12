import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { LAUNCH } from "@/lib/neighbourhoods";
import { bus, type ScreenPoint } from "./bus";

/* ------------------------------------------------------------------ */
/* Geography                                                          */
/* ------------------------------------------------------------------ */

const SCALE = 420;
const C_LAT = 12.965;
const C_LNG = 77.645;
export const toWorld = (lat: number, lng: number) => new THREE.Vector2((lng - C_LNG) * SCALE, -(lat - C_LAT) * SCALE);

const LAKES = [
  { lat: 12.935, lng: 77.667, r: 5.2 }, // Bellandur
  { lat: 12.982, lng: 77.621, r: 2.3 }, // Ulsoor
  { lat: 13.046, lng: 77.588, r: 3.0 }, // Hebbal
  { lat: 12.909, lng: 77.617, r: 2.6 }, // Madiwala
  { lat: 12.922, lng: 77.641, r: 2.0 }, // Agara
  { lat: 12.945, lng: 77.738, r: 3.6 }, // Varthur
].map((l) => {
  const p = toWorld(l.lat, l.lng);
  return new THREE.Vector3(p.x, p.y, l.r);
});

// Density centres so the generated city has believable clusters (not shown or named anywhere)
const CLUSTERS: [number, number][] = [
  [12.9116, 77.6474], [12.9352, 77.6245], [12.9784, 77.6408], [12.9698, 77.75], [12.9005, 77.6905],
  [12.926, 77.6762], [12.9591, 77.6974], [12.8452, 77.6602], [12.9166, 77.6101], [12.9063, 77.5857],
  [12.925, 77.5938], [12.9255, 77.5468], [12.9422, 77.5737], [12.9756, 77.6067], [12.961, 77.6387],
  [12.998, 77.615], [13.0031, 77.5643], [12.991, 77.5525], [13.028, 77.54], [13.0358, 77.597],
  [13.0358, 77.643], [13.0075, 77.695], [13.063, 77.587], [13.1007, 77.5963],
];

export const HSR = toWorld(LAUNCH.lat, LAUNCH.lng);
const HSR_R = 11; // launch-zone radius in world units
const HUBS = [new THREE.Vector2(HSR.x + 30, HSR.y + 26)];

const BLOCK = 5;
const STREET = 1.25;
const CITY_R = 98;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                            */
/* ------------------------------------------------------------------ */

const COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  uniform vec3  uLime;
  uniform vec3  uCamPos;
  uniform vec2  uScanOrigin;
  uniform float uScanR;
  uniform float uScanAmp;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float fogF(vec3 w){ float d = length(w - uCamPos); return 1.0 - exp(-pow(d * uFogDensity, 2.0)); }
  float scanF(vec2 p){ float d = length(p - uScanOrigin); return exp(-pow((d - uScanR) * 0.32, 2.0)) * uScanAmp; }
`;

const buildingVert = /* glsl */ `
  attribute float aSeed;
  attribute float aRim;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying float vRim;
  varying float vTop;
  void main(){
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(m) * normal);
    vSeed = aSeed;
    vRim = aRim;
    vTop = (m * vec4(0.0, 1.0, 0.0, 1.0)).y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const buildingFrag = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying float vRim;
  varying float vTop;
  void main(){
    vec3 n = normalize(vN);
    float h = vWorld.y;
    vec3 base = vec3(0.020, 0.024, 0.023) + vec3(0.018, 0.022, 0.020) * clamp(h / 24.0, 0.0, 1.0);
    vec3 L = normalize(vec3(-0.45, 0.75, 0.4));
    float diff = max(dot(n, L), 0.0) * 0.7 + 0.3;
    vec3 col = base * diff;

    float side = step(abs(n.y), 0.5);
    if (side > 0.5) {
      float u = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
      vec2 g = vec2(u * 2.4, h * 1.7);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float win = step(0.22, f.x) * step(f.x, 0.72) * step(0.28, f.y) * step(f.y, 0.78);
      float r = hash(cell + vSeed * 37.31);
      float lit = step(0.88, r);
      float flick = 0.8 + 0.2 * sin(uTime * 0.7 + r * 60.0);
      vec3 warm = mix(vec3(1.0, 0.78, 0.48), vec3(0.75, 0.9, 1.0), step(0.965, r));
      warm = mix(warm, uLime, step(0.993, r) * vRim);
      float ground = smoothstep(0.5, 1.2, h);
      col += win * lit * warm * 0.42 * flick * ground;
      col += win * (1.0 - lit) * vec3(0.010, 0.012, 0.012);
    } else {
      col = vec3(0.026, 0.031, 0.030);
    }

    float topDist = vTop - h;
    float rim = (1.0 - smoothstep(0.0, 0.09, topDist)) * side;
    col += rim * mix(vec3(0.07, 0.08, 0.075), uLime * 1.8, vRim);

    float s = scanF(vWorld.xz);
    col += uLime * s * (0.10 + rim * 2.2 + side * 0.06);

    col = mix(col, uFogColor, clamp(fogF(vWorld), 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const groundVert = /* glsl */ `
  varying vec3 vWorld;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const groundFrag = /* glsl */ `
  ${COMMON}
  uniform vec3 uLakes[6];
  uniform float uRoutes;
  uniform vec2 uHsr;
  uniform float uHsrR;
  varying vec3 vWorld;
  void main(){
    vec2 p = vWorld.xz;
    vec2 q = fract(p / ${BLOCK.toFixed(1)} + 0.5) - 0.5;
    vec2 ds = (0.5 - abs(q)) * ${BLOCK.toFixed(1)};   // distance to street centre lines
    float street = 1.0 - smoothstep(${(STREET * 0.5).toFixed(2)}, ${(STREET * 0.5 + 0.12).toFixed(2)}, min(ds.x, ds.y));
    float centre = 1.0 - smoothstep(0.0, 0.05, min(ds.x, ds.y));
    float dash = step(0.5, fract((ds.x < ds.y ? p.y : p.x) * 0.8));

    vec3 col = vec3(0.012, 0.014, 0.013);
    col += street * vec3(0.016, 0.019, 0.018);
    col += centre * dash * street * vec3(0.03);

    // arterial "binwala routes": every 4th street, faint lime
    vec2 idx = floor(p / ${BLOCK.toFixed(1)});
    float artX = step(0.5, 1.0 - step(0.5, mod(idx.x, 4.0))) ;
    float artY = step(0.5, 1.0 - step(0.5, mod(idx.y, 4.0))) ;
    float art = max(artX * (1.0 - smoothstep(0.0, 0.08, ds.x)), artY * (1.0 - smoothstep(0.0, 0.08, ds.y)));
    float flow = 0.5 + 0.5 * sin((p.x + p.y) * 0.15 - uTime * 1.5);
    float dz = length(p - uHsr);
    float zone = 1.0 - smoothstep(uHsrR * 0.9, uHsrR * 1.6, dz);
    col += art * uLime * (0.05 + 0.08 * flow) * uRoutes * zone;
    // launch-zone boundary: dashed lime ring + soft fill
    float ang = atan(p.y - uHsr.y, p.x - uHsr.x);
    float dashes = step(0.45, fract(ang * 9.0 - uTime * 0.25));
    col += uLime * (1.0 - smoothstep(0.0, 0.22, abs(dz - uHsrR))) * (0.35 + 0.65 * dashes) * 0.9;
    col += uLime * 0.025 * (1.0 - smoothstep(0.0, uHsrR, dz));

    // lakes
    for (int i = 0; i < 6; i++) {
      float d = length(p - uLakes[i].xy) - uLakes[i].z;
      if (d < 0.0) {
        float shimmer = 0.5 + 0.5 * sin(p.x * 3.0 + p.y * 1.3 + uTime * 0.8 + sin(p.y * 2.0 + uTime));
        col = vec3(0.006, 0.012, 0.012) + vec3(0.01, 0.02, 0.016) * shimmer;
      }
      col += uLime * 0.35 * (1.0 - smoothstep(0.0, 0.18, abs(d)));
    }

    float s = scanF(p);
    col += uLime * s * (0.05 + street * 0.12);

    float edge = smoothstep(${CITY_R.toFixed(1)}, ${(CITY_R + 40).toFixed(1)}, length(p));
    col = mix(col, uFogColor * 0.9, edge);
    col = mix(col, uFogColor, clamp(fogF(vWorld), 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const podVert = /* glsl */ `
  uniform float uTime;
  uniform float uL;
  attribute float aAxis;
  attribute float aLine;
  attribute float aSpeed;
  attribute float aOffset;
  attribute float aCenter;
  attribute float aRange;
  attribute float aKind;
  attribute float aLen;
  varying float vHead;
  varying float vKind;
  varying float vFade;
  varying vec3 vWorld;
  void main(){
    vec3 lp = position * vec3(0.17, 0.09, aLen);
    float along = aCenter + mod(uTime * aSpeed + aOffset, 2.0 * aRange) - aRange;
    float dir = sign(aSpeed);
    vec3 wp;
    if (aAxis < 0.5) wp = vec3(along + lp.z * dir, 0.14 + lp.y, aLine + lp.x);
    else             wp = vec3(aLine + lp.x, 0.14 + lp.y, along + lp.z * dir);
    vHead = position.z + 0.5;
    vKind = aKind;
    vFade = 1.0 - smoothstep(aRange * 0.75, aRange, abs(along - aCenter));
    vWorld = wp;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(wp, 1.0);
  }
`;

const podFrag = /* glsl */ `
  ${COMMON}
  uniform float uIntensity;
  varying float vHead;
  varying float vKind;
  varying float vFade;
  varying vec3 vWorld;
  void main(){
    vec3 c = mix(uLime * 2.6, vec3(1.0, 0.92, 0.82) * 0.9, vKind);
    float a = pow(vHead, 2.4) * vFade;
    a += smoothstep(0.93, 1.0, vHead) * 1.5 * vFade;
    float f = clamp(fogF(vWorld), 0.0, 1.0);
    gl_FragColor = vec4(c * a * (1.0 - f) * uIntensity, 1.0);
  }
`;

const beamVert = /* glsl */ `
  varying float vY;
  varying vec3 vN;
  varying vec3 vW;
  void main(){
    vY = uv.y;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uCamPos;
  varying float vY;
  varying vec3 vN;
  varying vec3 vW;
  void main(){
    vec3 v = normalize(uCamPos - vW);
    float fres = pow(1.0 - abs(dot(normalize(vN), v)), 1.5);
    float fall = pow(1.0 - vY, 2.2);
    float pulse = 0.75 + 0.25 * sin(uTime * 2.2 + uPhase);
    float bands = 0.85 + 0.15 * sin(vY * 40.0 - uTime * 3.0);
    float a = (0.25 + fres * 0.9) * fall * pulse * bands * uPower;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const ringVert = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;

const ringFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uPower;
  varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    float t = fract(uTime * 0.45 + uPhase);
    float ring = exp(-pow((d - t) * 22.0, 2.0)) * (1.0 - t);
    float ring2 = exp(-pow((d - fract(t + 0.5)) * 22.0, 2.0)) * (1.0 - fract(t + 0.5));
    float core = exp(-d * d * 60.0) * 1.6;
    float hud = (1.0 - smoothstep(0.0, 0.012, abs(d - 0.34))) * 0.5;
    float ticks = step(0.92, fract(atan(p.y, p.x) / 6.2831 * 24.0)) * (1.0 - smoothstep(0.0, 0.03, abs(d - 0.42)));
    float a = (ring + ring2 * 0.6 + core + hud + ticks * 0.6) * uPower * (1.0 - smoothstep(0.9, 1.0, d));
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const arcVert = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main(){ vT = aT; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;

const arcFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uPower;
  varying float vT;
  void main(){
    float packet = pow(fract(vT * 3.0 - uTime * 0.35 + uPhase), 10.0);
    float base = 0.14;
    float ends = smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
    gl_FragColor = vec4(uColor * (base + packet * 2.2) * ends * uPower, 1.0);
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uLime;
  varying vec3 vDir;
  void main(){
    float y = normalize(vDir).y;
    float h = exp(-abs(y) * 9.0);
    vec3 c = mix(uTop, uHorizon, h);
    c += uLime * 0.025 * exp(-abs(y - 0.02) * 30.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;
const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }
`;

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.028 },
    uAberration: { value: 0.0007 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= mix(1.0, smoothstep(0.85, 0.15, r2 * 1.6), uVignette);
      col += (rnd(vUv * 900.0 + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/* ------------------------------------------------------------------ */
/* Scene                                                              */
/* ------------------------------------------------------------------ */

type Beacon = {
  id: string;
  pos: THREE.Vector2;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  ring: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  arc: THREE.Line<THREE.BufferGeometry, THREE.ShaderMaterial>;
  power: number;
  targetPower: number;
  height: number;
  targetHeight: number;
};

export type CityOptions = { mobile: boolean; reducedMotion: boolean };

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finish: ShaderPass;
  private last = 0;
  private raf = 0;
  private running = false;
  private disposed = false;
  private sharedUniforms: Record<string, THREE.IUniform>;
  private beacons: Beacon[] = [];
  private arcsMat: THREE.ShaderMaterial[] = [];
  private hubMats: THREE.ShaderMaterial[] = [];
  private podMat!: THREE.ShaderMaterial;
  private groundMat!: THREE.ShaderMaterial;
  private dust!: THREE.Points;
  private camPos = new THREE.Vector3(34, 8, 48);
  private camTarget = new THREE.Vector3(-4, 3, -6);
  private lastMode: string = "";
  private countsVersion = -1;
  private scanStart = 0;
  private scanOrigin = new THREE.Vector2(0, 0);
  private time = 0;
  private opts: CityOptions;
  private onResize = () => this.resize();
  private onVisibility = () => (document.hidden ? this.stop() : this.start());
  private tmp = new THREE.Vector3();
  private fpsSamples: number[] = [];
  private degraded = false;
  private bloomBase = 1;
  private skyMat!: THREE.ShaderMaterial;
  private pin!: THREE.Group;
  private pinBeam!: THREE.ShaderMaterial;
  private pinRing!: THREE.ShaderMaterial;
  private pinKey = "";
  private pinDrop = 0;
  private pinPos = new THREE.Vector2();
  private fogTarget = new THREE.Color("#070908");
  private horizonTarget = new THREE.Color("#0d120f");

  constructor(private canvas: HTMLCanvasElement, opts: CityOptions) {
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.mobile ? 1.3 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    const fog = new THREE.Color("#070908");
    this.scene.background = fog;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    this.camera.position.copy(this.camPos);

    this.sharedUniforms = {
      uTime: { value: 0 },
      uFogColor: { value: fog },
      uFogDensity: { value: 0.0105 },
      uLime: { value: new THREE.Color("#C8FF2E") },
      uCamPos: { value: this.camera.position },
      uScanOrigin: { value: this.scanOrigin },
      uScanR: { value: 0 },
      uScanAmp: { value: opts.reducedMotion ? 0 : 1 },
    };

    this.buildSky();
    this.buildGround();
    this.buildBuildings();
    this.buildPods();
    this.buildBeacons();
    this.buildHubs();
    this.buildDust();
    this.buildPin();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomBase = opts.mobile ? 0.85 : 1.0;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomBase, 0.55, 0.12);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    if (opts.mobile) this.finish.uniforms.uAberration.value = 0.0008;
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.stop();
    });
  }

  /* -------------------------------- build -------------------------------- */

  private mat(vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}, additive = false) {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...this.sharedUniforms, ...extra },
      transparent: additive,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  private buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTop: { value: new THREE.Color("#030404") },
        uHorizon: { value: new THREE.Color("#0d120f") },
        uLime: this.sharedUniforms.uLime,
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyMat = mat;
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(700, 700, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.groundMat = this.mat(groundVert, groundFrag, {
      uLakes: { value: LAKES },
      uRoutes: { value: 1 },
      uHsr: { value: HSR },
      uHsrR: { value: HSR_R },
    });
    const ground = new THREE.Mesh(geo, this.groundMat);
    this.scene.add(ground);
  }

  private buildBuildings() {
    const rand = rng(20260101);
    const hoods = CLUSTERS.map(([lat, lng]) => toWorld(lat, lng));
    const items: { x: number; z: number; w: number; d: number; h: number; rim: number }[] = [];
    const N = Math.ceil(CITY_R / BLOCK);
    const lot = BLOCK - STREET;
    const maxBuildings = this.opts.mobile ? 2200 : 4200;

    for (let bx = -N; bx <= N; bx++) {
      for (let bz = -N; bz <= N; bz++) {
        const cx = bx * BLOCK;
        const cz = bz * BLOCK;
        const r = Math.hypot(cx, cz);
        if (r > CITY_R + rand() * 10) continue;
        if (LAKES.some((l) => Math.hypot(cx - l.x, cz - l.y) < l.z + 2.2)) continue;
        if (HUBS.some((h) => Math.hypot(cx - h.x, cz - h.y) < 7)) continue;

        let dens = 0;
        for (const h of hoods) {
          const d2 = (cx - h.x) ** 2 + (cz - h.y) ** 2;
          dens += Math.exp(-d2 / (2 * 9 * 9));
        }
        dens = Math.min(dens, 1.4);
        const core = Math.exp(-((cx + 10) ** 2 + (cz + 4) ** 2) / (2 * 22 * 22));
        const outskirts = THREE.MathUtils.smoothstep(r, 55, CITY_R);
        if (rand() < 0.08 + outskirts * 0.45) continue; // parks / open land

        const split = rand();
        const lots: [number, number, number, number][] =
          split < 0.3
            ? [[cx, cz, lot, lot]]
            : split < 0.6
              ? [
                  [cx - lot / 4, cz, lot / 2, lot],
                  [cx + lot / 4, cz, lot / 2, lot],
                ]
              : [
                  [cx - lot / 4, cz - lot / 4, lot / 2, lot / 2],
                  [cx + lot / 4, cz - lot / 4, lot / 2, lot / 2],
                  [cx - lot / 4, cz + lot / 4, lot / 2, lot / 2],
                  [cx + lot / 4, cz + lot / 4, lot / 2, lot / 2],
                ];

        for (const [x, z, w, d] of lots) {
          if (rand() < 0.1) continue;
          const t = rand();
          let h = 0.5 + t * t * t * (2.5 + dens * 9 + core * 16) + rand() * 1.4 * (1 - outskirts);
          if (rand() < 0.012 + core * 0.05) h += 10 + rand() * 18; // towers
          const shrink = 0.72 + rand() * 0.22;
          items.push({
            x: x + (rand() - 0.5) * 0.25,
            z: z + (rand() - 0.5) * 0.25,
            w: w * shrink,
            d: d * (0.72 + rand() * 0.22),
            h,
            rim: Math.hypot(x - HSR.x, z - HSR.y) < HSR_R && h > 1.5 && rand() < 0.55 ? 1 : 0,
          });
        }
      }
    }

    const list = items.slice(0, maxBuildings);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = this.mat(buildingVert, buildingFrag);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const seeds = new Float32Array(list.length);
    const rims = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d);
      m.setPosition(b.x, 0, b.z);
      mesh.setMatrixAt(i, m);
      seeds[i] = rand();
      rims[i] = b.rim;
    });
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute("aRim", new THREE.InstancedBufferAttribute(rims, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private buildPods() {
    const rand = rng(7);
    const count = this.opts.mobile ? 260 : 520;
    const L = CITY_R + 8;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.setAttribute("position", geo.getAttribute("position"));
    const A = (n: number) => new Float32Array(n);
    const axis = A(count), line = A(count), speed = A(count), offset = A(count), kind = A(count), len = A(count);
    const center = A(count), range = A(count);
    const N = Math.floor(L / BLOCK);
    for (let i = 0; i < count; i++) {
      const lime = i < count * 0.24; // Binwala pods only run inside the HSR launch zone
      axis[i] = rand() < 0.5 ? 0 : 1;
      const lane = rand() < 0.5 ? -0.28 : 0.28;
      const dir = lane > 0 ? 1 : -1;
      if (lime) {
        // street lines crossing the zone; x-moving pods sit on a z street and vice versa
        const across = axis[i] === 0 ? HSR.y : HSR.x;
        const along0 = axis[i] === 0 ? HSR.x : HSR.y;
        const k = Math.floor((across + (rand() * 2 - 1) * HSR_R * 0.8) / BLOCK);
        const lineV = k * BLOCK + BLOCK / 2;
        const half = Math.sqrt(Math.max(4, HSR_R * HSR_R - (lineV - across) ** 2));
        line[i] = lineV + lane;
        center[i] = along0;
        range[i] = half;
        speed[i] = dir * (2.5 + rand() * 2.5);
        offset[i] = rand() * 2 * half;
        len[i] = 1.6 + rand() * 1.6;
      } else {
        const k = Math.floor((rand() * 2 - 1) * N);
        line[i] = k * BLOCK + BLOCK / 2 + lane;
        center[i] = 0;
        range[i] = L;
        speed[i] = dir * (3 + rand() * 7);
        offset[i] = rand() * 2 * L;
        len[i] = 1.2 + rand() * 1.6;
      }
      kind[i] = lime ? 0 : 1;
    }
    inst.setAttribute("aCenter", new THREE.InstancedBufferAttribute(center, 1));
    inst.setAttribute("aRange", new THREE.InstancedBufferAttribute(range, 1));
    inst.setAttribute("aAxis", new THREE.InstancedBufferAttribute(axis, 1));
    inst.setAttribute("aLine", new THREE.InstancedBufferAttribute(line, 1));
    inst.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(speed, 1));
    inst.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 1));
    inst.setAttribute("aKind", new THREE.InstancedBufferAttribute(kind, 1));
    inst.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1));
    inst.instanceCount = count;
    this.podMat = this.mat(podVert, podFrag, { uL: { value: L }, uIntensity: { value: 1 } }, true);
    const mesh = new THREE.Mesh(inst, this.podMat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private buildBeacons() {
    const lime = this.sharedUniforms.uLime.value as THREE.Color;
    [{ id: "hsr", pos: HSR.clone() }].forEach((n, i) => {
      const pos = n.pos;
      const phase = { value: i * 1.37 };
      const power = { value: 0.0 };

      const beamGeo = new THREE.CylinderGeometry(0.12, 0.55, 1, 20, 1, true);
      beamGeo.translate(0, 0.5, 0);
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.ShaderMaterial({
          vertexShader: beamVert,
          fragmentShader: beamFrag,
          uniforms: { uColor: { value: lime.clone() }, uPower: power, uTime: this.sharedUniforms.uTime, uPhase: phase, uCamPos: this.sharedUniforms.uCamPos },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.set(pos.x, 0, pos.y);
      beam.scale.set(2.2, 10, 2.2);
      this.scene.add(beam);

      const ringGeo = new THREE.PlaneGeometry(1, 1);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.ShaderMaterial({
          vertexShader: ringVert,
          fragmentShader: ringFrag,
          uniforms: { uColor: { value: lime.clone() }, uTime: this.sharedUniforms.uTime, uPhase: { value: (i * 0.173) % 1 }, uPower: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.position.set(pos.x, 0.06, pos.y);
      ring.scale.setScalar(HSR_R * 2.4);
      this.scene.add(ring);

      // arc to nearest hub
      const hub = HUBS.reduce((a, b) => (a.distanceTo(pos) < b.distanceTo(pos) ? a : b));
      const mid = pos.clone().add(hub).multiplyScalar(0.5);
      const dist = pos.distanceTo(hub);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pos.x, 0.3, pos.y),
        new THREE.Vector3(mid.x, 4 + dist * 0.35, mid.y),
        new THREE.Vector3(hub.x, 0.3, hub.y),
      );
      const pts = curve.getPoints(64);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
      arcGeo.setAttribute("aT", new THREE.Float32BufferAttribute(pts.map((_, k) => k / (pts.length - 1)), 1));
      const arcMat = new THREE.ShaderMaterial({
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        uniforms: { uColor: { value: lime.clone() }, uTime: this.sharedUniforms.uTime, uPhase: { value: (i * 0.29) % 1 }, uPower: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const arc = new THREE.Line(arcGeo, arcMat);
      this.arcsMat.push(arcMat);
      this.scene.add(arc);

      this.beacons.push({ id: n.id, pos, beam, ring, arc, power: 0, targetPower: 0.5, height: 8, targetHeight: 8 });
    });
  }

  private buildHubs() {
    HUBS.forEach((h, i) => {
      const ringGeo = new THREE.PlaneGeometry(1, 1);
      ringGeo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        uniforms: { uColor: { value: new THREE.Color("#E9FFE0") }, uTime: this.sharedUniforms.uTime, uPhase: { value: i * 0.3 }, uPower: { value: 0.6 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(h.x, 0.08, h.y);
      ring.scale.setScalar(16);
      this.scene.add(ring);
      this.hubMats.push(mat);

      // the hub structure: stacked glowing slabs
      for (let k = 0; k < 3; k++) {
        const g = new THREE.BoxGeometry(6 - k * 1.6, 0.5, 6 - k * 1.6);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02 + k * 0.02, 0.03 + k * 0.03, 0.025 + k * 0.02) }));
        m.position.set(h.x, 0.25 + k * 0.55, h.y);
        this.scene.add(m);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(g),
          new THREE.LineBasicMaterial({ color: new THREE.Color("#C8FF2E").multiplyScalar(1.5), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
        );
        edges.position.copy(m.position);
        this.scene.add(edges);
      }
    });
  }

  private buildDust() {
    const count = this.opts.mobile ? 400 : 900;
    const rand = rng(99);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 200;
      pos[i * 3 + 1] = rand() * 40;
      pos[i * 3 + 2] = (rand() - 0.5) * 200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color("#C8FF2E").multiplyScalar(0.55),
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  /** The signup pin: a white-hot beam + target rings that drop on the person's building. */
  private buildPin() {
    this.pin = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(0.08, 0.32, 1, 20, 1, true);
    beamGeo.translate(0, 0.5, 0);
    this.pinBeam = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: {
        uColor: { value: new THREE.Color("#f4ffd9") },
        uPower: { value: 1.6 },
        uTime: this.sharedUniforms.uTime,
        uPhase: { value: 0 },
        uCamPos: this.sharedUniforms.uCamPos,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, this.pinBeam);
    beam.scale.set(1, 26, 1);
    this.pin.add(beam);
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.pinRing = new THREE.ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      uniforms: { uColor: { value: new THREE.Color("#C8FF2E").multiplyScalar(1.4) }, uTime: this.sharedUniforms.uTime, uPhase: { value: 0 }, uPower: { value: 1.4 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, this.pinRing);
    ring.position.y = 0.1;
    ring.scale.setScalar(7);
    this.pin.add(ring);
    this.pin.visible = false;
    this.scene.add(this.pin);
  }

  private static MOODS: Record<string, { fog: string; horizon: string }> = {
    none: { fog: "#070908", horizon: "#0d120f" },
    morning: { fog: "#0c1114", horizon: "#3b3121" },
    afternoon: { fog: "#10150f", horizon: "#2b3a1f" },
    evening: { fog: "#130c08", horizon: "#552612" },
    midnight: { fog: "#030405", horizon: "#0a1220" },
  };

  private updateSignup(dt: number) {
    const s = bus.signup;
    const mood = CityScene.MOODS[(s.active && s.slot) || "none"] ?? CityScene.MOODS.none;
    this.fogTarget.set(mood.fog);
    this.horizonTarget.set(mood.horizon);
    const k = 1 - Math.exp(-dt * 2.2);
    const fog = this.sharedUniforms.uFogColor.value as THREE.Color;
    fog.lerp(this.fogTarget, k);
    (this.scene.background as THREE.Color).copy(fog);
    (this.skyMat.uniforms.uHorizon.value as THREE.Color).lerp(this.horizonTarget, k);
    this.podMat.uniforms.uIntensity.value += ((s.active && s.dumps ? 0.75 + s.dumps * 0.22 : 1) - this.podMat.uniforms.uIntensity.value) * k;

    const key = s.active && s.pin ? `${s.pin.lat.toFixed(5)},${s.pin.lng.toFixed(5)}` : "";
    if (key !== this.pinKey) {
      this.pinKey = key;
      if (s.pin) {
        this.pinPos.copy(toWorld(s.pin.lat, s.pin.lng));
        this.pin.position.set(this.pinPos.x, 0, this.pinPos.y);
        this.pinDrop = 0;
        bus.pulse = { id: "__pin", at: performance.now() };
        this.scanOrigin.copy(this.pinPos);
        this.scanStart = performance.now();
      }
    }
    this.pin.visible = Boolean(key);
    if (this.pin.visible) {
      this.pinDrop = Math.min(1, this.pinDrop + dt * 1.4);
      const e = 1 - Math.pow(1 - this.pinDrop, 3);
      this.pin.children[0].scale.y = 26 * e;
      this.pin.children[1].scale.setScalar(4 + e * 4);
    }
  }

  /* ------------------------------- runtime ------------------------------- */

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.bloom.resolution.set((w * pr) / 2, (h * pr) / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private applyCounts() {
    if (this.countsVersion === bus.countsVersion) return;
    this.countsVersion = bus.countsVersion;
    let c = 0;
    bus.counts.forEach((v, id) => {
      if (id !== "outside") c += v;
    });
    const k = Math.min(1, Math.log10(1 + c) / 3); // grows with HSR demand, saturates ~1,000 signups
    for (const b of this.beacons) {
      b.targetHeight = 16 + k * 34;
      b.targetPower = 0.75 + k * 0.6;
    }
  }

  private pose(dt: number) {
    const t = this.time;
    const mode = bus.mode;
    const px = bus.pointer.x;
    const py = bus.pointer.y;
    const pos = this.tmp.set(0, 0, 0);
    const target = new THREE.Vector3();
    const aspect = this.camera.aspect;
    const rm = this.opts.reducedMotion ? 0 : 1;

    if (mode === "hero" || mode === "hidden") {
      const hp = bus.heroProgress;
      const narrow = aspect < 0.8;
      const a = -0.5 + Math.sin(t * 0.04) * 0.07 * rm + px * 0.04;
      const r = (narrow ? 150 : 112) - hp * 18;
      pos.set(Math.sin(a) * r, (narrow ? 62 : 34) + hp * 26 - py * 2, Math.cos(a) * r);
      // push the city to the right of the frame on desktop, to the top on phones
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const toCam = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      if (narrow) target.copy(toCam).multiplyScalar(30);
      else target.copy(right).multiplyScalar(-26 - px * 3);
      target.x += HSR.x * 0.6;
      target.z += HSR.y * 0.6;
      target.y = 2 + hp * 4;
      this.camera.fov = narrow ? 46 : 38;
    } else if (mode === "network") {
      const p = THREE.MathUtils.smoothstep(bus.networkProgress, 0.2, 0.92);
      const tf = Math.tan(THREE.MathUtils.degToRad(38 / 2));
      const narrow = aspect < 1.0;
      // frame the launch zone with breathing room; on wide screens leave the left for the panel
      const H = Math.max((HSR_R * 2.1) / tf, (HSR_R * 2.1) / (tf * aspect)) * (narrow ? 1.25 : 1);
      const halfW = H * tf * aspect;
      const halfH = H * tf;
      const sx = aspect > 1.15 ? -halfW * 0.36 : 0;
      const sz = narrow ? halfH * 0.42 : 0;
      const top = new THREE.Vector3(HSR.x + sx, H, HSR.y + sz + H * 0.18);
      const topT = new THREE.Vector3(HSR.x + sx, 0, HSR.y + sz);
      const obl = new THREE.Vector3(HSR.x - 40, 46, HSR.y + 80);
      const oblT = new THREE.Vector3(HSR.x, 0, HSR.y);
      pos.lerpVectors(obl, top, p);
      target.lerpVectors(oblT, topT, p);
      const orbit = Math.sin(t * 0.08) * 3 * rm;
      pos.x += orbit + px * 1.5 * (1 - p * 0.6);
      pos.z += py * 1.5 * (1 - p * 0.6);
      this.camera.fov = 38;
    } else if (mode === "signup") {
      const narrow = aspect < 0.8;
      const focus = bus.signup.pin ? this.pinPos : HSR;
      const close = bus.signup.pin ? 1 : 0;
      const a = 0.35 + t * 0.035 * rm + px * 0.05;
      const r = (narrow ? 80 : 58) - close * (narrow ? 26 : 22);
      pos.set(focus.x + Math.sin(a) * r, (narrow ? 58 : 34) - close * 8 - py * 2, focus.y + Math.cos(a) * r);
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const toCam = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      target.set(focus.x, 1.5, focus.y);
      // keep the subject in the open half of the screen: right on desktop, top on phones
      if (narrow) target.addScaledVector(toCam, 16);
      else target.addScaledVector(right, -r * 0.3);
      this.camera.fov = narrow ? 50 : 38;
    } else {
      const fp = bus.finaleProgress;
      const a = 0.9 + t * 0.03 * rm + fp * 0.6 + px * 0.06;
      const r = aspect < 0.8 ? 170 : 128;
      pos.set(HSR.x + Math.sin(a) * r, 40 + fp * 22 - py * 2, HSR.y + Math.cos(a) * r);
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      target.copy(right).multiplyScalar(aspect < 0.8 ? 0 : -26);
      target.x += HSR.x;
      target.z += HSR.y;
      target.y = 4;
      this.camera.fov = aspect < 0.8 ? 50 : 38;
    }

    if (mode !== this.lastMode) {
      this.camPos.copy(pos);
      this.camTarget.copy(target);
      this.lastMode = mode;
    } else {
      const k = 1 - Math.exp(-dt * 4.5);
      this.camPos.lerp(pos, k);
      this.camTarget.lerp(target, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    const nowT = performance.now();
    const dtRaw = Math.min((nowT - this.last) / 1000, 0.1);
    this.last = nowT;
    const dt = dtRaw * (this.opts.reducedMotion ? 0.35 : 1);
    this.time += dt;
    const t = this.time;
    this.sharedUniforms.uTime.value = t;
    this.finish.uniforms.uTime.value = t;

    this.applyCounts();

    // scan wave: periodic from the CBD; a signup fires one from that neighbourhood
    const now = performance.now();
    if (bus.pulse && bus.pulse.at > this.scanStart) {
      const b = this.beacons.find((x) => x.id === bus.pulse!.id);
      if (b) this.scanOrigin.copy(b.pos);
      this.scanStart = bus.pulse.at;
    }
    const since = (now - this.scanStart) / 1000;
    if (since > 9) {
      this.scanStart = now;
      this.scanOrigin.copy(HSR);
    }
    this.sharedUniforms.uScanR.value = since * 26;
    this.sharedUniforms.uScanAmp.value = this.opts.reducedMotion ? 0 : Math.max(0, 1 - since / 6);

    this.updateSignup(dtRaw);
    this.pose(dtRaw);

    const net = bus.mode === "network" ? THREE.MathUtils.smoothstep(bus.networkProgress, 0.3, 0.9) : 0;
    const k = 1 - Math.exp(-dtRaw * 3);
    for (const b of this.beacons) {
      const hl = bus.highlight === b.id ? 1 : 0;
      b.height += (b.targetHeight * (1 + hl * 0.5) - b.height) * k;
      b.power += (b.targetPower * (1 + hl * 1.2) - b.power) * k;
      b.beam.scale.set(2.2, b.height * (bus.mode === "network" ? 0.6 + net * 0.4 : 1), 2.2);
      b.beam.material.uniforms.uPower.value = b.power;
      b.ring.material.uniforms.uPower.value = b.power * (0.7 - net * 0.25) * (1 + hl);
      b.ring.scale.setScalar(HSR_R * 2.3);
      b.arc.material.uniforms.uPower.value = (bus.mode === "finale" ? 0.8 : net) * (0.6 + b.power * 0.6);
    }
    this.groundMat.uniforms.uRoutes.value = 0.6 + net * 0.8;
    this.bloom.strength = this.bloomBase * (1 - net * 0.45);
    this.dust.rotation.y = t * 0.004;
    this.dust.position.y = Math.sin(t * 0.2) * 0.5;

    this.composer.render(dtRaw);
    this.emitScreenPoints();
    this.watchPerf(dtRaw);
  }

  private emitScreenPoints() {
    if (!bus.listeners.size) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pts: ScreenPoint[] = this.beacons.map((b) => {
      const v = new THREE.Vector3(b.pos.x, 0.5, b.pos.y).project(this.camera);
      return {
        id: b.id,
        x: (v.x * 0.5 + 0.5) * w,
        y: (-v.y * 0.5 + 0.5) * h,
        depth: v.z,
        onScreen: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05,
      };
    });
    bus.listeners.forEach((fn) => fn(pts));
  }

  /** Drop expensive bits automatically on slow GPUs. Conversion beats eye-candy. */
  private watchPerf(dt: number) {
    if (this.degraded) return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 90) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (avg > 1 / 38) {
      this.degraded = true;
      this.renderer.setPixelRatio(1);
      this.finish.uniforms.uAberration.value = 0;
      this.resize();
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
