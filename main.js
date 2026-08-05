// main.js —— 沉浸式宇宙旅行核心逻辑（整个宇宙版）
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LOCATIONS, ZONES, INTRO } from './knowledge.js';
import { Sound } from './audio.js';

/* ---------------- 渲染器 / 场景 / 相机 ---------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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
let roamSurfaceActive = false;    // 漫游中是否正处于某行星地表探索
const roamExitPos = new THREE.Vector3();
let landTarget = null;            // 漫游中可着陆的邻近行星
let prevLandId = null;            // 上一帧锁定的可着陆行星（用于触发抵达音乐）
const _tmpVec = new THREE.Vector3();
const hazardEl = document.getElementById('hazard');
const hazardWarn = document.getElementById('hazard-warn');
const expHelp = document.getElementById('exp-help');
const DEFAULT_EXP_HELP = expHelp.innerHTML;

controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  if (gameState === 'paused') { gameState = 'flying'; hidePause(); }
});
controls.addEventListener('unlock', () => {
  if (mode === 'expedition') return;                    // 远征中 ESC 不触发漫游暂停
  if (roamSurfaceActive) return;                        // 地表探索中 ESC 不触发暂停
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
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `#${base.getHexString()}`; ctx.fillRect(0, 0, 1024, 512);
  // 轻量确定性值噪声（避免每帧闪烁）
  const vn = (x, y) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  if (opts.gas) {
    // 气态巨行星：纬度条带 + 湍流斑
    for (let y = 0; y < 512; y++) {
      const lat = y / 512;
      const turb = 0.5 + 0.5 * Math.sin(lat * 46 + vn(y, 3) * 7.0);
      const shade = 0.7 + 0.3 * turb + 0.07 * Math.sin(lat * 130);
      const col = base.clone().multiplyScalar(Math.max(0.35, shade));
      ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},1)`;
      ctx.fillRect(0, y, 1024, 1);
    }
    for (let i = 0; i < 460; i++) {
      const x = Math.random() * 1024, y = Math.random() * 512, r = 8 + Math.random() * 46;
      const shade = 0.68 + Math.random() * 0.5;
      const col = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.16)`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, 7); ctx.fill();
    }
    if (opts.storm) {
      // 木星大红斑
      const g = ctx.createRadialGradient(715, 330, 0, 715, 330, 96);
      g.addColorStop(0, 'rgba(214,96,52,0.95)');
      g.addColorStop(0.55, 'rgba(186,82,50,0.82)');
      g.addColorStop(1, 'rgba(186,82,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(715, 330, 96, 58, 0, 0, 7); ctx.fill();
    }
  } else {
    // 岩质 / 冰质行星：多倍频噪声斑驳 + 撞击点
    const img = ctx.getImageData(0, 0, 1024, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const px = (i / 4) % 1024, py = Math.floor((i / 4) / 1024);
      const n = vn(px * 0.05, py * 0.05) * 0.5 + vn(px * 0.22, py * 0.22) * 0.32 + vn(px * 0.9, py * 0.9) * 0.18;
      const shade = Math.max(0.32, 0.72 + (n - 0.5) * 0.62);
      const col = base.clone().multiplyScalar(shade);
      img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < (opts.spots || 60); i++) {
      const x = Math.random() * 1024, y = Math.random() * 512, r = 2 + Math.random() * 16;
      const shade = 0.5 + Math.random() * 0.7;
      const col = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.35)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
  if (opts.iceCaps) {
    // 不规则极冠（南北）
    ctx.fillStyle = 'rgba(245,250,255,0.93)';
    for (let x = 0; x < 1024; x++) {
      const h = 22 + Math.sin(x * 0.05) * 12 + Math.random() * 7;
      ctx.fillRect(x, 0, 1, h); ctx.fillRect(x, 512 - h, 1, h);
    }
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
// 从太空看，地球必须一眼可辨：用等距投影手绘出可辨认的大陆轮廓（美洲 / 欧亚 / 非洲 / 澳洲 / 南极 / 格陵兰）
function makeEarthTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const og = ctx.createLinearGradient(0, 0, 0, 512);
  og.addColorStop(0, '#0a2f63'); og.addColorStop(0.5, '#0e4a8a'); og.addColorStop(1, '#0a2f63');
  ctx.fillStyle = og; ctx.fillRect(0, 0, 1024, 512);
  const land = (pts, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fill();
  };
  const GREEN = '#2f7d34', GREEN2 = '#3c8a3f', DARK = '#5a7a34';
  land([[150,80],[230,65],[300,90],[330,130],[310,170],[270,210],[250,232],[225,214],[236,190],[200,200],[180,175],[165,140],[140,110]], GREEN); // 北美
  land([[372,46],[414,40],[432,66],[406,92],[376,82],[364,60]], '#eef4fb'); // 格陵兰
  land([[280,250],[330,255],[356,292],[345,342],[320,402],[300,436],[284,420],[296,370],[268,330],[263,290]], GREEN); // 南美
  land([[490,96],[546,90],[562,116],[540,142],[506,156],[484,134]], DARK); // 欧洲
  land([[500,150],[560,144],[606,170],[616,222],[600,282],[575,342],[555,376],[534,360],[546,310],[514,268],[504,210],[494,176]], GREEN); // 非洲
  land([[560,110],[642,80],[742,75],[832,96],[876,132],[860,172],[820,202],[760,222],[700,216],[650,190],[600,166],[564,140]], GREEN); // 亚洲
  land([[650,206],[696,212],[682,252],[660,242]], GREEN2); // 印度次大陆
  land([[800,236],[852,242],[856,266],[810,272],[794,256]], GREEN2); // 东南亚
  land([[840,310],[906,306],[940,332],[924,362],[880,374],[846,356],[834,332]], '#7a8a3a'); // 澳大利亚
  land([[0,482],[1024,482],[1024,512],[0,512]], '#eef4fb'); // 南极洲
  land([[40,470],[200,462],[420,468],[640,460],[860,466],[1000,470],[1024,482],[0,482]], '#eef4fb');
  // 沙漠（撒哈拉 / 中亚 / 澳洲内陆）
  for (const [x,y,w,h] of [[540,200,72,42],[576,216,58,30],[500,206,40,22],[860,335,46,22],[700,150,62,28],[330,300,40,22]]) {
    ctx.fillStyle = 'rgba(200,170,110,0.55)'; ctx.fillRect(x - w/2, y - h/2, w, h);
  }
  // 极冠
  ctx.fillStyle = 'rgba(245,250,255,0.92)'; ctx.fillRect(0, 0, 1024, 26);
  ctx.beginPath(); ctx.ellipse(512, 26, 360, 22, 0, 0, 7); ctx.fill();
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
      const isGas = (L.id === 'jupiter' || L.id === 'saturn' || L.id === 'uranus' || L.id === 'neptune');
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(L.radius, 64, 64),
        new THREE.MeshStandardMaterial({ map: makePlanetTexture(L.color, { gas: isGas, storm: L.id === 'jupiter', spots: 60, iceCaps: L.id === 'mars' }), roughness: isGas ? 0.82 : 1, metalness: 0 })
      );
      if (L.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(L.radius * 1.35, L.radius * 2.2, 96),
          new THREE.MeshBasicMaterial({ map: makeRingTexture(), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2.1;
        mesh.add(ring);
      }
      // 大气辉光：金星(浓黄) / 火星(薄红) / 气态巨行星(冷蓝)
      if (L.id === 'venus' || L.id === 'mars' || isGas) {
        const atmoColor = L.id === 'venus' ? 0xffd98a : L.id === 'mars' ? 0xff7a55 : (L.id === 'uranus' || L.id === 'neptune') ? 0x9fd4ff : 0xcfe0ff;
        addAtmosphere(mesh, L.radius, atmoColor);
      }
      mesh.position.copy(p); scene.add(mesh); L._mesh = mesh; L._autoRotate = true;
    }
  }
  // 标记实心天体（漫游时不可穿过）与可着陆天体
  const glowTypes = L => L.isNebula || L.isGalaxy || L.isBubble || L.isCMB || L.isPlanetary || L.isCraft || L.isGlobular || L.isScatter || L.isQuasar || L.isSpiral || L.isBelt;
  for (const L of LOCATIONS) {
    L._solid = !!(L._mesh && !glowTypes(L));
    L._landable = new Set(['mercury', 'venus', 'earth', 'moon', 'mars', 'pluto', 'ceres', 'europa', 'enceladus',
      'proxima', 'trappist1e', 'kepler452b', 'lhs1140b', 'belt', 'jupiter', 'saturn', 'uranus', 'neptune', 'hotjupiter']).has(L.id);
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
  Sound.resume();
  if (e.code === 'KeyP') { takePhoto(); return; }
  if (e.code === 'KeyL') { togglePhotoPanel(); return; }
  // 行星地表探索中：仅响应离开键
  if (roamSurfaceActive) {
    if (e.code === 'KeyX' || e.code === 'KeyR') { exitRoamSurface(); return; }
    return; // 地表模式下不响应其它漫游快捷键
  }
  if (mode === 'expedition') {
    if (e.code === 'KeyR') endExpedition();
    if (e.code === 'KeyM') toggleExpBrief();
    if (e.code === 'KeyV') toggleVoice();
    return;
  }
  // 漫游中：靠近可着陆行星按 X 登陆表面漫步
  if (e.code === 'KeyX') {
    if (landTarget) { beginRoamLanding(landTarget); return; }
    for (const L of LOCATIONS) {
      const h = hazardProfile(L); if (!h || L._landable) continue;
      if (camera.position.distanceTo(L._pos) < h.range) { showSub(`⚠ ${h.label}——这里无法着陆，但你已感受到它的威力`); return; }
    }
    return;
  }
  if (e.code === 'KeyE') toggleCard();
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyR') triggerReturn();
  if (e.code === 'KeyG') toggleStarChart();
  if (e.code === 'KeyB') toggleCodex();
  if (e.code === 'KeyF') toggleInterior();
  if (e.code === 'KeyM') { const on = Sound.toggle(); const sb = document.getElementById('sound-btn'); if (sb) sb.textContent = on ? '🔊' : '🔇'; return; }
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
  else if (landTarget && !roamSurfaceActive) {
    const cfg = getLandingConfig(landTarget);
    enterPrompt.style.display = 'flex';
    enterPrompt.textContent = (cfg && cfg.cloudDeck) ? `☁ 按 X 进入「${landTarget.name}」云顶漂浮` : `🪐 按 X 登陆「${landTarget.name}」表面漫步`;
  }
  else { enterPrompt.style.display = 'none'; }
}
// 危险天体邻近反馈：靠近高温/强辐射/极寒等天体时，屏幕边缘浮现对应色彩与警告
function hazardProfile(L) {
  if (L.isStar) return { color: '255,70,40', range: L.radius * 15, label: `恒星高温 · 表面约 ${L.id === 'sun' ? '5500' : '数千'}℃` };
  if (L.isRedGiant) return { color: '255,90,50', range: L.radius * 14, label: '红超巨星 · 剧烈膨胀的高温外层' };
  if (L.isBlackHole) return { color: '255,130,50', range: L.radius * 18, label: '事件视界 · 引力撕裂警告' };
  if (L.id === 'hotjupiter') return { color: '255,95,45', range: L.radius * 14, label: '炽热气态巨行星 · 直面恒星炙烤' };
  if (L.id === 'venus') return { color: '255,205,95', range: L.radius * 13, label: '失控温室 · 90 倍大气压 / 460℃' };
  if (L.id === 'jupiter' || L.id === 'saturn' || L.id === 'uranus' || L.id === 'neptune') return { color: '120,200,255', range: L.radius * 12, label: '强辐射带 · 无实体表面' };
  if (L.isPulsar || L.isMagnetar || L.id === 'neutronbinary') return { color: '205,120,255', range: L.radius * 18, label: '致命辐射 · 中子星' };
  if (L.id === 'pluto' || L.id === 'ceres' || L.id === 'europa' || L.id === 'enceladus') return { color: '175,215,255', range: L.radius * 15, label: '深空极寒 · 接近绝对零度' };
  return null;
}
function updateHazard() {
  let hp = null, hd = Infinity;
  for (const L of LOCATIONS) {
    const h = hazardProfile(L);
    if (!h) continue;
    const d = camera.position.distanceTo(L._pos);
    if (d < h.range && d < hd) { hd = d; hp = h; }
  }
  if (hp) {
    const intensity = Math.min(1, Math.max(0, 1 - hd / hp.range)); // 0=边缘 → 1=正中
    // 仅当非常靠近（进入危险范围前 ~50%）才给一点轻提示，避免满屏常驻报警（它只是个趣味小点）
    if (intensity > 0.5) {
      const a = (intensity - 0.5) / 0.5;            // 0→1
      const glow = (a * 0.28).toFixed(3);           // 最弱→最强仅 0.28，且只晕在屏幕最外缘
      hazardEl.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 54%, rgba(${hp.color}, ${glow}) 100%)`;
      hazardEl.style.opacity = '1';
      hazardWarn.style.display = 'block';
      hazardWarn.textContent = `⚠ ${hp.label}`;
      hazardWarn.style.color = `rgb(${hp.color})`;
      hazardWarn.style.textShadow = `0 0 10px rgba(${hp.color},0.5)`;
    } else {
      hazardEl.style.opacity = '0';
      hazardWarn.style.display = 'none';
    }
  } else {
    hazardEl.style.opacity = '0';
    hazardWarn.style.display = 'none';
  }
}
const card = document.getElementById('card');
const cardTitle = document.getElementById('card-title');
const cardTldr = document.getElementById('card-tldr');
const cardPoints = document.getElementById('card-points');
const cardType = document.getElementById('card-type');
const intro = document.getElementById('intro');

intro.querySelector('.intro-title').textContent = INTRO.title;
intro.querySelector('.intro-body').innerHTML = INTRO.lines.map(l => `<div>${l}</div>`).join('');

/* =====================================================================
   开场宣传片 / 宇宙总览（游戏开始前播放）
   流程：起始之门（首个手势 → 解锁音频）→ 自动放映章节 → 进入发射台
   ===================================================================== */
const cineGate = document.getElementById('cine-gate');
const cineFrame = document.getElementById('cine-frame');
const cineStage = document.getElementById('cine-stage');
const cineChapter = document.getElementById('cine-chapter');
const cineTitle = document.getElementById('cine-title');
const cineBody = document.getElementById('cine-body');
const cineDots = document.getElementById('cine-dots');
const cinePrev = document.getElementById('cine-prev');
const cineNext = document.getElementById('cine-next');
const cineSkip = document.getElementById('cine-skip');
const cineStart = document.getElementById('cine-start');
const cineProgress = document.getElementById('cine-progress-bar');
const cineText = cineFrame.querySelector('.cine-text');

// 静态星空背景（绘制一次）
(function drawCineStars() {
  const cv = document.getElementById('cine-stars'); if (!cv) return;
  function paint() {
    cv.width = innerWidth; cv.height = innerHeight;
    const x = cv.getContext('2d'); const W = cv.width, H = cv.height;
    x.clearRect(0, 0, W, H);
    const neb = [[W * 0.18, H * 0.3, 'rgba(60,90,180,0.10)'], [W * 0.82, H * 0.68, 'rgba(150,60,140,0.08)'], [W * 0.62, H * 0.18, 'rgba(40,120,150,0.07)']];
    for (const [nx, ny, c] of neb) { const g = x.createRadialGradient(nx, ny, 0, nx, ny, Math.max(W, H) * 0.34); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    const n = Math.floor(W * H / 5200);
    for (let i = 0; i < n; i++) { const px = Math.random() * W, py = Math.random() * H, r = Math.random() * 1.3 + 0.2, a = Math.random() * 0.7 + 0.2; x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
  }
  addEventListener('resize', paint); paint();
})();

// ---------- 程序化视觉（纯 SVG，无外部资源） ----------
function buildTimeline() {
  const nodes = [
    ['约 1500', '万户', '火箭飞天的最早尝试'],
    ['1609', '伽利略', '望远镜指向星空'],
    ['1961', '加加林', '首位进入太空的人类'],
    ['1969', '阿波罗11号', '人类首次踏上月球'],
    ['1977', '旅行者1号', '飞向星际空间'],
    ['1990', '哈勃', '重新定义宇宙'],
    ['2003', '杨利伟', '首位中国航天员'],
    ['2021', '韦伯', '看见宇宙第一缕光'],
  ];
  const W = 760, H = 300, x0 = 64, x1 = W - 64, y = 150, dx = (x1 - x0) / (nodes.length - 1);
  let s = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="rgba(150,200,255,0.35)" stroke-width="2"/>`;
  nodes.forEach((nd, i) => {
    const x = x0 + i * dx, up = i % 2 === 0, cy = up ? y - 60 : y + 60;
    s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${cy}" stroke="rgba(150,200,255,0.22)" stroke-width="1"/>`;
    s += `<circle cx="${x}" cy="${y}" r="6" fill="#7fd4ff" stroke="#fff" stroke-width="1.5"/>`;
    const lx = Math.max(44, Math.min(W - 44, x));
    s += `<text x="${lx}" y="${cy - 14}" fill="#9fd0ff" font-size="15" font-weight="700" text-anchor="middle">${nd[0]}</text>`;
    s += `<text x="${lx}" y="${cy + 4}" fill="#eaf3ff" font-size="13" text-anchor="middle">${nd[1]}</text>`;
    s += `<text x="${lx}" y="${cy + 22}" fill="#9fb6c9" font-size="11" text-anchor="middle">${nd[2]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
}
function buildSolar() {
  const cx = 230, cy = 150;
  const P = [
    { o: 40,  r: 7,  k: 'mercury', d: 9  },
    { o: 66,  r: 11, k: 'venus',   d: 13 },
    { o: 92,  r: 12, k: 'earth',   d: 17 },
    { o: 118, r: 9,  k: 'mars',    d: 21 },
    { o: 150, r: 22, k: 'jupiter', d: 28 },
    { o: 182, r: 17, k: 'saturn',  d: 34, ring: 30 },
    { o: 210, r: 14, k: 'uranus',  d: 40 },
    { o: 236, r: 13, k: 'neptune', d: 46 },
  ];
  const gmap = { mercury:'mer_g', venus:'ven_g', earth:'ear_g', mars:'mar_g', jupiter:'jup_g', saturn:'sat_g', uranus:'ura_g', neptune:'nep_g' };
  const defs = `<defs>
    <radialGradient id="s_c"  cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff7d4" stop-opacity="0.85"/><stop offset="55%" stop-color="#ffaa3a" stop-opacity="0.25"/><stop offset="100%" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient>
    <radialGradient id="s_g"  cx="40%" cy="38%" r="62%"><stop offset="0%" stop-color="#fff8d8"/><stop offset="45%" stop-color="#ffd56a"/><stop offset="100%" stop-color="#ff8a2a"/></radialGradient>
    <radialGradient id="mer_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#d4c8b2"/><stop offset="55%" stop-color="#8a7c68"/><stop offset="100%" stop-color="#3a3225"/></radialGradient>
    <radialGradient id="ven_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#f6dca0"/><stop offset="55%" stop-color="#cc9a55"/><stop offset="100%" stop-color="#6e4818"/></radialGradient>
    <radialGradient id="ear_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#9ed1ff"/><stop offset="55%" stop-color="#2a6cd2"/><stop offset="100%" stop-color="#0c2a60"/></radialGradient>
    <radialGradient id="ear_atm" cx="50%" cy="50%" r="50%"><stop offset="78%" stop-color="rgba(120,200,255,0)"/><stop offset="92%" stop-color="rgba(140,215,255,0.78)"/><stop offset="100%" stop-color="rgba(140,215,255,0)"/></radialGradient>
    <radialGradient id="mar_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#ea8c58"/><stop offset="55%" stop-color="#b54a22"/><stop offset="100%" stop-color="#5a2410"/></radialGradient>
    <radialGradient id="jup_g" cx="34%" cy="32%" r="76%"><stop offset="0%" stop-color="#f6e0b4"/><stop offset="55%" stop-color="#cc9868"/><stop offset="100%" stop-color="#6e4520"/></radialGradient>
    <radialGradient id="sat_g" cx="34%" cy="32%" r="76%"><stop offset="0%" stop-color="#fae6b8"/><stop offset="55%" stop-color="#d0a868"/><stop offset="100%" stop-color="#6e4a18"/></radialGradient>
    <radialGradient id="ura_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#d6efe8"/><stop offset="55%" stop-color="#7cc4ba"/><stop offset="100%" stop-color="#286060"/></radialGradient>
    <radialGradient id="nep_g" cx="34%" cy="32%" r="72%"><stop offset="0%" stop-color="#7aa6f0"/><stop offset="55%" stop-color="#2850b0"/><stop offset="100%" stop-color="#0a1f50"/></radialGradient>
    <clipPath id="jup_c"><circle cx="0" cy="0" r="22"/></clipPath>
    <clipPath id="sat_c"><circle cx="0" cy="0" r="17"/></clipPath>
  </defs>`;

  let body = '';
  P.forEach(p => {
    body += `<circle cx="${cx}" cy="${cy}" r="${p.o}" fill="none" stroke="rgba(140,180,230,0.14)" stroke-width="1"/>`;
  });

  P.forEach(p => {
    let pl = '';
    // 大气辉光（地球）
    if (p.k === 'earth') pl += `<circle r="${(p.r * 1.55).toFixed(1)}" fill="url(#ear_atm)"/>`;

    // 土星：环的后半（在行星后）
    if (p.k === 'saturn') {
      const rx = p.ring, ry = Math.round(p.ring * 0.28);
      pl += `<g transform="rotate(-18)">
        <ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(220,200,150,0.28)" stroke-width="3.5"/>
        <ellipse cx="0" cy="0" rx="${rx - 7}" ry="${Math.max(1, ry - 2)}" fill="none" stroke="rgba(210,185,130,0.35)" stroke-width="1.6"/>
      </g>`;
    }

    // 行星本体（3D 球感径向渐变）
    pl += `<circle r="${p.r}" fill="url(#${gmap[p.k]})"/>`;

    // 表面纹理
    if (p.k === 'mercury') {
      pl += `<circle cx="-2.2" cy="-3" r="2" fill="#3a3225" opacity="0.55"/>`;
      pl += `<circle cx="3"   cy="2"  r="1.5" fill="#3a3225" opacity="0.5"/>`;
      pl += `<circle cx="-1"  cy="3.5" r="1.2" fill="#3a3225" opacity="0.45"/>`;
      pl += `<circle cx="2.5" cy="-4" r="0.9" fill="#3a3225" opacity="0.4"/>`;
      pl += `<circle cx="-3.5" cy="1"  r="0.7" fill="#3a3225" opacity="0.35"/>`;
    } else if (p.k === 'venus') {
      pl += `<ellipse cx="0" cy="-4" rx="${(p.r * 0.95).toFixed(1)}" ry="${(p.r * 0.16).toFixed(1)}" fill="#ecc878" opacity="0.5"/>`;
      pl += `<ellipse cx="0" cy="-1" rx="${(p.r * 0.95).toFixed(1)}" ry="${(p.r * 0.14).toFixed(1)}" fill="#d4a868" opacity="0.4"/>`;
      pl += `<ellipse cx="0" cy="3"  rx="${(p.r * 0.95).toFixed(1)}" ry="${(p.r * 0.18).toFixed(1)}" fill="#a87c30" opacity="0.5"/>`;
    } else if (p.k === 'earth') {
      pl += `<g fill="#3a9654" opacity="0.92">
        <path d="M -5 -2 q3 -3 6 0 q1 3 -3 4 q-4 0 -3 -4 Z"/>
        <path d="M 1  3  q4 -1 6 2 q0 3 -4 3 q-4 0 -2 -5 Z"/>
        <path d="M -3 5  q2 -1 3 1 q0 2 -2 2 q-2 0 -1 -3 Z"/>
        <path d="M 4 -4  q2 -1 3 1 q0 2 -2 2 q-2 0 -1 -3 Z"/>
      </g>`;
      // 极冠
      pl += `<ellipse cx="0" cy="-${(p.r * 0.82).toFixed(1)}" rx="${(p.r * 0.42).toFixed(1)}" ry="${(p.r * 0.18).toFixed(1)}" fill="#eaf6ff" opacity="0.9"/>`;
      pl += `<ellipse cx="0" cy="${(p.r * 0.82).toFixed(1)}" rx="${(p.r * 0.36).toFixed(1)}" ry="${(p.r * 0.15).toFixed(1)}" fill="#eaf6ff" opacity="0.82"/>`;
      // 一抹薄云
      pl += `<ellipse cx="-2" cy="-4" rx="${(p.r * 0.42).toFixed(1)}" ry="${(p.r * 0.12).toFixed(1)}" fill="#ffffff" opacity="0.35"/>`;
    } else if (p.k === 'mars') {
      pl += `<ellipse cx="-2" cy="-1" rx="3" ry="2" fill="#6a2814" opacity="0.55"/>`;
      pl += `<ellipse cx="3"  cy="2"  rx="2" ry="1.5" fill="#6a2814" opacity="0.5"/>`;
      pl += `<ellipse cx="-3" cy="3"  rx="1.6" ry="1.1" fill="#6a2814" opacity="0.45"/>`;
      // 极冠（白色）
      pl += `<ellipse cx="0" cy="-${(p.r * 0.82).toFixed(1)}" rx="${(p.r * 0.55).toFixed(1)}" ry="${(p.r * 0.22).toFixed(1)}" fill="#ffffff" opacity="0.92"/>`;
      pl += `<ellipse cx="0" cy="${(p.r * 0.82).toFixed(1)}" rx="${(p.r * 0.4).toFixed(1)}" ry="${(p.r * 0.18).toFixed(1)}" fill="#ffffff" opacity="0.85"/>`;
    } else if (p.k === 'jupiter') {
      pl += `<g clip-path="url(#jup_c)" opacity="0.55">
        <rect x="-22" y="-16" width="44" height="2.4" fill="#a87238"/>
        <rect x="-22" y="-9"  width="44" height="2"   fill="#d4a574"/>
        <rect x="-22" y="-3"  width="44" height="3.2" fill="#9c6438"/>
        <rect x="-22" y="6"   width="44" height="2"   fill="#c08858"/>
        <rect x="-22" y="13"  width="44" height="2.4" fill="#8a5028"/>
      </g>`;
      // 大红斑
      pl += `<ellipse cx="3" cy="2" rx="4.2" ry="2.5" fill="#b8451e" opacity="0.85"/>`;
      pl += `<ellipse cx="3" cy="2" rx="3"   ry="1.6" fill="#d05a30" opacity="0.65"/>`;
    } else if (p.k === 'saturn') {
      pl += `<g clip-path="url(#sat_c)" opacity="0.5">
        <rect x="-17" y="-10" width="34" height="2"   fill="#a87838"/>
        <rect x="-17" y="-3"  width="34" height="2.4" fill="#c89c5c"/>
        <rect x="-17" y="6"   width="34" height="2"   fill="#9c6e30"/>
      </g>`;
    } else if (p.k === 'uranus') {
      pl += `<ellipse cx="0" cy="0" rx="${p.r}" ry="${(p.r * 0.14).toFixed(1)}" fill="#a8d8d0" opacity="0.55"/>`;
      pl += `<ellipse cx="0" cy="${(p.r * 0.5).toFixed(1)}" rx="${(p.r * 0.8).toFixed(1)}" ry="${(p.r * 0.06).toFixed(1)}" fill="#88c0b8" opacity="0.45"/>`;
    }

    // 土星：环的前半（在行星前，覆盖）
    if (p.k === 'saturn') {
      const rx = p.ring, ry = Math.round(p.ring * 0.28);
      pl += `<g transform="rotate(-18)">
        <path d="M -${rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0" fill="none" stroke="rgba(245,225,185,0.85)" stroke-width="1.8"/>
        <path d="M -${rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0" fill="none" stroke="rgba(255,240,205,0.55)" stroke-width="0.7" transform="translate(0 -1.4)"/>
      </g>`;
    }

    body += `<g class="orbit-g" style="transform-origin:${cx}px ${cy}px; --dur:${p.d}s"><g transform="translate(${cx + p.o} ${cy})">${pl}</g></g>`;
  });

  // 太阳：外日冕 + 主体 + 亮核 + 内核 + 火花点
  body += `<circle cx="${cx}" cy="${cy}" r="52" fill="url(#s_c)" class="sun-pulse"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="34" fill="url(#s_g)"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="22" fill="#fff5b0" opacity="0.9"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="13" fill="#ffffff"/>`;
  body += `<g opacity="0.8">`;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.3;
    body += `<circle cx="${(cx + Math.cos(a) * 44).toFixed(1)}" cy="${(cy + Math.sin(a) * 44).toFixed(1)}" r="1.6" fill="#ffe69a"/>`;
    body += `<circle cx="${(cx + Math.cos(a) * 56).toFixed(1)}" cy="${(cy + Math.sin(a) * 56).toFixed(1)}" r="1" fill="#ffcf6a" opacity="0.7"/>`;
  }
  body += `</g>`;

  return `<svg viewBox="0 0 460 300">${defs}${body}</svg>`;
}
function buildGalaxy() {
  const cx = 200, cy = 200; let arms = '', core = '';
  for (let a = 0; a < 3; a++) {
    const off = a * (Math.PI * 2 / 3);
    for (let i = 0; i < 150; i++) {
      const t = i / 150, ang = off + t * Math.PI * 2.4, rad = 12 + t * 178;
      const x = cx + Math.cos(ang) * rad + (Math.random() - 0.5) * 18 * (1 - t * 0.6);
      const y = cy + Math.sin(ang) * rad * 0.62 + (Math.random() - 0.5) * 14 * (1 - t * 0.6);
      const col = Math.random() < 0.12 ? '#ffb38a' : (Math.random() < 0.2 ? '#9fb8ff' : '#eaf2ff');
      arms += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(Math.random() * 1.6 + 0.5).toFixed(1)}" fill="${col}" opacity="${(0.5 + Math.random() * 0.5).toFixed(2)}"/>`;
    }
  }
  for (let i = 0; i < 60; i++) { const ang = Math.random() * 7, rad = Math.random() * 22; core += `<circle cx="${(cx + Math.cos(ang) * rad).toFixed(1)}" cy="${(cy + Math.sin(ang) * rad * 0.7).toFixed(1)}" r="${(Math.random() * 1.4 + 0.6).toFixed(1)}" fill="#fff4d6" opacity="${(0.6 + Math.random() * 0.4).toFixed(2)}"/>`; }
  return `<svg viewBox="0 0 400 400"><defs><radialGradient id="gg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff3cf" stop-opacity="0.9"/><stop offset="35%" stop-color="#ffd9a0" stop-opacity="0.35"/><stop offset="100%" stop-color="#1a2a55" stop-opacity="0"/></radialGradient></defs>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="195" ry="120" fill="rgba(90,120,200,0.06)"/>`
    + `<g class="spin-g" style="transform-origin:${cx}px ${cy}px">${arms}${core}</g>`
    + `<circle cx="${cx}" cy="${cy}" r="60" fill="url(#gg)"/><circle cx="${cx}" cy="${cy}" r="6" fill="#ffe9b0"/></svg>`;
}
function buildConstellations() {
  const CON = {
    dipper: { name: '北斗七星', sub: '大熊座 · 指极星', pts: [[18, 34], [26, 74], [78, 86], [66, 44], [122, 40], [170, 34], [216, 20]], line: [0, 1, 2, 3, 4, 5, 6], hot: [] },
    orion: { name: '猎户座', sub: '冬季夜空 · 参宿', pts: [[28, 22], [112, 18], [62, 58], [50, 92], [74, 92], [40, 128], [122, 124]], line: [0, 2, 3, 4, 5, 1, 2, 4, 6], hot: [0] },
    cass: { name: '仙后座', sub: '拱极 · W 形', pts: [[18, 42], [60, 82], [102, 42], [144, 86], [188, 42]], line: [0, 1, 2, 3, 4], hot: [] },
    scorpius: { name: '天蝎座', sub: '心宿二 · 红超巨星', pts: [[18, 42], [40, 72], [72, 92], [106, 92], [142, 80], [172, 58], [198, 42], [172, 58]], line: [0, 1, 2, 3, 4, 5, 6, 7], hot: [4] },
  };
  const cards = Object.values(CON).map(c => {
    const W = 230, H = 150;
    let line = '';
    if (c.line.length > 1) {
      let d = `M ${c.pts[c.line[0]][0]} ${c.pts[c.line[0]][1]}`;
      for (let i = 1; i < c.line.length; i++) d += ` L ${c.pts[c.line[i]][0]} ${c.pts[c.line[i]][1]}`;
      line = `<path d="${d}" fill="none" stroke="rgba(140,200,255,0.5)" stroke-width="1.2"/>`;
    }
    let stars = '';
    c.pts.forEach((p, i) => {
      const hot = c.hot.includes(i);
      const r = hot ? 4.2 : 2.6;
      stars += `<circle class="tw" cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${hot ? '#ff7a55' : '#eaf3ff'}" style="animation-delay:${(i * 0.4).toFixed(1)}s"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="210" height="138" style="background:rgba(10,22,46,0.5);border:1px solid rgba(120,200,255,0.25);border-radius:12px;margin:6px">${line}${stars}`
      + `<text x="12" y="22" fill="#9fd0ff" font-size="13" font-weight="700">${c.name}</text>`
      + `<text x="12" y="38" fill="#9fb6c9" font-size="10">${c.sub}</text></svg>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;align-items:center;width:100%">${cards}</div>`;
}
function buildEarth() {
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="oc" cx="38%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#7fc7ff"/>
      <stop offset="38%" stop-color="#2f7ad8"/>
      <stop offset="78%" stop-color="#0d3a86"/>
      <stop offset="100%" stop-color="#06224f"/>
    </radialGradient>
    <radialGradient id="atm" cx="50%" cy="50%" r="50%">
      <stop offset="76%" stop-color="rgba(120,210,255,0)"/>
      <stop offset="90%" stop-color="rgba(140,220,255,0.55)"/>
      <stop offset="100%" stop-color="rgba(140,220,255,0)"/>
    </radialGradient>
    <radialGradient id="dusk" cx="62%" cy="40%" r="72%">
      <stop offset="42%" stop-color="rgba(255,200,140,0)"/>
      <stop offset="72%" stop-color="rgba(255,200,140,0.04)"/>
      <stop offset="100%" stop-color="rgba(0,8,30,0.55)"/>
    </radialGradient>
    <radialGradient id="moon" cx="36%" cy="32%" r="78%">
      <stop offset="0%" stop-color="#f0f2f6"/>
      <stop offset="55%" stop-color="#b6bac2"/>
      <stop offset="100%" stop-color="#4a4d54"/>
    </radialGradient>
    <radialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="rgba(200,210,230,0)"/>
      <stop offset="92%" stop-color="rgba(200,210,230,0.25)"/>
      <stop offset="100%" stop-color="rgba(200,210,230,0)"/>
    </radialGradient>
    <clipPath id="earthClip"><circle cx="150" cy="150" r="104"/></clipPath>
  </defs>

  <!-- 大气外辉光（双层） -->
  <circle cx="150" cy="150" r="132" fill="url(#atm)"/>
  <circle cx="150" cy="150" r="120" fill="url(#atm)" opacity="0.5"/>
  <!-- 海洋主体 -->
  <circle cx="150" cy="150" r="104" fill="url(#oc)"/>

  <!-- 大陆（精细轮廓，clip 在球内） -->
  <g clip-path="url(#earthClip)" fill="#3d8a4e">
    <!-- 北美 -->
    <path d="M76 96 q12 -14 30 -12 q18 2 28 12 q6 10 -2 20 q-4 6 0 12 q-4 6 -12 8 q-10 2 -16 -4 q-8 -2 -10 4 q-6 0 -10 -6 q-8 -10 -10 -22 q-2 -8 2 -12 Z"/>
    <!-- 中美洲 + 加勒比岛链 -->
    <path d="M114 148 q6 -2 8 4 q2 8 -2 14 q-4 4 -8 0 q-4 -6 0 -12 q0 -4 2 -6 Z"/>
    <path d="M122 156 q4 0 4 4 q0 4 -4 4 q-4 0 -4 -4 q0 -4 4 -4 Z"/>
    <!-- 南美 -->
    <path d="M126 168 q12 -8 22 -2 q10 8 8 24 q-2 18 -8 32 q-6 12 -16 14 q-10 0 -14 -10 q-6 -14 -2 -32 q4 -16 10 -26 Z"/>
    <!-- 欧亚大陆（连成大块） -->
    <path d="M146 90 q24 -10 50 -4 q22 4 38 -2 q18 -2 26 8 q8 12 -4 22 q-12 10 -32 8 q-22 0 -40 8 q-22 6 -38 -4 q-16 -10 -8 -28 q4 -8 8 -8 Z"/>
    <!-- 印度次大陆（独立凸起） -->
    <path d="M202 134 q8 0 10 8 q2 8 -4 14 q-6 4 -10 -2 q-4 -8 0 -14 q2 -4 4 -6 Z"/>
    <!-- 阿拉伯半岛 -->
    <path d="M186 134 q8 -2 10 6 q2 8 -2 12 q-6 4 -10 -2 q-4 -8 0 -12 q0 -3 2 -4 Z"/>
    <!-- 非洲 -->
    <path d="M172 128 q14 -2 20 8 q10 14 6 32 q-2 20 -10 30 q-8 10 -18 2 q-10 -10 -10 -28 q-2 -22 4 -32 q4 -8 8 -12 Z"/>
    <!-- 东南亚岛屿链 -->
    <path d="M242 158 q6 0 8 4 q2 6 -4 8 q-6 0 -6 -6 q0 -4 2 -6 Z"/>
    <path d="M254 162 q4 0 4 4 q0 4 -4 4 q-4 0 -4 -4 q0 -4 4 -4 Z"/>
    <path d="M262 168 q4 0 4 4 q0 4 -4 4 q-4 0 -4 -4 q0 -4 4 -4 Z"/>
    <!-- 澳洲 -->
    <path d="M232 178 q12 -2 18 6 q6 10 -2 18 q-10 8 -22 4 q-10 -4 -10 -14 q0 -10 16 -14 Z"/>
    <!-- 格陵兰（北极圈内的孤岛） -->
    <path d="M76 70 q10 -6 18 0 q8 6 4 14 q-6 8 -18 4 q-10 -4 -4 -18 Z"/>
    <!-- 马达加斯加 -->
    <path d="M194 198 q4 0 4 6 q0 8 -2 12 q-2 2 -4 0 q-2 -8 0 -14 q1 -3 2 -4 Z"/>
  </g>

  <!-- 大陆纹理：沙漠/森林/山脉色斑 -->
  <g clip-path="url(#earthClip)" opacity="0.6">
    <ellipse cx="180" cy="108" rx="14" ry="5" fill="#c9a45c"/>
    <ellipse cx="198" cy="120" rx="10" ry="4" fill="#a37a3a"/>
    <ellipse cx="186" cy="160" rx="6" ry="14" fill="#b08a4a"/>
    <ellipse cx="194" cy="180" rx="5" ry="6" fill="#7a5a2a"/>
    <ellipse cx="98" cy="120" rx="8" ry="4" fill="#7ec082"/>
    <ellipse cx="116" cy="124" rx="6" ry="3" fill="#3a7a44"/>
    <ellipse cx="120" cy="200" rx="5" ry="9" fill="#3a7a44"/>
    <ellipse cx="134" cy="196" rx="3" ry="6" fill="#7ec082"/>
    <ellipse cx="240" cy="184" rx="6" ry="3" fill="#c9a45c"/>
  </g>

  <!-- 极冠：北极（多层雪冠） -->
  <g clip-path="url(#earthClip)">
    <ellipse cx="150" cy="44" rx="84" ry="22" fill="#e6efff" opacity="0.9"/>
    <ellipse cx="150" cy="40" rx="56" ry="12" fill="#ffffff" opacity="0.95"/>
    <ellipse cx="150" cy="38" rx="30" ry="6" fill="#ffffff"/>
  </g>
  <!-- 极冠：南极 -->
  <g clip-path="url(#earthClip)">
    <ellipse cx="150" cy="262" rx="92" ry="24" fill="#e6efff" opacity="0.9"/>
    <ellipse cx="150" cy="264" rx="58" ry="13" fill="#ffffff" opacity="0.95"/>
    <ellipse cx="150" cy="266" rx="28" ry="6" fill="#ffffff"/>
  </g>

  <!-- 云带（云带缓慢横向漂动） -->
  <g clip-path="url(#earthClip)" class="earth-clouds">
    <path d="M40 130 q40 -10 80 -4 q40 8 90 -2 q30 4 30 14 q-30 16 -86 14 q-60 -2 -100 6 q-30 -10 -14 -28 Z" fill="#ffffff" opacity="0.55"/>
    <path d="M60 168 q40 -6 80 -2 q44 4 80 -2 q14 6 8 14 q-36 12 -86 8 q-56 -4 -90 4 q-14 -8 8 -22 Z" fill="#ffffff" opacity="0.4"/>
    <path d="M50 200 q40 -4 76 0 q36 4 60 0 q8 4 4 10 q-26 8 -64 6 q-44 -2 -76 4 q-12 -6 0 -20 Z" fill="#ffffff" opacity="0.3"/>
    <path d="M70 92 q30 4 60 0 q30 -4 50 4 q4 8 -4 12 q-26 6 -56 4 q-32 -2 -56 4 q-8 -8 6 -24 Z" fill="#ffffff" opacity="0.35"/>
  </g>

  <!-- 晨昏线（让球有立体感：右上亮、左下暗） -->
  <circle cx="150" cy="150" r="104" fill="url(#dusk)"/>
  <!-- 球边缘高光 -->
  <circle cx="150" cy="150" r="104" fill="none" stroke="rgba(170,220,255,0.5)" stroke-width="1.2"/>
  <!-- 球边缘细描边 -->
  <circle cx="150" cy="150" r="103.5" fill="none" stroke="rgba(8,20,50,0.5)" stroke-width="0.8"/>

  <!-- 月球（带环形山） -->
  <g>
    <!-- 月球外极淡光晕 -->
    <circle cx="234" cy="116" r="22" fill="url(#moonHalo)"/>
    <!-- 月球阴影侧（暗面） -->
    <circle cx="236" cy="118" r="15" fill="#3a3d44"/>
    <!-- 月球亮面（径向渐变） -->
    <circle cx="232" cy="114" r="14" fill="url(#moon)"/>
    <!-- 环形山（5 个） -->
    <circle cx="227" cy="109" r="2.2" fill="#6b6e74" opacity="0.75"/>
    <circle cx="237" cy="112" r="1.4" fill="#6b6e74" opacity="0.6"/>
    <circle cx="232" cy="119" r="2.6" fill="#7d8086" opacity="0.55"/>
    <circle cx="241" cy="116" r="1.2" fill="#6b6e74" opacity="0.6"/>
    <circle cx="225" cy="117" r="1.6" fill="#7d8086" opacity="0.5"/>
    <!-- 月海（月球上暗色平原） -->
    <ellipse cx="230" cy="113" rx="3" ry="2" fill="#8a8d93" opacity="0.35"/>
    <ellipse cx="236" cy="116" rx="2" ry="1.2" fill="#8a8d93" opacity="0.3"/>
  </g>

</svg>`;
}

// ---------- 章节内容 ----------
const CINE = [
  {
    chapter: '探索编年 · A BRIEF HISTORY', title: '人类，从未停止仰望星空', build: buildTimeline,
    body: '从明朝<b>万户</b>绑着 47 支火箭飞向长空，到 1609 年<b>伽利略</b>把望远镜对准月亮；从 1961 年<b>加加林</b>成为第一个进入太空的人，到 1969 年阿姆斯特朗在月面留下脚印；从 1977 年<b>旅行者1号</b>带着金唱片飞向星际，到 1990 年<b>哈勃</b>、2021 年<b>韦伯</b>让我们看见宇宙诞生时的第一缕光——<br><br><span class="hl">人类用四百年，把“仰望”变成了“抵达”。</span>今天，这趟旅程交到你手里。',
  },
  {
    chapter: '我们的家 · THE SOLAR SYSTEM', title: '我们的家：太阳系', build: buildSolar,
    body: '太阳系是我们的家：<b>一颗恒星（太阳）</b>与<b>八颗行星</b>（水·金·地·火·木·土·天·海），以及无数卫星、矮行星与小天体。太阳占系统总质量的 <span class="hl">99.86%</span>。<br><br>地球是唯一已知孕育生命的世界——而在这趟旅程里，你可以飞临、甚至<b>登陆其中多颗行星与卫星</b>，用脚步丈量别的星球。',
  },
  {
    chapter: '星海之中 · THE MILKY WAY', title: '星海之中：银河系', build: buildGalaxy,
    body: '我们身处<b>银河系</b>——一个拥有 <span class="hl">上千亿颗恒星</span> 的棒旋星系，直径约 <b>10 万光年</b>。太阳系位于一条叫“猎户臂”的旋臂上，距银心约 2.6 万光年，绕银河一圈要 2.3 亿年。<br><br>离我们最近的恒星，是 <span class="hl">4.2 光年</span> 外的比邻星。你眼前的旋臂，正在缓缓转动。',
  },
  {
    chapter: '抬头可见 · CONSTELLATIONS', title: '抬头可见的星宿', build: buildConstellations,
    body: '在没有灯光的夜晚，古人把恒星连成图案，用来<b>辨别方向、标记季节</b>。西方今天沿用 <b>88 个星座</b>（如猎户座、仙后座、天蝎座）；中国自古则有<b>三垣二十八宿</b>的星官体系，<b>北斗七星</b>更是指引北天的钥匙。<br><br>进入游戏后，按 <b>G</b> 可一键跃迁到这些真实的星野。',
  },
  {
    chapter: '欢迎登船 · WELCOME ABOARD', title: '欢迎登上这趟奇妙旅程', build: buildEarth,
    body: '准备好了吗，航天员？在这趟旅程里，你可以：<br>· 驾驶飞船<b>飞越星系</b>，靠近星球会被真实挡住<br>· 飞临地球、火星、木星等，按 <b>X</b> <b>登陆星球表面漫步</b><br>· 用 <b>P</b> 拍照，把星辰大海“寄回地球”<br>· 按 <b>G</b> 打开星图、一键跃迁到十大宇宙区域<br><br><span class="hl">宇宙很大，但这一次，它属于你。</span>',
  },
];

// ---------- 放映控制 ----------
const CINE_DUR = 13000;
let cineIndex = 0, cineTimer = null;
CINE.forEach(() => { const d = document.createElement('span'); d.className = 'cine-dot'; cineDots.appendChild(d); });

function renderCine(i) {
  const c = CINE[i];
  cineChapter.textContent = c.chapter;
  cineTitle.textContent = c.title;
  cineBody.innerHTML = c.body;
  cineStage.innerHTML = c.build ? c.build() : '';
  [cineStage, cineText].forEach(el => { el.classList.remove('cine-anim'); void el.offsetWidth; el.classList.add('cine-anim'); });
  [...cineDots.children].forEach((d, idx) => d.classList.toggle('on', idx === i));
  cineProgress.style.transition = 'none'; cineProgress.style.width = '0%'; void cineProgress.offsetWidth;
  cineProgress.style.transition = `width ${CINE_DUR}ms linear`; cineProgress.style.width = '100%';
  cineNext.textContent = (i === CINE.length - 1) ? '开始探索 ▶' : '下一章 ›';
  cinePrev.style.visibility = i === 0 ? 'hidden' : 'visible';
  clearTimeout(cineTimer);
  cineTimer = setTimeout(() => goCine(i + 1), CINE_DUR);
}
function goCine(i) { if (i >= CINE.length) { finishCine(); return; } cineIndex = i; renderCine(i); }
function finishCine() {
  clearTimeout(cineTimer);
  Sound.stopCinematic();
  document.getElementById('cinematic').style.display = 'none';
  blocker.style.display = 'flex';
}

cineStart.addEventListener('click', () => {
  Sound.resume(); Sound.startCinematic();
  cineGate.style.display = 'none';
  cineFrame.style.display = 'flex';
  cineIndex = 0; renderCine(0);
});
cineNext.addEventListener('click', () => {
  if (cineIndex === CINE.length - 1) { finishCine(); return; }
  goCine(cineIndex + 1);
});
cinePrev.addEventListener('click', () => { if (cineIndex > 0) goCine(cineIndex - 1); });
cineSkip.addEventListener('click', finishCine);


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
  // 引擎嗡鸣随速度与档位变化（真空里只听得见你自己飞船的系统声——科学设定）
  const moving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || keys['Space'] || keys['KeyC'] || keys['ControlLeft'];
  Sound.setWarp((moving ? 0.35 : 0.07) + gearIndex / (SPEED_GEARS.length - 1) * 0.45);
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
  // 可着陆行星提示（漫游中）
  landTarget = null;
  if (!interiorActive && !roamSurfaceActive) {
    for (const L of LOCATIONS) {
      if (L._landable && camera.position.distanceTo(L._pos) < L.radius * 1.9 + 520) { landTarget = L; break; }
    }
  }
  // 首次锁定可登陆行星：奏响“抵达动机”（地球用更恢弘的招牌主题）
  if (landTarget && landTarget.id !== prevLandId) {
    if (landTarget.id === 'earth') Sound.cueEarth(); else Sound.cueArrival();
  }
  prevLandId = landTarget ? landTarget.id : null;
  updateEnterPrompt();
  drawMinimap();
  updateEdgeMarkers();
  if (mode === 'roam' && !roamSurfaceActive && !interiorActive) updateHazard();
  else { hazardEl.style.opacity = '0'; hazardWarn.style.display = 'none'; }
}
function toggleHelp(force) {
  if (force === true) helpPanel.style.display = 'block';
  else if (force === false) helpPanel.style.display = 'none';
  else helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
}
let helpAutoTimer = null;
// 进入漫游后，操作指南先显示一会儿再自动收起，避免挡住视野；常驻 ❔ 按钮可随时再开
function autoHideHelp(delay = 7000) {
  if (helpAutoTimer) clearTimeout(helpAutoTimer);
  helpPanel.style.display = 'block';
  helpAutoTimer = setTimeout(() => { helpPanel.style.display = 'none'; }, delay);
}
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

document.getElementById('btn-launch').addEventListener('click', () => { Sound.resume(); Sound.armMusic(); startCountdown(); });
document.getElementById('btn-resume').addEventListener('click', () => controls.lock());
document.getElementById('btn-return').addEventListener('click', triggerReturn);
document.getElementById('btn-relaunch').addEventListener('click', () => { resetMission(); startCountdown(); });

function startCountdown() {
  if (gameState === 'countdown' || gameState === 'flying' || gameState === 'returning') return;
  gameState = 'countdown';
  blocker.style.display = 'none';
  autoHideHelp(7000);   // 操作指南先显示 7 秒再自动收起
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
  Sound.setEnvironment('space');
  Sound.setWarp(0);
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
  Sound.gearShift(gearIndex);
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
  } else if (controls.isLocked && gameState === 'flying' && !interiorActive && mode === 'roam' && !roamSurfaceActive) {
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
    // 实心天体碰撞：不让用户穿过星球（停在表面壳外，并抵消朝内的速度分量）
    for (const L of LOCATIONS) {
      if (!L._solid) continue;
      const d = camera.position.distanceTo(L._pos);
      const minD = L.radius * 1.04 + 8;
      if (d < minD) {
        _tmpVec.copy(camera.position).sub(L._pos);
        if (_tmpVec.lengthSq() < 1e-6) _tmpVec.set(0, 1, 0);
        _tmpVec.normalize();
        camera.position.copy(L._pos).addScaledVector(_tmpVec, minD);
        const vn = velocity.dot(_tmpVec);
        if (vn < 0) velocity.addScaledVector(_tmpVec, -vn);
      }
    }
  }
  // 动效
  for (const L of LOCATIONS) {
    if (L._diskMat) L._diskMat.uniforms.uTime.value += dt;
    if (L._pulse) { const s = 1 + 0.03 * Math.sin(performance.now() * 0.001 + L._pulse); L._mesh.scale.setScalar(s); }
    if (L._spin) L._spin.rotation.y += dt * 0.3;
    if (L._clouds) L._clouds.rotation.y += dt * 0.02;
    if (L._autoRotate && L._mesh && L._mesh.isMesh) L._mesh.rotation.y += dt * 0.012;
  }
  composer.render();
  if (mode === 'expedition') updateExpedition(dt);
  else if (roamSurfaceActive) { exp.t += dt; if (exp.surfaceMode === 'cloud') updateCloudDeck(dt); else updateSurface(dt); }
  else updateHUD();
}
animate();

/* =====================================================================
   星际远征模式（剧情 · 硬核科幻纪实）
   流程：发射台 → 倒计时点火 → 升空(海拔里程碑) → 入轨失重 → 星际巡航
        → 进入目标大气/悬停 → 着陆 → 地表自由探索(成就 + 拍照明信片)
   支持的目的地由 PLANETS 配置驱动（火星 / 月球 …）
   ===================================================================== */
// 剧情分支任务线：3 条独立的故事线，共享同一发射-着陆流程
const EXPEDITIONS = {
  ark: {
    id: 'ark', tag: '🟠 殖民 · 第一批人类移民', name: '火星方舟', sub: 'Mars Ark',
    planet: 'mars', icon: '🚀', accent: '#ff9a5a',
    intro: `<p style="color:#ffd66b;font-weight:700;font-size:17px;margin-top:0">📅 公元 2049 · 火星方舟计划</p>
<p>你被选为 <b>首批 12 名火星定居者</b> 之一。这次任务不再是"探索"——是<b>永久殖民</b>。你的任务：在乌托邦平原建立火星一号基地，部署居住舱、太阳能阵列、水冰提炼装置。</p>
<p>同行的是 <b>祝融二号</b> 着陆器、<b>毅力号</b> 升级版火星车，以及 23 吨补给。<b>氧气从大气中提取，燃料就地取材</b>——这是人类成为多行星物种的起点。</p>
<p style="color:#9affd0">本程为真实数据：火星方舟计划由 SpaceX 推进，预计 2030s 首飞。你将用 7 分钟着陆、走 1.6 亿公里、花 7 个月到达。</p>`,
    story: [
      { at: 400,  title: '🟠 火星方舟 · 殖民启动', desc: '7 个月的航程即将开始。前方是那颗你即将永久居住的星球。' },
      { at: 10000, title: '🔶 接近火星轨道', desc: '从窗口望去，火星如一枚红铜硬币。你即将开始人类历史上最重要的减速——进入火星轨道。' },
    ],
    conclusion: '🌟 任务完成 · 火星一号基地正式奠基。地球人，终于成为多行星物种。',
  },
  life: {
    id: 'life', tag: '🟣 生命 · 疑似生物信号', name: '深海回响', sub: 'Deep Sea Echo',
    planet: 'mars', icon: '🧬', accent: '#c66bff',
    intro: `<p style="color:#c66bff;font-weight:700;font-size:17px;margin-top:0">📅 公元 2047 · 火星生命探测 · 最高优先级</p>
<p>3 天前，"洞察号"在火星地下 <b>1.6 公里</b> 深处检测到一组<b>异常电磁信号</b>：每 <b>11.3 小时</b> 重复一次，温度越高信号越强——地球上，这意味着<b>地下热液生态系统</b>。</p>
<p>你的任务：紧急飞往火星，钻探取样，确认信号是否来自<b>现存生命</b>。如果这是真的——人类将<b>第一次证明地球之外有生命</b>。</p>
<p>同行的科学载荷价值 <b>27 亿美元</b>。成败将改写人类世界观。</p>
<p style="color:#9affd0">本程为基于真实 NASA/ESA 火星生命探测任务的虚构推演。地球微生物极端环境证据：地下 1.6km 仍可存活。</p>`,
    story: [
      { at: 400,  title: '🧬 深海回响 · 生命信号确认', desc: '我们正飞向那颗可能藏着第二种生命的星球。' },
      { at: 10000, title: '🔬 接近火星 · 信号源定位', desc: '信号来自耶泽罗陨石坑下方——曾经的河流三角洲，如今被沉积岩深埋。' },
    ],
    conclusion: '🔬 钻探成功 · 样本已封存返回地球。如果回响来自生命——教科书今夜要改写。',
  },
  pathfinder: {
    id: 'pathfinder', tag: '🟢 探路 · 月球中转站', name: '曙光计划', sub: 'Dawn',
    planet: 'moon', icon: '🌙', accent: '#7adcff',
    intro: `<p style="color:#7adcff;font-weight:700;font-size:17px;margin-top:0">📅 公元 2046 · 曙光计划 · 月球中转站</p>
<p>目的地是 <b>40 光年外</b> 的 TRAPPIST-1e——已知最具地球相似度的系外行星。但我们先要建立<b>月球中转站</b>，作为深空航线补给点。</p>
<p>你的任务：在<b>静海基地</b>部署 <b>L2 拉格朗日点推进剂库</b>的预制件，验证 <b>ISRU（月壤制氧）</b> 工艺，测试 <b>抗宇宙辐射生态舱</b>。这是人类走向深空的<b>第一块跳板</b>。</p>
<p>同行的是 <b>嫦娥九号</b> 月球车与<b>SpaceX Starship HLS</b> 着陆器。</p>
<p style="color:#9affd0">本程为真实推进的阿尔忒弥斯计划 + 月球门户的延伸设想。嫦娥工程已实现月背软着陆。</p>`,
    story: [
      { at: 400,  title: '🌙 曙光 · 月球中转站奠基', desc: '3 天的航程，这里是深空之门。' },
      { at: 10000, title: '🛰 接近月球 · 拉格朗日点可见', desc: '远处那个白点，是月球门户空间站。' },
    ],
    conclusion: '🌙 中转站奠基完成。下一站：火星。再下一站：TRAPPIST-1e。',
  },
};

const PLANETS = {
  mars: {
    id: 'mars', name: '火星', nameEn: 'Mars', gravity: 14, gravLabel: '0.38g',
    sky: 0xc9a07a, fog: 0xc9a07a, fogDensity: 0.00032,
    groundColor: '#a8552e', groundSpots: 80, hasAtmosphere: true,
    farColor: 0xc1440e, dust: true, dustColor: 0xe8c9a0, dustCount: 1300,
    extras: 'mars',
    landTitle: '乌托邦平原',
    landDesc: '反推引擎熄火，着陆腿稳稳触地。你站在了距地球数千万公里的红色星球上。这里的重力只有地球的 0.38——轻轻一跳，就能跃起近一米高。',
    craters: [[900, 400, 280], [-1500, -700, 380], [2200, 1900, 320], [-1000, 2400, 240], [3200, -1500, 300]],
    moons: [
      { r: 130, color: 0x8a8076, orbitR: 4600, h: 3600, spd: 0.05 },
      { r: 72, color: 0x9a9088, orbitR: 5200, h: 4300, spd: -0.03 },
    ],
    brief: `<p>目的地：<b>火星（Mars）</b>——距地球最近时约 <b>5460 万公里</b>，最远约 4 亿公里；即便以第二宇宙速度（11.2 km/s）直飞，也要 <b>约 7 个月</b>。</p>
<p>这颗锈红色的星球，是人类最想踏上的下一颗行星：一天约 <b>24.6 小时</b>（一个“火星日/sol”），重力只有地球的 <b>0.38</b>（轻轻一跳就能跃起近一米），大气 <b>95% 是二氧化碳</b>、密度仅为地球的 0.6%。</p>
<p>这里曾有河流与湖泊，今天两极藏着水冰与干冰。最高的山<b>奥林匹斯山</b>高约 21.9 公里（珠峰近 3 倍），最长的峡谷<b>水手谷</b>绵延 4000 公里。中国的<b>祝融号</b>已在乌托邦平原巡视。</p>
<p style="color:#ffe27a">本程为硬核科幻纪实：升空、失重、巡航、着陆、地表探索，全部标注真实数据。准备好了吗，宇航员？</p>`,
    pois: [
      { x: -7200, y: 1100, z: -8200, id: 'olympus', name: '奥林匹斯山', desc: '太阳系最高山峰：高约 21.9 公里，约为珠穆朗玛峰的近 3 倍。它是一座“盾状火山”，由远古火星极度活跃的岩浆缓慢层层堆叠而成，底座比整个夏威夷还大。' },
      { x: 6100, y: 60, z: 2050, id: 'marineris', name: '水手谷', desc: '一条长逾 4000 公里、深达 7 公里的大峡谷，足以横贯整个中国。它由火星外壳张裂形成，是行星地质的一道巨大伤疤，也是太阳系最长峡谷。' },
      { x: 2600, y: 40, z: -1200, id: 'gale', name: '盖尔陨石坑 · 好奇号', desc: '直径 154 公里的古老撞击坑。NASA“好奇号”火星车 2012 年在此着陆，钻探出的泥岩证明：这里在数十亿年前曾是一个有水的湖泊。' },
      { x: -2600, y: 50, z: 1650, id: 'jezero', name: '耶泽罗陨石坑 · 毅力号', desc: '保存完好的古河流三角洲。NASA“毅力号”2021 年着陆于此，专门寻找可能的微生物化石，并首次在火星上利用二氧化碳制造出氧气（MOXIE）。' },
      { x: 0, y: 30, z: 4300, id: 'ice', name: '北极冰盖', desc: '火星两极覆盖着水冰与干冰（固态二氧化碳）。雷达探测证实地下藏有巨量水冰——这是未来火星殖民者最宝贵的资源：喝的水、呼吸的氧、推进的燃料，都能从中提取。' },
    ],
  },
  moon: {
    id: 'moon', name: '月球', nameEn: 'Moon', gravity: 6, gravLabel: '1/6g',
    sky: 0x05060a, fog: 0x0a0c12, fogDensity: 0.00018,
    groundColor: '#9a9a9a', groundSpots: 26, hasAtmosphere: false,
    farColor: 0xb9b6ad, dust: false, extras: 'moon',
    landTitle: '静海基地',
    landDesc: '引擎稳稳悬停，着陆支架轻触月壤。这里没有大气、没有风，天空永远漆黑。重力只有地球的 1/6，你可以像袋鼠一样蹦跳着前进。',
    craters: [[-1200, 800, 360], [1600, -1000, 420], [300, -2000, 300], [2400, 1600, 340], [-2600, -1400, 400], [800, 2600, 300], [-3400, 600, 460], [3200, -2600, 380], [-600, 3200, 320], [1400, 1200, 260]],
    moons: [],
    brief: `<p>目的地：<b>月球（Moon）</b>——距地球仅约 <b>38.4 万公里</b>，光走过去只要 1.3 秒。以第二宇宙速度直飞约 <b>3 天</b>即可抵达，是人类唯一踏足过的另一颗星球。</p>
<p>这里几乎没有大气：天空永远漆黑、星星不眨、白天黑夜温差超过 <b>300℃</b>。重力只有地球的 <b>1/6</b>，你可以像袋鼠一样蹦跳前进。表面布满数十亿年陨石撞击留下的环形山。</p>
<p>1969 年<b>阿波罗 11 号</b>首次载人登月；2013 年中国的<b>嫦娥三号 / 玉兔号</b>实现月面软着陆；2019 年<b>嫦娥四号</b>成为人类首个着陆月球背面的探测器。南极-艾特肯盆地，是太阳系最巨大的撞击遗迹之一。</p>
<p style="color:#ffe27a">本程为硬核科幻纪实：升空、失重、巡航、着陆、月面探索，全部标注真实数据。准备好了吗，宇航员？</p>`,
    pois: [
      { x: -4200, y: 40, z: -3600, id: 'apollo11', name: '静海 · 阿波罗11号', desc: '1969 年 7 月 20 日，人类首次踏上另一颗星球。阿姆斯特朗在静海基地踩下那著名的一步：“这是个人的一小步，却是人类的一大步。”这里几乎没有大气，天空永远漆黑，星星不眨眼。' },
      { x: 5200, y: 30, z: 1400, id: 'apollo17', name: '陶拉斯-利特罗 · 阿波罗17号', desc: '1972 年，最后一次载人登月。宇航员采集了最年轻的火山岩，并驾驶月球车驰骋。此处证明：月球并非死寂——它曾有过剧烈的火山活动。' },
      { x: 0, y: 30, z: 4300, id: 'spa', name: '南极-艾特肯盆地', desc: '月球背面巨大的撞击盆地，深约 12 公里、直径约 2500 公里，是太阳系最大最古老的撞击结构之一。中国“嫦娥四号”在此实现人类首次月背软着陆。' },
      { x: -2600, y: 50, z: 1650, id: 'tycho', name: '第谷陨石坑', desc: '南半球最醒目的年轻陨石坑，明亮的射线纹从坑心向四周辐射数千公里。它的形成仅约 1 亿年，是月球表面最“新鲜”的伤疤之一。' },
      { x: 2600, y: 40, z: -1200, id: 'change3', name: '虹湾 · 嫦娥三号', desc: '2013 年“嫦娥三号”携“玉兔号”月球车在此着陆，这是中国首次在地外天体软着陆。月壤由无数微陨石撞击粉碎的岩屑构成，踩上去会留下清晰脚印。' },
    ],
  },
};

/* ---------- 漫游模式可直接登陆的行星（含真实地标） ---------- */
const LANDING = {
  mercury: {
    id: 'mercury', name: '水星', nameEn: 'Mercury', gravity: 13, gravLabel: '0.38g',
    sky: 0x05060a, fog: 0x0a0a0e, fogDensity: 0.00016,
    groundColor: '#8a7a68', groundSpots: 44, hasAtmosphere: false,
    farColor: 0x8a7a68, dust: false, extras: null,
    landTitle: '水星 · 卡洛里盆地边缘',
    landDesc: '你降落在距太阳最近的行星上。这里几乎没有大气：白天被太阳烤到约 430℃、夜晚骤降至 -180℃，温差超过 600℃——太阳在天上显得比地球大两倍多。脚下是密布陨石坑的古老地壳。',
    craters: [[1200, 900, 520], [-1800, -600, 620], [2400, 1700, 480], [-900, 2200, 420], [3200, -1100, 560], [-2600, -1500, 600]],
    moons: [],
    pois: [
      { x: -1200, y: 110, z: -900, id: 'caloris', name: '卡洛里盆地', desc: '太阳系最大的撞击盆地之一，直径约 1550 公里。撞击冲击波在盆地对跖点激起崎岖的“混沌地形”。这里朝阳面正午温度足以熔化铅。' },
      { x: 2600, y: 60, z: 1400, id: 'mercury-ice', name: '极区永夜冰', desc: '水星几乎没有自转轴倾角，两极陨石坑底部永远照不到阳光。NASA 的 MESSENGER 探测器在此发现水冰——在离太阳最近的星球上，竟藏着生命之源。' },
      { x: 0, y: 40, z: 3200, id: 'mercury-valley', name: '水星大峡谷', desc: '一道绵延数百公里、深达数公里的裂谷，是这颗行星冷却收缩时地壳撕裂留下的伤疤，比美国大峡谷更庞大。' },
    ],
  },
  venus: {
    id: 'venus', name: '金星', nameEn: 'Venus', gravity: 26, gravLabel: '0.9g', venus: true,
    sky: 0xa9702f, fog: 0x9a6428, fogDensity: 0.0011,
    groundColor: '#9a7a52', groundSpots: 32, hasAtmosphere: true,
    farColor: 0xb98a4a, dust: false, extras: null,
    landTitle: '金星 · 地狱平原',
    landDesc: '你站在了太阳系最像地球的“恶魔双胞胎”上。这里气压是地球的 90 倍、温度约 460℃——铅都会熔化。厚重硫酸云把天空染成暗橙色；前苏联“金星9号”探测器曾在这里拍下人类第一批地外行星地表照片。',
    craters: [],
    moons: [],
    pois: [
      { x: -1800, y: 60, z: -1200, id: 'maat', name: '玛亚特山', desc: '金星上最高的火山之一，海拔约 8 公里。金星有超过 1600 座大型火山，是太阳系火山活动最活跃的世界（如今大多休眠）。' },
      { x: 2200, y: 50, z: 1600, id: 'maxwell', name: '麦克斯韦山', desc: '金星最高峰，比周围平原高出约 11 公里，也是金星上唯一以男性（物理学家麦克斯韦）命名的地标。' },
      { x: 0, y: 40, z: 3000, id: 'venera', name: '金星9号着陆点', desc: '1975 年，苏联“金星9号”成为首个从另一颗行星表面传回照片的探测器。它只坚持工作了约 53 分钟——便被 460℃ 的高温彻底烤毁。' },
    ],
  },
  earth: {
    id: 'earth', name: '地球', nameEn: 'Earth', gravity: 40, gravLabel: '1g', earth: true,
    sky: 0x9fc4ff, fog: 0xcfe6ff, fogDensity: 0.00022,
    groundColor: '#3f7a35', groundSpots: 30, hasAtmosphere: true,
    farColor: 0x2a6db4, dust: false, extras: null,
    landTitle: '地球 · 蓝色故乡',
    landDesc: '你回到了自己的母星。1g 的重力、湿润的空气、湛蓝的天空——这片草木葱茏的海岸平原，是浩瀚星海里目前已知唯一孕育了生命的世界。远处城市的轮廓提醒你：文明就在这里。',
    craters: [],
    moons: [{ r: 520, color: 0xd8d8d8, orbitR: 11000, h: 4200, spd: 0.01 }],
    pois: [
      { x: -2600, y: 0, z: -1800, model: 'everest', name: '珠穆朗玛峰', desc: '地球最高峰，海拔约 8849 米。它由印度板块与欧亚板块挤压隆起，至今仍以每年数毫米的速度长高。' },
      { x: 2400, y: 0, z: 1400, model: 'canyon', name: '科罗拉多大峡谷', desc: '历经约 600 万年科罗拉多河切割，深达 1.8 公里、绵延 446 公里，岩层像一本记录地球亿万年历史的书。' },
      { x: 0, y: 0, z: 3200, model: 'forest', name: '亚马逊雨林', desc: '地球之肺：占全球雨林一半以上，栖息着已知物种的约 10%，每天通过光合作用向大气释放海量氧气。' },
      { x: -3400, y: 0, z: 700, model: 'eiffel', name: '埃菲尔铁塔', desc: '1889 年为巴黎世界博览会建成，高约 330 米。它曾是全世界最高的人造建筑，如今是法国的象征，每年吸引数百万游客。' },
      { x: 3200, y: 0, z: -1600, model: 'pyramids', name: '吉萨金字塔群', desc: '古埃及人为法老修建的陵墓，其中胡夫金字塔原高约 146 米，是古代世界七大奇迹中唯一大体保存至今的一座。' },
      { x: 1400, y: 0, z: -2800, model: 'greatwall', name: '万里长城', desc: '人类历史上规模最大的军事防御工程，总长逾 2 万公里。它并非一道直线，而是依山势起伏、蜿蜒于崇山峻岭之间。' },
      { x: -1200, y: 0, z: 2800, model: 'statue', name: '自由女神像', desc: '法国赠予美国的礼物，1886 年落成，高约 93 米。她手持火炬，象征着自由与民主，是纽约港最著名的地标。' },
    ],
  },
  pluto: {
    id: 'pluto', name: '冥王星', nameEn: 'Pluto', gravity: 3, gravLabel: '0.06g',
    sky: 0x06070d, fog: 0x090b14, fogDensity: 0.00014,
    groundColor: '#b5a78c', groundSpots: 26, hasAtmosphere: false,
    farColor: 0xb5a78c, dust: false, extras: null,
    landTitle: '冥王星 · 斯普特尼克平原',
    landDesc: '你站在了太阳系边缘的矮行星上。重力只有地球的 0.06——轻轻一蹬就能跳起数米高。脚下的氮冰平原构成著名的“心形”区域，而遥远的太阳只是一颗格外明亮的星星。',
    craters: [[1400, 800, 360], [-1900, -700, 420], [2600, 1500, 300], [-800, 2100, 260], [3000, -1000, 340]],
    moons: [{ r: 240, color: 0x9a8f82, orbitR: 7000, h: 3000, spd: 0.012 }],
    pois: [
      { x: -1400, y: 80, z: -1000, id: 'sputnik', name: '斯普特尼克平原', desc: '冥王星上最醒目的“心形”区域，由氮冰构成的盆地。新视野号发现它并非死寂——冰层下或许仍有微弱对流，像缓慢沸腾的粥。' },
      { x: 2300, y: 60, z: 1500, id: 'tombaugh', name: '汤博区', desc: '以发现者克莱德·汤博命名的心形高地。1930 年他在一堆叠照片中辨认出这个移动的光点，冥王星才被人类认识。' },
      { x: 0, y: 50, z: 3000, id: 'charon', name: '冥卫一 · 卡戎', desc: '冥王星最大的卫星，体积接近冥王星本身，二者相互潮汐锁定——永远以同一面朝向彼此，像跳着慢舞的双星。' },
    ],
  },
  ceres: {
    id: 'ceres', name: '谷神星', nameEn: 'Ceres', gravity: 2, gravLabel: '0.03g',
    sky: 0x05060c, fog: 0x080a12, fogDensity: 0.00014,
    groundColor: '#8a7a66', groundSpots: 30, hasAtmosphere: false,
    farColor: 0x8a7a66, dust: false, extras: null,
    landTitle: '谷神星 · 奥卡托陨石坑',
    landDesc: '你降落在小行星带中最大的天体——一颗矮行星上。重力仅地球的 0.03，几乎像在漂浮。坑底那些亮白色的斑点，是咸水蒸发后留下的盐，暗示地下可能藏着液态卤水海洋。',
    craters: [[1300, 700, 380], [-1700, -600, 440], [2400, 1400, 320], [-700, 1900, 260], [2800, -900, 340]],
    moons: [],
    pois: [
      { x: -1300, y: 80, z: -900, id: 'occator', name: '奥卡托陨石坑', desc: '直径约 92 公里的撞击坑，坑底布满明亮的钠碳酸盐沉积（“亮斑”）。黎明号探测器确认这是地下卤水渗出、蒸发后留下的盐壳。' },
      { x: 2200, y: 60, z: 1400, id: 'ahuna', name: '阿胡纳山', desc: '谷神星上唯一的“冰火山”：由咸水（而非熔岩）缓慢涌出、冻结堆叠而成，高约 4 公里，是太阳系最独特的山脉之一。' },
      { x: 0, y: 50, z: 2900, id: 'ceres-belt', name: '小行星带', desc: '你身处火星与木星之间、由数百万块岩石碎块构成的环状带。谷神星是其中最大的一块——若把它凑齐，也仅占带总质量的小部分。' },
    ],
  },
  europa: {
    id: 'europa', name: '木卫二', nameEn: 'Europa', gravity: 6, gravLabel: '0.13g',
    sky: 0x05070d, fog: 0x080b14, fogDensity: 0.00014,
    groundColor: '#dde4ee', groundSpots: 18, hasAtmosphere: false,
    farColor: 0xc9d4e4, dust: false, extras: null,
    landTitle: '木卫二 · 冰原',
    landDesc: '你站在木星的第四颗卫星上。脚下是厚达数公里的水冰壳，冰壳之下，藏着比地球所有海洋加起来还多的液态水——银河系中最有希望孕育生命的地方之一。',
    craters: [[1200, 600, 260], [-1600, -500, 300], [2200, 1200, 220], [-700, 1700, 200]],
    moons: [{ r: 900, color: 0xd9b48a, orbitR: 14000, h: 4000, spd: 0.03 }],
    pois: [
      { x: -1200, y: 60, z: -800, id: 'conamara', name: '科纳马拉混沌区', desc: '冰壳破裂、错位、重新冻结形成的杂乱地形，是冰下海洋活动曾经搅动地表的直接证据。' },
      { x: 2100, y: 50, z: 1300, id: 'pwyll', name: '普威尔陨石坑', desc: '木卫二上最年轻的亮斑撞击坑之一，周围一圈明亮射线显示：冰壳表层极为新鲜，几乎没有被尘埃覆盖。' },
      { x: 0, y: 50, z: 2900, id: 'europa-ocean', name: '冰下海洋', desc: '潮汐加热让冰壳下的海水保持液态。科学家推测：这里可能具备生命所需的能量、液态水和化学物质——是未来探测器的头号目标。' },
    ],
  },
  enceladus: {
    id: 'enceladus', name: '土卫二', nameEn: 'Enceladus', gravity: 1, gravLabel: '0.011g',
    sky: 0x05070d, fog: 0x080b14, fogDensity: 0.00014,
    groundColor: '#e6ebf0', groundSpots: 16, hasAtmosphere: false,
    farColor: 0xd2dbe6, dust: false, extras: null,
    landTitle: '土卫二 · 南极冰喷泉',
    landDesc: '你降落在土星的一颗小卫星上，重力只有地球的 0.011——轻轻一碰地面就会飘起来。南极的裂隙正不断喷出含有水冰与有机物的喷泉，直冲数百公里高。',
    craters: [[1000, 500, 220], [-1400, -400, 260], [2000, 1000, 180], [-600, 1500, 160]],
    moons: [{ r: 1400, color: 0xe8d9a8, orbitR: 18000, h: 5000, spd: 0.025 }],
    pois: [
      { x: -1000, y: 60, z: -700, id: 'tiger', name: '南极虎纹裂隙', desc: '四条几乎平行的暗色裂缝，被称为“虎纹”。Cassini 探测器正是在这里发现：裂缝在不断喷出羽流——这是冰下海洋直通太空的窗口。' },
      { x: 1900, y: 50, z: 1200, id: 'plume', name: '冰喷泉羽流', desc: '喷泉由水汽、冰粒和简单有机物组成，速度可达每秒数百米。卡西尼号曾穿过羽流采样，分析出类似深海热泉的化学成分。' },
      { x: 0, y: 50, z: 2800, id: 'enc-ocean', name: '地下海洋', desc: '土卫二内部被土星引力潮汐加热，维持着全球性液态水海洋。它与木卫二并列，是太阳系最可能找到地外生命的热点。' },
    ],
  },
  proxima: { id: 'proxima', name: '比邻星 b', nameEn: 'Proxima b', gravity: 18, gravLabel: '0.5g (估)',
    sky: 0x3a2a3a, fog: 0x4a2a2a, fogDensity: 0.0005, groundColor: '#7a5a44', groundSpots: 34, hasAtmosphere: false, farColor: 0x7a5a44, dust: false, extras: null,
    landTitle: '比邻星 b · 红矮星下的世界', landDesc: '你站在距太阳最近（4.2 光年）的系外行星上。它的恒星是一颗暗红色矮星，天空常年泛着暗红的暮光。这颗行星很可能被潮汐锁定——一面永恒白昼、一面永恒黑夜，交界处的“晨昏线”或许是唯一温和的宜居地带。',
    craters: [[1300, 700, 300], [-1700, -600, 360], [2400, 1300, 260]], moons: [],
    pois: [
      { x: -1300, y: 60, z: -900, id: 'prox-day', name: '永昼面', desc: '朝向恒星的一面永远被照亮、温度可能高达数十摄氏度；岩石在恒定的红光下龟裂。' },
      { x: 2200, y: 50, z: 1400, id: 'prox-night', name: '永夜面', desc: '背向恒星的一面永远是零下百余摄氏度的冰原，只在偶尔的恒星耀斑中闪过微光。' },
      { x: 0, y: 50, z: 3000, id: 'prox-terminator', name: '晨昏线', desc: '昼夜交界的狭窄地带温度恰到好处，被科学家认为是比邻星 b 上最可能存在液态水与生命的地方。' },
    ] },
  trappist1e: { id: 'trappist1e', name: 'TRAPPIST-1e', nameEn: 'TRAPPIST-1e', gravity: 20, gravLabel: '0.93g (估)',
    sky: 0x244a5a, fog: 0x2a4a5a, fogDensity: 0.00045, groundColor: '#4a8c6a', groundSpots: 30, hasAtmosphere: true, farColor: 0x2a6a6a, dust: false, extras: null,
    landTitle: 'TRAPPIST-1e · 七姐妹之星', landDesc: '你站在一颗约 40 光年外、体积与地球相近的岩质行星上。它环绕一颗超冷红矮星运行，是著名的 TRAPPIST-1 七行星系统中最可能拥有液态水海洋的成员。抬头望去，另外几颗行星会在天空中大如满月。',
    craters: [[1200, 600, 260], [-1600, -500, 300]], moons: [{ r: 700, color: 0xff9a7a, orbitR: 8000, h: 3000, spd: 0.03 }, { r: 520, color: 0x9fd8ff, orbitR: 11000, h: 4500, spd: 0.02 }],
    pois: [
      { x: -1200, y: 60, z: -800, id: 't1-ocean', name: '全球海洋', desc: '模型显示 TRAPPIST-1e 可能几乎被海洋覆盖。它的密度暗示着岩石核心外包裹着大量水——一个真正的“水世界”。' },
      { x: 2100, y: 50, z: 1300, id: 't1-siblings', name: '天空中的姊妹星', desc: '由于行星间距离极近，相邻行星在天空中显得巨大，甚至能看到它们的相位变化，如同我们在地球看月亮。' },
      { x: 0, y: 50, z: 2900, id: 't1-habit', name: '宜居带核心', desc: 'TRAPPIST-1e 正位于其恒星的宜居带中央，接收的能量与地球相近，是寻找地外生命的头号候选之一。' },
    ] },
  kepler452b: { id: 'kepler452b', name: '开普勒-452b', nameEn: 'Kepler-452b', gravity: 30, gravLabel: '~1.6g (估)',
    sky: 0x2a4a7a, fog: 0x355a8a, fogDensity: 0.0004, groundColor: '#6a8cd8', groundSpots: 32, hasAtmosphere: true, farColor: 0x3a6db4, dust: false, extras: null,
    landTitle: '开普勒-452b · 地球的年长表亲', landDesc: '你站在一颗约 1400 光年外、比地球大 60%、绕类太阳恒星运行的“超级地球”上。它的一年约 385 天，位于宜居带，常被称为“地球年长表亲”。这里的重力可能接近地球的 2 倍。',
    craters: [[1300, 700, 300], [-1700, -600, 340]], moons: [],
    pois: [
      { x: -1300, y: 60, z: -900, id: 'k452-star', name: '类太阳恒星', desc: '它的恒星与太阳极为相似，只是更老、更亮。这意味着在它演化到今天，接收到的能量比地球略多——它或许正经历着地球未来的温室命运。' },
      { x: 2200, y: 50, z: 1400, id: 'k452-year', name: '385 天的年轮', desc: '开普勒-452b 的公转周期约 385 天，与地球惊人地接近，让它成为寻找“另一个地球”道路上最著名的候选者之一。' },
      { x: 0, y: 50, z: 3000, id: 'k452-mass', name: '超级地球重力', desc: '质量约为地球的 5 倍，表面重力可能接近 2g——在这里，你每走一步都像背着一个自己。' },
    ] },
  lhs1140b: { id: 'lhs1140b', name: 'LHS 1140 b', nameEn: 'LHS 1140 b', gravity: 32, gravLabel: '~2.3g (估)',
    sky: 0x1a2a4a, fog: 0x22304a, fogDensity: 0.0005, groundColor: '#6b8fb0', groundSpots: 30, hasAtmosphere: true, farColor: 0x3a5a8a, dust: false, extras: null,
    landTitle: 'LHS 1140 b · 致密的超级地球', landDesc: '你站在一颗距太阳系约 49 光年、密度极高的“超级地球”上。它的质量约为地球的 6.4 倍、却只比地球大 35%——意味着它极可能是颗岩石行星，甚至可能拥有厚厚的大气与液态水海洋。',
    craters: [[1200, 600, 280], [-1600, -500, 320]], moons: [],
    pois: [
      { x: -1200, y: 60, z: -800, id: 'lhs-density', name: '岩石巨兽', desc: 'LHS 1140 b 的密度之大，几乎排除了气态外壳的可能——它是一颗货真价实的岩石世界，表面重力约为地球的两倍多。' },
      { x: 2100, y: 50, z: 1300, id: 'lhs-transit', name: '凌星观测', desc: '它恰好从恒星前方经过，让我们能借星光穿过大气的“指纹”分析其成分——是目前最利于寻找生命迹象的系外行星之一。' },
      { x: 0, y: 50, z: 2900, id: 'lhs-water', name: '潜在海洋', desc: '若它拥有足够厚的大气，表面温度或允许液态水存在；有模型甚至推测它可能是一颗被海洋覆盖的世界。' },
    ] },
  belt: { id: 'belt', name: '小行星带', nameEn: 'Asteroid Belt', gravity: 2, gravLabel: '~0.02g',
    sky: 0x05060c, fog: 0x080a12, fogDensity: 0.00016, groundColor: '#8a7a66', groundSpots: 36, hasAtmosphere: false, farColor: 0x8a7a66, dust: true, dustColor: 0x9a8c7a, dustCount: 900, extras: null,
    landTitle: '小行星带 · 一块漂流的巨石', landDesc: '你降落在一块直径数公里的小行星表面。这里位于火星与木星之间，散布着数百万块岩石碎块——它们是一颗未能聚合成行星的“失败行星”残骸。重力微乎其微，轻轻一跳就能飘起数米。',
    craters: [[1300, 700, 340], [-1700, -600, 400], [2400, 1400, 300], [-800, 1900, 260]], moons: [],
    pois: [
      { x: -1300, y: 70, z: -900, id: 'belt-rock', name: '碎石海洋', desc: '小行星带的物质总量加起来，也远小于月球。你脚下这块石头，只是其中微不足道的一粒。' },
      { x: 2200, y: 60, z: 1400, id: 'belt-origin', name: '失败的行星', desc: '主流假说认为，木星的强大引力扰乱了这片区域的物质，使它们始终无法凝聚成一颗真正的行星。' },
      { x: 0, y: 50, z: 2900, id: 'belt-ceres', name: '带中之王 · 谷神星', desc: '小行星带里最大的天体是谷神星——一颗直径约 940 公里的矮行星，已被单独列为可登陆世界。' },
    ] },
};
// 气态 / 冰巨行星：没有固体表面，改为“云顶漂浮”体验
const GASDECK = {
  jupiter: { id: 'jupiter', name: '木星', nameEn: 'Jupiter', cloudDeck: true, base: 0xd8a47f, stormColor: 0xc0492e,
    landTitle: '木星 · 云顶风暴之上', landDesc: '你悬浮在太阳系最大的行星云端。这里没有固体表面——脚下是厚达数千公里、以每秒上百米速度翻涌的氢氦风暴。那颗比地球还大的“大红斑”，是一场刮了数百年的超级飓风。',
    pois: [{ x: 0, y: 0, z: -2600, storm: true, name: '大红斑', desc: '木星大红斑：一个持续至少 350 年的反气旋风暴，直径约 1.6 万公里，足以装下整个地球。它比周围云层高出约 8 公里，呈标志性的砖红色。' }] },
  saturn: { id: 'saturn', name: '土星', nameEn: 'Saturn', cloudDeck: true, base: 0xe3c98b, stormColor: 0xb98a4a,
    landTitle: '土星 · 金色云海', landDesc: '你飘在土星的大气顶层。这颗以壮丽光环闻名的气态巨行星，主要由氢和氦组成，同样没有可供立足的固体地表。这里静谧、金黄，远处行星环在云隙间若隐若现。',
    pois: [{ x: 0, y: 0, z: -2600, name: '土星环投影', desc: '土星环由无数冰与岩石碎块构成，宽达数十万公里却薄如刀刃。在云端仰望，环的阴影会像巨大的弧线扫过天幕。' }] },
  uranus: { id: 'uranus', name: '天王星', nameEn: 'Uranus', cloudDeck: true, base: 0x9fe3e3, stormColor: 0x8fd4d4,
    landTitle: '天王星 · 青色冰雾', landDesc: '你悬浮在天王星云顶。这颗冰巨星几乎“躺着”自转——自转轴倾斜约 98°，像在轨道上滚动前进。大气中的甲烷吸收红光，让它呈现梦幻的青蓝色。',
    pois: [{ x: 0, y: 0, z: -2600, name: '极地之阳', desc: '由于极度倾斜，天王星的一极会连续约 42 年朝向太阳、另一极陷入黑暗——这里的每个季节，都长达地球人近乎一生的世纪。' }] },
  neptune: { id: 'neptune', name: '海王星', nameEn: 'Neptune', cloudDeck: true, base: 0x3b5bdb, stormColor: 0x2740a0,
    landTitle: '海王星 · 深蓝疾风', landDesc: '你飘在海王星云顶。这里有太阳系最猛烈的风——时速可超 2000 公里。这颗深蓝色的冰巨星依靠内部余热，维持着狂暴的大气活动。',
    pois: [{ x: 0, y: 0, z: -2600, name: '大暗斑', desc: '海王星曾观测到类似木星大红斑的“大暗斑”风暴，宽度约地球大小，却在被发现后数年内便消失——这里的天气变幻莫测。' }] },
  hotjupiter: { id: 'hotjupiter', name: '热木星 51 Peg b', nameEn: '51 Peg b', cloudDeck: true, base: 0xd87a3a, stormColor: 0xa83a1a,
    landTitle: '热木星 · 炙烤肉侧', landDesc: '你悬浮在一颗距恒星极近的“热木星”云顶。它被潮汐锁定：永远以炽热的一面朝向恒星，温度可超 1000℃，另一面则永远黑暗。这是人类发现的第一类系外行星。',
    pois: [{ x: 0, y: 0, z: -2600, name: '晨昏线', desc: '热木星明暗交界的晨昏线，是理论上最可能存在奇特金属云（如硅酸盐、铁云）的地方——风在这里把蒸发又凝结的物质来回搬运。' }] },
};
function getLandingConfig(L) {
  if (L.id === 'mars') return PLANETS.mars;
  if (L.id === 'moon') return PLANETS.moon;
  if (GASDECK[L.id]) return GASDECK[L.id];
  return LANDING[L.id] || null;
}

const exp = {
  active: false, phase: 'pad', t: 0, alt: 0, reached: {}, achievements: new Set(),
  group: null, rocket: null, flame: null, flameOn: false, earth: null, marsFar: null,
  debris: [], surface: null, player: { vy: 0, onGround: true }, pois: [], dust: null,
  moons: [], earthSky: null, targetPlanet: null, voiceOn: true,
  surfaceMode: 'walk', cloudLayer: null, cloudSky: null,
  completedMissions: new Set(), _completeShown: false,
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
function makeGroundTexture(baseHex, spots) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `#${base.getHexString()}`; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 2 + Math.random() * 16;
    const s = 0.55 + Math.random() * 0.7;
    const col = base.clone().multiplyScalar(s);
    ctx.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.5)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 22 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(40,22,12,0.5)'); g.addColorStop(1, 'rgba(40,22,12,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t;
}
function craterField(x, z, craters) {
  let d = 0;
  craters = craters || [[900, 400, 280], [-1500, -700, 380], [2200, 1900, 320], [-1000, 2400, 240], [3200, -1500, 300]];
  for (const [cx, cz, r] of craters) {
    const dd = Math.hypot(x - cx, z - cz);
    if (dd < r) d -= (1 - dd / r) * (r * 0.32);
  }
  return d;
}
function makeDust(color, count) {
  const n = count || 1300, g = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9000;
    pos[i * 3 + 1] = Math.random() * 1600;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 9000;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: color || 0xe8c9a0, size: 18, transparent: true, opacity: 0.5, depthWrite: false });
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

/* ---------- 地球专属：高保真地表 ---------- */
function makeEarthGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3f7a35'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 1 + Math.random() * 5;
    const g = 0.7 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(${40 * g | 0},${120 * g | 0},${40 * g | 0},0.5)`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(150,120,80,0.5)'; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.moveTo(0, 512); ctx.quadraticCurveTo(512, 420, 1024, 560); ctx.stroke();
  for (let i = 0; i < 280; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024;
    ctx.fillStyle = ['#ffffff', '#ffd84d', '#ff7ba8', '#ffffff'][i % 4];
    ctx.beginPath(); ctx.arc(x, y, 2 + Math.random() * 2, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); return t;
}
function makeTree(kind) {
  const g = new THREE.Group();
  if (kind === 'pine') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 60, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }));
    trunk.position.y = 30; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(70 - i * 18, 70, 10), new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 1 }));
      cone.position.y = 60 + i * 46; g.add(cone);
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 80, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }));
    trunk.position.y = 40; g.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(70, 0), new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 1, flatShading: true }));
    crown.position.y = 120; g.add(crown);
  }
  return g;
}
function makeEiffel() {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.5 });
  const leg = (x) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(10, 22, 520, 8), mat); l.position.set(x, 260, 0); l.rotation.z = x > 0 ? -0.12 : 0.12; g.add(l); };
  leg(-70); leg(70);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(78, 9, 8, 24, Math.PI), mat); arch.position.y = 180; arch.rotation.z = Math.PI; g.add(arch);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 360, 8), mat); mid.position.y = 540; g.add(mid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 200, 8), mat); top.position.y = 820; g.add(top);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(7, 40, 8), new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0x553300, emissiveIntensity: 0.5 })); tip.position.y = 940; g.add(tip);
  return g;
}
function makePyramids() {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xcdb083, roughness: 1 });
  const p1 = new THREE.Mesh(new THREE.ConeGeometry(360, 300, 4), mat); p1.position.set(0, 150, 0); p1.rotation.y = Math.PI / 4; g.add(p1);
  const p2 = new THREE.Mesh(new THREE.ConeGeometry(240, 210, 4), mat); p2.position.set(520, 105, 180); p2.rotation.y = Math.PI / 4; g.add(p2);
  const p3 = new THREE.Mesh(new THREE.ConeGeometry(200, 170, 4), mat); p3.position.set(-420, 85, -160); p3.rotation.y = Math.PI / 4; g.add(p3);
  return g;
}
function makeGreatWall() {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xb9a98c, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(220, 120, 40), mat);
    seg.position.set(-1400 + i * 220, 60 + Math.sin(i * 0.6) * 40, 0); seg.rotation.y = 0.18; g.add(seg);
    const t = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 46), mat); t.position.set(-1400 + i * 220, 135 + Math.sin(i * 0.6) * 40, 0); t.rotation.y = 0.18; g.add(t);
  }
  return g;
}
function makeStatue() {
  const g = new THREE.Group(); const green = new THREE.MeshStandardMaterial({ color: 0x4fae8e, metalness: 0.3, roughness: 0.6 });
  const ped = new THREE.Mesh(new THREE.BoxGeometry(160, 160, 160), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1 })); ped.position.y = 80; g.add(ped);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(60, 90, 360, 12), green); body.position.y = 340; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(46, 16, 16), green); head.position.y = 560; g.add(head);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 200, 8), green); arm.position.set(0, 520, 70); arm.rotation.x = Math.PI / 2.6; g.add(arm);
  const torch = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffaa00, emissiveIntensity: 1.2 })); torch.position.set(0, 660, 90); g.add(torch);
  return g;
}
function makeCitySkyline() {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.7, metalness: 0.2 });
  for (let i = 0; i < 22; i++) {
    const w = 60 + Math.random() * 70, h = 180 + Math.random() * 620;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 60), mat); b.position.set(-1100 + i * 110, h / 2, -2600 - Math.random() * 200); g.add(b);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.95, 62), new THREE.MeshStandardMaterial({ color: 0x223044, emissive: 0xffe08a, emissiveIntensity: 0.25 }));
    win.position.copy(b.position); g.add(win);
  }
  return g;
}
function makeMountain(h, snow) {
  const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0x6b6357, roughness: 1 });
  const m = new THREE.Mesh(new THREE.ConeGeometry(900, h, 6), mat); m.position.y = h / 2; m.rotation.y = 0.4; g.add(m);
  if (snow) { const cap = new THREE.Mesh(new THREE.ConeGeometry(900 * (1 - h * 0.0016), h * 0.28, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })); cap.position.y = h * 0.86; cap.rotation.y = 0.4; g.add(cap); }
  return g;
}
function buildLandmark(kind) {
  switch (kind) {
    case 'everest': return makeMountain(2600, true);
    case 'canyon': { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(4200, 520, 1400), new THREE.MeshStandardMaterial({ color: 0x9c5a32, roughness: 1 })); m.position.y = -260; g.add(m); return g; }
    case 'forest': { const g = new THREE.Group(); for (let i = 0; i < 120; i++) { const t = makeTree(Math.random() < 0.5 ? 'pine' : 'broad'); const s = 0.7 + Math.random() * 0.8; t.scale.setScalar(s); t.position.set((Math.random() - 0.5) * 1400, 0, (Math.random() - 0.5) * 1400); g.add(t); } return g; }
    case 'eiffel': return makeEiffel();
    case 'pyramids': return makePyramids();
    case 'greatwall': return makeGreatWall();
    case 'statue': return makeStatue();
    default: return null;
  }
}
function buildEarthSurface(group, planet) {
  // 天空穹顶（蓝→白渐变）
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(0x2f6fd0) }, bot: { value: new THREE.Color(0xcfe6ff) } },
    vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying float h; uniform vec3 top; uniform vec3 bot; void main(){ float t = clamp(h*0.5+0.5,0.0,1.0); gl_FragColor = vec4(mix(bot,top,pow(t,0.8)),1.0); }` });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), skyMat));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6); sun.position.set(2600, 2200, -1800); group.add(sun);
  group.add(new THREE.HemisphereLight(0x9fc4ff, 0x4a7a3a, 0.95));
  const cloudSphere = new THREE.Mesh(new THREE.SphereGeometry(14000, 32, 16),
    new THREE.MeshBasicMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0.5, side: THREE.BackSide, depthWrite: false }));
  group.add(cloudSphere); exp.earthSky = cloudSphere;
  // 起伏地面
  const SIZE = 15000, SEG = 240;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position; const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = Math.sin(x * 0.0008) * 30 + Math.cos(z * 0.001) * 26 + Math.sin((x + z) * 0.0005) * 20;
    const lakeD = Math.hypot(x - 1800, z - 2400);
    if (lakeD < 1400) y -= (1 - lakeD / 1400) * 220;
    pos.setY(i, y);
    const h = THREE.MathUtils.clamp((y + 120) / 300, 0, 1);
    const col = new THREE.Color(0xffffff).multiplyScalar(0.8 + h * 0.35);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.computeVertexNormals(); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: makeEarthGroundTexture(), vertexColors: true, roughness: 1, metalness: 0 }));
  group.add(ground);
  // 湖泊 + 沙滩
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.92 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(1800, 6, 2400); group.add(lake);
  const beach = new THREE.Mesh(new THREE.RingGeometry(1400, 1620, 64), new THREE.MeshStandardMaterial({ color: 0xcdb083, roughness: 1 }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(1800, 4, 2400); group.add(beach);
  // 树木（实例化针叶/阔叶近似）
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(48, 220, 7), new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 1 }), 900);
  const dum = new THREE.Object3D(); let placed = 0;
  while (placed < 900) {
    const rx = (Math.random() - 0.5) * 13000, rz = (Math.random() - 0.5) * 13000;
    if (Math.hypot(rx - 1800, rz - 2400) < 1700) continue;
    const s = 0.7 + Math.random() * 1.1; dum.position.set(rx, s * 110, rz); dum.rotation.set(0, Math.random() * 6, 0); dum.scale.set(s, s, s); dum.updateMatrix();
    trees.setMatrixAt(placed++, dum.matrix);
  }
  group.add(trees);
  // 远景文明与山脉
  group.add(makeCitySkyline());
  const mt1 = makeMountain(2200, true); mt1.position.set(-4200, 0, 3600); group.add(mt1);
  const mt2 = makeMountain(1700, true); mt2.position.set(4600, 0, -3800); group.add(mt2);
  const mt3 = makeMountain(1400, false); mt3.position.set(-3600, 0, -4200); group.add(mt3);
  // POI 地标（模型 + 光柱）
  exp.moons = []; exp.dust = null; exp.earthSky = cloudSphere;
  exp.pois = planet.pois.map(p => { const m = buildLandmark(p.model); if (m) { m.position.set(p.x, 0, p.z); group.add(m); } return makePOI(group, p.x, p.y || 0, p.z, p.name, p.desc, p.id); });
}

/* ---------- 气态巨行星：云顶漂浮（无固体表面） ---------- */
function makeGasCloudTexture(baseHex) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const ctx = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  for (let y = 0; y < 512; y++) {
    const lat = y / 512; const turb = 0.5 + 0.5 * Math.sin(lat * 40 + Math.sin(y * 0.05) * 6);
    const sh = 0.75 + 0.25 * turb + 0.06 * Math.sin(lat * 120);
    const col = base.clone().multiplyScalar(Math.max(0.4, sh));
    ctx.fillStyle = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`; ctx.fillRect(0, y, 1024, 1);
  }
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, r = 10 + Math.random() * 42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function buildCloudDeck(group, cfg) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(16000, 32, 16), new THREE.MeshBasicMaterial({ color: cfg.base, side: THREE.BackSide }));
  group.add(sky); exp.cloudSky = sky;
  const layer = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24),
    new THREE.MeshBasicMaterial({ map: makeGasCloudTexture(cfg.base), transparent: true, opacity: 0.92, side: THREE.BackSide, depthWrite: false }));
  group.add(layer); exp.cloudLayer = layer;
  group.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(0, 3000, -6000); group.add(sun);
  exp.moons = []; exp.dust = null; exp.earthSky = null;
  exp.pois = cfg.pois.map(p => {
    if (p.storm) {
      const eye = new THREE.Mesh(new THREE.CircleGeometry(1500, 48), new THREE.MeshBasicMaterial({ color: cfg.stormColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      eye.position.set(p.x, 0, p.z); eye.lookAt(0, 0, 0); group.add(eye);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1500, 1720, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.position.copy(eye.position); ring.lookAt(0, 0, 0); group.add(ring);
    }
    return makePOI(group, p.x, p.y || 0, p.z, p.name, p.desc, p.id);
  });
}
function updateCloudDeck(dt) {
  camera.getWorldDirection(tmp.fwd);
  const fwd = new THREE.Vector3(tmp.fwd.x, 0, tmp.fwd.z).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys['KeyW']) move.add(fwd); if (keys['KeyS']) move.sub(fwd);
  if (keys['KeyD']) move.add(right); if (keys['KeyA']) move.sub(right);
  const speed = 320;
  if (move.lengthSq() > 0) { move.normalize().multiplyScalar(speed * dt); camera.position.x += move.x; camera.position.z += move.z; }
  if (keys['Space']) camera.position.y += 220 * dt;
  camera.position.y += Math.sin(exp.t * 0.6) * 8 * dt;
  const R = 7000; const d = Math.hypot(camera.position.x, camera.position.z);
  if (d > R) { camera.position.x *= R / d; camera.position.z *= R / d; }
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 40, 1200);
  if (exp.cloudLayer) exp.cloudLayer.rotation.y += dt * 0.03;
  for (const p of exp.pois) {
    const dd = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    if (dd < 900 && !p.done) { p.done = true; unlockAch(p.id, p.name); expMilestone(p.name, p.desc); }
    if (p.beam) { p.beam.material.opacity = p.done ? 0.14 : 0.55; p.beam.scale.y = 1 + 0.1 * Math.sin(exp.t * 3 + p.x); }
  }
  const left = exp.pois.filter(p => !p.done).length;
  expObj.textContent = left > 0 ? `在云海中漂浮 · 飞向发光风暴眼解锁地标（剩余 ${left} 处）· 按 P 拍照 · 按 R 返航` : `✦ 你已穿越${exp.surfacePlanet.name}云海！按 R 返航`;
  if (left === 0 && !exp._completeShown) { exp._completeShown = true; setTimeout(showJourneyEnd, 1400); }
}

// ---------- 金星：地狱平原（厚硫酸云 + 玄武岩 + 熔岩裂纹 + 苏联着陆器） ----------
function makeVenusSky() {
  // 程序化硫酸云穹顶（厚、分层）
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0,    '#3a1c0a');   // 顶部：几乎血红
  g.addColorStop(0.25, '#7a3a18');
  g.addColorStop(0.55, '#b07028');   // 中部：橘红硫酸云
  g.addColorStop(0.85, '#d2923a');
  g.addColorStop(1,    '#7a5230');   // 地平线附近：褐色雾
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  // 横向硫酸云带
  for (let i = 0; i < 12; i++) {
    const y = 80 + i * 30 + Math.random() * 18;
    const w = 600 + Math.random() * 380;
    const x0 = Math.random() * 1024 - 200;
    x.fillStyle = `rgba(${180 + Math.random() * 50 | 0},${90 + Math.random() * 40 | 0},${30 + Math.random() * 30 | 0},${0.18 + Math.random() * 0.25})`;
    x.beginPath(); x.ellipse(x0 + w / 2, y, w / 2, 14 + Math.random() * 22, 0, 0, Math.PI * 2); x.fill();
  }
  // 极厚的霾层（地平线灰黄）
  for (let i = 0; i < 60; i++) {
    const y = 380 + Math.random() * 120;
    x.fillStyle = `rgba(120,90,60,${0.18 + Math.random() * 0.2})`;
    x.beginPath(); x.ellipse(Math.random() * 1024, y, 200 + Math.random() * 400, 20 + Math.random() * 30, 0, 0, Math.PI * 2); x.fill();
  }
  // 太阳朦胧（被云层滤成橙黄）
  const grd = x.createRadialGradient(820, 200, 4, 820, 200, 120);
  grd.addColorStop(0, 'rgba(255, 230, 160, 0.95)');
  grd.addColorStop(0.4, 'rgba(255, 200, 120, 0.4)');
  grd.addColorStop(1, 'rgba(255, 160, 80, 0)');
  x.fillStyle = grd;
  x.beginPath(); x.arc(820, 200, 120, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeVenusGround() {
  // 玄武岩熔岩流：暗红裂纹网络 + 灰黑基岩
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#1a1108'; x.fillRect(0, 0, 1024, 1024);
  // 基岩斑驳
  for (let i = 0; i < 800; i++) {
    const px = Math.random() * 1024, py = Math.random() * 1024;
    const r = 4 + Math.random() * 22;
    const v = 30 + Math.random() * 50;
    x.fillStyle = `rgba(${v | 0},${(v * 0.7) | 0},${(v * 0.55) | 0},${0.45 + Math.random() * 0.4})`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  // 熔岩裂纹：暗红+亮橙细线网络
  for (let i = 0; i < 240; i++) {
    const sx = Math.random() * 1024, sy = Math.random() * 1024;
    let px = sx, py = sy; const segs = 6 + (Math.random() * 14) | 0;
    const hot = Math.random() < 0.3;
    x.strokeStyle = hot ? `rgba(255,${140 + Math.random() * 80 | 0},30,${0.7 + Math.random() * 0.3})` : `rgba(220,${60 + Math.random() * 30 | 0},20,${0.4 + Math.random() * 0.3})`;
    x.lineWidth = hot ? 1.5 + Math.random() * 2 : 0.6 + Math.random() * 1.2;
    x.beginPath(); x.moveTo(px, py);
    for (let j = 0; j < segs; j++) {
      px += (Math.random() - 0.5) * 90; py += (Math.random() - 0.5) * 90;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // 火山渣 / 碎块
  for (let i = 0; i < 500; i++) {
    const px = Math.random() * 1024, py = Math.random() * 1024;
    const r = 1.5 + Math.random() * 6;
    x.fillStyle = `rgba(${20 + Math.random() * 30 | 0},${10 + Math.random() * 20 | 0},${5 + Math.random() * 12 | 0},1)`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  // 硫黄沉积（亮黄斑）
  for (let i = 0; i < 80; i++) {
    const px = Math.random() * 1024, py = Math.random() * 1024;
    const r = 8 + Math.random() * 28;
    const grd = x.createRadialGradient(px, py, 1, px, py, r);
    grd.addColorStop(0, 'rgba(255, 220, 100, 0.7)');
    grd.addColorStop(0.5, 'rgba(220, 180, 80, 0.35)');
    grd.addColorStop(1, 'rgba(120, 100, 40, 0)');
    x.fillStyle = grd; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}
function buildVenusLander(group, x, z) {
  // 苏联"金星9号"风格的探测器：八边形主体 + 抛物面天线 + 三条腿
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(80, 100, 90, 8),
    new THREE.MeshStandardMaterial({ color: 0xc4a050, metalness: 0.7, roughness: 0.4 }));
  body.position.y = 95; g.add(body);
  // 顶部抛物面天线
  const dish = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6),
    new THREE.MeshStandardMaterial({ color: 0xeae0c0, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
  dish.position.y = 145; dish.rotation.x = Math.PI; g.add(dish);
  // 三条着陆腿
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(8, 140, 8),
      new THREE.MeshStandardMaterial({ color: 0xa89040, metalness: 0.6, roughness: 0.5 }));
    leg.position.set(Math.cos(a) * 75, 50, Math.sin(a) * 75);
    leg.rotation.z = Math.cos(a) * 0.25;
    leg.rotation.x = -Math.sin(a) * 0.25;
    g.add(leg);
    // 脚垫
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(20, 24, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }));
    pad.position.set(Math.cos(a) * 130, 3, Math.sin(a) * 130);
    g.add(pad);
  }
  // 太阳能板（小）
  const panel = new THREE.Mesh(new THREE.BoxGeometry(140, 4, 60),
    new THREE.MeshStandardMaterial({ color: 0x2a3a5a, metalness: 0.4, roughness: 0.6 }));
  panel.position.set(110, 130, 0); g.add(panel);
  g.position.set(x, 0, z);
  group.add(g);
}
function buildVenusSurface(group, planet) {
  // 1) 厚硫酸云穹顶（替换通用天）
  const skyTex = makeVenusSky();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  group.add(sky);
  exp.cloudSky = sky;
  // 2) 橙色雾霭里的太阳（被云滤成橙黄）
  const sun = new THREE.DirectionalLight(0xffb060, 1.4); sun.position.set(-3000, 1400, -4000); group.add(sun);
  group.add(new THREE.AmbientLight(0x6a3a18, 0.85));  // 红褐环境光
  // 一束顶光模拟穿过厚云的光柱
  const topLight = new THREE.DirectionalLight(0xffd28a, 0.5); topLight.position.set(800, 2400, 1200); group.add(topLight);
  // 3) 玄武岩熔岩地表
  const SIZE = 13000, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color('#2a1d12');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // 暗色平原 + 缓慢起伏 + 少量火山口凹陷
    let y = Math.sin(x * 0.0007) * 36 + Math.cos(z * 0.0009) * 32 + Math.sin((x + z) * 0.0005) * 24;
    y += craterField(x, z, planet.craters);
    // 几座明显火山高地
    for (const v of [[-2000, 1500], [3000, -2200], [-3500, -3000], [1200, 3500]]) {
      const d = Math.hypot(x - v[0], z - v[1]);
      if (d < 1800) y += (1 - d / 1800) * 220;
    }
    pos.setY(i, y);
    const h = THREE.MathUtils.clamp((y + 100) / 300, 0, 1);
    // 高度越高越红（高地岩石），低处偏暗
    const col = new THREE.Color().setHSL(0.06 + h * 0.04, 0.55, 0.08 + h * 0.18);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: makeVenusGround(), vertexColors: true, roughness: 0.95, metalness: 0 }));
  group.add(ground);
  // 4) 暗色玄武岩碎石（更高密度、层叠）
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1 });
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, 2200);
  const dum = new THREE.Object3D();
  for (let i = 0; i < 2200; i++) {
    const rx = (Math.random() - 0.5) * 12000, rz = (Math.random() - 0.5) * 12000;
    const s = 6 + Math.random() * 50;
    dum.position.set(rx, s * 0.4, rz);
    dum.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dum.scale.set(s, s * 0.7, s); dum.updateMatrix();
    rocks.setMatrixAt(i, dum.matrix);
  }
  group.add(rocks);
  // 5) 远处火山剪影（4 座），让地平线有起伏
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    const r = 8500;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(700 + Math.random() * 400, 1400 + Math.random() * 700, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 1 })
    );
    m.position.set(Math.cos(ang) * r, 600, Math.sin(ang) * r);
    group.add(m);
  }
  // 6) 苏联着陆器（"金星9号"风格）放在最近地标处
  buildVenusLander(group, -1800, -1200);
  // 7) 厚云雾层（贴近地面再铺一层黄褐半透明）
  const fogLayer = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000),
    new THREE.MeshBasicMaterial({ color: 0xc88a3a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  fogLayer.rotation.x = -Math.PI / 2; fogLayer.position.y = 120;
  group.add(fogLayer);
  exp.dust = { layer: fogLayer, t: 0 };
  // 8) 地标
  exp.pois = planet.pois.map(p => makePOI(group, p.x, p.y, p.z, p.name, p.desc, p.id));
}

function buildPlanetSurface(group, planet) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16),
    new THREE.MeshBasicMaterial({ color: planet.sky, side: THREE.BackSide }));
  group.add(sky);
  const sun = new THREE.DirectionalLight(0xffe9c8, 2.1); sun.position.set(-3000, 1400, -4000); group.add(sun);
  group.add(new THREE.AmbientLight(0x6b5640, 0.75));
  const SIZE = 13000, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(planet.groundColor);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = Math.sin(x * 0.0009) * 42 + Math.cos(z * 0.0011) * 38 + Math.sin((x + z) * 0.0006) * 30;
    y += craterField(x, z, planet.craters);
    pos.setY(i, y);
    const h = THREE.MathUtils.clamp((y + 130) / 320, 0, 1);
    const col = base.clone().multiplyScalar(0.68 + h * 0.5);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: makeGroundTexture(planet.groundColor, planet.groundSpots), vertexColors: true, roughness: 1, metalness: 0 }));
  group.add(ground);
  // 近景碎石（提升照片级细节）
  const rockMat = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.82).getHex(), roughness: 1 });
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, 1600);
  const dum = new THREE.Object3D();
  for (let i = 0; i < 1600; i++) {
    const rx = (Math.random() - 0.5) * 11000, rz = (Math.random() - 0.5) * 11000;
    const s = 8 + Math.random() * 44;
    dum.position.set(rx, s * 0.4, rz);
    dum.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    dum.scale.set(s, s * 0.7, s); dum.updateMatrix();
    rocks.setMatrixAt(i, dum.matrix);
  }
  group.add(rocks);
  // 星球专属地貌
  if (planet.extras === 'mars') {
    const olympus = new THREE.Mesh(new THREE.ConeGeometry(2600, 2100, 64),
      new THREE.MeshStandardMaterial({ color: 0xb5532e, roughness: 1 }));
    olympus.position.set(-7200, 1050, -8200); group.add(olympus);
    const canyon = new THREE.Mesh(new THREE.BoxGeometry(9200, 620, 1500),
      new THREE.MeshStandardMaterial({ color: 0x5e2f1c, roughness: 1 }));
    canyon.position.set(6100, -300, 2050); canyon.rotation.y = 0.42; group.add(canyon);
  } else if (planet.extras === 'moon') {
    const earthSky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 48),
      new THREE.MeshStandardMaterial({ map: makeEarthTexture(), emissive: 0x223355, emissiveIntensity: 0.4, roughness: 0.9 }));
    earthSky.position.set(5200, 5200, -7000); group.add(earthSky); exp.earthSky = earthSky;
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 180, 8),
      new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    flagPole.position.set(120, 90, 120); group.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(54, 34),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide }));
    flag.position.set(147, 163, 120); group.add(flag);
  }
  // 卫星
  exp.moons = [];
  for (const mo of (planet.moons || [])) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(mo.r, 16, 16),
      new THREE.MeshStandardMaterial({ color: mo.color, roughness: 1 }));
    group.add(m); exp.moons.push({ mesh: m, orbitR: mo.orbitR, h: mo.h, spd: mo.spd, ang: Math.random() * 6 });
  }
  if (planet.dust) { const dust = makeDust(planet.dustColor, planet.dustCount); group.add(dust); exp.dust = dust; }
  addRover(group, 0, 0);
  exp.pois = planet.pois.map(p => makePOI(group, p.x, p.y, p.z, p.name, p.desc, p.id));
}
function makeFarPlanet(planet) {
  return new THREE.Mesh(new THREE.SphereGeometry(320, 48, 48),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(planet.farColor, { spots: 80 }), roughness: 1 }));
}

/* ---------- 流程控制 ---------- */
function startExpedition(missionId) {
  if (mode === 'expedition') return;
  const mission = EXPEDITIONS[missionId] || EXPEDITIONS.ark;
  exp.mission = mission;
  exp.targetPlanet = PLANETS[mission.planet] || PLANETS.mars;
  mode = 'expedition';
  exp.active = true; exp.phase = 'countdown'; exp.t = 0; exp.alt = 0; exp.reached = {}; exp.achievements.clear(); exp.debris = [];
  exp.moons = []; exp.earthSky = null; exp.dust = null;
  setRoamVisibility(false);
  showExpeditionUI(true);
  sunLight.intensity = 0;
  document.getElementById('blocker').style.display = 'none';
  const dest = document.getElementById('exp-dest'); if (dest) dest.style.display = 'none';
  const panel = document.getElementById('photo-panel'); if (panel) panel.style.display = 'none';
  const gravEl = document.getElementById('exp-grav'); if (gravEl) gravEl.textContent = exp.targetPlanet.name + ' ' + exp.targetPlanet.gravLabel;
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
  try { controls.lock(); } catch (e) { console.warn('pointer lock failed, continue', e); }
  // 任务线专属简报（用 mission.intro 替换通用 brief）
  document.getElementById('eb-title').textContent = `${mission.icon} ${mission.name} · 任务简报`;
  document.getElementById('eb-body').innerHTML = mission.intro;
  expMilestone(`${mission.name} · 任务简报`, `${mission.tag}。你站在发射台上，前方就是这次任务的全部故事。按 M 随时调出简报，按 P 可拍照寄回地球。`);
  // 任务线专属成就：选了一支任务线
  unlockAch('mission_' + mission.id, '任务线 · ' + mission.name);
  try {
    Sound.rocketRoar();    // 点火：引擎轰鸣贯穿整个升空阶段
    runExpCountdown();
  } catch (e) {
    console.error('expedition start failed', e);
    const d = document.createElement('div'); d.className = 'exp-toast';
    d.textContent = '⚠ 启动异常，请重新选择任务线'; expToasts.appendChild(d);
    setTimeout(() => d.remove(), 3200);
    // 把任务卡重新弹回，让用户可重试
    const dest = document.getElementById('exp-dest'); if (dest) dest.style.display = 'flex';
    document.getElementById('blocker').style.display = 'none';
  }
}
function runExpCountdown() {
  const launchEl = document.getElementById('launch');
  const launchNum = document.getElementById('launch-num');
  const launchSub = document.getElementById('launch-sub');
  launchEl.style.display = 'flex';
  const seq = ['T-3', 'T-2', 'T-1', '🔥 点火'];
  const voice = ['倒计时 三', '二', '一', '点火'];
  let i = 0;
  const step = () => {
    launchNum.textContent = seq[i];
    launchNum.classList.remove('pop'); void launchNum.offsetWidth; launchNum.classList.add('pop');
    launchSub.textContent = i < 3 ? `${exp.targetPlanet.name}远征 · 系统自检` : '星舰点火 · 出发！';
    if (exp.voiceOn) speak(voice[i]);
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
    // 任务线专属剧情触发（替代默认描述）
    if (exp.mission && exp.mission.story) {
      for (const s of exp.mission.story) {
        if (s.at === km && !exp.reached['m_' + km]) {
          exp.reached['m_' + km] = true;
          setTimeout(() => expMilestone(s.title, s.desc), 1200);
        }
      }
    }
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
  if (k >= 1) { exp.phase = 'orbit'; exp.t = 0; igniteFlame(false); Sound.rocketRoarStop(); unlockAch('orbit', '成功入轨'); showSub('发动机关机，进入惯性滑行……'); }
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
  if (!exp.marsFar) { exp.marsFar = makeFarPlanet(exp.targetPlanet); exp.group.add(exp.marsFar); }
  exp.marsFar.position.set(0, 220, 700 + (1 - k) * 5200);
  exp.marsFar.scale.setScalar(0.18 + k * 1.05);
  camera.position.lerp(new THREE.Vector3(0, 260, 160), 0.02);
  camera.lookAt(0, 220, 2200);
  keepDebris(dt);
  if (k >= 1) {
    exp.phase = 'edl'; exp.t = 0;
    const atmo = exp.targetPlanet.hasAtmosphere
      ? '以每秒数公里的速度冲进虽稀薄却足以烧红防热罩的大气'
      : '这里几乎没有大气、没有气动减速，只能靠反推引擎精准悬停、缓缓落向月面';
    const tone = exp.targetPlanet.id === 'mars' ? '锈红色' : '银灰';
    expMilestone(`接近${exp.targetPlanet.name}`, `前方那颗${tone}的星球越来越大。接下来是最惊险的一段：${atmo}。`);
  }
}
function updateEDL(dt) {
  const dur = 11; const k = Math.min(1, exp.t / dur);
  const startY = 4200, endY = 170;
  camera.position.set(0, startY * (1 - k) + endY * k, 1500 - k * 1300);
  camera.lookAt(0, 70, 0);
  if (k >= 1) enterSurface();
}
function enterSurface() {
  exp.phase = 'surface'; exp.t = 0; exp._completeShown = false;
  const pl = exp.targetPlanet; exp.surfacePlanet = pl;
  unlockAch('land', `成功登陆${pl.name}`);
  const landDesc = pl.id === 'mars'
    ? '反推引擎熄火，着陆腿稳稳触地。你站在了距地球数千万公里的红色星球上。这里的重力只有地球的 0.38——轻轻一跳，就能跃起近一米高。'
    : '引擎稳稳悬停，着陆支架轻触月壤。这里没有大气、没有风，天空永远漆黑。重力只有地球的 1/6，你可以像袋鼠一样蹦跳着前进。';
  expMilestone(`着陆 · ${pl.id === 'mars' ? '乌托邦平原' : '静海基地'}`, landDesc);
  // 任务线专属结语
  if (exp.mission && exp.mission.conclusion) {
    setTimeout(() => expMilestone('✦ 任务完成', exp.mission.conclusion), 4200);
  }
  if (exp.group) scene.remove(exp.group);
  exp.group = new THREE.Group(); scene.add(exp.group);
  exp.moons = []; exp.earthSky = null; exp.dust = null;
  if (pl.earth) buildEarthSurface(exp.group, pl);
  else if (pl.cloudDeck) buildCloudDeck(exp.group, pl);
  else if (pl.venus) buildVenusSurface(exp.group, pl);
  else buildPlanetSurface(exp.group, pl);
  scene.background = new THREE.Color(pl.sky);
  scene.fog = new THREE.FogExp2(pl.fog, pl.fogDensity);
  camera.position.set(0, 18, 0);
  camera.lookAt(0, 32, -220);
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
  showZeroG(false);
  document.body.classList.add('shake-land');
  Sound.setEnvironment(pl.id === 'mars' ? 'mars' : 'airless');
  Sound.setWarp(0);
  if (pl.id === 'mars') Sound.entryHiss();
  setTimeout(() => Sound.land(pl.id !== 'mars'), 700);
  setTimeout(() => document.body.classList.remove('shake-land'), 720);
  const left = exp.pois.length;
  expObj.textContent = `走向发光光柱，解锁${pl.name}地标（剩余 ${left} 处）· 按 P 拍明信片`;
}
function updateSurface(dt) {
  const g = exp.surfacePlanet.gravity;
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
  if (keys['Space'] && exp.player.onGround) { exp.player.vy = 23; exp.player.onGround = false; Sound.jump(); }
  exp.player.vy -= g * dt;
  camera.position.y += exp.player.vy * dt;
  if (camera.position.y <= 18) { camera.position.y = 18; exp.player.vy = 0; exp.player.onGround = true; }
  // 走路脚步声（着地且移动时，节流触发）
  if (exp.player.onGround && move.lengthSq() > 0) {
    exp._stepT = (exp._stepT || 0) + dt;
    if (exp._stepT > 0.34) { exp._stepT = 0; Sound.footstep(); }
  }
  const R = 5800; const d = Math.hypot(camera.position.x, camera.position.z);
  if (d > R) { camera.position.x *= R / d; camera.position.z *= R / d; }
  if (exp.dust) {
    // 兼容两种形态：Mesh（earth/venus 雾层）/ Object3D（火星尘）
    if (exp.dust.layer) exp.dust.layer.rotation.z += dt * 0.02;   // Venus 雾层缓慢自转
    else if (exp.dust.rotation) exp.dust.rotation.y += dt * 0.01;
  }
  for (const m of exp.moons) { m.ang += m.spd * dt; m.mesh.position.set(Math.cos(m.ang) * m.orbitR, m.h, Math.sin(m.ang) * m.orbitR); }
  if (exp.earthSky) exp.earthSky.rotation.y += dt * 0.05;
  for (const p of exp.pois) {
    const dd = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    if (dd < 720 && !p.done) { p.done = true; unlockAch(p.id, p.name); expMilestone(p.name, p.desc); Sound.poi(); }
    if (p.beam) { p.beam.material.opacity = p.done ? 0.14 : 0.55; p.beam.scale.y = 1 + 0.1 * Math.sin(exp.t * 3 + p.x); }
  }
  const left = exp.pois.filter(p => !p.done).length;
  expObj.textContent = left > 0 ? `走向发光光柱，解锁${exp.surfacePlanet.name}地标（剩余 ${left} 处）· 按 P 拍明信片` : `✦ 全部地标已解锁！你已完成${exp.surfacePlanet.name}巡视 🚀`;
  if (left === 0 && !exp._completeShown) { exp._completeShown = true; setTimeout(showJourneyEnd, 1400); }
}

/* ---------- 漫游模式：直接登陆行星表面探索 ---------- */
function showRoamSurfaceUI(on) {
  document.getElementById('hud').style.display = on ? 'none' : '';
  document.getElementById('minimap-wrap').style.display = on ? 'none' : '';
  document.getElementById('edge-markers').style.display = on ? 'none' : '';
  document.getElementById('help').style.display = 'none';
  expHud.style.display = on ? 'block' : 'none';
  document.getElementById('exp-phase').style.display = on ? 'none' : '';
  document.getElementById('exp-alt-box').style.display = on ? 'none' : '';
  expSub.style.display = on ? 'none' : '';
}
const ROAM_HELP = 'WASD 行走 · 空格 跳跃 · 走向发光光柱解锁地标 · P 拍照寄回地球 · L 相册 · R 返航回到太空';
function beginRoamLanding(L) {
  const cfg = getLandingConfig(L);
  if (!cfg) return;
  exp.surfacePlanet = cfg;
  exp.surfaceMode = cfg.cloudDeck ? 'cloud' : 'walk';
  exp.phase = 'surface'; exp.t = 0; exp.pois = []; exp._completeShown = false; exp.mission = null;
  exp.player = { vy: 0, onGround: true };
  roamExitPos.copy(camera.position);
  landTarget = null;
  roamSurfaceActive = true;
  setRoamVisibility(false);
  if (exp.group) scene.remove(exp.group);
  exp.group = new THREE.Group(); scene.add(exp.group);
  exp.moons = []; exp.earthSky = null; exp.dust = null; exp.cloudLayer = null; exp.cloudSky = null;
  if (cfg.earth) buildEarthSurface(exp.group, cfg);
  else if (cfg.cloudDeck) buildCloudDeck(exp.group, cfg);
  else if (cfg.venus) buildVenusSurface(exp.group, cfg);
  else buildPlanetSurface(exp.group, cfg);
  scene.background = new THREE.Color(cfg.sky || 0x0a0a14);
  scene.fog = new THREE.FogExp2(cfg.fog || 0xbfcad6, cfg.fogDensity || 0.00004);
  camera.position.set(0, 18, 0);
  camera.lookAt(0, 32, -220);
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
  showRoamSurfaceUI(true);
  expHelp.textContent = cfg.cloudDeck ? 'WASD 漂浮 · 空格 上升 · 飞向发光风暴眼解锁地标 · P 拍照 · R 返航' : ROAM_HELP;
  hazardEl.style.opacity = '0'; hazardWarn.style.display = 'none';
  // 环境与着陆音效
  const envName = cfg.earth ? 'earth' : cfg.cloudDeck ? 'gas' : (cfg.id === 'mars' ? 'mars' : 'airless');
  Sound.setEnvironment(envName);
  Sound.setWarp(0);
  if (cfg.cloudDeck) {
    Sound.entryHiss();
  } else if (envName !== 'airless') {
    Sound.entryHiss();
    setTimeout(() => Sound.land(false), 700);
  } else {
    setTimeout(() => Sound.land(true), 700);
  }
  document.body.classList.add('shake-land');
  setTimeout(() => document.body.classList.remove('shake-land'), 720);
  expMilestone(`着陆 · ${cfg.landTitle || cfg.name}`, cfg.landDesc || `你降落在了${cfg.name}表面。`);
  if (!cfg.cloudDeck) { const left = exp.pois.length; expObj.textContent = `走向发光光柱，解锁${cfg.name}地标（剩余 ${left} 处）· 按 P 拍明信片 · 按 R 返航`; }
}
function exitRoamSurface() {
  roamSurfaceActive = false;
  if (exp.group) { scene.remove(exp.group); exp.group = null; }
  exp.moons = []; exp.earthSky = null; exp.dust = null; exp.cloudLayer = null; exp.cloudSky = null; exp.pois = []; exp.surfaceMode = 'walk';
  setRoamVisibility(true);
  scene.background = new THREE.Color(0x000006);
  scene.fog = new THREE.FogExp2(0x000006, 0.0000008);
  Sound.setEnvironment('space');
  Sound.setWarp(0);
  sunLight.intensity = 4.5;
  camera.position.copy(roamExitPos);
  camera.lookAt(roamExitPos.x, roamExitPos.y, roamExitPos.z - 100);
  velocity.set(0, 0, 0);
  showRoamSurfaceUI(false);
  expHelp.innerHTML = DEFAULT_EXP_HELP;
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
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
  Sound.achievement();
  // 首次登陆某星 / 全部地标解锁：奏响恢弘主题
  if (id === 'land') Sound.cueEpic();
  if (id !== 'land' && exp.pois.length && exp.pois.every(p => p.done)) Sound.cueEpic();
}
function phaseLabel(p) {
  const tp = exp.targetPlanet;
  const name = tp ? tp.name : '火星';
  const airless = tp ? !tp.hasAtmosphere : false;
  return {
    pad: '发射台', countdown: '倒计时', ascent: '升空',
    orbit: '近地轨道 · 失重',
    transit: `星际巡航 · 飞向${name}`,
    edl: airless ? `接近${name} · 悬停着陆` : `进入${name}大气`,
    surface: airless ? `${name}表面探索` : `${name}地表探索`,
  }[p] || '';
}
function updateExpeditionHUD() {
  expPhaseEl.textContent = phaseLabel(exp.phase);
  if (exp.phase === 'ascent' || exp.phase === 'orbit') {
    expAltNum.textContent = Math.round(exp.alt);
    expAltFill.style.height = Math.min(100, exp.alt / 400 * 100) + '%';
  } else { expAltNum.textContent = '—'; expAltFill.style.height = '0%'; }
  // 远征太空飞行段（升空/入轨/巡航）保留引擎嗡鸣；地表/再入段静默
  Sound.setWarp(['ascent', 'orbit', 'transit'].includes(exp.phase) ? 0.55 : 0);
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
  Sound.rocketRoarStop();     // 兜底：若在升空阶段返航，停掉引擎轰鸣
  if (exp.group) { scene.remove(exp.group); exp.group = null; }
  setRoamVisibility(true);
  scene.background = new THREE.Color(0x000006);
  scene.fog = new THREE.FogExp2(0x000006, 0.0000008);
  sunLight.intensity = 4.5;
  if (controls.isLocked) controls.unlock();
  showExpeditionUI(false);
  expBrief.style.display = 'none';
  camera.position.set(3450, 220, 520);
  camera.lookAt(0, 0, 0);
  velocity.set(0, 0, 0); flyTo = null; currentZone = ZONES[0];
  fovTarget = 72; camera.fov = 72; camera.updateProjectionMatrix();
  gameState = 'intro';
  document.getElementById('blocker').style.display = 'flex';
  Sound.setEnvironment('space');
  Sound.setWarp(0);
  const jeEl = document.getElementById('journey-end'); if (jeEl) jeEl.style.display = 'none';
}

/* ---------- 旅程完成 / 结算（远征与地表探索的收尾闭环） ---------- */
function journeyStatsHTML() {
  const total = exp.pois.length || 1;
  const done = exp.pois.filter(p => p.done).length;
  let photos = 0;
  try { photos = (JSON.parse(localStorage.getItem('cv_photos') || '[]')).length; } catch (e) {}
  return `
    <div class="mr-stat"><span>${done}<small>/${total}</small></span><label>地标解锁</label></div>
    <div class="mr-stat"><span>${exp.achievements.size}</span><label>本程成就</label></div>
    <div class="mr-stat"><span>${photos}</span><label>寄回明信片</label></div>`;
}
function hideJourneyEnd() {
  const je = document.getElementById('journey-end'); if (je) je.style.display = 'none';
}
function showJourneyEnd() {
  const je = document.getElementById('journey-end');
  if (!je || je.style.display === 'flex') return;
  if (exp.mission) exp.completedMissions.add(exp.mission.id);
  const allDone = exp.completedMissions.size >= 3;
  const planetName = exp.surfacePlanet ? exp.surfacePlanet.name : (exp.mission ? EXPEDITIONS[exp.mission.id].name : '');
  document.getElementById('je-badge').textContent = exp.mission ? `🚀 ${exp.mission.name} · 任务完成` : `🛰 ${planetName} 地表探索完成`;
  document.getElementById('je-title').textContent = allDone ? '🏆 传奇远征 · 全部通关' : '旅程完成';
  document.getElementById('je-sub').innerHTML = exp.mission
    ? (exp.mission.conclusion || '你完成了这次远征。')
    : `你走遍了${planetName}的每一处发光地标，把星辰大海寄回了地球。`;
  document.getElementById('je-stats').innerHTML = journeyStatsHTML();
  const extra = document.getElementById('je-extra');
  const credits = document.getElementById('je-credits');
  if (allDone) {
    credits.style.display = '';
    credits.innerHTML = `
      <div class="je-credit-line">火星方舟 · 殖民启航</div>
      <div class="je-credit-line">深海回响 · 生命追问</div>
      <div class="je-credit-line">曙光计划 · 月球跳板</div>
      <div class="je-credit-line">三条任务线 · 全部达成</div>
      <div class="je-credit-line je-credit-thanks">感谢你，深空宇航员。</div>
      <div class="je-credit-line">COSMIC VOYAGE · 奇妙太空旅程</div>
      <div class="je-credit-line">🌌 wonderfulclaire.github.io/cosmic-voyage</div>`;
    extra.innerHTML = `<div class="je-grand">你已成为人类深空远征的传奇宇航员——三条任务线悉数达成。</div>`;
    Sound.cueEpic();
  } else {
    credits.style.display = 'none';
    const remain = 3 - exp.completedMissions.size;
    extra.innerHTML = remain > 0 ? `<div class="je-next">还有 ${remain} 条任务线等待出发 · 回到起点即可选择新的故事</div>` : '';
    Sound.achievement();
  }
  je.style.display = 'flex';
  if (controls.isLocked) { try { controls.unlock(); } catch (e) {} }
}
document.getElementById('je-explore').addEventListener('click', () => {
  hideJourneyEnd();
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
});
document.getElementById('je-return').addEventListener('click', () => {
  hideJourneyEnd();
  // 漫游地表通关后 mode 仍是 'roam'，endExpedition 会因 mode 校验直接 return，
  // 必须按当前所在模式分别回到太空
  if (roamSurfaceActive) exitRoamSurface();
  else endExpedition();
});

document.getElementById('btn-expedition').addEventListener('click', () => {
  try { Sound.resume(); Sound.armMusic(); } catch (e) {}
  const dest = document.getElementById('exp-dest');
  if (dest) dest.style.display = 'flex';
  document.getElementById('blocker').style.display = 'none'; // 收起开场遮罩，避免遮挡任务卡
  if (helpAutoTimer) clearTimeout(helpAutoTimer);
  helpPanel.style.display = 'none';
});
document.querySelectorAll('.ed-mission').forEach(b => b.addEventListener('click', () => startExpedition(b.dataset.mission)));
document.getElementById('btn-ed-close').addEventListener('click', () => {
  const dest = document.getElementById('exp-dest'); if (dest) dest.style.display = 'none';
});
document.getElementById('btn-ph-close').addEventListener('click', () => {
  photoPanel.style.display = 'none';
  if (mode === 'expedition' && !controls.isLocked) controls.lock();
});
document.getElementById('btn-eb-close').addEventListener('click', toggleExpBrief);
// 远征中若误按 ESC 解锁指针，点击画面即可重新锁定
renderer.domElement.addEventListener('click', () => {
  Sound.resume();
  if (!controls.isLocked && expBrief.style.display !== 'flex' && photoPanel.style.display !== 'flex' && (mode === 'expedition' || roamSurfaceActive)) controls.lock();
});
document.getElementById('sound-btn').addEventListener('click', () => {
  Sound.resume(); Sound.armMusic();
  const on = Sound.toggle();
  document.getElementById('sound-btn').textContent = on ? '🔊' : '🔇';
});
// 操作指南：× 关闭、❔ 切换、H 键也行
document.getElementById('help-close').addEventListener('click', () => { if (helpAutoTimer) clearTimeout(helpAutoTimer); helpPanel.style.display = 'none'; });
document.getElementById('help-btn').addEventListener('click', () => { if (helpAutoTimer) clearTimeout(helpAutoTimer); toggleHelp(); });

/* ---------- 语音播报 ---------- */
function speak(t) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN'; u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
function toggleVoice() {
  exp.voiceOn = !exp.voiceOn;
  const d = document.createElement('div'); d.className = 'exp-toast';
  d.textContent = exp.voiceOn ? '🔊 语音播报 已开启' : '🔇 语音播报 已静音';
  expToasts.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2500);
  setTimeout(() => d.remove(), 3200);
}

/* ---------- 拍照 · 寄回地球的明信片（旅行青蛙式） ---------- */
const photoFlash = document.getElementById('photo-flash');
const photoPanel = document.getElementById('photo-panel');
const photoGrid = document.getElementById('photo-grid');
const photoToasts = document.getElementById('photo-toasts');
let photos = [];
try { photos = JSON.parse(localStorage.getItem('cv_photos') || '[]'); } catch (e) { photos = []; }
function photoMeta() {
  if (mode === 'expedition' && exp.targetPlanet) {
    const alt = (exp.phase === 'ascent' || exp.phase === 'orbit') ? Math.round(exp.alt) + ' km' : `地表 (${Math.round(camera.position.x)}, ${Math.round(camera.position.z)})`;
    return { planet: exp.targetPlanet.name, phase: phaseLabel(exp.phase), alt, t: new Date().toLocaleString('zh-CN', { hour12: false }) };
  }
  return { planet: '太阳系漫游', phase: '自由漫游', alt: `(${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)})`, t: new Date().toLocaleString('zh-CN', { hour12: false }) };
}
function composePostcard(photoCanvas, meta) {
  // 在原图下方铺一张"明信片卡面"（540 × ~900），加品牌头/邮戳/印章/水印
  const W = photoCanvas.width, H = photoCanvas.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H + 360;
  const x = c.getContext('2d');
  // 1) 渐变星空背景
  const bg = x.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#0a0f24'); bg.addColorStop(0.55, '#0b1530'); bg.addColorStop(1, '#1c0a2a');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  // 2) 顶部品牌
  x.fillStyle = '#7adcff'; x.font = '600 13px -apple-system, "PingFang SC", sans-serif';
  x.fillText('COSMIC VOYAGE · 来自星辰的明信片', 18, 30);
  x.strokeStyle = 'rgba(122, 220, 255, 0.4)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(18, 38); x.lineTo(c.width - 18, 38); x.stroke();
  // 3) 照片主体
  x.drawImage(photoCanvas, 0, 50, W, H);
  // 4) 照片描边
  x.strokeStyle = 'rgba(255, 255, 255, 0.18)'; x.lineWidth = 2;
  x.strokeRect(0, 50, W, H);
  // 5) 地标/目的地
  x.fillStyle = '#ffd66b'; x.font = '700 20px -apple-system, "PingFang SC", sans-serif';
  x.fillText('✦  ' + (meta.planet || '深空'), 18, 50 + H + 38);
  x.fillStyle = 'rgba(255, 255, 255, 0.72)'; x.font = '14px -apple-system, "PingFang SC", sans-serif';
  x.fillText((meta.phase || '') + '  ·  ' + (meta.alt || ''), 18, 50 + H + 60);
  // 6) 底部三栏：日期 / 邮戳 / 水印
  const baseY = 50 + H + 120;
  // 日期
  x.fillStyle = 'rgba(255, 255, 255, 0.5)'; x.font = '11px -apple-system, "PingFang SC", sans-serif';
  x.fillText('寄出时间', 18, baseY);
  x.fillStyle = '#fff'; x.font = '600 14px -apple-system, "PingFang SC", sans-serif';
  x.fillText(meta.t || '—', 18, baseY + 20);
  // 邮戳（环形 + 文字）
  x.save(); x.translate(c.width - 100, baseY + 20);
  x.strokeStyle = 'rgba(255, 92, 92, 0.7)'; x.lineWidth = 2;
  x.beginPath(); x.arc(0, 0, 36, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(255, 92, 92, 0.45)'; x.lineWidth = 1;
  x.beginPath(); x.arc(0, 0, 30, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(255, 92, 92, 0.75)'; x.font = '700 10px -apple-system, sans-serif';
  x.textAlign = 'center'; x.fillText('SPACE MAIL', 0, -4);
  x.fillText('—  ∞  —', 0, 8);
  x.font = '600 8px -apple-system, sans-serif'; x.fillText('COSMOS POST', 0, 22);
  x.textAlign = 'start'; x.restore();
  // 邮票（小方框 + 火箭）
  x.save(); x.translate(c.width - 200, baseY - 4);
  x.fillStyle = '#fff'; x.fillRect(0, 0, 50, 62);
  x.fillStyle = '#0a0f24';
  // 锯齿边框
  x.strokeStyle = '#0a0f24'; x.lineWidth = 2; x.setLineDash([3, 2]);
  x.strokeRect(2, 2, 46, 58); x.setLineDash([]);
  // 小火箭
  x.fillStyle = '#ffd66b'; x.beginPath();
  x.moveTo(25, 14); x.lineTo(31, 26); x.lineTo(28, 26); x.lineTo(28, 38);
  x.lineTo(22, 38); x.lineTo(22, 26); x.lineTo(19, 26); x.closePath(); x.fill();
  x.fillStyle = '#7adcff'; x.fillRect(23, 38, 4, 6);
  // 价值
  x.fillStyle = '#c00'; x.font = '700 9px -apple-system, sans-serif'; x.textAlign = 'center';
  x.fillText('∞ LY', 25, 54);
  x.textAlign = 'start'; x.restore();
  // 7) 水印
  x.fillStyle = 'rgba(255, 255, 255, 0.32)'; x.font = 'italic 11px -apple-system, "PingFang SC", sans-serif';
  x.textAlign = 'center';
  x.fillText('WonderfulClaire.github.io/cosmic-voyage', c.width / 2, c.height - 14);
  x.textAlign = 'start';
  return c;
}
function takePhoto() {
  Sound.photo();
  composer.render();
  const src = renderer.domElement;
  const W = 540, H = Math.round(src.height / src.width * W);
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
  oc.getContext('2d').drawImage(src, 0, 0, W, H);
  const meta = photoMeta();
  // 合成"明信片"卡面（带品牌/邮戳/邮票/水印）
  const card = composePostcard(oc, meta);
  const dataURL = card.toDataURL('image/jpeg', 0.85);
  const photo = { dataURL, raw: oc.toDataURL('image/jpeg', 0.82), ...meta, stamp: photos.length + 1 };
  photos.push(photo);
  try { localStorage.setItem('cv_photos', JSON.stringify(photos)); } catch (e) {}
  if (photoFlash) { photoFlash.style.opacity = '1'; setTimeout(() => photoFlash.style.opacity = '0', 130); }
  const d = document.createElement('div'); d.className = 'exp-toast';
  d.textContent = `📮 明信片已寄回地球 #${photo.stamp} · ${meta.planet}`;
  photoToasts.appendChild(d);
  setTimeout(() => d.classList.add('out'), 3200);
  setTimeout(() => d.remove(), 3900);
  unlockAch('photo', '第一张明信片');
  renderPhotoGrid();
}
async function sharePostcard(p) {
  // 把 dataURL 转成 Blob，尝试 Web Share API；不支持则回退到下载
  try {
    const r = await fetch(p.dataURL);
    const blob = await r.blob();
    const file = new File([blob], `cosmic-postcard-${p.stamp}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `来自${p.planet}的明信片 · Cosmic Voyage`,
        text: `📮 我从${p.planet}寄回地球的明信片 — 探索全宇宙：WonderfulClaire.github.io/cosmic-voyage`,
        files: [file],
      });
      return;
    }
  } catch (e) { /* 降级 */ }
  const a = document.createElement('a');
  a.href = p.dataURL; a.download = `cosmic-postcard-${p.stamp}-${p.planet}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
  const d = document.createElement('div'); d.className = 'exp-toast';
  d.textContent = '⬇ 已开始下载明信片（可发到朋友圈/微博）';
  photoToasts.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2800);
  setTimeout(() => d.remove(), 3300);
}
function renderPhotoGrid() {
  if (!photoGrid) return;
  photoGrid.innerHTML = photos.length ? photos.map(p => `
    <div class="ph-card">
      <img src="${p.dataURL}" alt="postcard"/>
      <div class="ph-meta"><b>#${p.stamp}</b> ${p.planet} · ${p.phase}<br>${p.alt}<br><span class="ph-stamp">📮 已寄回地球 · ${p.t}</span></div>
      <div class="ph-actions">
        <a class="ph-dl" href="${p.dataURL}" download="cosmic-postcard_${p.stamp}_${p.planet}.jpg">⬇ 下载</a>
        <button class="ph-share" data-i="${p.stamp - 1}">🔗 分享</button>
      </div>
    </div>`).join('') : '<div class="ph-empty">还没有明信片。在旅途中按 <b>P</b> 拍照，把星辰大海寄回地球吧 ✨</div>';
  const cnt = document.getElementById('ph-count'); if (cnt) cnt.textContent = photos.length;
  // 绑定分享按钮
  photoGrid.querySelectorAll('.ph-share').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.i, 10); sharePostcard(photos[i]);
  }));
}
function togglePhotoPanel() {
  if (!photoPanel) return;
  if (photoPanel.style.display === 'flex') { photoPanel.style.display = 'none'; if (mode === 'expedition' && !controls.isLocked) controls.lock(); }
  else { renderPhotoGrid(); photoPanel.style.display = 'flex'; if (controls.isLocked) controls.unlock(); }
}

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
