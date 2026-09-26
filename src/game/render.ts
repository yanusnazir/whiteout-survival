import { WORLD_SIZE } from "./data";
import type { Game } from "./engine";
import type { Entity } from "./types";
import { renderInterior } from "./interior";

export function render(g: Game) {
  // inside the shelter: draw the interior view instead of the world
  if (g.interiorActive()) {
    const sh = g.interiorShelter();
    if (sh) { renderInterior(g, sh); return; }
  }
  const ctx = g.ctx;
  const daylight = daylightAt(g.time);

  // camera shake
  let sx = 0, sy = 0;
  if (g.shake > 0) { sx = (Math.random() - 0.5) * g.shake; sy = (Math.random() - 0.5) * g.shake; }
  const camX = g.camX - sx;
  const camY = g.camY - sy;

  // ground snow. At night the snow itself holds a soft blue-white moonlight.
  const night = 1 - daylight;
  const topCol = lerpColor([66, 84, 120], [214, 232, 248], daylight);
  const botCol = lerpColor([80, 99, 138], [188, 210, 232], daylight);
  const grd = ctx.createLinearGradient(0, 0, 0, g.h);
  grd.addColorStop(0, `rgb(${topCol.join(",")})`);
  grd.addColorStop(1, `rgb(${botCol.join(",")})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, g.w, g.h);

  // snow texture: drifts catch the light (brighter crests, soft blue hollows)
  ctx.save();
  const cell = 46;
  const startX = Math.floor(camX / cell) * cell;
  const startY = Math.floor(camY / cell) * cell;
  const tNow = performance.now() / 1000;
  for (let x = startX; x < camX + g.w + cell; x += cell) {
    for (let y = startY; y < camY + g.h + cell; y += cell) {
      const n = pseudo(x, y);
      if (n > 0.7) {
        const dx = x - camX + n * 30, dy = y - camY + n * 20;
        // hollow shadow
        ctx.globalAlpha = 0.05 + night * 0.05;
        ctx.fillStyle = daylight > 0.4 ? "#9fb6d6" : "#2a3a5c";
        ctx.beginPath(); ctx.ellipse(dx + 2, dy + 2, 5 + n * 5, 2 + n * 2, 0, 0, Math.PI * 2); ctx.fill();
        // drift crest catching light
        ctx.globalAlpha = 0.06 + daylight * 0.04 + night * 0.05;
        ctx.fillStyle = daylight > 0.4 ? "#ffffff" : "#c3d3ee";
        ctx.beginPath(); ctx.ellipse(dx, dy, 4 + n * 5, 1.6 + n * 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (night > 0.3 && n < 0.035) {
        // rare, very faint moonlight glints on the snow crust
        const tw = 0.5 + 0.5 * Math.sin(tNow * (1.2 + n * 30) + x * 0.13 + y * 0.07);
        ctx.globalAlpha = night * 0.3 * tw;
        ctx.fillStyle = "#e6efff";
        ctx.fillRect(x - camX + n * 600 % cell, y - camY + (n * 900) % cell, 1.4, 1.4);
      }
    }
  }
  ctx.restore();

  // world border (edge of map darkens)
  drawWorldEdge(g, camX, camY);

  // sort entities by y for depth
  const vis = g.entities
    .filter((e) => e.x > camX - 120 && e.x < camX + g.w + 120 && e.y > camY - 160 && e.y < camY + g.h + 120)
    .sort((a, b) => a.y - b.y);

  // draw ground-level things first (tracks, water, fire base, trap)
  for (const e of vis) if (isGround(e)) drawEntity(g, e, camX, camY, daylight);
  // draw upright things + player interleaved by y
  const upright = vis.filter((e) => !isGround(e));
  let drewPlayer = false;
  for (const e of upright) {
    if (!drewPlayer && e.y > g.py) { drawPlayer(g, camX, camY); drewPlayer = true; }
    drawEntity(g, e, camX, camY, daylight);
  }
  if (!drewPlayer) drawPlayer(g, camX, camY);

  // flying spears
  for (const p of g.projectiles) {
    ctx.save();
    ctx.translate(p.x - camX, p.y - camY);
    ctx.rotate(p.angle);
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(20, 0); ctx.lineTo(12, 3); ctx.fill();
    ctx.restore();
  }

  // particles (snow is drawn under the lighting so flakes stay subtle at night;
  // they pick up a little moonlight and firelight from the layers above)
  for (const p of g.particles) {
    const a = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = p.kind === "snow" ? 0.85 - night * 0.2 : a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // night lighting: moonlit snow, distance falloff, warm firelight
  drawLighting(g, camX, camY, daylight);

  // embers are light sources themselves: redraw them above the darkness
  if (night > 0.15) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of g.particles) {
      if (p.kind !== "spark") continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife)) * night * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, p.size * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // floaters (feedback text stays readable at night)
  ctx.textAlign = "center";
  ctx.font = "bold 15px ui-sans-serif, system-ui";
  for (const fl of g.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, fl.life));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(fl.text, fl.x - camX + 1, fl.y - camY + 1);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x - camX, fl.y - camY);
  }
  ctx.globalAlpha = 1;

  // storm whiteout: bright by day, a cold grey-blue veil at night
  if (g.storm > 0.15) {
    const sc = lerpColor([78, 92, 120], [220, 232, 245], daylight);
    ctx.fillStyle = `rgba(${sc.join(",")},${(g.storm - 0.15) * 0.45})`;
    ctx.fillRect(0, 0, g.w, g.h);
  }

  // vignette (gentle: distance darkening at night is handled by the lighting pass)
  const vg = ctx.createRadialGradient(g.w / 2, g.h / 2, g.h * 0.3, g.w / 2, g.h / 2, g.h * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${0.3 + night * 0.06})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, g.w, g.h);

  // hurt flash
  if (g.hurtFlash > 0) {
    ctx.fillStyle = `rgba(180,20,20,${g.hurtFlash * 0.4})`;
    ctx.fillRect(0, 0, g.w, g.h);
    g.hurtFlash = Math.max(0, g.hurtFlash - 0.02);
  }
  // freezing tint
  if (g.temp < 30) {
    ctx.fillStyle = `rgba(120,170,255,${(30 - g.temp) / 30 * 0.3})`;
    ctx.fillRect(0, 0, g.w, g.h);
  }

  // aim line + objective guide are drawn above lighting so they stay readable at night
  drawAim(g, camX, camY);
  drawGuide(g, camX, camY);
}

function drawAim(g: Game, camX: number, camY: number) {
  if (!g.has("spear") || !g.animalNear || g.carrying) return;
  const ctx = g.ctx;
  const x = g.px - camX, y = g.py - 22 - camY;
  const ok = !!g.aimTarget;
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -Date.now() / 40;
  ctx.strokeStyle = ok ? "rgba(132,255,120,0.85)" : "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ok) {
    const t = g.aimTarget!;
    ctx.moveTo(x, y); ctx.lineTo(t.x - camX, t.y - 10 - camY);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x + g.aimX * 290, y + g.aimY * 290);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (ok) {
    const t = g.aimTarget!;
    const tx = t.x - camX, ty = t.y - 10 - camY;
    ctx.strokeStyle = "rgba(132,255,120,0.9)";
    ctx.beginPath(); ctx.arc(tx, ty, 16 + Math.sin(Date.now() / 150) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - 22, ty); ctx.lineTo(tx - 10, ty); ctx.moveTo(tx + 10, ty); ctx.lineTo(tx + 22, ty); ctx.stroke();
  }
  ctx.restore();
}

function drawGuide(g: Game, camX: number, camY: number) {
  const t = g.guideT;
  if (!t) return;
  const ctx = g.ctx;
  const sx = t.x - camX, sy = t.y - camY;
  const d = Math.hypot(t.x - g.px, t.y - g.py);
  const m = 56;
  const onScreen = sx > m && sx < g.w - m && sy > m + 40 && sy < g.h - m;
  const bob = Math.sin(Date.now() / 220) * 5;
  ctx.save();
  ctx.font = "bold 12px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  if (onScreen) {
    if (d < 60) { ctx.restore(); return; }
    const y = sy - 58 + bob;
    ctx.fillStyle = "#fcd34d";
    ctx.beginPath(); ctx.moveTo(sx - 9, y - 10); ctx.lineTo(sx + 9, y - 10); ctx.lineTo(sx, y + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    const w = ctx.measureText(t.label).width + 12;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.roundRect(sx - w / 2, y - 30, w, 17, 6); ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.fillText(t.label, sx, y - 17);
  } else {
    const cx = g.w / 2, cy = g.h / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const hw = g.w / 2 - m, hh = g.h / 2 - m - 20;
    const k = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
    const ax = cx + Math.cos(ang) * k, ay = cy + 10 + Math.sin(ang) * k;
    ctx.translate(ax, ay);
    ctx.save();
    ctx.rotate(ang);
    ctx.translate(bob * 0.6, 0);
    ctx.fillStyle = "#fcd34d";
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    const label = `${t.label} · ${Math.round(d / 20)}m`;
    const w = ctx.measureText(label).width + 12;
    const ly = Math.sin(ang) > 0.5 ? -30 : 26;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.roundRect(-w / 2, ly - 12, w, 17, 6); ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.fillText(label, 0, ly + 1);
  }
  ctx.restore();
}

function isGround(e: Entity) {
  return ["trackRabbit", "trackDeer", "waterHole", "trap", "fire", "firePit", "snowPile", "looseBranch", "looseStone", "stump", "buildSite", "carcass", "spearOnGround"].includes(e.kind);
}

// Darkness is painted on its own layer so light "holes" reveal the scene
// underneath instead of erasing it to black.
let lightLayer: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;
let flickT = 0, flickV = 1;

function drawLighting(g: Game, camX: number, camY: number, daylight: number) {
  const night = 1 - daylight;
  const stormDim = g.storm * 0.14;
  const ctx = g.ctx;

  // slow, organic fire flicker shared by all fires (no per-frame strobing)
  flickT += 1;
  if (flickT % 4 === 0) flickV += ((0.88 + Math.random() * 0.24) - flickV) * 0.5;

  const fires = g.entities.filter((e) => e.kind === "fire" && (e.fuel || 0) > 0);

  if (night > 0.02 || stormDim > 0.02) {
    const W = Math.floor(g.w * g.dpr), H = Math.floor(g.h * g.dpr);
    if (!lightLayer) { lightLayer = document.createElement("canvas"); lightCtx = lightLayer.getContext("2d"); }
    if (lightLayer.width !== W || lightLayer.height !== H) { lightLayer.width = W; lightLayer.height = H; }
    const lc = lightCtx!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, W, H);
    lc.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);

    const px = g.px - camX, py = g.py - 20 - camY;

    // LAYER 1: cold moonlit dusk. A light, even veil; the snow stays readable.
    lc.fillStyle = `rgba(6,11,28,${night * 0.3 + stormDim})`;
    lc.fillRect(0, 0, g.w, g.h);

    // distance: near the survivor stays clear, the far snow fades into silhouettes
    const far = Math.hypot(g.w, g.h) * 0.62;
    const dg = lc.createRadialGradient(px, py, Math.min(g.w, g.h) * 0.16, px, py, far);
    dg.addColorStop(0, "rgba(4,8,22,0)");
    dg.addColorStop(0.55, `rgba(4,8,22,${night * 0.16})`);
    dg.addColorStop(1, `rgba(4,8,22,${night * 0.36})`);
    lc.fillStyle = dg;
    lc.fillRect(0, 0, g.w, g.h);

    // LAYER 3 (cut-outs): firelight pushes back the dark; the survivor's eyes adjust a little
    lc.globalCompositeOperation = "destination-out";
    const hole = (x: number, y: number, r: number, s: number) => {
      const rg = lc.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(0,0,0,${s})`);
      rg.addColorStop(0.45, `rgba(0,0,0,${s * 0.7})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = rg;
      lc.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(px, py, g.has("torch") ? 230 : 150, g.has("torch") ? 0.75 : 0.35);
    for (const f of fires) {
      const k = Math.min(1, (f.fuel || 0) / 35 + 0.4);
      hole(f.x - camX, f.y - 8 - camY, 300 * k * flickV, 0.97);
    }
    ctx.drawImage(lightLayer, 0, 0, g.w, g.h);
  }

  // LAYER 1b: the moon. A faint cold wash from above that lifts the snow's blue-white tone.
  if (night > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const mg = ctx.createRadialGradient(g.w * 0.8, -g.h * 0.2, 0, g.w * 0.8, -g.h * 0.2, Math.hypot(g.w, g.h) * 1.1);
    mg.addColorStop(0, `rgba(150,176,224,${night * 0.13 * (1 - g.storm * 0.6)})`);
    mg.addColorStop(0.6, `rgba(110,136,190,${night * 0.05 * (1 - g.storm * 0.6)})`);
    mg.addColorStop(1, "rgba(80,100,150,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.restore();
  }

  // LAYER 3: warm firelight. The strongest local light, orange against the cold blue snow.
  if (fires.length) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const warmth = 0.45 + night * 0.55;
    for (const f of fires) {
      const x = f.x - camX, y = f.y - 8 - camY;
      const k = Math.min(1, (f.fuel || 0) / 35 + 0.35) * warmth;
      // tight bright core
      const r1 = 150 * flickV;
      const g1 = ctx.createRadialGradient(x, y, 0, x, y, r1);
      g1.addColorStop(0, `rgba(255,176,90,${0.42 * k})`);
      g1.addColorStop(0.5, `rgba(255,132,48,${0.16 * k})`);
      g1.addColorStop(1, "rgba(255,110,30,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(x - r1, y - r1, r1 * 2, r1 * 2);
      // wide soft warm spill across the snow (fades into moonlight)
      const r2 = 290 * flickV;
      const g2 = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, r2);
      g2.addColorStop(0, `rgba(255,140,60,${0.12 * k * night})`);
      g2.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(x - r2, y + 10 - r2, r2 * 2, r2 * 2);
    }
    ctx.restore();
  }
}

function drawWorldEdge(g: Game, camX: number, camY: number) {
  const ctx = g.ctx;
  ctx.fillStyle = "rgba(10,14,26,0.9)";
  const edge = 40;
  // left
  if (camX < edge) ctx.fillRect(0, 0, edge - camX, g.h);
  if (camX + g.w > WORLD_SIZE - edge) {
    const x = WORLD_SIZE - edge - camX;
    ctx.fillRect(x, 0, g.w - x, g.h);
  }
  if (camY < edge) ctx.fillRect(0, 0, g.w, edge - camY);
  if (camY + g.h > WORLD_SIZE - edge) {
    const y = WORLD_SIZE - edge - camY;
    ctx.fillRect(0, y, g.w, g.h - y);
  }
}

function drawEntity(g: Game, e: Entity, camX: number, camY: number, daylight: number) {
  const ctx = g.ctx;
  const x = e.x - camX;
  const y = e.y - camY;
  const s = e.scale || 1;
  // objects reflect less light than snow, so at night they read as soft silhouettes
  const shade = 0.4 + daylight * 0.6;

  const shadow = (rx: number, ry = rx * 0.35) => {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  switch (e.kind) {
    case "tree": {
      shadow(20 * s);
      // trunk
      ctx.fillStyle = `rgb(${scale([74, 52, 34], shade)})`;
      ctx.fillRect(x - 5 * s, y - 34 * s, 10 * s, 40 * s);
      // pine layers
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const ly = y - 20 * s - i * 26 * s;
        const lw = (42 - i * 10) * s;
        ctx.fillStyle = `rgb(${scale([30, 66, 48], shade)})`;
        ctx.beginPath();
        ctx.moveTo(x, ly - 34 * s);
        ctx.lineTo(x - lw, ly);
        ctx.lineTo(x + lw, ly);
        ctx.closePath();
        ctx.fill();
        // snow cap
        ctx.fillStyle = `rgba(240,248,255,${0.85 * shade})`;
        ctx.beginPath();
        ctx.moveTo(x, ly - 34 * s);
        ctx.lineTo(x - lw * 0.5, ly - 16 * s);
        ctx.lineTo(x + lw * 0.5, ly - 16 * s);
        ctx.closePath();
        ctx.fill();
      }
      if (e.hp !== undefined && e.hp < (e.maxHp || 100)) drawBar(ctx, x, y - 118 * s, e.hp / (e.maxHp || 100), "#a3e635");
      break;
    }
    case "deadTree": {
      shadow(12 * s);
      ctx.strokeStyle = `rgb(${scale([90, 74, 58], shade)})`;
      ctx.lineWidth = 6 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y - 44 * s);
      ctx.moveTo(x, y - 28 * s); ctx.lineTo(x - 18 * s, y - 44 * s);
      ctx.moveTo(x, y - 22 * s); ctx.lineTo(x + 16 * s, y - 40 * s);
      ctx.stroke();
      if (e.hp !== undefined && e.hp < (e.maxHp || 60)) drawBar(ctx, x, y - 58 * s, e.hp / (e.maxHp || 60), "#d6b98c");
      break;
    }
    case "rock": {
      shadow(18 * s);
      ctx.fillStyle = `rgb(${scale([120, 128, 140], shade)})`;
      ctx.beginPath();
      ctx.moveTo(x - 18 * s, y);
      ctx.lineTo(x - 12 * s, y - 18 * s);
      ctx.lineTo(x + 4 * s, y - 22 * s);
      ctx.lineTo(x + 18 * s, y - 8 * s);
      ctx.lineTo(x + 14 * s, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(240,248,255,${0.6 * shade})`;
      ctx.beginPath();
      ctx.moveTo(x - 12 * s, y - 18 * s);
      ctx.lineTo(x + 4 * s, y - 22 * s);
      ctx.lineTo(x - 2 * s, y - 12 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "bush": {
      shadow(14 * s);
      ctx.fillStyle = `rgb(${scale([40, 74, 44], shade)})`;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x - 10 * s + i * 6 * s, y - 6 * s - (i % 2) * 6 * s, 9 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(240,248,255,${0.5 * shade})`;
      ctx.beginPath(); ctx.arc(x - 4 * s, y - 14 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "smallTree": {
      const k = s * 0.62;
      shadow(14 * k);
      ctx.fillStyle = `rgb(${scale([84, 60, 40], shade)})`;
      ctx.fillRect(x - 3.5 * k, y - 30 * k, 7 * k, 32 * k);
      for (let i = 0; i < 2; i++) {
        const ly = y - 22 * k - i * 24 * k;
        const lw = (36 - i * 10) * k;
        ctx.fillStyle = `rgb(${scale([42, 84, 58], shade)})`;
        ctx.beginPath(); ctx.moveTo(x, ly - 32 * k); ctx.lineTo(x - lw, ly); ctx.lineTo(x + lw, ly); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(240,248,255,${0.8 * shade})`;
        ctx.beginPath(); ctx.moveTo(x, ly - 32 * k); ctx.lineTo(x - lw * 0.45, ly - 17 * k); ctx.lineTo(x + lw * 0.45, ly - 17 * k); ctx.closePath(); ctx.fill();
      }
      // axe notch
      if (e.hp !== undefined && e.hp < (e.maxHp || 60)) {
        ctx.fillStyle = "#e9c89a";
        ctx.beginPath(); ctx.moveTo(x - 4 * k, y - 8 * k); ctx.lineTo(x + 1, y - 5 * k); ctx.lineTo(x - 4 * k, y - 2 * k); ctx.fill();
        drawBar(ctx, x, y - 84 * k, e.hp / (e.maxHp || 60), "#fbbf24");
      }
      break;
    }
    case "stump": {
      const k = (s || 1) * 0.7;
      ctx.fillStyle = `rgb(${scale([92, 66, 42], shade)})`;
      ctx.beginPath(); ctx.ellipse(x, y, 7 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${scale([210, 176, 128], shade)})`;
      ctx.beginPath(); ctx.ellipse(x, y - 2, 6 * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "buildSite": {
      const pulse = 0.55 + Math.sin(Date.now() / 260) * 0.25;
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -Date.now() / 60;
      ctx.strokeStyle = `rgba(252,211,77,${pulse})`;
      ctx.fillStyle = `rgba(252,211,77,${pulse * 0.12})`;
      ctx.lineWidth = 2.5;
      if (e.site === "shelter") {
        ctx.beginPath();
        ctx.moveTo(x - 34, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 30, y - 8); ctx.lineTo(x - 6, y - 44); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y + 2, 48, 16, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(x, y, 24, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = "bold 11px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(253,230,138,${0.6 + pulse * 0.4})`;
      if (e.site === "rack") {
        ctx.strokeStyle = `rgba(252,211,77,${pulse})`;
        ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 18, y - 44); ctx.moveTo(x + 22, y); ctx.lineTo(x + 18, y - 44);
        ctx.moveTo(x - 24, y - 40); ctx.lineTo(x + 24, y - 40); ctx.stroke();
      }
      ctx.fillText(e.site === "shelter" ? "BUILD SHELTER HERE" : e.site === "rack" ? "BUILD DRYING RACK HERE" : "BUILD FIRE HERE", x, y + 30);
      ctx.restore();
      break;
    }
    case "carcass": {
      const deer = e.carcassOf === "deer";
      ctx.fillStyle = "rgba(140,20,20,0.35)";
      ctx.beginPath(); ctx.ellipse(x, y + 2, deer ? 22 : 10, deer ? 7 : 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${deer ? scale([140, 102, 66], shade) : e.carcassOf === "wolf" ? scale([90, 96, 108], shade) : scale([220, 220, 225], shade)})`;
      ctx.beginPath(); ctx.ellipse(x, y - (deer ? 6 : 3), deer ? 17 : 8, deer ? 7 : 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = deer ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 2); ctx.lineTo(x - 12, y + 3); ctx.moveTo(x + 6, y - 2); ctx.lineTo(x + 12, y + 3); ctx.stroke();
      break;
    }
    case "spearOnGround": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.angle || 0);
      ctx.strokeStyle = `rgb(${scale([138, 90, 43], shade)})`; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(14, 0); ctx.stroke();
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(22, 0); ctx.lineTo(14, 3); ctx.fill();
      ctx.restore();
      break;
    }
    case "looseBranch": {
      const ang = ((e.seed || 0) % 6.28);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = `rgb(${scale([96, 74, 52], shade)})`;
      ctx.lineWidth = 3 * s; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-13 * s, 0); ctx.lineTo(13 * s, 0);
      ctx.moveTo(2 * s, 0); ctx.lineTo(8 * s, -5 * s);
      ctx.moveTo(-4 * s, 0); ctx.lineTo(-9 * s, 4 * s);
      ctx.stroke();
      ctx.restore();
      // snow dusting
      ctx.fillStyle = `rgba(255,255,255,${0.35 * shade})`;
      ctx.beginPath(); ctx.ellipse(x, y + 1, 12 * s, 3 * s, ang, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "looseStone": {
      ctx.fillStyle = `rgb(${scale([130, 136, 146], shade)})`;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y + 2 * s);
      ctx.lineTo(x - 5 * s, y - 6 * s);
      ctx.lineTo(x + 4 * s, y - 7 * s);
      ctx.lineTo(x + 8 * s, y);
      ctx.lineTo(x + 5 * s, y + 3 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.4 * shade})`;
      ctx.beginPath(); ctx.ellipse(x - 1, y - 5 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "firePit": {
      // unlit ring of stones + laid branches
      ctx.fillStyle = `rgb(${scale([90, 96, 108], shade)})`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 10, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = `rgb(${scale([96, 74, 52], shade)})`;
      ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 4); ctx.lineTo(x + 10, y - 4);
      ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
      ctx.stroke();
      break;
    }
    case "snowPile": {
      ctx.fillStyle = `rgba(245,250,255,${0.9 * shade})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(200,220,240,${0.5 * shade})`;
      ctx.beginPath();
      ctx.ellipse(x + 4, y + 3, 9 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "waterHole": {
      ctx.fillStyle = `rgba(200,220,235,${0.8 * shade})`;
      ctx.beginPath(); ctx.ellipse(x, y, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${scale([40, 90, 130], shade)})`;
      ctx.beginPath(); ctx.ellipse(x, y, 22, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(140,190,230,${0.5})`;
      ctx.beginPath(); ctx.ellipse(x - 5, y - 3, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "fire": {
      // stones
      ctx.fillStyle = `rgb(${scale([90, 96, 108], shade)})`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 18, y + Math.sin(a) * 10, 5, 0, Math.PI * 2); ctx.fill();
      }
      if ((e.fuel || 0) > 0) {
        const t = Date.now() / 120;
        for (let i = 0; i < 3; i++) {
          const fl = 0.7 + Math.sin(t + i) * 0.3;
          ctx.fillStyle = i === 0 ? "#ff7b00" : i === 1 ? "#ffb14e" : "#ffe08a";
          ctx.beginPath();
          const fh = (26 - i * 7) * fl * (0.45 + Math.min(1, (e.fuel || 0) / 45) * 0.65);
          ctx.moveTo(x, y - fh);
          ctx.quadraticCurveTo(x + (10 - i * 3), y - 4, x + (5 - i * 2), y);
          ctx.lineTo(x - (5 - i * 2), y);
          ctx.quadraticCurveTo(x - (10 - i * 3), y - 4, x, y - fh);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(x - 8, y - 3, 16, 4);
      }
      // fuel gauge when the survivor is close enough to tend the fire
      if ((e.fuel || 0) > 0 && Math.hypot(e.x - g.px, e.y - g.py) < 170) {
        const f = (e.fuel || 0) / 100;
        drawBar(ctx, x, y + 16, f, f < 0.25 ? "#ef4444" : f < 0.5 ? "#f59e0b" : "#fb923c");
      }
      if (e.cook?.length) drawCooking(ctx, x, y, e);
      break;
    }
    case "shelter": {
      shadow(38);
      // the survivor's firewood stacked against the shelter
      const logs = Math.min(8, g.inventory.wood || 0);
      for (let i = 0; i < logs; i++) {
        const row = i < 4 ? 0 : 1;
        const lx = x - 60 + (i % 4) * 7 + row * 3.5, ly = y - 3 - row * 6;
        ctx.fillStyle = `rgb(${scale([92, 64, 40], shade)})`;
        ctx.beginPath(); ctx.ellipse(lx, ly, 3.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${scale([196, 160, 112], shade)})`;
        ctx.beginPath(); ctx.ellipse(lx, ly, 1.8, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      const tier = e.tier || 1;
      if (tier === 1) {
        // rough lean-to of branches
        ctx.fillStyle = `rgb(${scale([70, 54, 36], shade)})`;
        ctx.beginPath();
        ctx.moveTo(x - 34, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 30, y - 8); ctx.lineTo(x - 6, y - 44);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgb(${scale([50, 38, 26], shade)})`; ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - 6, y - 44); ctx.lineTo(x - 30 + i * 14, y); ctx.stroke(); }
        ctx.fillStyle = `rgba(240,248,255,${0.6 * shade})`;
        ctx.beginPath(); ctx.moveTo(x - 6, y - 44); ctx.lineTo(x + 30, y - 8); ctx.lineTo(x + 24, y - 4); ctx.lineTo(x - 8, y - 38); ctx.closePath(); ctx.fill();
      } else if (tier === 2) {
        // walled log shelter with a small opening
        ctx.fillStyle = `rgb(${scale([78, 58, 38], shade)})`;
        ctx.beginPath();
        ctx.moveTo(x - 40, y); ctx.lineTo(x - 40, y - 30); ctx.lineTo(x, y - 52); ctx.lineTo(x + 40, y - 30); ctx.lineTo(x + 40, y);
        ctx.closePath(); ctx.fill();
        // log lines
        ctx.strokeStyle = `rgba(40,28,18,${0.5})`; ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 40, y - i * 8); ctx.lineTo(x + 40, y - i * 8); ctx.stroke(); }
        // dark entrance
        ctx.fillStyle = "rgba(10,8,6,0.85)";
        ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 10, y - 22); ctx.lineTo(x + 10, y - 22); ctx.lineTo(x + 10, y); ctx.closePath(); ctx.fill();
        // snow roof
        ctx.fillStyle = `rgba(240,248,255,${0.7 * shade})`;
        ctx.beginPath(); ctx.moveTo(x - 42, y - 29); ctx.lineTo(x, y - 55); ctx.lineTo(x + 42, y - 29); ctx.lineTo(x + 36, y - 27); ctx.lineTo(x, y - 49); ctx.lineTo(x - 36, y - 27); ctx.closePath(); ctx.fill();
      } else {
        // completed winter hut — hide-lined, snug, with a proper doorway
        ctx.fillStyle = `rgb(${scale([84, 62, 40], shade)})`;
        ctx.beginPath();
        ctx.moveTo(x - 46, y); ctx.lineTo(x - 44, y - 34); ctx.lineTo(x, y - 58); ctx.lineTo(x + 44, y - 34); ctx.lineTo(x + 46, y);
        ctx.closePath(); ctx.fill();
        // hide panels
        ctx.fillStyle = `rgba(120,90,58,${0.6})`;
        ctx.beginPath(); ctx.moveTo(x - 40, y - 4); ctx.lineTo(x - 38, y - 26); ctx.lineTo(x - 16, y - 26); ctx.lineTo(x - 18, y - 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 40, y - 4); ctx.lineTo(x + 38, y - 26); ctx.lineTo(x + 16, y - 26); ctx.lineTo(x + 18, y - 4); ctx.closePath(); ctx.fill();
        // doorway with hide flap
        ctx.fillStyle = "rgba(8,6,4,0.9)";
        ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 11, y - 26); ctx.lineTo(x + 11, y - 26); ctx.lineTo(x + 11, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgb(${scale([100, 74, 46], shade)})`;
        ctx.beginPath(); ctx.moveTo(x - 11, y - 26); ctx.lineTo(x + 3, y - 26); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x - 11, y - 10); ctx.closePath(); ctx.fill();
        // heavy snow roof + smoke hole
        ctx.fillStyle = `rgba(240,248,255,${0.8 * shade})`;
        ctx.beginPath(); ctx.moveTo(x - 48, y - 33); ctx.lineTo(x, y - 61); ctx.lineTo(x + 48, y - 33); ctx.lineTo(x + 40, y - 31); ctx.lineTo(x, y - 54); ctx.lineTo(x - 40, y - 31); ctx.closePath(); ctx.fill();
        if (Math.random() < 0.3) g.particles.push({ x: e.x, y: e.y - 58, vx: (Math.random() - 0.5) * 6, vy: -18, life: 1.2, maxLife: 1.5, color: "rgba(160,160,160,0.4)", size: 3, kind: "dust", gravity: -6 });
      }
      break;
    }
    case "dryingRack": {
      shadow(26, 7);
      const pole = `rgb(${scale([96, 70, 44], shade)})`;
      const poleHi = `rgb(${scale([140, 106, 70], shade)})`;
      ctx.lineCap = "round";
      // two leaning A-frame legs each side, lashed at the top, with a crossbar
      ctx.strokeStyle = pole; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 30, y); ctx.lineTo(x - 22, y - 50); ctx.moveTo(x - 14, y + 2); ctx.lineTo(x - 22, y - 50);
      ctx.moveTo(x + 30, y); ctx.lineTo(x + 22, y - 50); ctx.moveTo(x + 14, y + 2); ctx.lineTo(x + 22, y - 50);
      ctx.stroke();
      ctx.strokeStyle = poleHi; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 28, y - 47); ctx.lineTo(x + 28, y - 47); ctx.stroke();
      ctx.strokeStyle = `rgba(${scale([200, 180, 130], shade)},0.8)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 22, y - 48, 3, 0, Math.PI * 2); ctx.arc(x + 22, y - 48, 3, 0, Math.PI * 2); ctx.stroke();
      // snow on the crossbar
      ctx.fillStyle = `rgba(240,248,255,${0.7 * shade})`;
      ctx.fillRect(x - 26, y - 51, 52, 2.5);
      // hanging meat strips: red and glossy when fresh, dark and shrunken when dried
      const slots = e.slots || [];
      const t = performance.now() / 1000;
      slots.forEach((p, i) => {
        const sx = x - 15 + i * 10;
        const sway = Math.sin(t * 1.3 + i * 1.7) * (1 + g.storm * 3);
        const len = 20 - p * 6;
        const c0 = [178, 42, 42], c1 = [92, 46, 26];
        const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * Math.min(1, p)));
        ctx.strokeStyle = `rgba(${scale([200, 180, 130], shade)},0.7)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, y - 46); ctx.lineTo(sx + sway * 0.3, y - 42); ctx.stroke();
        ctx.fillStyle = `rgb(${scale(c, shade)})`;
        ctx.beginPath();
        ctx.moveTo(sx - 3.5 + sway * 0.3, y - 42);
        ctx.lineTo(sx + 3.5 + sway * 0.3, y - 42);
        ctx.lineTo(sx + 2.5 + sway, y - 42 + len);
        ctx.lineTo(sx - 2.5 + sway, y - 42 + len);
        ctx.closePath(); ctx.fill();
        if (p < 0.5) { ctx.fillStyle = `rgba(255,220,220,${0.25 * (1 - p * 2) * shade})`; ctx.fillRect(sx - 2 + sway * 0.5, y - 40, 1.2, len - 4); }
        if (p >= 1) { ctx.fillStyle = "rgba(252,211,77,0.9)"; ctx.beginPath(); ctx.arc(sx + sway, y - 42 + len + 4, 1.6, 0, Math.PI * 2); ctx.fill(); }
      });
      // drying progress when close
      if (slots.length && Math.hypot(e.x - g.px, e.y - g.py) < 180) {
        const avg = slots.reduce((a, b) => a + Math.min(1, b), 0) / slots.length;
        drawBar(ctx, x, y + 10, avg, avg >= 1 ? "#fcd34d" : "#b45309");
      }
      break;
    }
    case "trap": {
      ctx.strokeStyle = e.caught ? "#a3e635" : `rgb(${scale([120, 100, 70], shade)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke();
      if (e.caught) { ctx.font = "16px serif"; ctx.textAlign = "center"; ctx.fillText("🐰", x, y - 4); }
      break;
    }
    case "trackRabbit": case "trackDeer": {
      const alpha = e.guided ? 0.7 : Math.min(0.55, (e.life || 0) / 26);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.angle || 0);
      // prints are shadowed hollows: darker than the moonlit snow at night
      const tc = lerpColor([24, 32, 56], [70, 88, 120], daylight);
      ctx.fillStyle = `rgba(${tc.join(",")},${Math.min(0.85, alpha + (1 - daylight) * 0.1)})`;
      if (e.kind === "trackDeer") {
        // split-hoof prints, alternating sides
        for (const side of [-1, 1]) {
          const ox = side === -1 ? -5 : 5, oy = side * 5;
          ctx.beginPath(); ctx.ellipse(ox + 1.5, oy - 1.3, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(ox + 1.5, oy + 1.3, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.beginPath(); ctx.ellipse(4, -2, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(4, 2, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "rabbit": drawRabbit(ctx, x, y, s, shade, e); drawAlert(ctx, x, y - 24 * s, e); break;
    case "deer": drawDeer(ctx, x, y, s, shade, e); drawAlert(ctx, x, y - 50 * s, e); break;
    case "wolf": drawWolf(ctx, x, y, s, shade, e); break;
  }
}

function facing(e: Entity) { return e.angle !== undefined && Math.abs(e.angle) === 1 ? e.angle : (e.vx || 0) >= 0 ? 1 : -1; }

function drawRabbit(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shade: number, e: Entity) {
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath(); ctx.ellipse(x, y + 2, 10 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  const dir = facing(e);
  const hop = Math.abs((e.vx || 0)) + Math.abs((e.vy || 0)) > 20 ? Math.abs(Math.sin(Date.now() / 90)) * 4 : 0;
  const c = `rgb(${scale([225, 225, 230], shade)})`;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(x, y - 6 * s - hop, 9 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + dir * 8 * s, y - 9 * s - hop, 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  // ears
  ctx.fillStyle = c;
  ctx.fillRect(x + dir * 8 * s - 1, y - 18 * s - hop, 2 * s, 8 * s);
  ctx.fillRect(x + dir * 10 * s - 1, y - 18 * s - hop, 2 * s, 8 * s);
}

function drawDeer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shade: number, e: Entity) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  const dir = facing(e);
  const c = `rgb(${scale([150, 110, 72], shade)})`;
  ctx.fillStyle = c;
  // body
  ctx.beginPath(); ctx.ellipse(x, y - 14 * s, 15 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
  // legs
  ctx.strokeStyle = c; ctx.lineWidth = 3 * s;
  const walk = (Math.abs(e.vx || 0) + Math.abs(e.vy || 0)) > 20 ? Math.sin(Date.now() / 100) * 3 : 0;
  ctx.beginPath();
  ctx.moveTo(x - 8 * s, y - 8 * s); ctx.lineTo(x - 8 * s + walk, y);
  ctx.moveTo(x + 8 * s, y - 8 * s); ctx.lineTo(x + 8 * s - walk, y);
  ctx.stroke();
  // neck + head
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(x + dir * 15 * s, y - 24 * s, 5 * s, 7 * s, dir * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + dir * 20 * s, y - 30 * s, 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  // antlers
  ctx.strokeStyle = "#c9b28a"; ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(x + dir * 20 * s, y - 34 * s); ctx.lineTo(x + dir * 24 * s, y - 42 * s);
  ctx.moveTo(x + dir * 22 * s, y - 38 * s); ctx.lineTo(x + dir * 28 * s, y - 40 * s);
  ctx.stroke();
  if (e.hp !== undefined && (e.maxHp || 3) > e.hp) drawBar(ctx, x, y - 46 * s, e.hp / (e.maxHp || 3), "#ef4444");
}

function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shade: number, e: Entity) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.ellipse(x, y + 2, 15 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  const dir = facing(e);
  const c = `rgb(${scale([90, 96, 108], shade)})`;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(x, y - 10 * s, 14 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c; ctx.lineWidth = 3 * s;
  const walk = (Math.abs(e.vx || 0) + Math.abs(e.vy || 0)) > 20 ? Math.sin(Date.now() / 80) * 3 : 0;
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 5 * s); ctx.lineTo(x - 7 * s + walk, y);
  ctx.moveTo(x + 7 * s, y - 5 * s); ctx.lineTo(x + 7 * s - walk, y);
  ctx.stroke();
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(x + dir * 15 * s, y - 14 * s, 6 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  // ears
  ctx.beginPath(); ctx.moveTo(x + dir * 13 * s, y - 18 * s); ctx.lineTo(x + dir * 15 * s, y - 23 * s); ctx.lineTo(x + dir * 17 * s, y - 18 * s); ctx.fill();
  // glowing eyes
  ctx.fillStyle = "#fde047";
  ctx.beginPath(); ctx.arc(x + dir * 18 * s, y - 15 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill();
  if (e.hp !== undefined && (e.maxHp || 4) > e.hp) drawBar(ctx, x, y - 30 * s, e.hp / (e.maxHp || 4), "#ef4444");
}

export function drawPlayer(g: Game, camX: number, camY: number) {
  const ctx = g.ctx;
  const x = g.px - camX;
  const y = g.py - camY;
  const dir = g.pfacing;
  const bob = g.pmoving ? Math.sin(g.panim) * 2.5 : 0;
  const legSwing = g.pmoving ? Math.sin(g.panim) * 5 : 0;
  // fire-drill has a fast repetitive arm motion
  const drilling = g.fireLighting >= 0;
  const actSwing = drilling
    ? Math.sin(Date.now() / 45) * 26
    : g.pact > 0 ? Math.sin((0.35 - g.pact) / 0.35 * Math.PI) * 22 : 0;

  // clothing progression flags
  const hasCoat = g.has("warmCoat");
  const hasCloak = g.has("cloak") || hasCoat;
  const hasWrap = g.has("furWrap") || hasCloak;
  const hasHood = g.has("hood") || hasCoat;
  const hasGloves = g.has("gloves") || hasCoat;
  const hasBoots = g.has("boots") || hasCoat;
  // shivering when cold & poorly dressed
  const shiver = g.temp < 40 ? Math.sin(Date.now() / 55) * (40 - g.temp) / 40 * 0.8 : 0;
  const sx = x + shiver;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();

  // legs / trousers (worn = thin dark, boots = fur cuffs)
  ctx.strokeStyle = hasBoots ? "#5a4326" : "#41403c"; ctx.lineWidth = hasBoots ? 6 : 5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx - 4, y - 12); ctx.lineTo(sx - 4 + legSwing, y);
  ctx.moveTo(sx + 4, y - 12); ctx.lineTo(sx + 4 - legSwing, y);
  ctx.stroke();
  if (hasBoots) {
    ctx.fillStyle = "#c9b28a";
    ctx.beginPath(); ctx.arc(sx - 4 + legSwing, y - 2, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 4 - legSwing, y - 2, 3.4, 0, Math.PI * 2); ctx.fill();
  }

  // body — worn thin shirt at first, then fur wrap, cloak, full coat
  const bodyCol = hasCoat ? "#6e5233" : hasWrap ? "#6a5238" : "#556170"; // starts drab grey-blue rags
  ctx.fillStyle = bodyCol;
  ctx.beginPath();
  ctx.roundRect(sx - 8, y - 30 + bob, 16, 20, 5);
  ctx.fill();
  // torn/worn detail when he has nothing
  if (!hasWrap) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - 2, y - 26 + bob); ctx.lineTo(sx - 2, y - 12 + bob); ctx.stroke();
  }
  // fur wrap over the shoulders
  if (hasWrap) {
    ctx.fillStyle = hasCoat ? "#8a6a42" : "#7a5f3e";
    ctx.beginPath();
    ctx.moveTo(sx - 10, y - 28 + bob);
    ctx.quadraticCurveTo(sx, y - 34 + bob, sx + 10, y - 28 + bob);
    ctx.lineTo(sx + 8, y - 20 + bob);
    ctx.quadraticCurveTo(sx, y - 24 + bob, sx - 8, y - 20 + bob);
    ctx.closePath(); ctx.fill();
    // fur texture dots
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(sx - 5, y - 27 + bob, 1.2, 0, Math.PI * 2); ctx.arc(sx + 5, y - 27 + bob, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // hide cloak drapes down the back/side
  if (hasCloak) {
    ctx.fillStyle = hasCoat ? "#5c4326" : "#6b5236";
    ctx.beginPath();
    ctx.moveTo(sx - dir * 8, y - 26 + bob);
    ctx.quadraticCurveTo(sx - dir * 16, y - 14 + bob, sx - dir * 12, y - 2 + bob);
    ctx.lineTo(sx - dir * 4, y - 6 + bob);
    ctx.lineTo(sx - dir * 3, y - 26 + bob);
    ctx.closePath(); ctx.fill();
  }

  // arm / tool
  ctx.strokeStyle = bodyCol; ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(sx + dir * 6, y - 24 + bob);
  ctx.rotate(dir * (actSwing * Math.PI / 180));
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * 10, 6); ctx.stroke();
  if (hasGloves) { ctx.fillStyle = "#7a5f3e"; ctx.beginPath(); ctx.arc(dir * 10, 6, 3.2, 0, Math.PI * 2); ctx.fill(); }
  // tool in hand
  const tool: string | null = drilling ? "drill" : g.carrying ? null : g.equipped === "axe" ? "axe" : g.equipped === "spear" ? "spear" : g.has("torch") ? "torch" : null;
  if (tool === "axe") {
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(dir * 10, 6); ctx.lineTo(dir * 16, -8); ctx.stroke();
    ctx.fillStyle = "#c0c6d0";
    ctx.beginPath(); ctx.moveTo(dir * 16, -8); ctx.lineTo(dir * 22, -12); ctx.lineTo(dir * 18, -2); ctx.fill();
  } else if (tool === "spear") {
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dir * 10, 8); ctx.lineTo(dir * 26, -16); ctx.stroke();
    ctx.fillStyle = "#c0c6d0";
    ctx.beginPath(); ctx.moveTo(dir * 26, -16); ctx.lineTo(dir * 30, -22); ctx.lineTo(dir * 24, -14); ctx.fill();
  } else if (tool === "knife") {
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dir * 10, 6); ctx.lineTo(dir * 14, 0); ctx.stroke();
    ctx.fillStyle = "#c0c6d0";
    ctx.beginPath(); ctx.moveTo(dir * 14, 0); ctx.lineTo(dir * 18, -4); ctx.lineTo(dir * 15, 2); ctx.fill();
  } else if (tool === "drill") {
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(dir * 8, 6); ctx.lineTo(dir * 8, -8); ctx.stroke();
  } else if (tool === "torch") {
    ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(dir * 10, 6); ctx.lineTo(dir * 16, -6); ctx.stroke();
    const t = Date.now() / 100;
    ctx.fillStyle = "#ffb14e";
    ctx.beginPath(); ctx.arc(dir * 16, -10 + Math.sin(t) * 1.5, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // head
  ctx.fillStyle = "#e8c9a0";
  ctx.beginPath(); ctx.arc(sx + dir * 1, y - 34 + bob, 6.5, 0, Math.PI * 2); ctx.fill();
  // simple beard/face shadow to read as a rugged man
  ctx.fillStyle = "rgba(60,40,25,0.35)";
  ctx.beginPath(); ctx.arc(sx + dir * 2, y - 32 + bob, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill();

  if (hasHood) {
    // fur hood framing the face
    ctx.fillStyle = hasCoat ? "#5a3f28" : "#6b5236";
    ctx.beginPath(); ctx.arc(sx + dir * 1, y - 37 + bob, 8, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
    ctx.fillStyle = "rgba(240,235,220,0.35)";
    ctx.beginPath(); ctx.arc(sx + dir * 1, y - 37 + bob, 8, Math.PI * 1.0, Math.PI * 2.0); ctx.stroke();
  } else {
    // bare/thin knit hat — looks under-dressed
    ctx.fillStyle = "#4a4740";
    ctx.beginPath(); ctx.arc(sx + dir * 1, y - 37 + bob, 6.6, Math.PI, 0); ctx.fill();
    ctx.fillRect(sx - 6, y - 37 + bob, 13, 2);
  }
  // carried carcass slung over the shoulders
  if (g.carrying) {
    const deer = g.carrying === "deer";
    ctx.fillStyle = deer ? "#8c6642" : g.carrying === "wolf" ? "#5a606c" : "#dcdce1";
    ctx.beginPath(); ctx.ellipse(sx - dir * 2, y - 40 + bob, deer ? 18 : 9, deer ? 7 : 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = deer ? 3 : 2; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx - dir * 16, y - 40 + bob); ctx.lineTo(sx - dir * 20, y - 30 + bob);
    ctx.moveTo(sx + dir * 12, y - 40 + bob); ctx.lineTo(sx + dir * 16, y - 30 + bob);
    ctx.stroke();
  }
  // frozen breath — more when colder / under-dressed
  const breathChance = g.temp < 55 ? (55 - g.temp) / 55 * 0.12 : 0;
  if (Math.random() < breathChance) {
    g.particles.push({ x: g.px + dir * 8, y: g.py - 34, vx: dir * 20, vy: -6, life: 0.9, maxLife: 1, color: "rgba(255,255,255,0.5)", size: 3, kind: "dust", gravity: -6 });
  }
}

// food on a stick / bark pot by the coals, each with a small progress ring
function drawCooking(ctx: CanvasRenderingContext2D, x: number, y: number, e: Entity) {
  const items = e.cook || [];
  const burning = e.kind === "fire" && (e.fuel || 0) > 0;
  items.forEach((c, i) => {
    const ox = x + (i - (items.length - 1) / 2) * 20;
    const oy = y - 4;
    const p = Math.min(1, c.t / c.dur);
    if (c.pot) {
      // bark pot set against the stones
      ctx.fillStyle = "#b08a5a";
      ctx.beginPath(); ctx.moveTo(ox - 7, oy - 8); ctx.lineTo(ox + 7, oy - 8); ctx.lineTo(ox + 5, oy + 2); ctx.lineTo(ox - 5, oy + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p < 0.5 ? "#e8f2ff" : "#7dd3fc";
      ctx.fillRect(ox - 6, oy - 8, 12, 2.5);
      if (p > 0.4 && burning && Math.random() < 0.3) { ctx.fillStyle = "rgba(230,235,245,0.35)"; ctx.beginPath(); ctx.arc(ox + (Math.random() - 0.5) * 6, oy - 12 - Math.random() * 8, 2.5, 0, Math.PI * 2); ctx.fill(); }
    } else {
      // meat/fish on a stick leaning over the flames
      ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox + 12, oy + 6); ctx.lineTo(ox - 4, oy - 16); ctx.stroke();
      const raw = [178, 52, 52], done = [140, 78, 34];
      const col = raw.map((v, k) => Math.round(v + (done[k] - v) * p));
      ctx.fillStyle = `rgb(${col.join(",")})`;
      ctx.beginPath(); ctx.ellipse(ox + 1, oy - 10, 5, 3.5, -0.9, 0, Math.PI * 2); ctx.fill();
      if (burning && p < 1 && Math.random() < 0.15) { ctx.fillStyle = "rgba(255,200,120,0.8)"; ctx.fillRect(ox + (Math.random() - 0.5) * 6, oy - 14, 1.2, 1.2); }
    }
    // progress ring
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ox, oy - 26, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = p >= 1 ? "#a3e635" : burning ? "#fbbf24" : "#94a3b8"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(ox, oy - 26, 6, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  });
}

function drawAlert(ctx: CanvasRenderingContext2D, x: number, y: number, e: Entity) {
  const a = e.alert || 0;
  if (a < 0.25) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a);
  ctx.font = "bold 13px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = a > 0.7 ? "#ef4444" : "#fbbf24";
  ctx.fillText(a > 0.7 ? "!" : "?", x, y);
  ctx.restore();
}

function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number, col: string) {
  const w = 34;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x - w / 2, y, w, 4);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, pct), 4);
}

function daylightAt(t: number): number {
  if (t < 0.18 || t > 0.85) return 0;
  if (t < 0.3) return (t - 0.18) / 0.12;
  if (t > 0.72) return (0.85 - t) / 0.13;
  return 1;
}

function scale(rgb: number[], f: number): string {
  return rgb.map((c) => Math.round(Math.max(0, Math.min(255, c * (0.4 + f * 0.6))))).join(",");
}
function lerpColor(a: number[], b: number[], t: number): number[] {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}
function pseudo(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
