import * as THREE from "https://esm.sh/three@0.169.0";
import { OrbitControls } from "https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "https://esm.sh/three@0.169.0/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "https://esm.sh/three@0.169.0/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "https://esm.sh/three@0.169.0/examples/jsm/environments/RoomEnvironment.js";
import { coverWithPixels, revealFromPixels } from "./pixel-transition.js";
import { pause } from "./ui/text.js";

if (sessionStorage.getItem("atlas:enter") === "pixel") {
  sessionStorage.removeItem("atlas:enter");
  revealFromPixels();
}

document.querySelector("[data-atlas-back]").addEventListener("click", async () => {
  await coverWithPixels();
  sessionStorage.setItem("etinuxia:return", "atlas");
  window.location.href = "index.html";
});

const canvas = document.querySelector("[data-scene]");
const hint = document.querySelector("[data-hint]");

const reader = document.querySelector("[data-reader]");
const readerPanel = document.querySelector("[data-reader-panel]");
const readerCopy = document.querySelector("[data-reader-copy]");
const readerCulture = document.querySelector("[data-reader-culture]");
const readerTitle = document.querySelector("[data-reader-title]");
const readerClose = document.querySelector("[data-reader-close]");
const pageEls = [document.querySelector("[data-page-current]"), document.querySelector("[data-page-turning]")];
const prevBtn = document.querySelector("[data-page-prev]");
const nextBtn = document.querySelector("[data-page-next]");
const indicator = document.querySelector("[data-page-indicator]");

// --- renderer / scene / camera ---
// lighting rig, fog and PMREM environment reflections are adapted from
// github.com/MengTo/complete-shelf, which builds a studio-photography-style
// multi-light setup rather than a single flat headlight

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const FOG_COLOR = 0x0b0a08;
renderer.setClearColor(FOG_COLOR, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.045);

RectAreaLightUniformsLib.init();
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.045).texture;
scene.environmentIntensity = 0.6;
pmremGenerator.dispose();

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
const HOME_POS = new THREE.Vector3(0, 2.1, 8.6);
const HOME_TARGET = new THREE.Vector3(0, 1.55, 0);
camera.position.copy(HOME_POS);

// --- studio light rig: hemisphere ambient, a shadow-casting key light, a
// soft rectangular "softbox" key, a cool fill and a warm rim ---
scene.add(new THREE.HemisphereLight(0x4a4238, 0x0a0806, 0.6));

const keyLight = new THREE.DirectionalLight(0xffe9c4, 1.35);
keyLight.position.set(-3.4, 6.4, 5.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -2;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.bias = -0.0002;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 3;
scene.add(keyLight);

const softKey = new THREE.RectAreaLight(0xffe9c4, 6, 5, 5.4);
softKey.position.set(-2.6, 5.2, 4.4);
softKey.lookAt(0, 1.6, 0);
scene.add(softKey);

const fillLight = new THREE.DirectionalLight(0xcfe1ea, 0.28);
fillLight.position.set(5, 3.4, 4);
scene.add(fillLight);

const rimLight = new THREE.RectAreaLight(0xd8ae70, 3, 1.4, 5);
rimLight.position.set(4.2, 3.8, -1.6);
rimLight.lookAt(0, 1.6, 0);
scene.add(rimLight);

// --- room: floor, backdrop wall, walnut shelf, contact-shadow strip ---
// gives the scene real depth instead of books floating in a flat void

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.95 }),
);
floor.scale.set(34, 24, 1);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
floor.receiveShadow = true;
scene.add(floor);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 1 }),
);
backdrop.scale.set(30, 16, 1);
backdrop.position.set(0, 6, -4.4);
scene.add(backdrop);

const WALNUT = new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 0.55 });
const WALNUT_DARK = new THREE.MeshStandardMaterial({ color: 0x1c1109, roughness: 0.7 });

const shelfPlank = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), WALNUT);
shelfPlank.scale.set(9.4, 0.16, 1.3);
shelfPlank.position.set(0, 0.42, 0);
shelfPlank.castShadow = true;
shelfPlank.receiveShadow = true;
scene.add(shelfPlank);

const shelfLip = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), WALNUT_DARK);
shelfLip.scale.set(9.46, 0.06, 1.36);
shelfLip.position.set(0, 0.33, 0.02);
scene.add(shelfLip);

[-4.85, 4.85].forEach((x) => {
  const upright = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), WALNUT_DARK);
  upright.scale.set(0.18, 4.6, 0.9);
  upright.position.set(x, 2.5, -0.3);
  scene.add(upright);
});

function makeContactShadowTexture() {
  const c = makeCanvas(256, 128);
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 64, 4, 128, 64, 120);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(c);
}

const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: makeContactShadowTexture(),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
);
contactShadow.scale.set(9, 1.1, 1);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.set(0, 0.51, 0.1);
scene.add(contactShadow);

// floating dust motes for atmosphere
{
  const DUST_COUNT = 90;
  const positions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = 0.8 + Math.random() * 4.6;
    positions[i * 3 + 2] = -2 + Math.random() * 5;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xc9b088,
    size: 0.016,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }));
  dust.name = "dust";
  scene.add(dust);
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 5;
controls.maxDistance = 11;
controls.minPolarAngle = Math.PI / 2 - 0.28;
controls.maxPolarAngle = Math.PI / 2 + 0.14;
controls.minAzimuthAngle = -0.6;
controls.maxAzimuthAngle = 0.6;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.update();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- book construction ---
// a rounded-edge shell (cover) plus a separate inset page-block, both in
// MeshPhysicalMaterial with sheen so cloth and paper actually catch the
// studio lights and the room-environment reflections above

const BOOK_WIDTH = 0.5;
const BOOK_HEIGHT = 2.3;
const BOOK_DEPTH = 1.5;
const BOARD = 0.05;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = `${word} `;
    } else {
      line = test;
    }
  });
  lines.push(line.trim());
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

// one shared cloth-weave bump map, reused (tiled) across every book cover so
// we're not generating a full normal map per book
const CLOTH_BUMP = new THREE.CanvasTexture((() => {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const weave = Math.sin(x * 1.4) * Math.sin(y * 1.4) * 0.5 + 0.5;
      const grain = Math.random() * 0.15;
      const v = Math.floor(Math.min(1, weave * 0.7 + grain) * 255);
      const i = (y * 128 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
})());
CLOTH_BUMP.wrapS = THREE.RepeatWrapping;
CLOTH_BUMP.wrapT = THREE.RepeatWrapping;
CLOTH_BUMP.repeat.set(4, 12);

function makeBookMaterials(data) {
  const spineCanvas = makeCanvas(160, 800);
  const sctx = spineCanvas.getContext("2d");
  sctx.fillStyle = data.spine;
  sctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);
  sctx.strokeStyle = `${data.accent}55`;
  sctx.lineWidth = 3;
  sctx.strokeRect(12, 30, spineCanvas.width - 24, spineCanvas.height - 60);
  sctx.save();
  sctx.translate(spineCanvas.width / 2, spineCanvas.height / 2);
  sctx.rotate(-Math.PI / 2);
  sctx.fillStyle = data.accent;
  sctx.font = "700 48px Satoshi, sans-serif";
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillText(data.title, 0, 0);
  sctx.restore();

  const coverCanvas = makeCanvas(640, 880);
  const cctx = coverCanvas.getContext("2d");
  cctx.fillStyle = data.cover;
  cctx.fillRect(0, 0, coverCanvas.width, coverCanvas.height);
  cctx.strokeStyle = `${data.accent}66`;
  cctx.lineWidth = 5;
  cctx.strokeRect(32, 32, coverCanvas.width - 64, coverCanvas.height - 64);
  cctx.save();
  cctx.translate(coverCanvas.width / 2, coverCanvas.height * 0.38);
  cctx.strokeStyle = `${data.accent}aa`;
  cctx.lineWidth = 2;
  for (let r = 40; r <= 175; r += 30) {
    cctx.beginPath();
    cctx.arc(0, 0, r, 0, Math.PI * 2);
    cctx.stroke();
  }
  cctx.restore();
  cctx.fillStyle = data.accent;
  cctx.textAlign = "center";
  cctx.font = "900 50px Satoshi, sans-serif";
  wrapText(cctx, data.title, coverCanvas.width / 2, coverCanvas.height * 0.68, coverCanvas.width - 120, 56);
  cctx.font = "500 24px Satoshi, sans-serif";
  cctx.globalAlpha = 0.8;
  cctx.fillText(data.culture.toUpperCase(), coverCanvas.width / 2, coverCanvas.height * 0.87);
  cctx.globalAlpha = 1;

  const spineTex = new THREE.CanvasTexture(spineCanvas);
  const coverTex = new THREE.CanvasTexture(coverCanvas);
  spineTex.colorSpace = THREE.SRGBColorSpace;
  coverTex.colorSpace = THREE.SRGBColorSpace;

  const accentColor = new THREE.Color(data.accent);
  const clothBase = {
    normalScale: new THREE.Vector2(0.3, 0.3),
    bumpMap: CLOTH_BUMP,
    bumpScale: 0.004,
    roughness: 0.82,
    metalness: 0.03,
    sheen: 0.4,
    sheenRoughness: 0.7,
    sheenColor: accentColor,
    envMapIntensity: 1,
  };

  const plainMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  const coverMat = new THREE.MeshPhysicalMaterial({ ...clothBase, map: coverTex });
  const spineMat = new THREE.MeshPhysicalMaterial({ ...clothBase, map: spineTex, side: THREE.DoubleSide });

  // RoundedBoxGeometry keeps BoxGeometry's face-group order: +X, -X, +Y, -Y, +Z, -Z
  return [coverMat, plainMat, plainMat, plainMat, spineMat, plainMat];
}

const PAGE_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: 0xece1c8,
  roughness: 0.92,
  metalness: 0,
  sheen: 0.12,
  sheenRoughness: 0.9,
});

// fore-edge of the page block: faint vertical striations so the stacked
// sheets read as individual leaves rather than one solid slab
const PAGE_EDGE_MAP = new THREE.CanvasTexture((() => {
  const c = makeCanvas(256, 8);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#efe6d2";
  ctx.fillRect(0, 0, 256, 8);
  for (let x = 0; x < 256; x += 1) {
    const v = 0.72 + Math.random() * 0.28;
    ctx.fillStyle = `rgba(150,136,110,${(1 - v) * 0.9})`;
    ctx.fillRect(x, 0, 1, 8);
  }
  return c;
})());
PAGE_EDGE_MAP.wrapS = THREE.RepeatWrapping;
PAGE_EDGE_MAP.wrapT = THREE.RepeatWrapping;

const PAGE_EDGE_MATERIAL = new THREE.MeshPhysicalMaterial({
  map: PAGE_EDGE_MAP,
  bumpMap: PAGE_EDGE_MAP,
  bumpScale: 0.0025,
  roughness: 0.94,
  metalness: 0,
  sheen: 0.08,
  sheenRoughness: 1,
});

function makeEndpaperMaterial(data) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext("2d");
  const base = new THREE.Color(data.cover).lerp(new THREE.Color(0xf2ead8), 0.62);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = `${data.accent}22`;
  ctx.lineWidth = 1;
  for (let i = -256; i < 256; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.95,
    metalness: 0,
    sheen: 0.05,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
  });
}

// A book is built as a hinged rig rather than one solid box:
//
//   root            placement on the shelf
//    └ motion       idle sway + hover offsets
//       ├ spine     cloth-wrapped, faces the viewer on the shelf
//       ├ backBoard
//       ├ frontPivot   hinge at the spine edge — this is what cracks open
//       │   ├ frontBoard
//       │   └ frontEndpaper
//       ├ pageBlock + fore/head/tail edges
//       ├ headbands (top + bottom of the spine)
//       └ ribbon
//
// Local axes: X = cover-to-cover thickness, Y = height, Z = page depth,
// with the spine at +Z so it faces out when shelved.
function buildBookRig(data) {
  const root = new THREE.Group();
  const motion = new THREE.Group();
  root.add(motion);

  const [coverMat, , , , spineMat] = makeBookMaterials(data);
  const endpaperMat = makeEndpaperMaterial(data);
  const half = BOOK_WIDTH / 2;
  const boardInset = half - BOARD / 2;
  const hingeZ = BOOK_DEPTH / 2;

  const boardGeo = new RoundedBoxGeometry(BOARD, BOOK_HEIGHT, BOOK_DEPTH, 2, 0.01);

  const backBoard = new THREE.Mesh(boardGeo, coverMat);
  backBoard.position.x = -boardInset;
  backBoard.castShadow = true;
  backBoard.receiveShadow = true;
  motion.add(backBoard);

  // front cover lives under a pivot placed on the spine edge, so rotating
  // the pivot swings the board open exactly like a real hinge
  const frontPivot = new THREE.Group();
  frontPivot.position.set(boardInset, 0, hingeZ);
  motion.add(frontPivot);

  const frontBoard = new THREE.Mesh(boardGeo, coverMat);
  frontBoard.position.z = -BOOK_DEPTH / 2;
  frontBoard.castShadow = true;
  frontBoard.receiveShadow = true;
  frontPivot.add(frontBoard);

  const frontEndpaper = new THREE.Mesh(
    new THREE.PlaneGeometry(BOOK_DEPTH - 0.06, BOOK_HEIGHT - 0.06),
    endpaperMat,
  );
  frontEndpaper.rotation.y = -Math.PI / 2;
  frontEndpaper.position.set(-BOARD / 2 - 0.002, 0, -BOOK_DEPTH / 2);
  frontPivot.add(frontEndpaper);

  const spine = new THREE.Mesh(
    new RoundedBoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, BOARD, 2, 0.012),
    spineMat,
  );
  spine.position.z = hingeZ - BOARD / 2;
  spine.castShadow = true;
  spine.receiveShadow = true;
  motion.add(spine);

  const pageW = BOOK_WIDTH - BOARD * 2.2;
  const pageH = BOOK_HEIGHT - 0.09;
  const pageD = BOOK_DEPTH - BOARD * 1.6;
  const pageBlock = new THREE.Mesh(
    new RoundedBoxGeometry(pageW, pageH, pageD, 2, 0.008),
    PAGE_MATERIAL,
  );
  pageBlock.position.z = -BOARD * 0.5;
  pageBlock.castShadow = true;
  pageBlock.receiveShadow = true;
  motion.add(pageBlock);

  // striated fore-edge (opposite the spine) and the head/tail edges
  const foreEdge = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageH), PAGE_EDGE_MATERIAL);
  foreEdge.rotation.y = Math.PI;
  foreEdge.position.set(0, 0, pageBlock.position.z - pageD / 2 - 0.001);
  motion.add(foreEdge);

  [1, -1].forEach((dir) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageD), PAGE_EDGE_MATERIAL);
    edge.rotation.x = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
    edge.position.set(0, dir * (pageH / 2 + 0.001), pageBlock.position.z);
    motion.add(edge);
  });

  // headbands: the small woven caps at the head and tail of a bound spine
  const headbandMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(data.accent),
    roughness: 0.6,
    metalness: 0.12,
    sheen: 0.3,
    sheenRoughness: 0.7,
  });
  [1, -1].forEach((dir) => {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, pageW, 10, 1, false, 0, Math.PI),
      headbandMat,
    );
    band.rotation.z = Math.PI / 2;
    band.rotation.y = Math.PI;
    band.position.set(0, dir * (pageH / 2 - 0.004), hingeZ - BOARD - 0.018);
    motion.add(band);
  });

  const ribbon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.035, BOOK_HEIGHT * 0.42),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(data.accent).lerp(new THREE.Color(data.cover), 0.35),
      roughness: 0.62,
      metalness: 0.06,
      sheen: 0.35,
      sheenRoughness: 0.65,
      side: THREE.DoubleSide,
    }),
  );
  ribbon.position.set(0, -BOOK_HEIGHT * 0.36, pageBlock.position.z - pageD / 2 + 0.01);
  motion.add(ribbon);

  const hitTargets = [backBoard, frontBoard, spine, pageBlock];
  return { root, motion, frontPivot, hitTargets };
}

async function buildBooks(booksData) {
  await document.fonts.load("700 48px Satoshi");
  await document.fonts.load("900 50px Satoshi");
  await document.fonts.load("500 24px Satoshi");
  await document.fonts.ready;

  const gap = 0.14;
  const totalWidth = booksData.length * (BOOK_WIDTH + gap) - gap;
  const startX = -totalWidth / 2 + BOOK_WIDTH / 2;

  return booksData.map((data, i) => {
    const rig = buildBookRig(data);
    const group = rig.root;

    const x = startX + i * (BOOK_WIDTH + gap);
    const tilt = (Math.random() - 0.5) * 0.05;
    group.position.set(x, BOOK_HEIGHT / 2 + 0.51, 0);
    group.rotation.z = tilt;
    group.userData = {
      data,
      motion: rig.motion,
      frontPivot: rig.frontPivot,
      home: {
        position: group.position.clone(),
        rotationY: 0,
        rotationZ: tilt,
      },
      hoverLerp: 0,
      hoverTarget: 0,
    };
    rig.hitTargets.forEach((mesh) => {
      mesh.userData.group = group;
    });
    scene.add(group);
    return group;
  });
}

// --- selection state + tween ---

const OPEN_POS = new THREE.Vector3(0, 1.75, 4.7);
const OPEN_ROT_Y = -Math.PI / 2;
const OPEN_DURATION = 0.72;

let books = [];
let hovered = null;
let selected = null;
let animatingMesh = null;
let animDir = 1;
let animT = 0;
let currentBook = null;
let taleIndex = 0;
let frontIndex = 0;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function setBookHover(mesh, isHover) {
  mesh.userData.hoverTarget = isHover ? 1 : 0;
}

function hideHintOnce() {
  hint.classList.add("is-hidden");
}

canvas.addEventListener("pointerdown", hideHintOnce, { once: true });

function resolveBookGroup(object) {
  return object?.userData.group ?? object ?? null;
}

canvas.addEventListener("pointermove", (event) => {
  if (selected || animatingMesh) {
    return;
  }
  updatePointer(event);
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = resolveBookGroup(raycaster.intersectObjects(books, true)[0]?.object);
  if (hit !== hovered) {
    if (hovered) {
      setBookHover(hovered, false);
    }
    hovered = hit;
    if (hovered) {
      setBookHover(hovered, true);
    }
    canvas.classList.toggle("is-hovering", Boolean(hovered));
  }
});

canvas.addEventListener("click", (event) => {
  if (selected || animatingMesh) {
    return;
  }
  updatePointer(event);
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = resolveBookGroup(raycaster.intersectObjects(books, true)[0]?.object);
  if (hit) {
    selectBook(hit);
  }
});

function selectBook(mesh) {
  if (hovered) {
    setBookHover(hovered, false);
  }
  hovered = null;
  canvas.classList.remove("is-hovering");
  hint.classList.add("is-hidden");
  selected = mesh;
  animatingMesh = mesh;
  animDir = 1;
  animT = 0;
  controls.enabled = false;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function tickSelection(dt) {
  if (!animatingMesh) {
    return;
  }
  animT = Math.min(animT + dt / OPEN_DURATION, 1);
  const e = easeOutCubic(animT);
  const mesh = animatingMesh;
  const home = mesh.userData.home;

  const fromPos = animDir === 1 ? home.position : OPEN_POS;
  const toPos = animDir === 1 ? OPEN_POS : home.position;
  const fromRotY = animDir === 1 ? home.rotationY : OPEN_ROT_Y;
  const toRotY = animDir === 1 ? OPEN_ROT_Y : home.rotationY;
  const fromRotZ = animDir === 1 ? home.rotationZ : 0;
  const toRotZ = animDir === 1 ? 0 : home.rotationZ;

  mesh.position.lerpVectors(fromPos, toPos, e);
  mesh.rotation.y = THREE.MathUtils.lerp(fromRotY, toRotY, e);
  mesh.rotation.z = THREE.MathUtils.lerp(fromRotZ, toRotZ, e);

  // the front board swings open as the book leaves the shelf, and shuts
  // again on the way back — the hinge is what sells it as a real object
  const ud = mesh.userData;
  ud.frontPivot.rotation.y = THREE.MathUtils.lerp(
    animDir === 1 ? 0 : -2.1,
    animDir === 1 ? -2.1 : 0,
    e,
  );

  if (animT >= 1) {
    const finishedMesh = mesh;
    animatingMesh = null;
    if (animDir === 1) {
      openReader(finishedMesh.userData.data);
    } else {
      finishedMesh.position.copy(home.position);
      finishedMesh.rotation.y = home.rotationY;
      finishedMesh.rotation.z = home.rotationZ;
      ud.frontPivot.rotation.y = 0;
      ud.motion.rotation.set(0, 0, 0);
      selected = null;
      controls.enabled = true;
    }
  }
}

function animateIdleBooks(dt, elapsed) {
  books.forEach((mesh, index) => {
    if (mesh === selected || mesh === animatingMesh) {
      return;
    }
    const ud = mesh.userData;
    ud.hoverLerp = THREE.MathUtils.damp(ud.hoverLerp, ud.hoverTarget, 6, dt);

    // each book breathes on its own phase so the shelf never looks frozen
    const breathe = Math.sin(elapsed * 0.7 + index * 0.85) * 0.012;
    mesh.position.y = ud.home.position.y + ud.hoverLerp * 0.14 + breathe;
    mesh.position.z = ud.home.position.z + ud.hoverLerp * 0.16;
    mesh.rotation.z = ud.home.rotationZ - ud.hoverLerp * 0.05;

    // hovering cracks the front board open on its hinge and lets the book
    // lean very slightly toward the pointer, like it is being picked up
    ud.frontPivot.rotation.y = THREE.MathUtils.damp(
      ud.frontPivot.rotation.y,
      ud.hoverLerp * -0.30,
      9,
      dt,
    );
    ud.motion.rotation.x = THREE.MathUtils.damp(
      ud.motion.rotation.x,
      ud.hoverLerp * pointerNDC.y * 0.05,
      8,
      dt,
    );
    ud.motion.rotation.y = THREE.MathUtils.damp(
      ud.motion.rotation.y,
      ud.hoverLerp * -pointerNDC.x * 0.05,
      8,
      dt,
    );
  });
}

// --- reader UI: culture facts + flipping page spread ---

function renderTaleInto(el, tale) {
  el.replaceChildren();
  const title = document.createElement("p");
  title.className = "atlas-page__title";
  title.textContent = tale.title;
  const body = document.createElement("p");
  body.className = "atlas-page__body";
  body.textContent = tale.body;
  el.append(title, body);
}

function updateNav(book) {
  prevBtn.disabled = taleIndex === 0;
  nextBtn.disabled = taleIndex === book.tales.length - 1;
  indicator.textContent = `${taleIndex + 1} / ${book.tales.length}`;
}

function resetPages(book) {
  taleIndex = 0;
  frontIndex = 0;
  pageEls.forEach((el, i) => {
    el.style.transition = "none";
    el.style.transform = "rotateY(0deg)";
    el.classList.remove("atlas-page--flip-next", "atlas-page--flip-prev");
    el.classList.toggle("atlas-page--front", i === 0);
    el.classList.toggle("atlas-page--turning", i !== 0);
  });
  renderTaleInto(pageEls[0], book.tales[0]);
  requestAnimationFrame(() => {
    pageEls.forEach((el) => {
      el.style.transition = "";
    });
  });
  updateNav(book);
}

function turnPage(direction) {
  if (!currentBook) {
    return;
  }
  const nextIndex = taleIndex + direction;
  if (nextIndex < 0 || nextIndex >= currentBook.tales.length) {
    return;
  }

  const frontEl = pageEls[frontIndex];
  const backIndex = 1 - frontIndex;
  const backEl = pageEls[backIndex];

  renderTaleInto(backEl, currentBook.tales[nextIndex]);
  backEl.style.transition = "none";
  backEl.style.transform = "rotateY(0deg)";
  backEl.classList.remove("atlas-page--flip-next", "atlas-page--flip-prev", "atlas-page--front");
  backEl.classList.add("atlas-page--turning");
  requestAnimationFrame(() => {
    backEl.style.transition = "";
  });

  frontEl.classList.add(direction > 0 ? "atlas-page--flip-next" : "atlas-page--flip-prev");

  taleIndex = nextIndex;
  frontIndex = backIndex;
  updateNav(currentBook);

  setTimeout(() => {
    frontEl.style.transition = "none";
    frontEl.style.transform = "rotateY(0deg)";
    frontEl.classList.remove("atlas-page--front", "atlas-page--flip-next", "atlas-page--flip-prev");
    frontEl.classList.add("atlas-page--turning");
    backEl.classList.add("atlas-page--front");
    backEl.classList.remove("atlas-page--turning");
    requestAnimationFrame(() => {
      frontEl.style.transition = "";
    });
  }, 640);
}

prevBtn.addEventListener("click", () => turnPage(-1));
nextBtn.addEventListener("click", () => turnPage(1));

async function openReader(book) {
  currentBook = book;
  readerCulture.textContent = `${book.culture} · ${book.region}`;
  readerTitle.textContent = book.title;
  resetPages(book);

  reader.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      readerPanel.classList.add("is-shown");
    });
  });
  await pause(260);
  readerCopy.classList.add("is-shown");
  readerTitle.focus({ preventScroll: true });
}

async function closeReader() {
  currentBook = null;
  readerCopy.classList.remove("is-shown");
  await pause(120);
  readerPanel.classList.remove("is-shown");
  await pause(320);
  reader.hidden = true;

  animDir = -1;
  animT = 0;
  animatingMesh = selected;
}

readerClose.addEventListener("click", closeReader);

document.addEventListener("keydown", (event) => {
  if (reader.hidden) {
    return;
  }
  if (event.key === "Escape") {
    closeReader();
  } else if (event.key === "ArrowRight") {
    turnPage(1);
  } else if (event.key === "ArrowLeft") {
    turnPage(-1);
  }
});

// --- boot ---

const clock = new THREE.Clock();
function renderLoop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();
  if (controls.enabled) {
    controls.update();
  }
  animateIdleBooks(dt, elapsed);
  tickSelection(dt);
  const dust = scene.getObjectByName("dust");
  if (dust) {
    dust.rotation.y = elapsed * 0.015;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

fetch("src/data/atlas-books.json")
  .then((response) => response.json())
  .then(async (booksData) => {
    books = await buildBooks(booksData);
    requestAnimationFrame(renderLoop);
  });
