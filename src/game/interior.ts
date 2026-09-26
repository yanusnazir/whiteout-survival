import type { Game } from "./engine";
import { drawPlayer } from "./render";
import type { Entity } from "./types";

// Interior view of the player's own shelter, looking out through the entrance.
// Outside: cold blue snow, falling/blowing flakes, the real campfire (with its real fuel).
// Inside: dim, warm, primitive walls matching the shelter's current tier.

interface Flake { x: number; y: number; z: number; ph: number; }
let flakes: Flake[] = [];
let lastT = 0;
let flick = 1, flickTick = 0;

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function renderInterior(g: Game, shelter: Entity) {
  const ctx = g.ctx;
  const W = g.w, H = g.h;
  const now = performance.now();
  const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016);
  lastT = now;
  const tSec = now / 1000;
  const day = g.daylight();
  const night = 1 - day;
  const tier = Math.min(3, shelter.tier || 1);
  const sleeping = g.resting;
  const S = Math.min(W, H * 1.4) / 900; // global scale

  // --- the real campfire outside ---
  const fire = g.campFireNear(shelter);
  const burning = !!fire && fire.kind === "fire" && (fire.fuel || 0) > 0;
  const fuel = burning ? fire!.fuel || 0 : 0;
  flickTick++;
  if (flickTick % 3 === 0) flick += ((0.84 + Math.random() * 0.32) - flick) * 0.5;
  const fireK = burning ? Math.min(1, fuel / 40 + 0.3) : 0;
  const fireL = fireK * flick;

  // --- geometry: back wall with the entrance, perspective side walls, floor, roof ---
  const floorY = H * 0.74;
  const bx0 = W * 0.15, bx1 = W * 0.85, bTop = H * 0.14;
  let opening: [number, number][];
  if (tier === 1) opening = [[W * 0.22, floorY], [W * 0.22, H * 0.42], [W * 0.82, H * 0.2], [W * 0.82, floorY]]; // open lean-to side
  else if (tier === 2) opening = [[W * 0.37, floorY], [W * 0.37, H * 0.38], [W * 0.63, H * 0.38], [W * 0.63, floorY]]; // doorway
  else opening = [[W * 0.38, floorY], [W * 0.38, H * 0.41], [W * 0.5, H * 0.34], [W * 0.62, H * 0.41], [W * 0.62, floorY]]; // hut door
  const opX0 = opening[0][0], opX1 = opening[opening.length - 1][0];
  const opCx = (opX0 + opX1) / 2;
  const opTop = Math.min(...opening.map((p) => p[1]));

  // ================= OUTSIDE =================
  const horizon = H * 0.5;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, rgb(mix([7, 12, 30], [140, 170, 210], day)));
  sky.addColorStop(1, rgb(mix([30, 44, 78], [205, 222, 240], day)));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 2);
  // moonlit snowfield
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, rgb(mix([58, 74, 108], [214, 228, 244], day)));
  ground.addColorStop(1, rgb(mix([84, 104, 142], [196, 214, 236], day)));
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);
  // distant tree silhouettes along the horizon
  for (let i = 0; i < 26; i++) {
    const x = hash(i + shelter.id) * W;
    const h = (18 + hash(i * 3.1) * 46) * S * 1.6;
    const w = h * 0.36;
    ctx.fillStyle = rgb(mix([16, 24, 42], [70, 98, 96], day), 0.85);
    ctx.beginPath();
    ctx.moveTo(x, horizon - h); ctx.lineTo(x - w, horizon + 2); ctx.lineTo(x + w, horizon + 2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgb(mix([120, 140, 175], [245, 250, 255], day), 0.35);
    ctx.beginPath();
    ctx.moveTo(x, horizon - h); ctx.lineTo(x - w * 0.35, horizon - h * 0.6); ctx.lineTo(x + w * 0.35, horizon - h * 0.6); ctx.closePath();
    ctx.fill();
  }
  // moonlight on the snow
  if (night > 0.1) {
    const mg = ctx.createRadialGradient(W * 0.7, horizon - H * 0.3, 0, W * 0.7, horizon - H * 0.3, H * 0.8);
    mg.addColorStop(0, `rgba(170,195,235,${0.12 * night * (1 - g.storm * 0.7)})`);
    mg.addColorStop(1, "rgba(170,195,235,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
  }

  // campfire just beyond the entrance
  const fx = opCx + (tier === 1 ? W * 0.05 : 0);
  const fy = floorY - H * 0.055;
  const fs = S * (tier === 1 ? 2.2 : 1.9);
  if (fire) {
    // warm light spilling across the snow outside
    if (burning) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const r = 260 * fs * flick;
      const gl = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      gl.addColorStop(0, `rgba(255,150,60,${0.45 * fireK * (0.5 + night * 0.5)})`);
      gl.addColorStop(0.5, `rgba(255,110,30,${0.14 * fireK * (0.5 + night * 0.5)})`);
      gl.addColorStop(1, "rgba(255,100,20,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
      ctx.restore();
    }
    // stone ring
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.fillStyle = rgb(mix([40, 44, 56], [120, 126, 138], day * 0.7 + fireL * 0.2));
      ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 26 * fs, fy + Math.sin(a) * 7 * fs, 7 * fs, 4.5 * fs, 0, 0, Math.PI * 2); ctx.fill();
    }
    // logs
    ctx.strokeStyle = burning ? "#3a2616" : "#2a2622"; ctx.lineWidth = 5 * fs; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(fx - 16 * fs, fy + 3 * fs); ctx.lineTo(fx + 14 * fs, fy - 4 * fs);
    ctx.moveTo(fx - 12 * fs, fy - 4 * fs); ctx.lineTo(fx + 16 * fs, fy + 3 * fs); ctx.stroke();
    if (burning) {
      const hk = 0.45 + Math.min(1, fuel / 45) * 0.65;
      for (let i = 0; i < 4; i++) {
        const w = Math.sin(tSec * (7 + i * 2.3) + i) * 0.25 + 0.8;
        const fh = (46 - i * 10) * fs * w * hk;
        const fw = (15 - i * 3) * fs;
        const sway = Math.sin(tSec * 3 + i) * 3 * fs - g.storm * 5 * fs;
        ctx.fillStyle = ["#e0520f", "#ff8a1f", "#ffb347", "#ffe39a"][i];
        ctx.beginPath();
        ctx.moveTo(fx + sway, fy - fh);
        ctx.quadraticCurveTo(fx + fw, fy - fh * 0.3, fx + fw * 0.6, fy);
        ctx.lineTo(fx - fw * 0.6, fy);
        ctx.quadraticCurveTo(fx - fw, fy - fh * 0.3, fx + sway, fy - fh);
        ctx.fill();
      }
      // rising embers & smoke
      for (let i = 0; i < 6; i++) {
        const p = (tSec * 0.35 + i / 6) % 1;
        const ex = fx + Math.sin(tSec * 1.3 + i * 2) * 10 * fs - p * g.storm * 60 * fs;
        const ey = fy - 30 * fs - p * 120 * fs;
        ctx.fillStyle = `rgba(255,170,80,${(1 - p) * 0.8 * fireK})`;
        ctx.fillRect(ex, ey, 1.6 * fs, 1.6 * fs);
        ctx.fillStyle = `rgba(150,150,160,${(1 - p) * 0.12})`;
        ctx.beginPath(); ctx.arc(fx + p * 30 * fs - p * g.storm * 90 * fs, fy - 50 * fs - p * 150 * fs, (6 + p * 16) * fs, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // cold, dead fire: a little snow settling on the ash
      ctx.fillStyle = "rgba(220,230,245,0.35)";
      ctx.beginPath(); ctx.ellipse(fx, fy, 14 * fs, 4 * fs, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // falling / blowing snow outside
  const target = g.weather === "storm" ? 240 : g.weather === "snow" ? 120 : 40;
  while (flakes.length < target) flakes.push({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6 });
  if (flakes.length > target) flakes.length = target;
  const wind = g.weather === "storm" ? -300 : g.weather === "snow" ? -50 : -14;
  for (const f of flakes) {
    f.x += (wind * f.z + Math.sin(tSec * 1.4 + f.ph) * 14) * dt;
    f.y += (30 + 70 * f.z + g.storm * 140) * dt * (0.6 + f.z * 0.5);
    if (f.y > floorY + 6) { f.y = opTop - 20 - Math.random() * 60; f.x = Math.random() * W; }
    if (f.x < -10) f.x = W + 10;
    if (f.x > W + 10) f.x = -10;
    const dFire = Math.hypot(f.x - fx, f.y - fy);
    const warm = burning && dFire < 200 * fs ? (1 - dFire / (200 * fs)) * fireK : 0;
    const c = mix(mix([185, 202, 232], [255, 255, 255], day), [255, 200, 150], warm);
    ctx.fillStyle = rgb(c, 0.5 + f.z * 0.35);
    ctx.beginPath(); ctx.arc(f.x, f.y, (0.7 + f.z * 1.6) * S * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  // storm veil outside
  if (g.storm > 0.2) {
    ctx.fillStyle = rgb(mix([80, 94, 124], [225, 235, 246], day), (g.storm - 0.2) * 0.4);
    ctx.fillRect(0, 0, W, floorY);
  }

  // ================= INSIDE =================
  const insideClip = () => {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(opening[0][0], opening[0][1]);
    for (let i = 1; i < opening.length; i++) ctx.lineTo(opening[i][0], opening[i][1]);
    ctx.closePath();
    ctx.clip("evenodd");
  };
  ctx.save();
  insideClip();

  const lit = 0.35 + day * 0.35; // how much outside light reaches the interior
  const wallBase: RGB = tier === 1 ? [58, 44, 30] : tier === 2 ? [74, 54, 36] : [92, 66, 44];
  const wallC = mix([22, 18, 16], wallBase, lit);
  const dark = mix([10, 8, 8], [40, 32, 26], lit);

  // back wall
  ctx.fillStyle = rgb(wallC);
  ctx.fillRect(bx0, bTop, bx1 - bx0, floorY - bTop);
  // side walls, roof and floor (perspective)
  const quad = (pts: number[], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  };
  quad([0, 0, bx0, bTop, bx0, floorY, 0, H], rgb(mix(dark, wallC, 0.7)));
  quad([W, 0, bx1, bTop, bx1, floorY, W, H], rgb(mix(dark, wallC, 0.55)));
  quad([0, 0, W, 0, bx1, bTop, bx0, bTop], rgb(mix(dark, wallC, 0.45)));
  quad([0, H, bx0, floorY, bx1, floorY, W, H], rgb(mix([18, 16, 14], [66, 58, 46], lit)));

  // --- wall construction by tier ---
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, c: string) => {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  const poleC = rgb(mix([30, 22, 14], [104, 78, 52], lit));
  const poleHi = rgb(mix([40, 30, 20], [140, 108, 72], lit), 0.6);
  const gapC = `rgba(${90 + day * 100},${110 + day * 100},${150 + day * 80},${0.18 + night * 0.08})`;
  if (tier === 1) {
    // leaning branch poles: cold light leaks through the gaps
    ctx.fillStyle = gapC;
    ctx.fillRect(bx0, bTop, bx1 - bx0, floorY - bTop);
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      const xTop = bx0 + (bx1 - bx0) * t;
      line(xTop, bTop - 4, xTop - 40 * S, floorY, 12 * S, poleC);
      line(xTop + 3 * S, bTop, xTop - 37 * S, floorY, 2 * S, poleHi);
    }
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      line(0, H * t * 0.2, bx0, bTop + (floorY - bTop) * t, 14 * S, poleC);
      line(W, H * t * 0.2, bx1, bTop + (floorY - bTop) * t, 14 * S, poleC);
      line(W * t, 0, bx0 + (bx1 - bx0) * t, bTop, 12 * S, poleC);
    }
    // lashing cord
    line(bx0, bTop + 20 * S, bx1, bTop + 20 * S, 3 * S, rgb(mix([40, 34, 20], [150, 130, 90], lit), 0.7));
  } else {
    // stacked logs chinked with packed snow
    const logs = 9;
    for (let i = 0; i < logs; i++) {
      const y0 = bTop + ((floorY - bTop) / logs) * i;
      const lh = (floorY - bTop) / logs;
      ctx.fillStyle = rgb(mix(wallC, [0, 0, 0], (i % 2) * 0.12));
      ctx.fillRect(bx0, y0 + 1, bx1 - bx0, lh - 2);
      line(bx0, y0 + lh * 0.3, bx1, y0 + lh * 0.3, 2 * S, poleHi);
      line(bx0, y0, bx1, y0, 2.5 * S, rgb(mix([60, 70, 90], [220, 230, 240], day), 0.35));
      // side walls follow the perspective
      const ty = y0 / H;
      line(0, H * ty * 0.1 + ty * H * 0.9 * 1.0 * 0 + (y0 - bTop) / (floorY - bTop) * H, bx0, y0, 2 * S, rgb(dark, 0.6));
      line(W, (y0 - bTop) / (floorY - bTop) * H, bx1, y0, 2 * S, rgb(dark, 0.6));
    }
    // log ends at the corners
    for (let i = 0; i < logs; i++) {
      const y = bTop + ((floorY - bTop) / logs) * (i + 0.5);
      for (const x of [bx0, bx1]) {
        ctx.fillStyle = rgb(mix([40, 30, 20], [150, 118, 80], lit));
        ctx.beginPath(); ctx.ellipse(x, y, 7 * S, ((floorY - bTop) / logs) * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // A-frame rafters overhead
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      line(W * t, 0, bx0 + (bx1 - bx0) * t, bTop, 11 * S, poleC);
    }
    line(bx0, bTop, bx1, bTop, 14 * S, poleC);
    if (tier === 3) {
      // hide panels stitched over the logs (insulation), fur lining the roof
      const hideC = rgb(mix([46, 32, 22], [128, 92, 60], lit), 0.92);
      const panels: [number, number, number, number][] = [
        [bx0 + 6 * S, bTop + 10 * S, opX0 - 12 * S, floorY - 8 * S],
        [opX1 + 12 * S, bTop + 10 * S, bx1 - 6 * S, floorY - 8 * S],
      ];
      for (const [x0, y0, x1, y1] of panels) {
        ctx.fillStyle = hideC;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + 6 * S); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 6 * S, x1, y0 + 6 * S);
        ctx.lineTo(x1 - 4 * S, y1); ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 8 * S, x0 + 4 * S, y1);
        ctx.closePath(); ctx.fill();
        ctx.setLineDash([4 * S, 5 * S]);
        ctx.strokeStyle = rgb(mix([30, 22, 14], [200, 170, 120], lit), 0.6); ctx.lineWidth = 1.5 * S;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      quad([W * 0.05, 0, W * 0.95, 0, bx1 - 10 * S, bTop - 2 * S, bx0 + 10 * S, bTop - 2 * S], rgb(mix([40, 28, 20], [118, 86, 58], lit), 0.85));
      quad([0, H * 0.05, bx0 - 4 * S, bTop + 30 * S, bx0 - 4 * S, floorY - 30 * S, 0, H * 0.8], hideC);
      quad([W, H * 0.05, bx1 + 4 * S, bTop + 30 * S, bx1 + 4 * S, floorY - 30 * S, W, H * 0.8], hideC);
    }
  }

  // floor: spruce boughs, and in the hut a fur rug
  for (let i = 0; i < 90; i++) {
    const u = hash(i * 7.7), v = hash(i * 3.3 + 1);
    const y = floorY + (H - floorY) * v;
    const spread = (y - floorY) / (H - floorY);
    const x = bx0 * (1 - spread) + (bx1 - bx0 + (W - (bx1 - bx0)) * spread) * u + (1 - spread) * 0 - spread * 0;
    const len = (10 + v * 18) * S;
    line(x, y, x + len, y - len * 0.25, 2.2 * S, rgb(mix([14, 22, 16], [44, 70, 46], lit), 0.8));
  }

  // sleeping area: a bed of boughs along the left, hide on top as the shelter improves
  const bedX = W * 0.05, bedY = H * 0.9, bedW = W * 0.42, bedH = H * 0.1;
  ctx.fillStyle = rgb(mix([16, 26, 18], [52, 80, 52], lit));
  ctx.beginPath(); ctx.ellipse(bedX + bedW / 2, bedY, bedW / 2, bedH, -0.05, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 26; i++) {
    const a = hash(i + 50) * Math.PI * 2;
    const r = hash(i + 80);
    const x = bedX + bedW / 2 + Math.cos(a) * bedW * 0.45 * r, y = bedY + Math.sin(a) * bedH * 0.8 * r;
    line(x, y, x + 16 * S, y - 3 * S, 2.5 * S, rgb(mix([10, 20, 12], [60, 96, 60], lit)));
  }
  if (tier >= 2) {
    ctx.fillStyle = rgb(mix([42, 30, 20], [130, 96, 62], lit));
    ctx.beginPath(); ctx.ellipse(bedX + bedW / 2, bedY - 4 * S, bedW * 0.42, bedH * 0.7, -0.05, 0, Math.PI * 2); ctx.fill();
  }
  if (tier >= 3) {
    ctx.fillStyle = rgb(mix([50, 44, 38], [170, 150, 126], lit), 0.9);
    ctx.beginPath(); ctx.ellipse(W * 0.66, H * 0.94, W * 0.16, H * 0.05, 0.05, 0, Math.PI * 2); ctx.fill();
  }

  // small personal things: firewood stacked inside by the wall
  const woodN = Math.min(6, g.inventory.wood || 0);
  for (let i = 0; i < woodN; i++) {
    const x = W * 0.86 + (i % 3) * 16 * S, y = H * 0.83 - Math.floor(i / 3) * 12 * S;
    ctx.fillStyle = rgb(mix([40, 28, 18], [120, 86, 54], lit));
    ctx.beginPath(); ctx.ellipse(x, y, 8 * S, 6 * S, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgb(mix([60, 48, 34], [196, 162, 118], lit));
    ctx.beginPath(); ctx.ellipse(x, y, 4 * S, 3 * S, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- the survivor ----
  const k = (H / 150) * 0.9;
  const pf = g.pfacing;
  if (sleeping) {
    // lying on the bed under a hide
    const breath = Math.sin(tSec * 1.3) * 0.02;
    ctx.save();
    ctx.translate(bedX + bedW * 0.86, bedY - 2 * S);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(k * 0.95, k * (0.95 + breath));
    g.pfacing = 1;
    drawPlayer(g, g.px, g.py);
    ctx.restore();
    ctx.fillStyle = rgb(mix([40, 28, 18], [122, 88, 56], lit + fireL * 0.15));
    ctx.beginPath();
    ctx.moveTo(bedX + bedW * 0.9, bedY - 8 * S);
    ctx.quadraticCurveTo(bedX + bedW * 0.6, bedY - 30 * S - breath * 200 * S, bedX + bedW * 0.28, bedY - 14 * S);
    ctx.lineTo(bedX + bedW * 0.3, bedY + 8 * S);
    ctx.lineTo(bedX + bedW * 0.92, bedY + 8 * S);
    ctx.closePath(); ctx.fill();
    // soft Zzz
    ctx.font = `${Math.round(14 * S * 1.6)}px ui-sans-serif, system-ui`;
    for (let i = 0; i < 3; i++) {
      const p = (tSec * 0.25 + i / 3) % 1;
      ctx.fillStyle = `rgba(220,230,255,${Math.sin(p * Math.PI) * 0.4})`;
      ctx.fillText("z", bedX + bedW * 0.2 + p * 30 * S, bedY - 50 * S - p * 60 * S);
    }
  } else {
    // standing inside, looking out toward the fire
    ctx.save();
    ctx.translate(W * 0.7, H * 0.985);
    ctx.scale(k, k);
    g.pfacing = -1;
    drawPlayer(g, g.px, g.py);
    ctx.restore();
  }
  g.pfacing = pf;

  // ---- interior lighting ----
  // dim, warm-dark base
  ctx.fillStyle = `rgba(12,8,6,${0.18 + night * 0.34 + (sleeping ? 0.08 : 0)})`;
  ctx.fillRect(0, 0, W, H);
  // cold light seeping in (strongest when the fire is out)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cold = ctx.createRadialGradient(opCx, floorY, 0, opCx, floorY, H * 0.7);
  cold.addColorStop(0, `rgba(80,110,170,${(0.05 + night * 0.06) * (1 - fireK * 0.7)})`);
  cold.addColorStop(1, "rgba(80,110,170,0)");
  ctx.fillStyle = cold;
  ctx.fillRect(0, 0, W, H);
  // warm firelight entering through the doorway and washing across the floor & walls
  if (burning) {
    const strength = fireL * (0.55 + night * 0.45);
    const wg = ctx.createRadialGradient(fx, fy, 0, fx, fy, H * (tier === 1 ? 1.1 : 0.95));
    wg.addColorStop(0, `rgba(255,150,70,${0.34 * strength})`);
    wg.addColorStop(0.35, `rgba(255,120,50,${0.14 * strength})`);
    wg.addColorStop(1, "rgba(255,100,40,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);
    // a wedge of light on the floor through the opening
    const spread = W * 0.25;
    const fl = ctx.createLinearGradient(0, floorY, 0, H);
    fl.addColorStop(0, `rgba(255,150,70,${0.22 * strength})`);
    fl.addColorStop(1, `rgba(255,130,60,0)`);
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.moveTo(opX0, floorY); ctx.lineTo(opX1, floorY);
    ctx.lineTo(opX1 + spread, H); ctx.lineTo(opX0 - spread, H);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.restore(); // end inside clip

  // doorway frame shadow + threshold
  ctx.save();
  ctx.strokeStyle = "rgba(10,7,5,0.8)";
  ctx.lineWidth = 7 * S;
  ctx.beginPath();
  ctx.moveTo(opening[0][0], opening[0][1]);
  for (let i = 1; i < opening.length; i++) ctx.lineTo(opening[i][0], opening[i][1]);
  ctx.stroke();
  // snow drifted into the threshold
  ctx.fillStyle = rgb(mix([96, 112, 146], [228, 238, 248], day), 0.85);
  ctx.beginPath();
  ctx.ellipse(opCx, floorY + 3 * S, (opX1 - opX0) * 0.5, 7 * S, 0, 0, Math.PI);
  ctx.fill();
  if (tier === 3) {
    // hide door flap tied back
    ctx.fillStyle = rgb(mix([40, 28, 18], [120, 86, 56], 0.3 + day * 0.4 + fireL * 0.15));
    ctx.beginPath();
    ctx.moveTo(opX0 - 4 * S, opTop + 6 * S);
    ctx.lineTo(opX0 + 26 * S, opTop + 12 * S);
    ctx.quadraticCurveTo(opX0 + 12 * S, (opTop + floorY) / 2, opX0 + 16 * S + Math.sin(tSec * 2) * g.storm * 4 * S, floorY - 10 * S);
    ctx.lineTo(opX0 - 4 * S, floorY);
    ctx.closePath(); ctx.fill();
    line(opX0 - 4 * S, (opTop + floorY) * 0.5, opX0 + 18 * S, (opTop + floorY) * 0.52, 3 * S, "rgba(190,160,110,0.7)");
  }
  ctx.restore();

  // snow gusting in through the opening during storms
  if (g.storm > 0.4) {
    for (let i = 0; i < 18; i++) {
      const p = (tSec * (0.6 + hash(i) * 0.5) + hash(i + 9)) % 1;
      const x = opCx + (hash(i + 3) - 0.5) * (opX1 - opX0) - p * W * 0.15;
      const y = opTop + (floorY - opTop) * hash(i + 5) + p * (H - floorY) * 0.9;
      ctx.fillStyle = `rgba(210,222,245,${(1 - p) * 0.5 * g.storm})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6 * S, 0, Math.PI * 2); ctx.fill();
    }
  }

  // cosy vignette (heavier while sleeping)
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(4,3,2,${sleeping ? 0.78 : 0.6})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
