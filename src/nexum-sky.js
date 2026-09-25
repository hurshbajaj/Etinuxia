import { PANTHEONS } from "./data/pantheons.js";

const TILE = 2600;
const COLS = 5;
const ROWS = 5;
const PICK_RADIUS = 16;
const CLICK_SLOP = 6;
const FRICTION = 0.94;
const CAMERA_EASE = 0.12;
const FOCUS_EASE = 0.14;
const DRIFT_SPEED = 0.35;
const STAR_COUNT = 420;
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.4;
const METEOR_MAX = 2;
const METEOR_GAP_MIN = 3500;
const METEOR_GAP_MAX = 9000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function tileSeed(tx, ty) {
  return ((tx * 374761393 + ty * 668265263) ^ 0x9e3779b9) >>> 0;
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildTile(tx, ty) {
  const rng = mulberry32(tileSeed(tx, ty));
  const order = shuffle(PANTHEONS, rng);
  const cellW = TILE / COLS;
  const cellH = TILE / ROWS;

  const clusters = order.map((pantheon, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = tx * TILE + col * cellW + cellW / 2 + (rng() - 0.5) * cellW * 0.55;
    const cy = ty * TILE + row * cellH + cellH / 2 + (rng() - 0.5) * cellH * 0.55;

    const nodes = pantheon.deities.map((deity, j) => {
      const angle = (j / pantheon.deities.length) * Math.PI * 2 + rng() * 0.7;
      const radius = 46 + rng() * 58;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        name: deity.name,
        tag: deity.tag,
        pantheon,
      };
    });

    return { pantheon, cx, cy, nodes, maxRel: null };
  });

  const buckets = new Map();
  for (const cluster of clusters) {
    for (const node of cluster.nodes) {
      if (!buckets.has(node.tag)) buckets.set(node.tag, []);
      buckets.get(node.tag).push(node);
    }
  }

  const threads = [];
  for (const nodes of buckets.values()) {
    const chain = shuffle(nodes, rng);
    for (let i = 1; i < chain.length; i++) {
      threads.push([chain[i - 1], chain[i]]);
    }
  }

  const starRng = mulberry32(tileSeed(tx, ty) ^ 0x51ed270b);
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: tx * TILE + starRng() * TILE,
      y: ty * TILE + starRng() * TILE,
      r: 0.5 + starRng() * 1.1,
      alpha: 0.12 + starRng() * 0.4,
    });
  }

  return { clusters, threads, stars };
}

function clusterMaxRel(cluster) {
  if (cluster.maxRel == null) {
    let m = 0;
    for (const n of cluster.nodes) {
      m = Math.max(m, Math.hypot(n.x - cluster.cx, n.y - cluster.cy));
    }
    cluster.maxRel = m || 1;
  }
  return cluster.maxRel;
}

export function createSky(canvas, { onFocus, onUnfocus } = {}) {
  const ctx = canvas.getContext("2d");
  const tileCache = new Map();

  function getTile(tx, ty) {
    const key = `${tx},${ty}`;
    let tile = tileCache.get(key);
    if (!tile) {
      tile = buildTile(tx, ty);
      tileCache.set(key, tile);
    }
    return tile;
  }

  const camera = { x: 0, y: 0 };
  const drive = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };
  let scale = 1;
  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let focus = null;
  const meteors = [];
  let nextMeteorAt = performance.now() + METEOR_GAP_MIN + Math.random() * (METEOR_GAP_MAX - METEOR_GAP_MIN);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function visibleClusters() {
    const pad = 220 / scale;
    const minX = camera.x - width / 2 / scale - pad;
    const maxX = camera.x + width / 2 / scale + pad;
    const minY = camera.y - height / 2 / scale - pad;
    const maxY = camera.y + height / 2 / scale + pad;
    const tx0 = Math.floor(minX / TILE);
    const tx1 = Math.floor(maxX / TILE);
    const ty0 = Math.floor(minY / TILE);
    const ty1 = Math.floor(maxY / TILE);
    const tiles = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        tiles.push(getTile(tx, ty));
      }
    }
    return tiles;
  }

  function toScreen(x, y) {
    return [(x - camera.x) * scale + width / 2, (y - camera.y) * scale + height / 2];
  }

  function spawnMeteor() {
    const startX = width * (0.45 + Math.random() * 0.5);
    const startY = -30;
    const worldX = camera.x + (startX - width / 2) / scale;
    const worldY = camera.y + (startY - height / 2) / scale;
    const angle = (200 + Math.random() * 25) * (Math.PI / 180);
    const speed = (240 + Math.random() * 140) / scale;
    meteors.push({
      x: worldX,
      y: worldY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * -speed,
      born: performance.now(),
      life: 2200 + Math.random() * 900,
      len: (46 + Math.random() * 40) / scale,
    });
  }

  function updateMeteors(now) {
    if (!focus && now >= nextMeteorAt && meteors.length < METEOR_MAX) {
      spawnMeteor();
      nextMeteorAt = now + METEOR_GAP_MIN + Math.random() * (METEOR_GAP_MAX - METEOR_GAP_MIN);
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      if (now - meteors[i].born > meteors[i].life) meteors.splice(i, 1);
    }
  }

  function drawMeteors(now) {
    for (const m of meteors) {
      const age = now - m.born;
      const t = age / m.life;
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      const worldHx = m.x + (m.vx * age) / 1000;
      const worldHy = m.y + (m.vy * age) / 1000;
      const mag = Math.hypot(m.vx, m.vy) || 1;
      const worldTx = worldHx - (m.vx / mag) * m.len;
      const worldTy = worldHy - (m.vy / mag) * m.len;
      const [hx, hy] = toScreen(worldHx, worldHy);
      const [tx, ty] = toScreen(worldTx, worldTy);

      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, `rgba(255,255,255,${alpha * 0.85})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(hx, hy, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }

  function drawNode(cluster, node) {
    const [sx, sy] = toScreen(node.x, node.y);
    const haloR = Math.max(6, 15 * scale);
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
    halo.addColorStop(0, hexToRgba(cluster.pantheon.color, 0.18));
    halo.addColorStop(1, hexToRgba(cluster.pantheon.color, 0));
    ctx.beginPath();
    ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = cluster.pantheon.color;
    ctx.shadowColor = cluster.pantheon.color;
    ctx.shadowBlur = 7;
    ctx.fill();
  }

  function focusLayout() {
    const t = focus.progress;
    const cluster = focus.cluster;
    const targetCx = width * 0.27;
    const targetCy = height * 0.52;
    const [fcx, fcy] = focus.fromCenter;
    const cx = fcx + (targetCx - fcx) * t;
    const cy = fcy + (targetCy - fcy) * t;
    const targetScale = (width * 0.42) / (2 * clusterMaxRel(cluster));
    const s = focus.fromScale + (targetScale - focus.fromScale) * t;
    const angle = -0.32 * t;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const pts = cluster.nodes.map((node) => {
      const relX = node.x - cluster.cx;
      const relY = node.y - cluster.cy;
      const rx = relX * cosA - relY * sinA;
      const ry = relX * sinA + relY * cosA;
      return { sx: cx + rx * s, sy: cy + ry * s, node };
    });

    return { t, cluster, cx, cy, s, pts };
  }

  function drawFocusStars(t) {
    for (const star of focus.extraStars) {
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${star.alpha * t})`;
      ctx.fill();
    }
  }

  function drawFocused() {
    const { t, cluster, cx, cy, s, pts } = focusLayout();

    drawFocusStars(t);

    ctx.strokeStyle = hexToRgba(cluster.pantheon.color, 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    });
    ctx.stroke();

    for (const p of pts) {
      const haloR = 16 + 30 * t;
      const halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, haloR);
      halo.addColorStop(0, hexToRgba(cluster.pantheon.color, 0.22));
      halo.addColorStop(1, hexToRgba(cluster.pantheon.color, 0));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, haloR, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 3 + 2.5 * t, 0, Math.PI * 2);
      ctx.fillStyle = cluster.pantheon.color;
      ctx.shadowColor = cluster.pantheon.color;
      ctx.shadowBlur = 10;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (t > 0.55) {
      ctx.globalAlpha = Math.min(1, (t - 0.55) / 0.35);
      ctx.font = "600 12px var(--font, sans-serif)";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (const p of pts) {
        ctx.fillText(p.node.name, p.sx + 10, p.sy + 4);
      }
      ctx.font = "900 20px var(--font, sans-serif)";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(cluster.pantheon.name.toUpperCase(), cx, cy - clusterMaxRel(cluster) * s - 34);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const tiles = visibleClusters();
    const dim = focus ? 1 - focus.progress * 0.95 : 1;

    ctx.globalAlpha = dim;
    const starBoost = 1 + Math.max(0, scale - 1) * 0.9;
    for (const tile of tiles) {
      for (const star of tile.stars) {
        const [sx, sy] = toScreen(star.x, star.y);
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, star.alpha * starBoost)})`;
        ctx.fill();
      }
    }

    ctx.lineWidth = 1;
    for (const tile of tiles) {
      for (const [a, b] of tile.threads) {
        if (focus && (focus.cluster.nodes.includes(a) || focus.cluster.nodes.includes(b))) continue;
        const [ax, ay] = toScreen(a.x, a.y);
        const [bx, by] = toScreen(b.x, b.y);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    for (const tile of tiles) {
      for (const cluster of tile.clusters) {
        if (focus && cluster === focus.cluster) continue;
        const [lx, ly] = toScreen(cluster.cx, cluster.cy);
        ctx.font = "600 11px var(--font, sans-serif)";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.34)";
        ctx.fillText(cluster.pantheon.name.toUpperCase(), lx, ly - 92 * scale);

        for (const node of cluster.nodes) {
          drawNode(cluster, node);
        }
      }
    }
    drawMeteors(performance.now());
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (focus) drawFocused();
  }

  let raf = requestAnimationFrame(function tick() {
    updateMeteors(performance.now());
    if (focus) {
      focus.progress += (focus.targetProgress - focus.progress) * FOCUS_EASE;
      if (focus.targetProgress === 0 && focus.progress < 0.003) {
        focus = null;
        canvas.classList.remove("is-focused");
      }
    } else {
      if (!dragging) {
        drive.x -= DRIFT_SPEED / scale;
      }
      if (!dragging && (Math.abs(velocity.x) > 0.02 || Math.abs(velocity.y) > 0.02)) {
        drive.x += velocity.x;
        drive.y += velocity.y;
        velocity.x *= FRICTION;
        velocity.y *= FRICTION;
      }
      camera.x += (drive.x - camera.x) * CAMERA_EASE;
      camera.y += (drive.y - camera.y) * CAMERA_EASE;
    }
    draw();
    raf = requestAnimationFrame(tick);
  });

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const worldX = camera.x + (px - width / 2) / scale;
    const worldY = camera.y + (py - height / 2) / scale;
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);

    let bestNode = null;
    let bestCluster = null;
    let bestDist = PICK_RADIUS;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = getTile(tx + dx, ty + dy);
        for (const cluster of tile.clusters) {
          for (const node of cluster.nodes) {
            const [sx, sy] = toScreen(node.x, node.y);
            const d = Math.hypot(sx - px, sy - py);
            if (d < bestDist) {
              bestDist = d;
              bestNode = node;
              bestCluster = cluster;
            }
          }
        }
      }
    }
    return bestNode ? { node: bestNode, cluster: bestCluster } : null;
  }

  function focusHitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { pts } = focusLayout();
    let best = null;
    let bestDist = 22;
    for (const p of pts) {
      const d = Math.hypot(p.sx - px, p.sy - py);
      if (d < bestDist) {
        bestDist = d;
        best = p.node;
      }
    }
    return best;
  }

  function enterFocus(node, cluster) {
    if (focus) return;
    focus = {
      cluster,
      node,
      progress: 0,
      targetProgress: 1,
      fromCenter: toScreen(cluster.cx, cluster.cy),
      fromScale: scale,
      extraStars: Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.2,
        alpha: 0.1 + Math.random() * 0.45,
      })),
    };
    canvas.classList.add("is-focused");
    onFocus?.({ node, cluster });
  }

  function exitFocus() {
    if (!focus || focus.targetProgress === 0) return;
    focus.targetProgress = 0;
    onUnfocus?.();
  }

  function retarget(node) {
    if (!focus) return;
    focus.node = node;
  }

  let dragging = false;
  let last = { x: 0, y: 0 };
  let moved = 0;
  let samples = [];

  function onPointerDown(event) {
    last = { x: event.clientX, y: event.clientY };
    moved = 0;
    if (focus) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-grabbing");
    velocity.x = 0;
    velocity.y = 0;
    drive.x = camera.x;
    drive.y = camera.y;
    samples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
  }

  function onPointerMove(event) {
    if (focus) return;
    if (!dragging) {
      const hit = hitTest(event.clientX, event.clientY);
      canvas.classList.toggle("is-hover", !!hit);
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    drive.x -= dx / scale;
    drive.y -= dy / scale;
    last = { x: event.clientX, y: event.clientY };
    moved += Math.hypot(dx, dy);
    samples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    if (samples.length > 6) samples.shift();
  }

  function onPointerUp(event) {
    if (focus) {
      const dist = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      if (dist < CLICK_SLOP) {
        const hitNode = focusHitTest(event.clientX, event.clientY);
        if (hitNode && hitNode !== focus.node) {
          focus.node = hitNode;
          onFocus?.({ node: hitNode, cluster: focus.cluster });
        } else if (!hitNode) {
          exitFocus();
        }
      }
      return;
    }
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-grabbing");
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    if (moved < CLICK_SLOP) {
      const hit = hitTest(event.clientX, event.clientY);
      if (hit) enterFocus(hit.node, hit.cluster);
      return;
    }

    const first = samples[0];
    const lastSample = samples[samples.length - 1];
    const dt = Math.max(lastSample.t - first.t, 1);
    velocity.x = (-(lastSample.x - first.x) / dt) * 16 / scale;
    velocity.y = (-(lastSample.y - first.y) / dt) * 16 / scale;
  }

  function onWheel(event) {
    if (focus) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const worldX = camera.x + (px - width / 2) / scale;
    const worldY = camera.y + (py - height / 2) / scale;

    const factor = Math.exp(-event.deltaY * 0.0015);
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));

    camera.x = worldX - (px - width / 2) / scale;
    camera.y = worldY - (py - height / 2) / scale;
    drive.x = camera.x;
    drive.y = camera.y;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    exitFocus,
    retarget,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
