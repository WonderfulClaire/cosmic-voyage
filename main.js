// main.js —— 沉浸式宇宙旅行核心逻辑（整个宇宙版）
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LOCATIONS, ZONES, INTRO } from './knowledge.js';

/* ---------------- 渲染器 / 场景 / 相机 ---------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000006);
scene.fog = new THREE.FogExp2(0x000006, 0.0000008);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600000);
camera.position.set(3450, 220, 520);
camera.lookAt(0, 0, 0);

/* ---------------- 控制器（第一人称飞船） ---------------- */
const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');

// ---- 任务状态机 ----
let gameState = 'intro';          // intro | countdown | flying | paused | returning
let fovTarget = 72;               // 相机 FOV 缓动目标（发射拉伸 / 返航收缩）
const visited = new Set();        // 已查看科普的地点（去重）
let totalDist = 0;                // 累计飞行距离（u）
let missionStart = 0;             // 发射时刻（performance.now）
let uiOpen = false;               // 星图航图 / 图鉴是否打开（避免误触发暂停）
let flyTo = null;                 // 区域跃迁目标 {target, zone}
let currentZone = ZONES[0];       // 当前所在区域（就近判定）
let mode = 'roam';                // 'roam' | 'expedition'（火星远征剧情模式）

controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  if (gameState === 'paused') { gameState = 'flying'; hidePause(); }
});
controls.addEventListener('unlock', () => {
  if (mode === 'expedition') return;                    // 远征中 ESC 不触发漫游暂停
  if (uiOpen) return;                                   // 打开航图/图鉴时不进入暂停
  if (gameState === 'flying') { gameState = 'paused'; showPause(); }
  else if (gameState === 'countdown') {                 // 倒计时中误按 ESC：回到开场
    gameState = 'intro';
    document.getElementById('launch').style.display = 'none';
    blocker.style.display = 'flex';
  }
});

/* ---------------- 灯光 ---------------- */
scene.add(new THREE.AmbientLight(0x334455, 0.55));
const sunLight = new THREE.PointLight(0xfff2c0, 4.5, 0, 0); // 不随距离衰减，照亮全太阳系
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

/* ---------------- 程序化纹理 ---------------- */
function makePlanetTexture(baseHex, opts = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `#${base.getHexString()}`; ctx.fillRect(0, 0, 512, 256);
  const bands = opts.bands || 6;
  for (let i = 0; i < bands; i++) {
    const y = Math.random() * 256, h = 8 + Math.random() * 36;
    const shade = 0.6 + Math.random() * 0.5;
    const col = base.clone().multiplyScalar(shade);
    ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.5)`;
    ctx.fillRect(0, y, 512, h);
  }
  for (let i = 0; i < (opts.spots || 45); i++) {
    const x = Math.random() * 512, y = Math.random() * 256, r = 2 + Math.random() * 14;
    const shade = 0.5 + Math.random() * 0.8;
    const col = base.clone().multiplyScalar(shade);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.35)`;
    ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  if (opts.iceCaps) {
    ctx.fillStyle = 'rgba(245,250,255,0.92)';
    ctx.fillRect(0, 0, 512, 26); ctx.fillRect(0, 230, 512, 26);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeStarTexture(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hex);
  ctx.fillStyle = `#${col.getHexString()}`; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 4 + Math.random() * 22;
    const b = Math.random();
    const rr = Math.min(255, col.r * 255 + b * 60) | 0;
    const gg = Math.min(255, col.g * 255 + b * 50) | 0;
    const bb = Math.min(255, col.b * 255 + b * 40) | 0;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${0.22 + Math.random() * 0.3})`;
    ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeRingTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 32;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    const a = 0.25 + 0.55 * Math.abs(Math.sin(t * 38)) * (0.5 + 0.5 * Math.sin(t * 7));
    const s = 210 + Math.random() * 35;
    ctx.fillStyle = `rgba(${s | 0},${(s * 0.9) | 0},${(s * 0.72) | 0},${a})`;
    ctx.fillRect(x, 0, 1, 32);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeGlowSprite(colorHex, scale) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(colorHex);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.9)`);
  g.addColorStop(0.4, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.32)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(scale, scale, 1); return s;
}
function makeTextSprite(text) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const fs = 52; ctx.font = `bold ${fs}px sans-serif`;
  const w = ctx.measureText(text).width + 48; c.width = w; c.height = fs + 28;
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.fillStyle = 'rgba(8,16,34,0.55)'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#cdeeff'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 24, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false });
  return new THREE.Sprite(m);
}

/* ---------------- 逼真地球 / 行星大气 ---------------- */
function makeEarthTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0b2c57'); g.addColorStop(0.5, '#0e4078'); g.addColorStop(1, '#0b2c57');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // 大陆：若干绿/棕椭圆斑块，拼出“有陆地有海洋”的观感
  const land = [
    [180, 165, 150, 110, '#2f7d34'], [300, 250, 120, 92, '#3a8a3f'], [140, 330, 110, 80, '#6b8e3a'],
    [520, 150, 140, 100, '#2f7d34'], [640, 260, 120, 90, '#7a8a3a'], [560, 360, 100, 70, '#5a7a34'],
    [820, 180, 130, 95, '#2f7d34'], [905, 300, 110, 80, '#6b8e3a'], [760, 400, 90, 60, '#4a7a38'],
    [420, 430, 80, 55, '#5a7a34'], [250, 420, 70, 50, '#4f7a34'],
  ];
  for (const [x, y, w, h, col] of land) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, w, h, Math.random() * 0.4, 0, 7); ctx.fill();
  }
  // 沙漠/裸土点缀
  ctx.fillStyle = 'rgba(205,175,115,0.45)';
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512;
    ctx.beginPath(); ctx.ellipse(x, y, 12 + Math.random() * 30, 8 + Math.random() * 20, 0, 0, 7); ctx.fill();
  }
  // 极冠（南北冰盖）
  ctx.fillStyle = 'rgba(245,250,255,0.95)';
  ctx.fillRect(0, 0, 1024, 34); ctx.fillRect(0, 478, 1024, 34);
  ctx.fillStyle = 'rgba(245,250,255,0.6)';
  ctx.beginPath(); ctx.ellipse(512, 34, 300, 28, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(512, 478, 300, 28, 0, 0, 7); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeCloudTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 64; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, r = 20 + Math.random() * 72;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function addAtmosphere(mesh, radius, colorHex) {
  const geo = new THREE.SphereGeometry(radius * 1.03, 48, 48);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(colorHex) } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vN; uniform vec3 uColor; void main(){ float i = pow(max(0.0, 0.78 - dot(vN, vec3(0.0,0.0,1.0))), 3.0); gl_FragColor = vec4(uColor, clamp(i,0.0,1.0)*0.85); }`,
  });
  mesh.add(new THREE.Mesh(geo, mat));
}

/* ---------------- 银河系旋臂 ---------------- */
function makeSpiralGalaxy(center, radius, colorHex, armCount) {
  armCount = armCount || 4;
  const grp = new THREE.Group();
  const count = 16000;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const c = new THREE.Color(colorHex);
  const turns = 2.4;
  for (let i = 0; i < count; i++) {
    const arm = i % armCount;
    const t = Math.pow(Math.random(), 0.55);
    const r = t * radius;
    const baseAng = arm / armCount * Math.PI * 2;
    const ang = baseAng + t * turns * Math.PI * 2 + (Math.random() - 0.5) * 0.55 * (1 - t);
    const spread = (1 - t) * radius * 0.16 + Math.random() * radius * 0.04;
    const x = Math.cos(ang) * r + (Math.random() - 0.5) * spread;
    const z = Math.sin(ang) * r + (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * radius * 0.05 * (1 - t * 0.4);
    pos[i * 3] = center.x + x; pos[i * 3 + 1] = center.y + y; pos[i * 3 + 2] = center.z + z;
    const b = 0.55 + Math.random() * 0.45;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: radius * 0.012, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
  grp.add(new THREE.Points(g, m));
  const bulge = makeGlowSprite(0xfff0c0, radius * 0.55); bulge.position.copy(center); grp.add(bulge);
  return grp;
}

/* ---------------- 舱内模式（进入空间站） ---------------- */
let interiorGroup = null, interiorActive = false, enterTarget = null;
const exteriorCamPos = new THREE.Vector3(), exteriorCamQuat = new THREE.Quaternion();
function buildInterior() {
  const grp = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc2cbd4, metalness: 0.55, roughness: 0.5, side: THREE.BackSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(720, 720, 1500, 44, 1, true), wallMat);
  wall.rotation.x = Math.PI / 2; grp.add(wall);
  const fcMat = new THREE.MeshStandardMaterial({ color: 0x707a86, metalness: 0.4, roughness: 0.7, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(720, 44), fcMat); floor.rotation.x = -Math.PI / 2; floor.position.z = 750; grp.add(floor);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(720, 44), fcMat); ceil.rotation.x = Math.PI / 2; ceil.position.z = -750; grp.add(ceil);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(380, 46, 16, 56), new THREE.MeshStandardMaterial({ color: 0x39414f, metalness: 0.7, roughness: 0.4 }));
  frame.position.z = 750; grp.add(frame);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(380, 44), new THREE.MeshBasicMaterial({ color: 0x9ec9ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  glass.position.z = 746; grp.add(glass);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x0e1622, emissive: 0x1f7fe0, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(440, 260, 28), panelMat);
    panel.position.set(Math.cos(a) * 660, Math.sin(a) * 660, -150);
    panel.lookAt(0, 0, -150); grp.add(panel);
  }
  const lamp = new THREE.PointLight(0xffffff, 1.4, 4000, 2); lamp.position.set(0, 0, 0); grp.add(lamp);
  return grp;
}
function enterCraft(L) {
  if (!interiorGroup) interiorGroup = buildInterior();
  interiorActive = true;
  exteriorCamPos.copy(camera.position);
  exteriorCamQuat.copy(camera.quaternion);
  if (L._mesh) L._mesh.visible = false;
  interiorGroup.position.copy(L._pos);
  scene.add(interiorGroup);
  camera.position.copy(L._pos).add(new THREE.Vector3(0, 0, -260));
  camera.lookAt(L._pos.x, L._pos.y, L._pos.z + 1200);
  updateEnterPrompt();
}
function exitCraft() {
  if (interiorGroup) scene.remove(interiorGroup);
  if (enterTarget && enterTarget._mesh) enterTarget._mesh.visible = true;
  camera.position.copy(exteriorCamPos);
  camera.quaternion.copy(exteriorCamQuat);
  interiorActive = false;
  updateEnterPrompt();
}
function toggleInterior() {
  if (interiorActive) exitCraft();
  else if (enterTarget) enterCraft(enterTarget);
}

/* ---------------- 星空 ---------------- */
function buildStarfield() {
  const n = 14000, g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 80000 + Math.random() * 120000;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const c = 0.6 + Math.random() * 0.4, tint = Math.random();
    col[i * 3] = c * (0.85 + 0.15 * tint);
    col[i * 3 + 1] = c * 0.85;
    col[i * 3 + 2] = c * (0.9 + 0.1 * (1 - tint));
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 220, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false });
  scene.add(new THREE.Points(g, m));
}

/* ---------------- 点云（星云 / 星系 / 星团 / 背景） ---------------- */
function makeCloud(center, radius, count, colorHex, flat = 1, opacity = 0.65) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1), r = radius * Math.cbrt(Math.random());
    pos[i * 3] = center.x + r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = center.y + r * Math.cos(ph) * flat;
    pos[i * 3 + 2] = center.z + r * Math.sin(ph) * Math.sin(th);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: colorHex, size: radius * 0.03, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}

/* ---------------- 小行星带 ---------------- */
function makeAsteroidBelt(center, spread) {
  const count = 600;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a8c7a, roughness: 1, metalness: 0 });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = spread * 0.55 + Math.random() * spread * 0.55;
    const x = center.x + Math.cos(ang) * r;
    const z = center.z + Math.sin(ang) * r;
    const y = center.y + (Math.random() - 0.5) * spread * 0.18;
    const s = 18 + Math.random() * 70;
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  return inst;
}

/* ---------------- 黑洞吸积盘 shader ---------------- */
function makeAccretionDisk(radius, colorHex) {
  const geo = new THREE.CircleGeometry(radius, 96);
  const mat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(colorHex) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform vec3 uColor;
      void main(){
        float r = distance(vUv, vec2(0.5));
        float a = smoothstep(0.5, 0.16, r);
        float ang = atan(vUv.y - 0.5, vUv.x - 0.5);
        float swirl = 0.5 + 0.5 * sin(ang * 10.0 + uTime * 2.5 - r * 26.0);
        vec3 col = mix(uColor, vec3(1.0, 0.92, 0.6), swirl * 0.7);
        gl_FragColor = vec4(col, a * 0.85);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/* ---------------- 脉冲星 / 磁星 光束 ---------------- */
function makePulsarBeams(radius, accent) {
  const grp = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamGeo = new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, radius * 34, 16, 1, true);
  const b1 = new THREE.Mesh(beamGeo, beamMat); b1.position.y = radius * 17; grp.add(b1);
  const b2 = new THREE.Mesh(beamGeo, beamMat); b2.position.y = -radius * 17; grp.add(b2);
  const glow = makeGlowSprite(accent, radius * 8); grp.add(glow);
  return grp;
}

/* ---------------- 构建所有地点 ---------------- */
function buildLocations() {
  for (const L of LOCATIONS) {
    const p = new THREE.Vector3(...L.position);
    L._pos = p;
    const label = makeTextSprite(`${L.name} · ${L.nameEn}`);
    label.position.copy(p).add(new THREE.Vector3(0, L.radius * 0.9 + 140, 0));
    label.scale.multiplyScalar(Math.max(220, L.radius * 0.9));
    scene.add(label);
    L._label = label;

    if (L.isStar) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 48, 48),
        new THREE.MeshBasicMaterial({ map: makeStarTexture(L.color), color: L.color })
      );
      const glow = makeGlowSprite(L.accent, L.radius * 6);
      mesh.add(glow);
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh;

    } else if (L.isBlackHole) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 48, 48),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      );
      const disk = makeAccretionDisk(L.radius * 2.4, L.accent);
      disk.rotation.x = -Math.PI / 2;
      mesh.add(disk);
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh; L._diskMat = disk.material;

    } else if (L.isNebula) {
      const glow = makeGlowSprite(L.color, L.radius * 2.6);
      glow.position.copy(p); scene.add(glow);
      scene.add(makeCloud(p, L.radius * 0.9, 1500, L.accent, 0.7));
      L._mesh = glow;

    } else if (L.isGalaxy) {
      const glow = makeGlowSprite(L.color, L.radius * 2.2);
      glow.position.copy(p); scene.add(glow);
      scene.add(makeCloud(p, L.radius * 0.95, 2000, L.accent, 0.25, 0.6));
      L._mesh = glow;

    } else if (L.isBelt) {
      const belt = makeAsteroidBelt(p, L.radius);
      scene.add(belt); L._mesh = belt;

    } else if (L.isPulsar || L.isMagnetar) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 32, 32),
        new THREE.MeshBasicMaterial({ color: L.accent })
      );
      mesh.add(makePulsarBeams(L.radius, L.accent));
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh;

    } else if (L.isRedGiant) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 48, 48),
        new THREE.MeshBasicMaterial({ color: L.color })
      );
      const glow = makeGlowSprite(L.accent, L.radius * 3.2);
      mesh.add(glow);
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh; L._pulse = Math.random() * 6;

    } else if (L.isWhiteDwarf) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 32, 32),
        new THREE.MeshBasicMaterial({ color: L.color })
      );
      const glow = makeGlowSprite(L.accent, L.radius * 7);
      mesh.add(glow);
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh;

    } else if (L.isPlanetary) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(L.radius * 0.8, L.radius * 0.28, 16, 64),
        new THREE.MeshBasicMaterial({ color: L.accent, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = Math.random() * Math.PI; ring.rotation.y = Math.random() * Math.PI;
      ring.position.copy(p); scene.add(ring);
      const glow = makeGlowSprite(L.color, L.radius * 2.2);
      glow.position.copy(p); scene.add(glow);
      L._mesh = ring;

    } else if (L.isComet) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      const glow = makeGlowSprite(L.accent, L.radius * 5);
      mesh.add(glow);
      // 彗尾：指向远离太阳（原点）的方向
      const tailDir = p.clone().normalize();
      const tailLen = L.radius * 26;
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(L.radius * 1.4, tailLen, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: L.accent, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      const up = new THREE.Vector3(0, 1, 0);
      tail.quaternion.setFromUnitVectors(up, tailDir);
      tail.position.copy(p).add(tailDir.clone().multiplyScalar(tailLen / 2));
      scene.add(mesh); scene.add(tail);
      mesh.position.copy(p); L._mesh = mesh;

    } else if (L.isNeutronBinary) {
      const grp = new THREE.Group();
      const m1 = new THREE.Mesh(new THREE.SphereGeometry(L.radius * 0.6, 24, 24), new THREE.MeshBasicMaterial({ color: L.color }));
      const m2 = new THREE.Mesh(new THREE.SphereGeometry(L.radius * 0.5, 24, 24), new THREE.MeshBasicMaterial({ color: L.accent }));
      m1.position.set(L.radius * 0.9, 0, 0); m2.position.set(-L.radius * 0.9, 0, 0);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(L.radius * 1.3, L.radius * 0.12, 12, 48),
        new THREE.MeshBasicMaterial({ color: L.accent, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      grp.add(m1, m2, ring);
      const glow = makeGlowSprite(L.accent, L.radius * 4); grp.add(glow);
      grp.position.copy(p); scene.add(grp); L._mesh = grp; L._spin = grp;

    } else if (L.isGlobular) {
      const glow = makeGlowSprite(L.color, L.radius * 1.8);
      glow.position.copy(p); scene.add(glow);
      scene.add(makeCloud(p, L.radius * 0.95, 2600, L.accent, 1, 0.8));
      L._mesh = glow;

    } else if (L.isScatter) {
      const glow = makeGlowSprite(L.color, L.radius * 1.6);
      glow.position.copy(p); scene.add(glow);
      scene.add(makeCloud(p, L.radius * 1.1, 800, L.accent, 1, 0.7));
      L._mesh = glow;

    } else if (L.isQuasar) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius * 0.5, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      const glow = makeGlowSprite(0xffffff, L.radius * 4);
      core.add(glow);
      const jetMat = new THREE.MeshBasicMaterial({ color: L.accent, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const jetGeo = new THREE.CylinderGeometry(L.radius * 0.18, L.radius * 0.18, L.radius * 8, 16, 1, true);
      const j1 = new THREE.Mesh(jetGeo, jetMat); j1.position.y = L.radius * 4; core.add(j1);
      const j2 = new THREE.Mesh(jetGeo, jetMat); j2.position.y = -L.radius * 4; core.add(j2);
      core.position.copy(p); scene.add(core); L._mesh = core; L._spin = core;

    } else if (L.isCMB) {
      // 包裹区域的极暗背景壳：身处其中像被宇宙余晖包围
      scene.add(makeCloud(p, L.radius, 6000, L.color, 1, 0.16));

    } else if (L.isCraft) {
      // 航天器 / 探测器 / 望远镜：舱体 + 太阳能板 + 天线 + 天线碟，缓慢转动展示
      const grp = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: L.color, metalness: 0.6, roughness: 0.4, emissive: 0x221a06, emissiveIntensity: 0.25 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(L.radius * 0.34, L.radius * 0.34, L.radius * 1.1, 20), bodyMat);
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x26508a, metalness: 0.3, roughness: 0.5, emissive: 0x0a1a3a, emissiveIntensity: 0.5, side: THREE.DoubleSide });
      const panelGeo = new THREE.BoxGeometry(L.radius * 1.5, L.radius * 0.04, L.radius * 0.5);
      const p1 = new THREE.Mesh(panelGeo, panelMat); p1.position.x = L.radius * 1.05;
      const p2 = new THREE.Mesh(panelGeo, panelMat); p2.position.x = -L.radius * 1.05;
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(L.radius * 0.04, L.radius * 0.04, L.radius * 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5, roughness: 0.5 }));
      ant.position.y = L.radius * 0.85;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(L.radius * 0.3, 20, 12, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xeaeaea, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide }));
      dish.rotation.x = -Math.PI / 2.2; dish.position.y = L.radius * 0.3;
      grp.add(body, p1, p2, ant, dish);
      const glow = makeGlowSprite(L.accent, L.radius * 5); grp.add(glow);
      grp.position.copy(p); scene.add(grp); L._mesh = grp; L._spin = grp;

    } else if (L.isGnomon) {
      // 圭表：立表 + 平圭 + 影线，演示“立竿见影”
      const grp = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.9, metalness: 0.1 });
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(L.radius * 0.12, L.radius * 1.5, L.radius * 0.12), stone);
      pillar.position.y = L.radius * 0.75;
      const base = new THREE.Mesh(new THREE.BoxGeometry(L.radius * 2.6, L.radius * 0.14, L.radius * 0.7), stone);
      base.position.y = L.radius * 0.07;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L.radius * 2.4, L.radius * 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = L.radius * 0.145;
      grp.add(pillar, base, shadow);
      const glow = makeGlowSprite(L.accent, L.radius * 4); grp.add(glow);
      grp.position.copy(p); scene.add(grp); L._mesh = grp; L._spin = grp;

    } else if (L.isRelic) {
      // 浑仪 / 简仪 / 观星台 / 节气：黄铜环组 + 核心球
      const grp = new THREE.Group();
      const brass = new THREE.MeshStandardMaterial({ color: L.color, metalness: 0.75, roughness: 0.35, emissive: 0x3a2a08, emissiveIntensity: 0.35 });
      const ringGeo = new THREE.TorusGeometry(L.radius, L.radius * 0.07, 14, 80);
      const r1 = new THREE.Mesh(ringGeo, brass);
      const r2 = new THREE.Mesh(ringGeo, brass); r2.rotation.x = Math.PI / 2.2;
      const r3 = new THREE.Mesh(new THREE.TorusGeometry(L.radius * 0.7, L.radius * 0.06, 14, 80), brass); r3.rotation.y = Math.PI / 2.4;
      const core = new THREE.Mesh(new THREE.SphereGeometry(L.radius * 0.28, 24, 24), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0x553300, emissiveIntensity: 0.5 }));
      grp.add(r1, r2, r3, core);
      const glow = makeGlowSprite(L.accent, L.radius * 4); grp.add(glow);
      grp.position.copy(p); scene.add(grp); L._mesh = grp; L._spin = grp;

    } else if (L.isEarth) {
      const surf = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 64, 64),
        new THREE.MeshStandardMaterial({ map: makeEarthTexture(), roughness: 0.85, metalness: 0.0 })
      );
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius * 1.02, 48, 48),
        new THREE.MeshStandardMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0.5, depthWrite: false })
      );
      surf.add(clouds); L._clouds = clouds;
      addAtmosphere(surf, L.radius, 0x6db4ff);
      surf.position.copy(p); scene.add(surf); L._mesh = surf;

    } else if (L.isSpiral) {
      const sp = makeSpiralGalaxy(p, L.radius, L.color, 4);
      scene.add(sp); L._mesh = sp;
      const core = makeGlowSprite(L.accent, L.radius * 0.4); core.position.copy(p); scene.add(core);

    } else if (L.isBubble) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 32, 32),
        new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      shell.position.copy(p); scene.add(shell); L._mesh = shell;
      const rim = makeGlowSprite(L.accent, L.radius * 2.2); rim.position.copy(p); scene.add(rim);

    } else {
      // 行星 / 卫星 / 矮行星 默认
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 48, 48),
        new THREE.MeshStandardMaterial({ map: makePlanetTexture(L.color, { bands: L.id === 'jupiter' ? 11 : 6, spots: 50, iceCaps: L.id === 'mars' }), roughness: 1, metalness: 0 })
      );
      if (L.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(L.radius * 1.35, L.radius * 2.2, 96),
          new THREE.MeshBasicMaterial({ map: makeRingTexture(), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2.1;
        mesh.add(ring);
      }
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh;
    }
  }
}

/* ---------------- 组装场景 ---------------- */
buildStarfield();
buildLocations();

/* ---------------- 后处理（辉光） ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.2);
composer.addPass(bloom);

/* ---------------- 输入 ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (mode === 'expedition') {
    if (e.code === 'KeyR') endExpedition();
    if (e.code === 'KeyM') toggleExpBrief();
    return;
  }
  if (e.code === 'KeyE') toggleCard();
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyR') triggerReturn();
  if (e.code === 'KeyG') toggleStarChart();
  if (e.code === 'KeyB') toggleCodex();
  if (e.code === 'KeyF') toggleInterior();
  if (e.code === 'BracketLeft') cycleGear(-1);
  if (e.code === 'BracketRight') cycleGear(1);
});
addEventListener('keyup', e => { keys[e.code] = false; });

/* ---------------- HUD ---------------- */
const hudSpeed = document.getElementById('hud-speed');
const hudPos = document.getElementById('hud-pos');
const hudTarget = document.getElementById('hud-target');
const hudHint = document.getElementById('hud-hint');
const hudZone = document.getElementById('hud-zone');
const hudGear = document.getElementById('hud-gear');
const enterPrompt = document.getElementById('enter-prompt');
const helpPanel = document.getElementById('help');
function updateEnterPrompt() {
  if (!enterPrompt) return;
  if (interiorActive) { enterPrompt.style.display = 'flex'; enterPrompt.textContent = '🛰 已进入舱内 · 按 F 离开'; }
  else if (enterTarget) { enterPrompt.style.display = 'flex'; enterPrompt.textContent = `🛰 按 F 进入「${enterTarget.name}」舱内`; }
  else { enterPrompt.style.display = 'none'; }
}
const card = document.getElementById('card');
const cardTitle = document.getElementById('card-title');
const cardTldr = document.getElementById('card-tldr');
const cardPoints = document.getElementById('card-points');
const cardType = document.getElementById('card-type');
const intro = document.getElementById('intro');

intro.querySelector('.intro-title').textContent = INTRO.title;
intro.querySelector('.intro-body').innerHTML = INTRO.lines.map(l => `<div>${l}</div>`).join('');

function inCurrentZone(L) { return L.zone === currentZone.id; }

let nearest = null;
function updateHUD() {
  // 当前区域（就近判定），跃迁途中以目标区域为准
  if (!flyTo) {
    let best = ZONES[0], bestD = Infinity;
    const c = new THREE.Vector3();
    for (const z of ZONES) {
      c.set(...z.center);
      const d = camera.position.distanceTo(c);
      if (d < bestD) { bestD = d; best = z; }
    }
    if (best.id !== currentZone.id) currentZone = best;
  }
  hudZone.textContent = `◈ ${currentZone.name} · ${currentZone.nameEn}`;

  const v = velocity.length();
  hudSpeed.textContent = `速度 ${Math.round(v)} u/s`;
  hudGear.textContent = `档位 ${SPEED_GEARS[gearIndex].name}`;
  hudPos.textContent = `坐标 ${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)}`;
  // nearest（仅当前区域）
  let best = null, bestD = Infinity;
  for (const L of LOCATIONS) {
    if (!inCurrentZone(L)) continue;
    const d = camera.position.distanceTo(L._pos);
    if (d < bestD) { bestD = d; best = L; }
  }
  nearest = best;
  if (best) {
    const margin = best.radius * 1.25 + 450;
    hudTarget.textContent = `最近 · ${best.name}（${Math.round(bestD)} u）`;
    if (bestD < margin) {
      hudHint.style.display = 'block';
      hudHint.textContent = `按 E 查看「${best.name}」科普`;
    } else { hudHint.style.display = 'none'; }
  } else {
    hudTarget.textContent = `最近 · —`;
    hudHint.style.display = 'none';
  }
  // 可进入的航天器提示
  enterTarget = null;
  if (!interiorActive) {
    for (const L of LOCATIONS) {
      if (L.enter && camera.position.distanceTo(L._pos) < L.radius * 1.5 + 700) { enterTarget = L; break; }
    }
  }
  updateEnterPrompt();
  drawMinimap();
  updateEdgeMarkers();
}
function toggleHelp() { helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none'; }
function toggleCard() {
  if (card.style.display === 'flex') { card.style.display = 'none'; return; }
  if (!nearest) return;
  const f = nearest.facts;
  cardType.textContent = nearest.type;
  cardTitle.textContent = f.title;
  cardTldr.textContent = f.tldr;
  cardPoints.innerHTML = f.points.map(p => `<li>${p}</li>`).join('');
  visited.add(nearest.name);
  card.style.display = 'flex';
}
document.getElementById('card-close').addEventListener('click', () => card.style.display = 'none');

/* ---------------- 星图雷达（小地图，仅当前区域） + 边缘方向指示 ---------------- */
const TYPE_COLORS = {
  '恒星': '#ffcf6b', '黑洞': '#ff5a5a', '星云': '#c98bff', '星系': '#9b8bff',
  '脉冲星': '#7fd4ff', '小行星带': '#cbb08a', '岩石行星': '#6fd0ff',
  '气态巨行星': '#ffd9a3', '冰巨星': '#9be7ff', '矮行星': '#bfe3c0',
  '卫星': '#d8d8d8', '彗星': '#9fd8ff', '红巨星': '#ff8a5a', '白矮星': '#cfe6ff',
  '行星状星云': '#8fe0ff', '中子星双星': '#aad4ff', '磁星': '#ff9aff',
  '球状星团': '#ffe0a0', '疏散星团': '#aad4ff', '活动星系核': '#ffffff',
  '超新星遗迹': '#ff8844', '系外行星': '#8fd0a0', '热木星': '#ffb070',
  '红矮星': '#ff7a5a', '宇宙背景辐射': '#7fa0c8', '星系中心黑洞': '#ffaa33', '矮星系': '#ffd9a0',
  '空间站': '#ffd24a', '探测器': '#9fe0ff', '月球车': '#ffd9a0', '火星车': '#ff8a5a',
  '太空望远镜': '#c9d4ff', '古代天文仪器': '#e8c45a', '古代天文台': '#d8b85a', '历法体系': '#a0e0a0', '陨石藏品': '#cbb08a',
  '宜居带': '#6fe0c0', '德雷克方程': '#8fb8ff', '费米悖论': '#ff9a6b', '生物标记': '#9affc8', 'SETI': '#9fd4ff',
  '地下海洋卫星': '#cfe8ff', '超级地球': '#bcd6ff', '多世界诠释': '#9b8bff', '暴胀泡泡宇宙': '#7fd4ff', '膜宇宙': '#ff9ad6'
};
const typeColor = t => TYPE_COLORS[t] || '#7fd4ff';

const minimap = document.getElementById('minimap');
const mmCtx = minimap.getContext('2d');
const MM_SIZE = 190, MM_R = 84, MM_CX = MM_SIZE / 2, MM_CY = MM_SIZE / 2;
const RADAR_RANGE = 7000;
const mmScale = (MM_R - 6) / RADAR_RANGE;

function drawMinimap() {
  mmCtx.clearRect(0, 0, MM_SIZE, MM_SIZE);
  mmCtx.fillStyle = 'rgba(4,12,28,0.88)';
  mmCtx.beginPath(); mmCtx.arc(MM_CX, MM_CY, MM_R, 0, Math.PI * 2); mmCtx.fill();
  mmCtx.strokeStyle = 'rgba(120,220,255,0.22)'; mmCtx.lineWidth = 1;
  for (const r of [MM_R * 0.34, MM_R * 0.67, MM_R]) {
    mmCtx.beginPath(); mmCtx.arc(MM_CX, MM_CY, r, 0, Math.PI * 2); mmCtx.stroke();
  }
  mmCtx.beginPath();
  mmCtx.moveTo(MM_CX - MM_R, MM_CY); mmCtx.lineTo(MM_CX + MM_R, MM_CY);
  mmCtx.moveTo(MM_CX, MM_CY - MM_R); mmCtx.lineTo(MM_CX, MM_CY + MM_R); mmCtx.stroke();

  const px = camera.position.x, pz = camera.position.z;
  for (const L of LOCATIONS) {
    if (!inCurrentZone(L)) continue;
    let sx = (L._pos.x - px) * mmScale;
    let sy = (L._pos.z - pz) * mmScale;
    const d = Math.hypot(sx, sy);
    if (d > MM_R) { const k = (MM_R - 5) / d; sx *= k; sy *= k; }
    const col = typeColor(L.type);
    mmCtx.fillStyle = col;
    const rad = (L.isStar || L.isBlackHole || L.isGalaxy) ? 4.2 : 3;
    mmCtx.beginPath(); mmCtx.arc(MM_CX + sx, MM_CY + sy, rad, 0, Math.PI * 2); mmCtx.fill();
    if (L.isStar || L.isBlackHole) {
      mmCtx.globalAlpha = 0.5; mmCtx.strokeStyle = col;
      mmCtx.beginPath(); mmCtx.arc(MM_CX + sx, MM_CY + sy, rad + 3.5, 0, Math.PI * 2); mmCtx.stroke();
      mmCtx.globalAlpha = 1;
    }
  }

  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const hl = Math.hypot(fwd.x, fwd.z) || 1;
  const ax = fwd.x / hl, az = fwd.z / hl;
  mmCtx.strokeStyle = '#ffe27a'; mmCtx.lineWidth = 2.4;
  mmCtx.beginPath(); mmCtx.moveTo(MM_CX, MM_CY);
  mmCtx.lineTo(MM_CX + ax * 18, MM_CY + az * 18); mmCtx.stroke();
  const ah = ax * 18, av = az * 18;
  const perpX = -az, perpZ = ax;
  mmCtx.beginPath();
  mmCtx.moveTo(MM_CX + ah, MM_CY + av);
  mmCtx.lineTo(MM_CX + ah * 0.45 + perpX * 6, MM_CY + av * 0.45 + perpZ * 6);
  mmCtx.lineTo(MM_CX + ah * 0.45 - perpX * 6, MM_CY + av * 0.45 - perpZ * 6);
  mmCtx.closePath(); mmCtx.fillStyle = '#ffe27a'; mmCtx.fill();
  mmCtx.fillStyle = '#ffffff';
  mmCtx.beginPath(); mmCtx.arc(MM_CX, MM_CY, 3.2, 0, Math.PI * 2); mmCtx.fill();
}

// 边缘方向指示箭头池
const edgeContainer = document.getElementById('edge-markers');
const EDGE_POOL = [];
const EDGE_MAX = 8;
for (let i = 0; i < EDGE_MAX; i++) {
  const el = document.createElement('div'); el.className = 'edge-marker'; el.style.display = 'none';
  const arrow = document.createElement('div'); arrow.className = 'edge-arrow';
  const label = document.createElement('div'); label.className = 'edge-label';
  const dist = document.createElement('div'); dist.className = 'edge-dist';
  el.append(arrow, label, dist);
  edgeContainer.appendChild(el);
  EDGE_POOL.push({ el, arrow, label, dist });
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _upv = new THREE.Vector3();
function updateEdgeMarkers() {
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();
  _upv.crossVectors(_right, _fwd).normalize();

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const halfW = innerWidth / 2 - 96, halfH = innerHeight / 2 - 80;

  const cand = [];
  for (const L of LOCATIONS) {
    if (!inCurrentZone(L)) continue;
    const r = new THREE.Vector3().subVectors(L._pos, camera.position);
    const f = r.dot(_fwd), x = r.dot(_right), y = r.dot(_upv);
    if (f > 0 && Math.abs(x) < f * tanH && Math.abs(y) < f * tanV) continue;
    const dist = camera.position.distanceTo(L._pos);
    cand.push({ L, x, y, f, dist });
  }
  cand.sort((a, b) => a.dist - b.dist);
  const use = cand.slice(0, EDGE_MAX);

  for (let i = 0; i < EDGE_MAX; i++) {
    const m = EDGE_POOL[i];
    if (i >= use.length) { m.el.style.display = 'none'; continue; }
    const c = use[i];
    let dx = c.x, dyUp = c.y;
    if (c.f <= 0) { dx = -dx; dyUp = -dyUp; }
    let dyDown = -dyUp;
    if (Math.abs(dx) < 1e-3 && Math.abs(dyDown) < 1e-3) { m.el.style.display = 'none'; continue; }
    const tX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
    const tY = dyDown !== 0 ? halfH / Math.abs(dyDown) : Infinity;
    const t = Math.min(tX, tY);
    const left = innerWidth / 2 + dx * t;
    const top = innerHeight / 2 + dyDown * t;
    const rot = Math.atan2(dyDown, dx) * 180 / Math.PI + 90;
    m.el.style.left = left + 'px';
    m.el.style.top = top + 'px';
    m.arrow.style.transform = `rotate(${rot}deg)`;
    m.label.textContent = c.L.name;
    m.dist.textContent = Math.round(c.dist) + ' u';
    m.el.style.display = 'flex';
  }
}

/* ---------------- 星图航图（区域跃迁） ---------------- */
const starChart = document.getElementById('starchart');
const scGrid = document.getElementById('sc-grid');
function buildStarChart() {
  scGrid.innerHTML = '';
  for (const z of ZONES) {
    const total = LOCATIONS.filter(L => L.zone === z.id).length;
    const cardEl = document.createElement('div');
    cardEl.className = 'sc-card';
    cardEl.innerHTML = `
      <div class="sc-card-name">${z.name}<span>${z.nameEn}</span></div>
      <div class="sc-card-desc">${z.desc}</div>
      <div class="sc-card-foot">天体 ${total} 个 · 点击跃迁</div>`;
    cardEl.addEventListener('click', () => teleportToZone(z));
    scGrid.appendChild(cardEl);
  }
}
function teleportToZone(z) {
  starChart.style.display = 'none';
  uiOpen = false;
  currentZone = z;
  flyTo = { target: new THREE.Vector3(...z.view) };
  velocity.set(0, 0, 0);
  gameState = 'flying';
  controls.lock();                 // 用户手势（点击卡片）内调用，合法
}
function toggleStarChart() {
  if (starChart.style.display === 'flex') { closeStarChart(); return; }
  uiOpen = true;
  if (controls.isLocked) controls.unlock();
  starChart.style.display = 'flex';
}
function closeStarChart() {
  starChart.style.display = 'none';
  uiOpen = false;
  if (gameState === 'flying' || gameState === 'paused') controls.lock();
}

/* ---------------- 宇宙图鉴 ---------------- */
const codex = document.getElementById('codex');
const codexBody = document.getElementById('codex-body');
function toggleCodex() {
  if (codex.style.display === 'flex') { closeCodex(); return; }
  buildCodex();
  uiOpen = true;
  if (controls.isLocked) controls.unlock();
  codex.style.display = 'flex';
}
function closeCodex() {
  codex.style.display = 'none';
  uiOpen = false;
  if (gameState === 'flying' || gameState === 'paused') controls.lock();
}
function buildCodex() {
  const zoneRows = ZONES.map(z => {
    const all = LOCATIONS.filter(L => L.zone === z.id);
    const done = all.filter(L => visited.has(L.name)).length;
    const pct = Math.round(done / all.length * 100);
    return `<div class="cx-row"><span class="cx-name">${z.name}</span>
      <span class="cx-bar"><i style="width:${pct}%"></i></span>
      <span class="cx-num">${done}/${all.length}</span></div>`;
  }).join('');
  // 按类型
  const byType = {};
  for (const L of LOCATIONS) {
    byType[L.type] = byType[L.type] || { total: 0, done: 0, col: typeColor(L.type) };
    byType[L.type].total++;
    if (visited.has(L.name)) byType[L.type].done++;
  }
  const typeRows = Object.entries(byType).map(([t, o]) => {
    const pct = Math.round(o.done / o.total * 100);
    return `<div class="cx-row"><span class="cx-name" style="color:${o.col}">${t}</span>
      <span class="cx-bar"><i style="width:${pct}%"></i></span>
      <span class="cx-num">${o.done}/${o.total}</span></div>`;
  }).join('');
  codexBody.innerHTML = `
    <div class="cx-summary">已探索 <b>${visited.size}</b> / ${LOCATIONS.length} 个天体</div>
    <div class="cx-title">按区域</div>${zoneRows}
    <div class="cx-title">按类型</div>${typeRows}`;
}

/* ---------------- 区域进入横幅 ---------------- */
const zoneBanner = document.getElementById('zone-banner');
let zoneBannerTimer = null;
function showZoneBanner(z) {
  zoneBanner.textContent = `◈ 进入 ${z.name} · ${z.nameEn}`;
  zoneBanner.classList.add('show');
  clearTimeout(zoneBannerTimer);
  zoneBannerTimer = setTimeout(() => zoneBanner.classList.remove('show'), 2600);
}

/* ---------------- 发射 / 返航仪式 ---------------- */
const launchEl = document.getElementById('launch');
const launchNum = document.getElementById('launch-num');
const launchSub = document.getElementById('launch-sub');
const missionPause = document.getElementById('mission-pause');
const missionReturn = document.getElementById('mission-return');
const mrStats = document.getElementById('mr-stats');
const mrList = document.getElementById('mr-list');

document.getElementById('btn-launch').addEventListener('click', startCountdown);
document.getElementById('btn-resume').addEventListener('click', () => controls.lock());
document.getElementById('btn-return').addEventListener('click', triggerReturn);
document.getElementById('btn-relaunch').addEventListener('click', () => { resetMission(); startCountdown(); });

function startCountdown() {
  if (gameState === 'countdown' || gameState === 'flying' || gameState === 'returning') return;
  gameState = 'countdown';
  blocker.style.display = 'none';
  controls.lock();
  launchEl.style.display = 'flex';
  const seq = ['3', '2', '1', '🔥 点火'];
  let i = 0;
  const step = () => {
    launchNum.textContent = seq[i];
    launchNum.classList.remove('pop'); void launchNum.offsetWidth; launchNum.classList.add('pop');
    launchSub.textContent = i < 3 ? '系统自检完成 · 准备点火' : '引擎全功率 · 出发！';
    if (i < seq.length - 1) { i++; setTimeout(step, 800); }
    else { doIgnition(); setTimeout(() => { launchEl.style.display = 'none'; }, 1300); }
  };
  step();
}

function doIgnition() {
  gameState = 'flying';
  missionStart = performance.now();
  totalDist = 0;
  velocity.copy(camera.getWorldDirection(new THREE.Vector3())).multiplyScalar(1700);
  fovTarget = 108;
  document.body.classList.add('launching');
  setTimeout(() => { document.body.classList.remove('launching'); fovTarget = 72; }, 1600);
}

function triggerReturn() {
  if (gameState !== 'flying' && gameState !== 'paused') return;
  gameState = 'returning';
  controls.unlock();
  fovTarget = 56;
  document.body.classList.add('returning');
  setTimeout(() => {
    document.body.classList.remove('returning');
    fovTarget = 72;
    showReturn();
  }, 1800);
}

function showReturn() {
  const dur = Math.max(1, Math.round((performance.now() - missionStart) / 1000));
  mrStats.innerHTML = `
    <div class="mr-stat"><span>${dur}</span><label>飞行时长 / 秒</label></div>
    <div class="mr-stat"><span>${visited.size}<small>/${LOCATIONS.length}</small></span><label>探索地点</label></div>
    <div class="mr-stat"><span>${Math.round(totalDist)}</span><label>飞行距离 / u</label></div>`;
  mrList.innerHTML = visited.size
    ? [...visited].map(n => `<span class="mr-badge">${n}</span>`).join('')
    : '<div class="mr-empty">这次还没靠近任何天体，下次飞近按 E 看看吧 ✨</div>';
  missionReturn.style.display = 'flex';
}

function showPause() { missionPause.style.display = 'flex'; }
function hidePause() { missionPause.style.display = 'none'; }
function hideReturn() { missionReturn.style.display = 'none'; }

function resetMission() {
  camera.position.set(3450, 220, 520);
  camera.lookAt(0, 0, 0);
  velocity.set(0, 0, 0);
  visited.clear();
  totalDist = 0;
  flyTo = null;
  currentZone = ZONES[0];
  fovTarget = 72; camera.fov = 72; camera.updateProjectionMatrix();
  hideReturn();
}

/* ---------------- 飞行 ---------------- */
const velocity = new THREE.Vector3();
const maxSpeed = 700;
const SPEED_GEARS = [
  { name: '滑行', mult: 0.22 },
  { name: '巡航', mult: 0.6 },
  { name: '标准', mult: 1.0 },
  { name: '加速', mult: 2.4 },
  { name: '跃迁', mult: 5.5 },
];
let gearIndex = 2;
function cycleGear(dir) {
  gearIndex = Math.max(0, Math.min(SPEED_GEARS.length - 1, gearIndex + dir));
}
const tmp = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), accel: new THREE.Vector3(), target: new THREE.Vector3() };
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();

  // 区域跃迁：平滑飞向目标观察点
  if (flyTo) {
    camera.position.lerp(flyTo.target, 1 - Math.pow(0.0025, dt));
    if (camera.position.distanceTo(flyTo.target) < 60) {
      camera.position.copy(flyTo.target);
      flyTo = null;
      showZoneBanner(currentZone);
    }
  } else if (controls.isLocked && gameState === 'flying' && !interiorActive && mode === 'roam') {
    camera.getWorldDirection(tmp.fwd);
    tmp.right.crossVectors(tmp.fwd, camera.up).normalize();
    tmp.up.crossVectors(tmp.right, tmp.fwd).normalize();
    tmp.accel.set(0, 0, 0);
    if (keys['KeyW']) tmp.accel.add(tmp.fwd);
    if (keys['KeyS']) tmp.accel.sub(tmp.fwd);
    if (keys['KeyD']) tmp.accel.add(tmp.right);
    if (keys['KeyA']) tmp.accel.sub(tmp.right);
    if (keys['Space']) tmp.accel.add(tmp.up);
    if (keys['KeyC'] || keys['ControlLeft']) tmp.accel.sub(tmp.up);
    const gear = SPEED_GEARS[gearIndex].mult;
    if (tmp.accel.lengthSq() > 0) tmp.accel.normalize();
    tmp.target.copy(tmp.accel).multiplyScalar(maxSpeed * gear);
    velocity.lerp(tmp.target, 1 - Math.pow(0.0008, dt));
    camera.position.addScaledVector(velocity, dt);
    totalDist += velocity.length() * dt;
  }
  // 动效
  for (const L of LOCATIONS) {
    if (L._diskMat) L._diskMat.uniforms.uTime.value += dt;
    if (L._pulse) { const s = 1 + 0.03 * Math.sin(performance.now() * 0.001 + L._pulse); L._mesh.scale.setScalar(s); }
    if (L._spin) L._spin.rotation.y += dt * 0.3;
    if (L._clouds) L._clouds.rotation.y += dt * 0.02;
  }
  composer.render();
  if (mode === 'expedition') updateExpedition(dt); else updateHUD();
}
animate();

/* =====================================================================
   火星远征模式（剧情 · 硬核科幻纪实）
   流程：发射台 → 倒计时点火 → 升空(海拔里程碑) → 入轨失重 → 地火巡航
        → 进入火星大气 → 着陆 → 地表自由探索(成就)
   ===================================================================== */
const exp = {
  active: false, phase: 'pad', t: 0, alt: 0, reached: {}, achievements: new Set(),
  group: null, rocket: null, flame: null, flameOn: false, earth: null, marsFar: null,
  debris: [], surface: null, player: { vy: 0, onGround: true }, pois: [], dust: null,
  phobos: null, deimos: null,
};

/* ---------- 远征 DOM ---------- */
const expHud = document.getElementById('exp-hud');
const expPhaseEl = document.getElementById('exp-phase');
const expAltNum = document.getElementById('exp-alt-num');
const expAltFill = document.getElementById('exp-alt-fill');
const expSub = document.getElementById('exp-sub');
const expObj = document.getElementById('exp-obj');
const expToasts = document.getElementById('exp-toasts');
const expBrief = document.getElementById('exp-brief');

function showExpeditionUI(on) {
  expHud.style.display = on ? 'block' : 'none';
  document.getElementById('hud').style.display = on ? 'none' : '';
  document.getElementById('minimap-wrap').style.display = on ? 'none' : '';
  document.getElementById('edge-markers').style.display = on ? 'none' : '';
  document.getElementById('help').style.display = 'none';
}
function setRoamVisibility(v) {
  for (const L of LOCATIONS) {
    if (L._mesh) L._mesh.visible = v;
    if (L._label) L._label.visible = v;
  }
}

/* ---------- 建模：火箭 / 发射台 / 地球 ---------- */
function makeRocket() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 0.3, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 220, 32), bodyMat);
  body.position.y = 130; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(26.6, 26.6, 26, 32),
    new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
  band.position.y = 58; g.add(band);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(26, 74, 32),
    new THREE.MeshStandardMaterial({ color: 0xd23b2e, metalness: 0.3, roughness: 0.5 }));
  nose.position.y = 240 + 37; g.add(nose);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 64, 44), finMat);
    const a = i / 4 * Math.PI * 2;
    fin.position.set(Math.cos(a) * 30, 26, Math.sin(a) * 30);
    fin.lookAt(0, 26, 0); fin.rotateY(Math.PI / 2);
    g.add(fin);
  }
  const engMat = new THREE.MeshStandardMaterial({ color: 0x333944, metalness: 0.7, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(8, 13, 26, 16), engMat);
    e.position.set((i - 1) * 17, 6, 0); g.add(e);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(22, 170, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flame.position.y = -82; flame.rotation.x = Math.PI; flame.visible = false; g.add(flame);
  exp.flame = flame;
  return g;
}
function makeLaunchpad() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(120, 142, 16, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.9 }));
  pad.position.y = 8; g.add(pad);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 210, 14),
    new THREE.MeshStandardMaterial({ color: 0x586069, roughness: 0.8 }));
  tower.position.set(74, 105, 0); g.add(tower);
  return g;
}
function makeExpeditionEarth() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 48),
    new THREE.MeshStandardMaterial({ map: makeEarthTexture(), roughness: 0.92 }));
  addAtmosphere(m, 900, 0x6db4ff);
  return m;
}
function makeFarMars() {
  return new THREE.Mesh(new THREE.SphereGeometry(320, 48, 48),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(0xc1440e, { spots: 80 }), roughness: 1 }));
}

/* ---------- 失重漂浮物 ---------- */
function buildDebris(group) {
  const items = [
    { geo: new THREE.BoxGeometry(12, 5, 5), col: 0xcccccc },
    { geo: new THREE.SphereGeometry(8, 16, 16), col: 0x66bbff, trans: true },
    { geo: new THREE.CylinderGeometry(2.4, 2.4, 24, 8), col: 0xdd5533 },
    { geo: new THREE.TorusGeometry(9, 2.4, 8, 16), col: 0xffcc55 },
    { geo: new THREE.BoxGeometry(8, 8, 8), col: 0x8fd0a0 },
  ];
  for (let i = 0; i < 16; i++) {
    const it = items[i % items.length];
    const m = new THREE.Mesh(it.geo, new THREE.MeshStandardMaterial({
      color: it.col, transparent: !!it.trans, opacity: it.trans ? 0.7 : 1, roughness: 0.6,
    }));
    m.visible = false;
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 32, (Math.random() - 0.5) * 32, (Math.random() - 0.5) * 32);
    m.userData.base = new THREE.Vector3((Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220);
    group.add(m); exp.debris.push(m);
  }
}
function showZeroG(on) { for (const d of exp.debris) d.visible = on; }
function keepDebris(dt) {
  for (const d of exp.debris) {
    d.position.addScaledVector(d.userData.v, dt);
    if (d.position.distanceTo(camera.position) > 280) d.position.copy(camera.position).add(d.userData.base);
    d.rotation.x += dt * 0.8; d.rotation.y += dt * 1.1;
  }
}
function igniteFlame(on) { exp.flameOn = on; if (exp.flame) exp.flame.visible = on; }

/* ---------- 火星地表建模 ---------- */
function makeMarsGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a8552e'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 2 + Math.random() * 16;
    const s = 0.55 + Math.random() * 0.7;
    const col = new THREE.Color('#a8552e').multiplyScalar(s);
    ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.5)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 22 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(58,28,16,0.55)'); g.addColorStop(1, 'rgba(58,28,16,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t;
}
function craterField(x, z) {
  let d = 0;
  const craters = [[900, 400, 280], [-1500, -700, 380], [2200, 1900, 320], [-1000, 2400, 240], [3200, -1500, 300]];
  for (const [cx, cz, r] of craters) {
    const dd = Math.hypot(x - cx, z - cz);
    if (dd < r) d -= (1 - dd / r) * 130;
  }
  return d;
}
function makeDust() {
  const n = 1300, g = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9000;
    pos[i * 3 + 1] = Math.random() * 1600;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 9000;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xe8c9a0, size: 18, transparent: true, opacity: 0.5, depthWrite: false });
  return new THREE.Points(g, m);
}
function addRover(group, x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 92),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.4, roughness: 0.6 }));
  body.position.y = 28; g.add(body);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 44, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333 }));
  mast.position.set(0, 58, -32); g.add(mast);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(16, 11, 11),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cam.position.set(0, 80, -32); g.add(cam);
  for (const sx of [-26, 26]) for (const sz of [-32, 32]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 11, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111 }));
    w.rotation.z = Math.PI / 2; w.position.set(sx, 17, sz); g.add(w);
  }
  g.position.set(x, 0, z); g.rotation.y = 0.6; group.add(g);
}
function makePOI(group, x, y, z, name, desc, id) {
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 1700, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(x, 850, z); group.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(120, 152, 44),
    new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 22, z); group.add(ring);
  const label = makeTextSprite(name); label.position.set(x, 1780, z); label.scale.multiplyScalar(2.4); group.add(label);
  return { x, y, z, name, desc, id, beam, ring, label, done: false };
}
function buildMarsSurface(group) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xd8b48a, side: THREE.BackSide }));
  group.add(sky);
  const sun = new THREE.DirectionalLight(0xffe9c8, 2.1); sun.position.set(-3000, 1400, -4000); group.add(sun);
  group.add(new THREE.AmbientLight(0x6b5640, 0.75));
  const SIZE = 13000, SEG = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = Math.sin(x * 0.0009) * 42 + Math.cos(z * 0.0011) * 38 + Math.sin((x + z) * 0.0006) * 30;
    y += craterField(x, z);
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: makeMarsGroundTexture(), roughness: 1, metalness: 0 }));
  group.add(ground);
  const olympus = new THREE.Mesh(new THREE.ConeGeometry(2600, 2100, 64),
    new THREE.MeshStandardMaterial({ color: 0xb5532e, roughness: 1 }));
  olympus.position.set(-7200, 1050, -8200); group.add(olympus);
  const canyon = new THREE.Mesh(new THREE.BoxGeometry(9200, 620, 1500),
    new THREE.MeshStandardMaterial({ color: 0x5e2f1c, roughness: 1 }));
  canyon.position.set(6100, -300, 2050); canyon.rotation.y = 0.42; group.add(canyon);
  const phobos = new THREE.Mesh(new THREE.SphereGeometry(130, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x8a8076, roughness: 1 }));
  phobos.position.set(4200, 3600, -6000); group.add(phobos); exp.phobos = phobos;
  const deimos = new THREE.Mesh(new THREE.SphereGeometry(72, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x9a9088, roughness: 1 }));
  deimos.position.set(-5000, 4300, -5200); group.add(deimos); exp.deimos = deimos;
  const dust = makeDust(); group.add(dust); exp.dust = dust;
  addRover(group, 0, 0);
  exp.pois = [
    makePOI(group, -7200, 1100, -8200, '奥林匹斯山', '太阳系最高山峰：高约 21.9 公里，约为珠穆朗玛峰的近 3 倍。它是一座“盾状火山”，由远古火星极度活跃的岩浆缓慢层层堆叠而成，底座比整个夏威夷还大。', 'olympus'),
    makePOI(group, 6100, 60, 2050, '水手谷', '一条长逾 4000 公里、深达 7 公里的大峡谷，足以横贯整个中国。它由火星外壳张裂形成，是行星地质的一道巨大伤疤，也是太阳系最长峡谷。', 'marineris'),
    makePOI(group, 2600, 40, -1200, '盖尔陨石坑 · 好奇号', '直径 154 公里的古老撞击坑。NASA“好奇号”火星车 2012 年在此着陆，钻探出的泥岩证明：这里在数十亿年前曾是一个有水的湖泊。', 'gale'),
    makePOI(group, -2600, 50, 1650, '耶泽罗陨石坑 · 毅力号', '保存完好的古河流三角洲。NASA“毅力号”2021 年着陆于此，专门寻找可能的微生物化石，并首次在火星上利用二氧化碳制造出氧气（MOXIE）。', 'jezero'),
    makePOI(group, 0, 30, 4300, '北极冰盖', '火星两极覆盖着水冰与干冰（固态二氧化碳）。雷达探测证实地下藏有巨量水冰——这是未来火星殖民者最宝贵的资源：喝的水、呼吸的氧、推进的燃料，都能从中提取。', 'ice'),
  ];
}

/* ---------- 流程控制 ---------- */
function startExpedition() {
  if (mode === 'expedition') return;
  mode = 'expedition';
  exp.active = true; exp.phase = 'countdown'; exp.t = 0; exp.alt = 0; exp.reached = {}; exp.achievements.clear(); exp.debris = [];
  setRoamVisibility(false);
  showExpeditionUI(true);
  sunLight.intensity = 0;
  document.getElementById('blocker').style.display = 'none';
  const g = new THREE.Group(); exp.group = g; scene.add(g);
  g.add(makeLaunchpad());
  exp.rocket = makeRocket(); g.add(exp.rocket);
  exp.earth = makeExpeditionEarth(); exp.earth.position.set(0, -1400, -200); g.add(exp.earth);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(260, 700, 360); g.add(key);
  g.add(new THREE.AmbientLight(0x334455, 0.5));
  buildDebris(g);
  camera.position.set(190, 130, 380);
  camera.lookAt(0, 170, 0);
  gameState = 'flying';
  controls.lock();
  expMilestone('火星远征 · 任务简报', '你站在发射台上，脚下是巨型运载火箭。前方之旅：升空 → 失重 → 地火巡航 → 着陆火星 → 地表探索。所有数据均为真实航天参数。按 M 可随时调出任务简报。');
  runExpCountdown();
}
function runExpCountdown() {
  const launchEl = document.getElementById('launch');
  const launchNum = document.getElementById('launch-num');
  const launchSub = document.getElementById('launch-sub');
  launchEl.style.display = 'flex';
  const seq = ['T-3', 'T-2', 'T-1', '🔥 点火'];
  let i = 0;
  const step = () => {
    launchNum.textContent = seq[i];
    launchNum.classList.remove('pop'); void launchNum.offsetWidth; launchNum.classList.add('pop');
    launchSub.textContent = i < 3 ? '火星远征 · 系统自检' : '星舰点火 · 出发！';
    if (i < seq.length - 1) { i++; setTimeout(step, 800); }
    else { setTimeout(() => { launchEl.style.display = 'none'; exp.phase = 'ascent'; exp.t = 0; igniteFlame(true); }, 1200); }
  };
  step();
}
function milestone(km, title, desc) {
  if (exp.alt >= km && !exp.reached[km]) {
    exp.reached[km] = true;
    expMilestone(title, desc);
    if (km === 100) unlockAch('karman', '跨越卡门线');
  }
}
function updateAscent(dt) {
  const dur = 15;
  const k = Math.min(1, exp.t / dur);
  exp.alt = k * 400;
  const rocketY = 160 + k * 5400;
  exp.rocket.position.y = rocketY;
  camera.position.set(190, rocketY - 230, 380);
  camera.lookAt(0, rocketY + 120, 0);
  exp.earth.position.y = -1400 - k * 240;
  milestone(13, '突破 Max-Q（最大动压区）', '海拔约 13 公里。此刻空气最稠密、速度最快，二者叠加让火箭外壳承受最大应力——这是整个发射中最惊险的几十秒，结构工程师最紧张的时刻。');
  milestone(100, '抵达卡门线', '海拔 100 公里，国际公认的“太空边界”。天空在此终结，星辰开始。这里的大气已稀薄到无法支撑飞机机翼，你正式进入了“太空”。');
  milestone(400, '进入近地轨道', '海拔约 400 公里（与国际空间站同高）。速度约 7.8 km/s，与地球引力达成精妙平衡——你成为了一颗人造卫星，90 分钟就能绕地球一圈。');
  if (k >= 1) { exp.phase = 'orbit'; exp.t = 0; igniteFlame(false); unlockAch('orbit', '成功入轨'); showSub('发动机关机，进入惯性滑行……'); }
}
function updateOrbit(dt) {
  if (!exp.reached.zeroG) {
    exp.reached.zeroG = true;
    unlockAch('zerog', '体验失重');
    showZeroG(true);
    expMilestone('失重降临', '上面级关机，绑带松开——笔、水珠、还有你自己，都轻轻地飘了起来。这就是微重力：在这里没有绝对的“上”与“下”，一切都自由悬浮。');
  }
  const a = exp.t * 0.3;
  camera.position.set(Math.cos(a) * 440, 180 + Math.sin(a * 0.7) * 130, Math.sin(a) * 440);
  camera.lookAt(0, 220, 0);
  keepDebris(dt);
  if (exp.t > 8) {
    exp.phase = 'transit'; exp.t = 0;
    expMilestone('地火转移点火', '再次点火，把速度加到第二宇宙速度（11.2 km/s），挣脱地球引力，奔向火星。接下来把约 7 个月的航程，压缩成一段安静的星际漂流。');
  }
}
function updateTransit(dt) {
  const dur = 17; const k = Math.min(1, exp.t / dur);
  exp.earth.position.z = -200 - k * 4200; exp.earth.scale.setScalar(1 - k * 0.72);
  if (!exp.marsFar) { exp.marsFar = makeFarMars(); exp.group.add(exp.marsFar); }
  exp.marsFar.position.set(0, 220, 700 + (1 - k) * 5200);
  exp.marsFar.scale.setScalar(0.18 + k * 1.05);
  camera.position.lerp(new THREE.Vector3(0, 260, 160), 0.02);
  camera.lookAt(0, 220, 2200);
  keepDebris(dt);
  if (k >= 1) { exp.phase = 'edl'; exp.t = 0; expMilestone('接近火星', '前方那颗锈红色的星球越来越大。接下来是最惊险的一段：以每秒数公里的速度冲进虽稀薄却足以烧红防热罩的大气。'); }
}
function updateEDL(dt) {
  const dur = 11; const k = Math.min(1, exp.t / dur);
  const startY = 4200, endY = 170;
  camera.position.set(0, startY * (1 - k) + endY * k, 1500 - k * 1300);
  camera.lookAt(0, 70, 0);
  if (k >= 1) enterSurface();
}
function enterSurface() {
  exp.phase = 'surface'; exp.t = 0;
  unlockAch('land', '成功登陆火星');
  expMilestone('着陆 · 乌托邦平原', '反推引擎熄火，着陆腿稳稳触地。你站在了距地球数千万公里的红色星球上。这里的重力只有地球的 0.38——轻轻一跳，就能跃起近一米高。');
  if (exp.group) scene.remove(exp.group);
  exp.group = new THREE.Group(); scene.add(exp.group);
  buildMarsSurface(exp.group);
  scene.background = new THREE.Color(0xc9a07a);
  scene.fog = new THREE.FogExp2(0xc9a07a, 0.00032);
  camera.position.set(0, 18, 0);
  camera.lookAt(0, 32, -220);
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
  showZeroG(false);
  expObj.textContent = '走向发光光柱，解锁火星地标（剩余 5 处）';
}
function updateSurface(dt) {
  camera.getWorldDirection(tmp.fwd);
  tmp.right.crossVectors(tmp.fwd, camera.up).normalize();
  const fwd = new THREE.Vector3(tmp.fwd.x, 0, tmp.fwd.z).normalize();
  const right = new THREE.Vector3(tmp.right.x, 0, tmp.right.z).normalize();
  const move = new THREE.Vector3();
  if (keys['KeyW']) move.add(fwd);
  if (keys['KeyS']) move.sub(fwd);
  if (keys['KeyD']) move.add(right);
  if (keys['KeyA']) move.sub(right);
  const speed = 280;
  if (move.lengthSq() > 0) { move.normalize().multiplyScalar(speed * dt); camera.position.x += move.x; camera.position.z += move.z; }
  const g = 14; // 火星 0.38g 的“飘”感
  if (keys['Space'] && exp.player.onGround) { exp.player.vy = 23; exp.player.onGround = false; }
  exp.player.vy -= g * dt;
  camera.position.y += exp.player.vy * dt;
  if (camera.position.y <= 18) { camera.position.y = 18; exp.player.vy = 0; exp.player.onGround = true; }
  const R = 5800; const d = Math.hypot(camera.position.x, camera.position.z);
  if (d > R) { camera.position.x *= R / d; camera.position.z *= R / d; }
  if (exp.dust) exp.dust.rotation.y += dt * 0.01;
  if (exp.phobos) { exp.phobos.position.x = Math.cos(exp.t * 0.05) * 4400; exp.phobos.position.z = -6000 + Math.sin(exp.t * 0.05) * 1600; }
  if (exp.deimos) { exp.deimos.position.x = Math.cos(-exp.t * 0.03) * 5200; exp.deimos.position.z = -5200 + Math.sin(-exp.t * 0.03) * 1500; }
  for (const p of exp.pois) {
    const dd = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    if (dd < 720 && !p.done) { p.done = true; unlockAch(p.id, p.name); expMilestone(p.name, p.desc); }
    if (p.beam) { p.beam.material.opacity = p.done ? 0.14 : 0.55; p.beam.scale.y = 1 + 0.1 * Math.sin(exp.t * 3 + p.x); }
  }
  const left = exp.pois.filter(p => !p.done).length;
  expObj.textContent = left > 0 ? `走向发光光柱，解锁火星地标（剩余 ${left} 处）` : '✦ 全部地标已解锁！你已完成火星巡视，恭喜宇航员 🚀';
}

/* ---------- 字幕 / 成就 / 简报 ---------- */
function expMilestone(title, desc) {
  expSub.innerHTML = `<div class="exp-ms-title">${title}</div><div class="exp-ms-desc">${desc}</div>`;
  expSub.classList.remove('show'); void expSub.offsetWidth; expSub.classList.add('show');
}
function showSub(text) { expMilestone('·', text); }
function unlockAch(id, label) {
  if (exp.achievements.has(id)) return;
  exp.achievements.add(id);
  const d = document.createElement('div'); d.className = 'exp-toast'; d.textContent = '🏅 成就解锁：' + label;
  expToasts.appendChild(d);
  setTimeout(() => d.classList.add('out'), 3200);
  setTimeout(() => d.remove(), 3900);
}
function phaseLabel(p) {
  return { pad: '发射台', countdown: '倒计时', ascent: '升空', orbit: '近地轨道 · 失重', transit: '地火巡航', edl: '进入火星大气', surface: '火星地表探索' }[p] || '';
}
function updateExpeditionHUD() {
  expPhaseEl.textContent = phaseLabel(exp.phase);
  if (exp.phase === 'ascent' || exp.phase === 'orbit') {
    expAltNum.textContent = Math.round(exp.alt);
    expAltFill.style.height = Math.min(100, exp.alt / 400 * 100) + '%';
  } else { expAltNum.textContent = '—'; expAltFill.style.height = '0%'; }
}
function updateExpedition(dt) {
  exp.t += dt;
  switch (exp.phase) {
    case 'ascent': updateAscent(dt); break;
    case 'orbit': updateOrbit(dt); break;
    case 'transit': updateTransit(dt); break;
    case 'edl': updateEDL(dt); break;
    case 'surface': updateSurface(dt); break;
  }
  if (exp.flame) { const s = 0.7 + Math.random() * 0.6; exp.flame.scale.set(1, s, 1); }
  updateExpeditionHUD();
}
function toggleExpBrief() {
  if (expBrief.style.display === 'flex') {
    expBrief.style.display = 'none';
    if (mode === 'expedition' && !controls.isLocked) controls.lock();
  } else {
    expBrief.style.display = 'flex';
    if (controls.isLocked) controls.unlock();
  }
}
function endExpedition() {
  if (mode !== 'expedition') return;
  mode = 'roam'; exp.active = false;
  if (exp.group) { scene.remove(exp.group); exp.group = null; }
  setRoamVisibility(true);
  scene.background = new THREE.Color(0x000006);
  scene.fog = new THREE.FogExp2(0x000006, 0.0000008);
  sunLight.intensity = 4.5;
  showExpeditionUI(false);
  expBrief.style.display = 'none';
  camera.position.set(3450, 220, 520);
  camera.lookAt(0, 0, 0);
  velocity.set(0, 0, 0); flyTo = null; currentZone = ZONES[0];
  fovTarget = 72; camera.fov = 72; camera.updateProjectionMatrix();
  gameState = 'intro';
  document.getElementById('blocker').style.display = 'flex';
}

document.getElementById('btn-expedition').addEventListener('click', startExpedition);
document.getElementById('btn-eb-close').addEventListener('click', toggleExpBrief);

/* ---------------- 自适应 ---------------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});

// 初始化航图卡片
buildStarChart();
