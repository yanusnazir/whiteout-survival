import { WORLD_SIZE } from "./data";
import type { Game } from "./engine";
import type { Entity, ItemId } from "./types";
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
  drawPlayerPrints(g, camX, camY, daylight);
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

  // storm whiteout: bright by day, a cold grey-blue veil at night, dense during severe storms
  if (g.storm > 0.15) {
    const sc = lerpColor([78, 92, 120], [225, 236, 248], daylight);
    const opacity = Math.min(0.65, (g.storm - 0.15) * 0.68 + (g.stormExposure || 0) * 0.18);
    ctx.fillStyle = `rgba(${sc.join(",")},${opacity})`;
    ctx.fillRect(0, 0, g.w, g.h);

    // Blowing blizzard wind streaks across the viewport
    if (g.storm > 0.35) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1.2;
      const nowT = Date.now() / 25;
      for (let i = 0; i < 24; i++) {
        const lx = ((i * 71 + nowT * 26) % (g.w + 160)) - 80;
        const ly = (i * 43) % g.h;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 50 - (i % 6) * 10, ly + 8 + (i % 3) * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
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
  // freezing frost vignette: active during cold exposure in storms
  if (g.temp < 30 && ((g.stormExposure || 0) > 0.08 || g.weather === "storm")) {
    const coldK = Math.min(1, (30 - g.temp) / 26);
    const fg = ctx.createRadialGradient(g.w / 2, g.h / 2, Math.min(g.w, g.h) * 0.28, g.w / 2, g.h / 2, Math.max(g.w, g.h) * 0.65);
    fg.addColorStop(0, "rgba(140, 190, 255, 0)");
    fg.addColorStop(0.65, `rgba(130, 180, 255, ${coldK * 0.16})`);
    fg.addColorStop(1, `rgba(180, 220, 255, ${coldK * 0.42})`);
    ctx.fillStyle = fg;
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
      // Noticeable warmth radius on the snow around the fire
      if ((e.fuel || 0) > 0) {
        const fuelRatio = Math.min(1, (e.fuel || 0) / 40);
        const radius = 135 * (0.75 + fuelRatio * 0.25);
        ctx.save();
        const wg = ctx.createRadialGradient(x, y, 6, x, y, radius);
        wg.addColorStop(0, "rgba(255, 145, 35, 0.22)");
        wg.addColorStop(0.5, "rgba(255, 110, 25, 0.08)");
        wg.addColorStop(0.85, "rgba(255, 95, 15, 0.025)");
        wg.addColorStop(1, "rgba(255, 80, 0, 0)");
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing dashed warmth boundary
        const pulse = Math.sin(Date.now() / 280) * 0.04;
        ctx.strokeStyle = `rgba(255, 180, 80, ${0.28 + pulse})`;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.96, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

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
      // Packed snow & pine needle campsite clearing around shelter and camp structures
      ctx.save();
      const campR = 88;
      const cg = ctx.createRadialGradient(x, y + 10, 16, x, y + 10, campR);
      cg.addColorStop(0, `rgba(45, 52, 65, ${0.2 * (0.6 + daylight * 0.4)})`);
      cg.addColorStop(0.65, `rgba(60, 72, 90, ${0.11 * (0.6 + daylight * 0.4)})`);
      cg.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(x, y + 14, campR, campR * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

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
        // completed proper wooden hut — heavy timber, stone chimney, hide-lined, snug
        ctx.fillStyle = `rgb(${scale([84, 62, 40], shade)})`;
        ctx.beginPath();
        ctx.moveTo(x - 46, y); ctx.lineTo(x - 44, y - 34); ctx.lineTo(x, y - 58); ctx.lineTo(x + 44, y - 34); ctx.lineTo(x + 46, y);
        ctx.closePath(); ctx.fill();
        // hide panels
        ctx.fillStyle = `rgba(120,90,58,${0.6})`;
        ctx.beginPath(); ctx.moveTo(x - 40, y - 4); ctx.lineTo(x - 38, y - 26); ctx.lineTo(x - 16, y - 26); ctx.lineTo(x - 18, y - 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 40, y - 4); ctx.lineTo(x + 38, y - 26); ctx.lineTo(x + 16, y - 26); ctx.lineTo(x + 18, y - 4); ctx.closePath(); ctx.fill();

        // Stone chimney rising from the right roof
        const chimX = x + 24, chimY = y - 52;
        ctx.fillStyle = `rgb(${scale([95, 92, 90], shade)})`;
        ctx.beginPath();
        ctx.rect(chimX - 6, chimY - 18, 12, 22);
        ctx.fill();
        // stone mortar lines
        ctx.strokeStyle = `rgb(${scale([55, 52, 50], shade)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chimX - 6, chimY - 12); ctx.lineTo(chimX + 6, chimY - 12);
        ctx.moveTo(chimX - 6, chimY - 6); ctx.lineTo(chimX + 6, chimY - 6);
        ctx.moveTo(chimX - 6, chimY); ctx.lineTo(chimX + 6, chimY);
        ctx.stroke();
        // chimney rim & cap
        ctx.fillStyle = `rgb(${scale([120, 118, 115], shade)})`;
        ctx.fillRect(chimX - 7.5, chimY - 20, 15, 3.5);
        // snow on chimney rim
        ctx.fillStyle = `rgba(240,248,255,${0.85 * shade})`;
        ctx.fillRect(chimX - 7.5, chimY - 21.5, 15, 1.8);
        // dark flue opening
        ctx.fillStyle = "#161414";
        ctx.beginPath(); ctx.ellipse(chimX, chimY - 20, 4.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();

        // Fireplace fuel and burning state
        const fpFuel = e.fireplaceFuel !== undefined ? e.fireplaceFuel : 80;
        const fpBurning = fpFuel > 0;
        const fpIntensity = Math.min(1, fpFuel / 40 + 0.3);

        // Noticeable fireplace warmth radius surrounding the wooden hut
        if (fpBurning) {
          const fpRadius = 135 * (0.8 + fpIntensity * 0.2);
          ctx.save();
          const fpg = ctx.createRadialGradient(x, y + 6, 10, x, y + 6, fpRadius);
          fpg.addColorStop(0, "rgba(255, 135, 40, 0.22)");
          fpg.addColorStop(0.55, "rgba(255, 100, 25, 0.08)");
          fpg.addColorStop(1, "rgba(255, 80, 10, 0)");
          ctx.fillStyle = fpg;
          ctx.beginPath();
          ctx.arc(x, y + 6, fpRadius, 0, Math.PI * 2);
          ctx.fill();

          const fpPulse = Math.sin(Date.now() / 300) * 0.04;
          ctx.strokeStyle = `rgba(255, 175, 75, ${0.25 + fpPulse})`;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.arc(x, y + 6, fpRadius * 0.95, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Doorway with warm firelight spilling out
        ctx.fillStyle = "rgba(8,6,4,0.92)";
        ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 11, y - 26); ctx.lineTo(x + 11, y - 26); ctx.lineTo(x + 11, y); ctx.closePath(); ctx.fill();

        if (fpBurning) {
          // Warm flickering glow from inside the hut doorway
          const flick = 0.86 + Math.sin(performance.now() / 150 + e.id) * 0.14;
          const nightFactor = 0.5 + (1 - g.daylight()) * 0.5;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const glowGrad = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 24);
          glowGrad.addColorStop(0, `rgba(255, 160, 60, ${0.75 * fpIntensity * flick})`);
          glowGrad.addColorStop(0.7, `rgba(255, 110, 30, ${0.28 * fpIntensity * flick})`);
          glowGrad.addColorStop(1, "rgba(255, 80, 20, 0)");
          ctx.fillStyle = glowGrad;
          ctx.fillRect(x - 22, y - 32, 44, 38);

          // Fan of warm light spilling across the snow outside the entrance
          const spillR = 48 * fpIntensity * flick;
          const spillGrad = ctx.createRadialGradient(x, y - 6, 2, x, y + 10, spillR);
          spillGrad.addColorStop(0, `rgba(255, 150, 60, ${0.45 * fpIntensity * nightFactor * flick})`);
          spillGrad.addColorStop(0.5, `rgba(255, 110, 30, ${0.16 * fpIntensity * nightFactor * flick})`);
          spillGrad.addColorStop(1, "rgba(255, 80, 20, 0)");
          ctx.fillStyle = spillGrad;
          ctx.beginPath();
          ctx.ellipse(x, y + 10, spillR * 0.85, spillR * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = `rgb(${scale([100, 74, 46], shade)})`;
        ctx.beginPath(); ctx.moveTo(x - 11, y - 26); ctx.lineTo(x + 3, y - 26); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x - 11, y - 10); ctx.closePath(); ctx.fill();

        // Heavy snow roof
        ctx.fillStyle = `rgba(240,248,255,${0.8 * shade})`;
        ctx.beginPath(); ctx.moveTo(x - 48, y - 33); ctx.lineTo(x, y - 61); ctx.lineTo(x + 48, y - 33); ctx.lineTo(x + 40, y - 31); ctx.lineTo(x, y - 54); ctx.lineTo(x - 40, y - 31); ctx.closePath(); ctx.fill();

        // Subtle, realistic chimney smoke when fireplace is burning
        if (fpBurning && Math.random() < 0.45) {
          const wind = g.weather === "storm" ? -35 : g.weather === "snow" ? -12 : -4;
          const coldSmokeAlpha = g.temp < 35 ? 0.32 : 0.20;
          g.particles.push({
            x: chimX + (Math.random() - 0.5) * 4,
            y: chimY - 21,
            vx: (Math.random() - 0.5) * 3 + wind * 0.6,
            vy: -18 - Math.random() * 10,
            life: 1.8 + Math.random() * 0.8,
            maxLife: 2.6,
            color: `rgba(180, 185, 195, ${coldSmokeAlpha * fpIntensity})`,
            size: 3.5 + Math.random() * 3,
            kind: "dust",
            gravity: -4,
          });
        }
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
    case "woodStorage": drawWoodStorage(ctx, x, y, shade, e, g); break;
    case "foodStorage": drawFoodStorage(ctx, x, y, shade, e, g); break;
    case "waterStorage": drawWaterStorage(ctx, x, y, shade, e, g); break;
    case "materialStorage": drawMaterialStorage(ctx, x, y, shade, e, g); break;
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
    case "dog": drawDog(ctx, x, y, s, shade, e, g); break;
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

function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shade: number, e: Entity, g: Game) {
  const dir = facing(e);
  const state = e.dogState || "follow";
  const speed = Math.hypot(e.vx || 0, e.vy || 0);
  const isMoving = speed > 15;
  const isRunning = speed > 110;
  const isResting = state === "rest";
  const isSitting = state === "sit";
  const isEating = state === "eat";
  const isPet = state === "pet";

  const t = performance.now() / 1000;
  const anim = e.dogAnim ?? (t * (isRunning ? 13 : isMoving ? 8 : 2));
  const idleBreath = Math.sin(t * 2.8) * 0.7;

  // Tail wag dynamics
  let tailWag = 0;
  if (isPet) tailWag = Math.sin(t * 20) * 0.6;
  else if (isEating) tailWag = Math.sin(t * 14) * 0.45;
  else if (isRunning) tailWag = Math.sin(t * 11) * 0.2;
  else if (isMoving) tailWag = Math.sin(anim * 1.5) * 0.28;
  else if (isSitting) tailWag = Math.sin(t * 5) * 0.35;
  else tailWag = Math.sin(t * 2.2) * 0.18;

  // Coat colors (husky / northern timber-dog / domestic survival companion)
  const saddleCol = `rgb(${scale([62, 52, 44], shade)})`;
  const coatCol = `rgb(${scale([95, 82, 70], shade)})`;
  const underCol = `rgb(${scale([228, 220, 210], shade)})`;
  const muzzleCol = `rgb(${scale([44, 36, 30], shade)})`;
  const collarCol = `rgb(${scale([130, 60, 20], shade)})`;
  const sockCol = `rgb(${scale([215, 206, 195], shade)})`;
  const eyeCol = "#d97706";

  // Ground shadow on snow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  const shadowR = (isResting ? 14 : 15) * s;
  ctx.ellipse(x, y + 2, shadowR, (isResting ? 6.5 : 4.5) * s, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isResting) {
    // Resting curled in snow
    const rx = x, ry = y - 4 * s;
    const rBreath = Math.sin(t * 2.0) * 0.5 * s;

    // Curled body
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(rx, ry + rBreath, 13 * s, 8 * s, dir * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Dark dorsal saddle
    ctx.fillStyle = saddleCol;
    ctx.beginPath();
    ctx.ellipse(rx, ry - 2 * s + rBreath, 11 * s, 5 * s, dir * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Head tucked near paws
    const headX = rx + dir * 8 * s;
    const headY = ry + 2 * s + rBreath;
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(headX, headY, 6 * s, 5 * s, dir * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Cream muzzle resting down
    ctx.fillStyle = underCol;
    ctx.beginPath();
    ctx.ellipse(headX + dir * 4 * s, headY + 1 * s, 3.5 * s, 2.5 * s, dir * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#181818";
    ctx.beginPath();
    ctx.arc(headX + dir * 6.5 * s, headY + 0.8 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Sleeping eye
    ctx.strokeStyle = "#221c16";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(headX + dir * 2.5 * s, headY - 1.2 * s, 1.6 * s, 0.2 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Folded ear
    ctx.fillStyle = saddleCol;
    ctx.beginPath();
    ctx.moveTo(headX - dir * 1 * s, headY - 3 * s);
    ctx.lineTo(headX + dir * 2 * s, headY - 6.5 * s);
    ctx.lineTo(headX + dir * 4 * s, headY - 2 * s);
    ctx.closePath();
    ctx.fill();

    // Bushy tail wrapped around flanks
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 4.5 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(rx - dir * 4 * s, ry + 1 * s, 9 * s, 0.4 * Math.PI, 1.4 * Math.PI, dir > 0);
    ctx.stroke();
    // Light tail tip
    ctx.strokeStyle = underCol;
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.arc(rx - dir * 4 * s, ry + 1 * s, 9 * s, 0.4 * Math.PI, 0.65 * Math.PI, dir > 0);
    ctx.stroke();

  } else if (isSitting) {
    // Sitting on haunches, alert, looking up
    const sitY = y - 2 * s + idleBreath * 0.3;
    const chestX = x + dir * 5 * s;
    const rearX = x - dir * 7 * s;

    // Rear folded haunches
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(rearX, sitY - 4 * s, 7 * s, 6 * s, -dir * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = saddleCol;
    ctx.beginPath();
    ctx.ellipse(rearX, sitY - 5 * s, 5.5 * s, 4 * s, -dir * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Bushy tail on snow thumping
    const tailThump = Math.abs(Math.sin(t * 6 + (e.dogTailWag || 0))) * 2.5 * s;
    ctx.save();
    ctx.translate(rearX - dir * 4 * s, sitY - 2 * s);
    ctx.rotate(-dir * 0.35 + tailWag);
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 4.2 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-dir * 7 * s, -3 * s - tailThump, -dir * 12 * s, 1 * s - tailThump);
    ctx.stroke();
    ctx.strokeStyle = underCol;
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    ctx.moveTo(-dir * 8 * s, -2 * s - tailThump);
    ctx.lineTo(-dir * 12 * s, 1 * s - tailThump);
    ctx.stroke();
    ctx.restore();

    // Upright chest and body
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.moveTo(rearX - dir * 2 * s, sitY - 2 * s);
    ctx.lineTo(chestX + dir * 2 * s, sitY - 14 * s);
    ctx.lineTo(chestX - dir * 3 * s, sitY - 16 * s);
    ctx.lineTo(rearX - dir * 4 * s, sitY - 8 * s);
    ctx.closePath();
    ctx.fill();

    // Cream throat & chest ruff
    ctx.fillStyle = underCol;
    ctx.beginPath();
    ctx.ellipse(chestX + dir * 1 * s, sitY - 12 * s, 4.5 * s, 6.5 * s, dir * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Front legs planted
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 3.2 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(chestX + dir * 1.5 * s, sitY - 8 * s);
    ctx.lineTo(chestX + dir * 2 * s, sitY);
    ctx.stroke();
    ctx.strokeStyle = saddleCol;
    ctx.beginPath();
    ctx.moveTo(chestX - dir * 1.5 * s, sitY - 8 * s);
    ctx.lineTo(chestX - dir * 1 * s, sitY);
    ctx.stroke();

    // Front paws
    ctx.fillStyle = sockCol;
    ctx.beginPath();
    ctx.ellipse(chestX + dir * 2.5 * s, sitY + 0.5 * s, 2.8 * s, 1.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(chestX - dir * 0.5 * s, sitY + 0.5 * s, 2.5 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Collar
    ctx.strokeStyle = collarCol;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.ellipse(chestX + dir * 1 * s, sitY - 16 * s, 3.5 * s, 2.2 * s, dir * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(chestX + dir * 3.5 * s, sitY - 15 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const hX = chestX + dir * 2 * s;
    const hY = sitY - 19 * s + idleBreath * 0.4;
    drawDogHead(ctx, hX, hY, s, dir, isPet, isEating, coatCol, underCol, muzzleCol, saddleCol, eyeCol, t);

  } else if (isEating) {
    // Eating from snow
    const eatY = y - 4 * s;
    const chew = Math.sin(t * 16) * 1.5 * s;

    // Body angled down toward snow
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(x - dir * 2 * s, eatY - 6 * s, 13 * s, 7 * s, dir * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = saddleCol;
    ctx.beginPath();
    ctx.ellipse(x - dir * 2 * s, eatY - 8 * s, 11 * s, 4.5 * s, dir * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Front legs braced wide
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 3.2 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + dir * 6 * s, eatY - 6 * s);
    ctx.lineTo(x + dir * 10 * s, y);
    ctx.moveTo(x + dir * 3 * s, eatY - 6 * s);
    ctx.lineTo(x + dir * 6 * s, y);
    ctx.stroke();

    // Hind legs standing
    ctx.beginPath();
    ctx.moveTo(x - dir * 9 * s, eatY - 6 * s);
    ctx.lineTo(x - dir * 8 * s, y);
    ctx.moveTo(x - dir * 13 * s, eatY - 5 * s);
    ctx.lineTo(x - dir * 12 * s, y);
    ctx.stroke();

    // Bushy excited wagging tail high
    ctx.save();
    ctx.translate(x - dir * 13 * s, eatY - 8 * s);
    ctx.rotate(dir * 0.6 + tailWag);
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 4.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-dir * 5 * s, -8 * s, -dir * 10 * s, -5 * s);
    ctx.stroke();
    ctx.strokeStyle = underCol;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-dir * 6 * s, -7 * s);
    ctx.lineTo(-dir * 10 * s, -5 * s);
    ctx.stroke();
    ctx.restore();

    // Food morsel / bone on snow
    ctx.fillStyle = "#b91c1c";
    ctx.beginPath();
    ctx.ellipse(x + dir * 15 * s, y - 1 * s, 3.5 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(x + dir * 13 * s, y - 2 * s, 4 * s, 1.5 * s);

    // Dipped head chewing
    const hX = x + dir * 11 * s;
    const hY = eatY + chew;
    drawDogHead(ctx, hX, hY, s, dir, false, true, coatCol, underCol, muzzleCol, saddleCol, eyeCol, t);

  } else {
    // Standing / Walking / Running / Petting
    const bob = isRunning ? Math.sin(anim * 2) * 2.2 * s : isMoving ? Math.sin(anim * 2) * 1.2 * s : idleBreath * 0.4;
    const bodyY = y - 11 * s + bob;

    const stride = isRunning ? 7.5 * s : isMoving ? 4.5 * s : 0;
    const lift = isRunning ? 5.5 * s : isMoving ? 3.0 * s : 0;

    const fL_swing = Math.sin(anim);
    const fR_swing = Math.sin(anim + Math.PI);
    const rL_swing = Math.sin(anim + Math.PI);
    const rR_swing = Math.sin(anim);

    const fL_x = x + dir * 5 * s + dir * fL_swing * stride;
    const fL_y = y - Math.max(0, fL_swing) * lift;

    const fR_x = x + dir * 3 * s + dir * fR_swing * stride;
    const fR_y = y - Math.max(0, fR_swing) * lift;

    const rL_x = x - dir * 8 * s + dir * rL_swing * stride;
    const rL_y = y - Math.max(0, rL_swing) * lift;

    const rR_x = x - dir * 10 * s + dir * rR_swing * stride;
    const rR_y = y - Math.max(0, rR_swing) * lift;

    // Far legs
    ctx.strokeStyle = saddleCol;
    ctx.lineWidth = 3.0 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - dir * 7 * s, bodyY + 3 * s);
    ctx.lineTo(rR_x, rR_y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + dir * 4 * s, bodyY + 2 * s);
    ctx.lineTo(fR_x, fR_y);
    ctx.stroke();

    // Bushy winter tail
    ctx.save();
    ctx.translate(x - dir * 11 * s, bodyY - 1 * s);
    const baseTailAngle = isRunning ? -dir * 0.15 : isPet ? -dir * 0.7 : -dir * 0.45;
    ctx.rotate(baseTailAngle + tailWag);
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 4.6 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-dir * 7 * s, -6 * s, -dir * 12 * s, -2 * s);
    ctx.stroke();
    ctx.strokeStyle = underCol;
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    ctx.moveTo(-dir * 7 * s, -5 * s);
    ctx.lineTo(-dir * 12 * s, -2 * s);
    ctx.stroke();
    ctx.restore();

    // Main torso
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(x - dir * 2 * s, bodyY, 13 * s, 7.5 * s, dir * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Dark saddle & spine marking
    ctx.fillStyle = saddleCol;
    ctx.beginPath();
    ctx.ellipse(x - dir * 3 * s, bodyY - 2.5 * s, 11 * s, 5 * s, dir * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Cream chest & underbelly
    ctx.fillStyle = underCol;
    ctx.beginPath();
    ctx.ellipse(x + dir * 3.5 * s, bodyY + 1 * s, 5.5 * s, 5.5 * s, dir * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - dir * 1 * s, bodyY + 3.5 * s, 7 * s, 3.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Near legs
    ctx.strokeStyle = coatCol;
    ctx.lineWidth = 3.4 * s;
    ctx.lineCap = "round";
    const kneeBackX = (x - dir * 6 * s + rL_x) * 0.5 - dir * 1.5 * s;
    const kneeBackY = (bodyY + 3 * s + rL_y) * 0.5 - 1 * s;
    ctx.beginPath();
    ctx.moveTo(x - dir * 6 * s, bodyY + 2 * s);
    ctx.lineTo(kneeBackX, kneeBackY);
    ctx.lineTo(rL_x, rL_y);
    ctx.stroke();

    const kneeFrontX = (x + dir * 5 * s + fL_x) * 0.5 + dir * 1.0 * s;
    const kneeFrontY = (bodyY + 2 * s + fL_y) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + dir * 5 * s, bodyY + 1 * s);
    ctx.lineTo(kneeFrontX, kneeFrontY);
    ctx.lineTo(fL_x, fL_y);
    ctx.stroke();

    // Cream socks and paw pads on near feet
    ctx.fillStyle = sockCol;
    ctx.beginPath();
    ctx.ellipse(fL_x + dir * 1.2 * s, fL_y, 2.6 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(rL_x + dir * 1.0 * s, rL_y, 2.6 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Collar
    ctx.strokeStyle = collarCol;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.ellipse(x + dir * 6 * s, bodyY - 4 * s, 3.2 * s, 4.5 * s, dir * 0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(x + dir * 8.2 * s, bodyY - 3.5 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headReach = isRunning ? 1.5 * s : 0;
    const hX = x + dir * (9 * s + headReach);
    const hY = bodyY - 6.5 * s + (isRunning ? 2 * s : 0);
    drawDogHead(ctx, hX, hY, s, dir, isPet, false, coatCol, underCol, muzzleCol, saddleCol, eyeCol, t);
  }

  // Cold vapor breath puff drifting from dog snout in freezing weather
  if (g.temp < 50 && Math.random() < 0.12 && !isResting) {
    g.particles.push({
      x: x + dir * 16 * s,
      y: y - 10 * s,
      vx: dir * 12 + (Math.random() - 0.5) * 3,
      vy: -6 + (Math.random() - 0.5) * 2,
      life: 0.7,
      maxLife: 0.8,
      color: "rgba(255,255,255,0.45)",
      size: 2.2 * s,
      kind: "dust",
      gravity: -3,
    });
  }
}

function drawDogHead(
  ctx: CanvasRenderingContext2D,
  hX: number,
  hY: number,
  s: number,
  dir: number,
  isPet: boolean,
  isEating: boolean,
  coatCol: string,
  underCol: string,
  muzzleCol: string,
  saddleCol: string,
  eyeCol: string,
  t: number
) {
  const earTwitch = Math.sin(t * 1.8) > 0.82 ? Math.sin(t * 22) * 0.25 : 0;

  // Head base / cheek ruff
  ctx.fillStyle = coatCol;
  ctx.beginPath();
  ctx.ellipse(hX, hY, 5.8 * s, 5.0 * s, dir * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Fluffy cream cheek ruff
  ctx.fillStyle = underCol;
  ctx.beginPath();
  ctx.ellipse(hX - dir * 1 * s, hY + 1.8 * s, 3.8 * s, 3.2 * s, dir * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Tapered canine muzzle
  ctx.fillStyle = muzzleCol;
  ctx.beginPath();
  ctx.moveTo(hX + dir * 2 * s, hY - 1.8 * s);
  ctx.lineTo(hX + dir * 7.5 * s, hY - 0.2 * s);
  ctx.lineTo(hX + dir * 7.0 * s, hY + 2.2 * s);
  ctx.lineTo(hX + dir * 1 * s, hY + 3.2 * s);
  ctx.closePath();
  ctx.fill();

  // Muzzle underside cream
  ctx.fillStyle = underCol;
  ctx.beginPath();
  ctx.moveTo(hX + dir * 2 * s, hY + 1.2 * s);
  ctx.lineTo(hX + dir * 6.5 * s, hY + 1.5 * s);
  ctx.lineTo(hX + dir * 5.5 * s, hY + 3.0 * s);
  ctx.lineTo(hX + dir * 1.5 * s, hY + 3.0 * s);
  ctx.closePath();
  ctx.fill();

  // Black nose leather
  ctx.fillStyle = "#181818";
  ctx.beginPath();
  ctx.ellipse(hX + dir * 7.4 * s, hY + 0.2 * s, 1.4 * s, 1.2 * s, dir * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Panting tongue when petted
  if (isPet) {
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.ellipse(hX + dir * 6.0 * s, hY + 3.4 * s, 1.8 * s, 2.5 * s, dir * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Alert canine eye
  if (isPet) {
    ctx.strokeStyle = "#221c16";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(hX + dir * 2.2 * s, hY - 0.8 * s, 1.8 * s, 0.2 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#1c140e";
    ctx.beginPath();
    ctx.ellipse(hX + dir * 2.2 * s, hY - 0.8 * s, 1.8 * s, 1.5 * s, dir * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.arc(hX + dir * 2.4 * s, hY - 0.8 * s, 1.0 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(hX + dir * 2.8 * s, hY - 1.2 * s, 0.45 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pointed triangular ears
  const earAngle = isPet ? -dir * 0.4 : isEating ? -dir * 0.25 : earTwitch;
  ctx.save();
  ctx.translate(hX - dir * 1.5 * s, hY - 3.5 * s);
  ctx.rotate(earAngle);

  // Far ear
  ctx.fillStyle = saddleCol;
  ctx.beginPath();
  ctx.moveTo(-dir * 2 * s, 0);
  ctx.lineTo(-dir * 0.5 * s, -6.5 * s);
  ctx.lineTo(dir * 2 * s, -1 * s);
  ctx.closePath();
  ctx.fill();

  // Near ear
  ctx.fillStyle = coatCol;
  ctx.beginPath();
  ctx.moveTo(-dir * 1 * s, 1 * s);
  ctx.lineTo(dir * 1.5 * s, -7.5 * s);
  ctx.lineTo(dir * 4.5 * s, 0);
  ctx.closePath();
  ctx.fill();

  // Inner ear fluff
  ctx.fillStyle = underCol;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(dir * 1.5 * s, -5.5 * s);
  ctx.lineTo(dir * 3.2 * s, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawStorageBadge(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, cur: number, max: number, accent: string) {
  const text = `${icon} ${cur}/${max}`;
  ctx.save();
  ctx.font = "bold 11px ui-sans-serif, system-ui";
  const tw = ctx.measureText(text).width;
  const w = tw + 14;
  const h = 18;
  const bx = x - w / 2;
  const by = y - h;
  ctx.fillStyle = "rgba(10, 14, 26, 0.82)";
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = cur >= max ? "rgba(245, 158, 11, 0.7)" : "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const pct = Math.max(0, Math.min(1, cur / max));
  if (pct > 0) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(bx + 3, by + h - 2.5, (w - 6) * pct, 1.5, 1);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, by + h / 2 - 0.5);
  ctx.restore();
}

function drawWoodStorage(ctx: CanvasRenderingContext2D, x: number, y: number, shade: number, e: Entity, g: Game) {
  const shadow = (rx: number, ry = rx * 0.35) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  shadow(24, 7);

  const stored = e.storage?.wood || 0;
  const cap = e.capacity || 50;
  const woodDark = `rgb(${scale([74, 52, 34], shade)})`;
  const woodLight = `rgb(${scale([168, 128, 88], shade)})`;
  const snow = `rgba(240, 248, 255, ${0.75 * shade})`;

  // 1. Cradle foundation: 2 horizontal skids resting on ground
  ctx.strokeStyle = woodDark;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 2); ctx.lineTo(x + 20, y - 2);
  ctx.moveTo(x - 18, y + 3); ctx.lineTo(x + 18, y + 3);
  ctx.stroke();

  // 2. Upright stakes (lashed at angles to hold logs)
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 2); ctx.lineTo(x - 23, y - 24);
  ctx.moveTo(x - 16, y - 3); ctx.lineTo(x - 19, y - 22);
  ctx.moveTo(x + 20, y + 2); ctx.lineTo(x + 23, y - 24);
  ctx.moveTo(x + 16, y - 3); ctx.lineTo(x + 19, y - 22);
  ctx.stroke();

  // Lashings on stakes
  ctx.strokeStyle = `rgba(${scale([180, 160, 120], shade)}, 0.8)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 24, y - 12); ctx.lineTo(x - 17, y - 12);
  ctx.moveTo(x + 17, y - 12); ctx.lineTo(x + 24, y - 12);
  ctx.stroke();

  // 3. Stacked logs based on stored amount
  if (stored === 0) {
    ctx.fillStyle = `rgba(${scale([180, 150, 100], shade)}, 0.4)`;
    ctx.fillRect(x - 12, y - 3, 24, 2);
    ctx.fillStyle = snow;
    ctx.fillRect(x - 15, y - 4, 30, 1.5);
  } else {
    const drawLog = (lx: number, ly: number, len = 22) => {
      ctx.fillStyle = woodDark;
      ctx.beginPath();
      ctx.roundRect(lx - len / 2, ly - 3, len, 6, 2);
      ctx.fill();
      ctx.fillStyle = woodLight;
      ctx.beginPath();
      ctx.ellipse(lx + len / 2 - 1, ly, 2.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = woodDark;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(lx + len / 2 - 1, ly, 1.2, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    };

    // Tier 1 (1 to 10 logs: low row)
    const countT1 = Math.min(4, Math.max(1, Math.ceil(stored / 3)));
    const t1Offsets = [-12, -4, 4, 12];
    for (let i = 0; i < countT1; i++) {
      drawLog(x + t1Offsets[i] * 0.4, y - 6 - (i % 2) * 1.5, 26);
    }

    // Tier 2 (11 to 25 logs: medium stack)
    if (stored >= 11) {
      const countT2 = Math.min(3, Math.ceil((stored - 10) / 5));
      const t2Offsets = [-8, 0, 8];
      for (let i = 0; i < countT2; i++) {
        drawLog(x + t2Offsets[i] * 0.4, y - 13 - (i % 2) * 1, 24);
      }
    }

    // Tier 3 (26 to 50 logs: full woodpile)
    if (stored >= 26) {
      const countT3 = Math.min(2, Math.ceil((stored - 25) / 12));
      const t3Offsets = [-4, 4];
      for (let i = 0; i < countT3; i++) {
        drawLog(x + t3Offsets[i] * 0.4, y - 20, 22);
      }
    }

    // Snow dusting on the top ridge
    const topY = stored >= 26 ? y - 23 : stored >= 11 ? y - 16 : y - 9;
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.roundRect(x - 12, topY, 24, 2.5, 1);
    ctx.fill();
  }

  if (Math.hypot(e.x - g.px, e.y - g.py) < 140) {
    const topY = stored >= 26 ? y - 28 : stored >= 11 ? y - 22 : y - 16;
    drawStorageBadge(ctx, x, topY, "🪵", stored, cap, "#a3e635");
  }
}

function drawFoodStorage(ctx: CanvasRenderingContext2D, x: number, y: number, shade: number, e: Entity, g: Game) {
  const shadow = (rx: number, ry = rx * 0.35) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  shadow(22, 6);

  const store = e.storage || {};
  const raw = store.meat || 0;
  const cooked = (store.cookedMeat || 0) + (store.cookedFish || 0);
  const dried = store.driedMeat || 0;
  const total = raw + cooked + dried;
  const cap = e.capacity || 30;

  const timberDark = `rgb(${scale([68, 48, 30], shade)})`;
  const timberMid = `rgb(${scale([100, 72, 46], shade)})`;
  const snow = `rgba(240, 248, 255, ${0.8 * shade})`;

  // 1. 4 sturdy timber stilt legs lifting larder box off snow
  ctx.strokeStyle = timberDark;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 2); ctx.lineTo(x - 14, y - 10);
  ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 8, y - 8);
  ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + 8, y - 8);
  ctx.moveTo(x + 14, y + 2); ctx.lineTo(x + 14, y - 10);
  ctx.stroke();

  // 2. Main timber cache box
  ctx.fillStyle = "rgba(18, 12, 8, 0.85)";
  ctx.fillRect(x - 15, y - 26, 30, 16);

  ctx.strokeStyle = timberMid;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x - 15, y - 26, 30, 16);

  // 3. Stored food rendering inside open slatted cavity
  if (total === 0) {
    ctx.strokeStyle = `rgba(200, 220, 240, ${0.35 * shade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 18); ctx.lineTo(x + 13, y - 18);
    ctx.stroke();
  } else {
    // Hanging dried meat strips
    if (dried > 0) {
      const strips = Math.min(4, Math.max(1, Math.ceil(dried / 2)));
      ctx.strokeStyle = `rgb(${scale([80, 36, 18], shade)})`;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < strips; i++) {
        const sx = x - 10 + i * 6.5;
        ctx.beginPath();
        ctx.moveTo(sx, y - 25);
        ctx.lineTo(sx, y - 17);
        ctx.stroke();
      }
    }
    // Cooked roasted meat chunks
    if (cooked > 0) {
      ctx.fillStyle = `rgb(${scale([160, 90, 40], shade)})`;
      ctx.beginPath();
      ctx.ellipse(x - 3, y - 14, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Raw meat cuts (marbled deep red)
    if (raw > 0) {
      ctx.fillStyle = `rgb(${scale([180, 40, 40], shade)})`;
      ctx.beginPath();
      ctx.ellipse(x + 6, y - 14, 4.5, 3.2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 230, 230, 0.6)";
      ctx.fillRect(x + 5, y - 15, 2.5, 1);
    }
  }

  // 4. Overhanging split-bark roof with heavy snow cap
  ctx.fillStyle = timberDark;
  ctx.beginPath();
  ctx.moveTo(x - 19, y - 24);
  ctx.lineTo(x, y - 34);
  ctx.lineTo(x + 19, y - 24);
  ctx.lineTo(x + 16, y - 22);
  ctx.lineTo(x, y - 31);
  ctx.lineTo(x - 16, y - 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = snow;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 25);
  ctx.lineTo(x, y - 36);
  ctx.lineTo(x + 20, y - 25);
  ctx.lineTo(x + 17, y - 24);
  ctx.lineTo(x, y - 33);
  ctx.lineTo(x - 17, y - 24);
  ctx.closePath();
  ctx.fill();

  // Tiny icicles under the roof eaves
  ctx.fillStyle = `rgba(220, 240, 255, ${0.85 * shade})`;
  ctx.fillRect(x - 16, y - 22, 1.2, 3);
  ctx.fillRect(x - 6, y - 26, 1.2, 2.5);
  ctx.fillRect(x + 8, y - 25, 1.2, 3.5);
  ctx.fillRect(x + 15, y - 22, 1.2, 2);

  if (Math.hypot(e.x - g.px, e.y - g.py) < 140) {
    drawStorageBadge(ctx, x, y - 39, "🥩", total, cap, "#fca5a5");
  }
}

function drawWaterStorage(ctx: CanvasRenderingContext2D, x: number, y: number, shade: number, e: Entity, g: Game) {
  const shadow = (rx: number, ry = rx * 0.35) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  shadow(18, 6);

  const store = e.storage || {};
  const water = (store.water || 0) + (store.streamWater || 0);
  const cap = e.capacity || 20;

  const cedarDark = `rgb(${scale([80, 52, 30], shade)})`;
  const cedarMid = `rgb(${scale([120, 84, 52], shade)})`;
  const snow = `rgba(240, 248, 255, ${0.8 * shade})`;

  // 1. Primitive hollowed cedar cistern tub
  ctx.fillStyle = cedarDark;
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = cedarMid;
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 3);
  ctx.lineTo(x - 14, y - 16);
  ctx.ellipse(x, y - 16, 14, 5, 0, Math.PI, 0, true);
  ctx.lineTo(x + 14, y - 3);
  ctx.ellipse(x, y - 3, 14, 5, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgb(${scale([50, 32, 18], shade)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 7, 14, 4.5, 0, 0, Math.PI);
  ctx.stroke();

  ctx.fillStyle = "rgba(22, 14, 8, 0.95)";
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 12, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Water inside
  const pct = Math.max(0, Math.min(1, water / cap));
  if (water > 0) {
    const waterY = y - 13 - pct * 3.5;
    ctx.fillStyle = "rgba(70, 160, 225, 0.85)";
    ctx.beginPath();
    ctx.ellipse(x, waterY, 11 * (0.8 + pct * 0.2), 3.6 * (0.8 + pct * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(220, 245, 255, 0.6)";
    ctx.beginPath();
    ctx.ellipse(x - 3, waterY - 0.8, 4, 1.2, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Wooden dipper / ladle resting on the edge
    ctx.strokeStyle = `rgb(${scale([160, 120, 75], shade)})`;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 17);
    ctx.lineTo(x + 7, y - 14);
    ctx.stroke();
    ctx.fillStyle = `rgb(${scale([140, 100, 60], shade)})`;
    ctx.beginPath();
    ctx.arc(x - 9, y - 16.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = `rgba(220, 240, 255, ${0.4 * shade})`;
    ctx.fillRect(x - 6, y - 14, 12, 1.5);
  }

  ctx.fillStyle = snow;
  ctx.beginPath();
  ctx.ellipse(x + 6, y - 17, 7, 2, 0.2, 0, Math.PI);
  ctx.fill();

  if (Math.hypot(e.x - g.px, e.y - g.py) < 140) {
    drawStorageBadge(ctx, x, y - 27, "💧", water, cap, "#7dd3fc");
  }
}

function drawMaterialStorage(ctx: CanvasRenderingContext2D, x: number, y: number, shade: number, e: Entity, g: Game) {
  const shadow = (rx: number, ry = rx * 0.35) => {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  shadow(24, 7);

  const store = e.storage || {};
  let total = 0;
  for (const k in store) total += store[k as ItemId] || 0;
  const cap = e.capacity || 40;

  const boxDark = `rgb(${scale([70, 50, 32], shade)})`;
  const boxMid = `rgb(${scale([105, 75, 48], shade)})`;
  const snow = `rgba(240, 248, 255, ${0.75 * shade})`;

  ctx.fillStyle = "rgba(16, 10, 6, 0.85)";
  ctx.fillRect(x - 17, y - 14, 34, 14);

  if (total === 0) {
    ctx.fillStyle = `rgba(${scale([140, 110, 75], shade)}, 0.35)`;
    ctx.fillRect(x - 12, y - 6, 24, 2);
  } else {
    const hides = (store.hide || 0) + (store.curedHide || 0) + (store.furWrap || 0) + (store.cloak || 0);
    if (hides > 0) {
      ctx.fillStyle = `rgb(${scale([130, 95, 65], shade)})`;
      ctx.beginPath();
      ctx.roundRect(x - 15, y - 12, 10, 8, 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${scale([170, 135, 95], shade)})`;
      ctx.fillRect(x - 14, y - 11, 8, 1.5);
    }

    const branches = (store.branch || 0) + (store.shaft || 0);
    if (branches > 0) {
      ctx.strokeStyle = `rgb(${scale([120, 90, 55], shade)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 14); ctx.lineTo(x + 5, y - 4);
      ctx.moveTo(x - 5, y - 13); ctx.lineTo(x + 3, y - 3);
      ctx.stroke();
      ctx.strokeStyle = "rgba(220, 200, 160, 0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, y - 9, 3, 2);
    }

    const stones = (store.stone || 0) + (store.sharpStone || 0);
    if (stones > 0) {
      ctx.fillStyle = `rgb(${scale([135, 140, 150], shade)})`;
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 6, 4, 3, 0.2, 0, Math.PI * 2);
      ctx.ellipse(x + 13, y - 9, 3.2, 2.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    const bones = store.bone || 0;
    if (bones > 0) {
      ctx.fillStyle = `rgb(${scale([220, 215, 200], shade)})`;
      ctx.fillRect(x + 7, y - 11, 6, 1.8);
    }
  }

  ctx.strokeStyle = boxDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 17, y - 14, 34, 14);

  ctx.strokeStyle = boxMid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 7); ctx.lineTo(x + 16, y - 7);
  ctx.stroke();

  ctx.fillStyle = `rgb(${scale([160, 125, 80], shade)})`;
  ctx.fillRect(x - 18, y - 16, 3, 4);
  ctx.fillRect(x + 15, y - 16, 3, 4);

  ctx.fillStyle = snow;
  ctx.fillRect(x - 18, y - 16, 36, 1.8);

  if (Math.hypot(e.x - g.px, e.y - g.py) < 140) {
    drawStorageBadge(ctx, x, y - 24, "🧰", total, cap, "#fcd34d");
  }
}

function drawPlayerPrints(g: Game, camX: number, camY: number, daylight: number) {
  if (!g.playerPrints || !g.playerPrints.length) return;
  const ctx = g.ctx;
  const tc = lerpColor([24, 32, 56], [70, 88, 120], daylight);
  for (const pr of g.playerPrints) {
    const x = pr.x - camX, y = pr.y - camY;
    if (x < -20 || x > g.w + 20 || y < -20 || y > g.h + 20) continue;
    const alpha = (pr.life / pr.maxLife) * 0.38;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pr.angle);
    // soft shadowed indentation in snow
    ctx.fillStyle = `rgba(${tc.join(",")},${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0.5, 0, 4.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // heel depression
    ctx.beginPath();
    ctx.ellipse(-2.2, 0, 2.0, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // soft snow displacement highlight on sunward rim
    if (daylight > 0.1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4 * daylight})`;
      ctx.beginPath();
      ctx.arc(0.8, -1.3, 1.8, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawPlayer(g: Game, camX: number, camY: number) {
  const ctx = g.ctx;
  const x = g.px - camX;
  const y = g.py - camY;

  // Orientation and angles in 3/4 perspective
  const angle = g.pAngle ?? Math.PI / 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const walk = g.pWalkBlend ?? (g.pmoving ? 1 : 0);
  const idleT = g.pIdleAnim ?? (Date.now() / 1000);
  const stridePhase = g.panim ?? 0;
  const isRunning = g.prunning;

  // Backward stepping check (moving opposite to facing direction)
  const moveAngle = g.pMoveAngle ?? angle;
  let diffMove = moveAngle - angle;
  while (diffMove < -Math.PI) diffMove += Math.PI * 2;
  while (diffMove > Math.PI) diffMove -= Math.PI * 2;
  const isBacking = walk > 0.1 && Math.abs(diffMove) > Math.PI * 0.55;

  // 1. Idle breathing and settling motion (smooth rise & expansion of chest)
  const breathCycle = Math.sin(idleT * 2.2);
  const breath = breathCycle * 0.9 * (1 - walk * 0.75);
  const breathChest = Math.cos(idleT * 2.2) * 0.5 * (1 - walk * 0.85);

  // Shivering: severe during snowstorm & cold exposure
  const isStormCold = (g.stormExposure || 0) > 0.05 || (g.weather === "storm" && g.temp < 32);
  const shiverAmp = isStormCold
    ? Math.max(1.0, ((32 - Math.min(32, g.temp)) / 32) * 2.8 + (g.stormExposure || 0) * 2.5)
    : (g.temp < 32 ? ((32 - g.temp) / 32) * 0.7 : 0);
  const shiverFreq = isStormCold ? 35 : 55;
  const shiver = shiverAmp > 0 ? Math.sin(Date.now() / shiverFreq) * shiverAmp : 0;
  const sx = x + shiver;

  // 2. Walking & running dynamics
  const strideReach = (isRunning ? 6.5 : 4.4) * walk * (isBacking ? 0.75 : 1.0);
  const stepLift = (isRunning ? 4.8 : 3.4) * walk;

  // Natural gait bobbing: two vertical dips per stride cycle
  const stepDip = walk * (Math.abs(Math.sin(stridePhase)) * (isRunning ? 1.4 : 0.9));
  const bob = (walk * Math.sin(stridePhase * 2) * (isRunning ? 2.0 : 1.4)) - stepDip * 0.4 + breath * 0.5;

  // Lateral weight shift onto the supporting foot
  const swaySide = Math.sin(stridePhase);
  const swayX = -sinA * swaySide * (isRunning ? 1.4 : 0.8) * walk;
  const swayY = cosA * swaySide * (isRunning ? 0.7 : 0.4) * walk;

  // Forward torso lean into motion, or struggling posture hunching against biting blizzard
  const stormLean = isStormCold ? (g.stormExposure || 0) * 3.8 : 0;
  const leanMult = isBacking ? -1.6 : (isRunning ? 3.4 : 1.9);
  const leanX = cosA * leanMult * walk + swayX - (g.storm > 0.35 ? g.storm * 2.2 : 0) + cosA * stormLean;
  const leanY = sinA * leanMult * 0.65 * walk + swayY + stormLean * 0.5;

  // Clothing progression flags
  const hasCoat = g.has("warmCoat");
  const hasCloak = g.has("cloak") || hasCoat;
  const hasWrap = g.has("furWrap") || hasCloak;
  const hasHood = g.has("hood") || hasCoat;
  const hasGloves = g.has("gloves") || hasCoat;
  const hasBoots = g.has("boots") || hasCoat;

  const bodyCol = hasCoat ? "#6e5233" : hasWrap ? "#6a5238" : "#556170";
  const trouserCol = hasBoots ? "#523c22" : "#3c3b38";
  const handCol = hasGloves ? "#7a5f3e" : "#e8c9a0";

  // Tools & equipped items
  const drilling = g.fireLighting >= 0;
  const tool: string | null = drilling ? "drill" : g.carrying ? null : g.equipped === "axe" ? "axe" : g.equipped === "spear" ? "spear" : g.has("torch") ? "torch" : null;
  const isAxe = tool === "axe";
  const isChopping = isAxe && g.pact > 0;

  // Axe swing participation in torso & shoulders
  let chopLeanX = 0, chopLeanY = 0, chopDrop = 0, chopTwist = 0;
  let chopU = 0;
  if (isChopping) {
    chopU = Math.min(1, Math.max(0, (0.35 - g.pact) / 0.35));
    if (chopU < 0.28) {
      // Windup: cock back and arch upright
      const w = chopU / 0.28;
      chopDrop = -2.0 * w;
      chopLeanX = -cosA * 2.2 * w;
      chopLeanY = -sinA * 1.6 * w;
      chopTwist = -0.3 * w;
    } else if (chopU < 0.68) {
      // Downswing: crunch forward and down with body weight
      const c = (chopU - 0.28) / 0.40;
      const ease = c * c;
      chopDrop = -2.0 + 4.5 * ease;
      chopLeanX = -cosA * 2.2 + cosA * 5.0 * ease;
      chopLeanY = -sinA * 1.6 + sinA * 3.5 * ease;
      chopTwist = -0.3 + 0.6 * ease;
    } else {
      // Recovery
      const r = (chopU - 0.68) / 0.32;
      chopDrop = 2.5 * (1 - r);
      chopLeanX = cosA * 2.8 * (1 - r);
      chopLeanY = sinA * 1.9 * (1 - r);
      chopTwist = 0.3 * (1 - r);
    }
  }

  const sitT = g.sitTransition ?? (g.sitting ? 1 : 0);
  const isSitting = sitT > 0.01;

  // 3. Torso position & dimensions in 3D projection
  const standTx = sx + (1 - sitT) * (leanX + chopLeanX);
  const sitTx = sx;
  const tx = standTx + (sitTx - standTx) * sitT;

  const standTy = y - 22 + bob + leanY + chopDrop + chopLeanY;
  const sitTy = y - 12 + breath * 0.4;
  const ty = standTy + (sitTy - standTy) * sitT;

  // Lateral & forward vectors in ground plane
  const latX = -sinA;
  const latY = cosA * 0.55; // perspective tilt foreshortening
  const fwdX = cosA;
  const fwdY = sinA * 0.65;

  // Foreshortened chest width: full in front/back (sinA ~ +-1), narrower in side profile (cosA ~ +-1)
  const profileFactor = Math.abs(cosA);
  const torsoW = 17 - profileFactor * 4.5 + breathChest;
  const torsoH = 19;

  // Shoulders rotate with the body in 3D:
  const shoulderHalf = 8.2 - profileFactor * 1.6;
  const walkTwist = Math.sin(stridePhase) * (isRunning ? 1.6 : 1.1) * walk;
  const totalTwist = (walkTwist + chopTwist * 3.5) * (isBacking ? -1 : 1);

  const shL_x = tx - latX * shoulderHalf - fwdX * totalTwist;
  const shL_y = ty - 6 - latY * shoulderHalf * 0.6 - fwdY * totalTwist * 0.6 - breath * 0.4;
  const shR_x = tx + latX * shoulderHalf + fwdX * totalTwist;
  const shR_y = ty - 6 + latY * shoulderHalf * 0.6 + fwdY * totalTwist * 0.6 - breath * 0.4;

  // Hips
  const hipHalf = 4.4 - profileFactor * 1.0;
  const standHipY = y - 13 + bob * 0.6;
  const sitHipY = y - 4;
  const hipY = standHipY + (sitHipY - standHipY) * sitT;
  const hx_L = sx - latX * hipHalf;
  const hy_L = hipY - latY * hipHalf * 0.6;
  const hx_R = sx + latX * hipHalf;
  const hy_R = hipY + latY * hipHalf * 0.6;

  // 4. Biomechanical legs & feet with snow clearance
  const legCycle = (phase: number) => {
    const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let reach = 0, lift = 0, sink = 0;

    if (cycle < Math.PI) {
      // Swing phase: foot lifts up in smooth parabolic arc over snow crust, swinging forward
      const u = cycle / Math.PI;
      reach = -Math.cos(u * Math.PI) * strideReach;
      lift = Math.sin(u * Math.PI) * stepLift;
    } else {
      // Stance phase: foot plants on snow, rolling through push-off
      const v = (cycle - Math.PI) / Math.PI;
      reach = (1 - 2 * v) * strideReach;
      lift = 0;
      sink = Math.sin(v * Math.PI) * 1.1 * walk; // slight soft snow compression
    }
    if (isBacking) {
      reach = -reach;
    }
    return { reach, lift, sink };
  };

  const legL = legCycle(stridePhase);
  const legR = legCycle(stridePhase + Math.PI);

  const stand_fx_L = hx_L + fwdX * legL.reach;
  const stand_fy_L = y + fwdY * legL.reach - legL.lift + legL.sink;
  const stand_fx_R = hx_R + fwdX * legR.reach;
  const stand_fy_R = y + fwdY * legR.reach - legR.lift + legR.sink;
  const stand_kneeL_x = (hx_L + stand_fx_L) * 0.5 + fwdX * (legL.lift > 0 ? 1.5 : 0);
  const stand_kneeL_y = (hy_L + stand_fy_L) * 0.5 - legL.lift * 0.3;
  const stand_kneeR_x = (hx_R + stand_fx_R) * 0.5 + fwdX * (legR.lift > 0 ? 1.5 : 0);
  const stand_kneeR_y = (hy_R + stand_fy_R) * 0.5 - legR.lift * 0.3;

  const sit_fx_L = sx - latX * 3.5 + fwdX * 5.2;
  const sit_fy_L = y + 1 + fwdY * 2.5;
  const sit_fx_R = sx + latX * 3.5 + fwdX * 5.2;
  const sit_fy_R = y + 1 + fwdY * 2.5;
  const sit_kneeL_x = sx - latX * 7.2 + fwdX * 2.2;
  const sit_kneeL_y = y - 5;
  const sit_kneeR_x = sx + latX * 7.2 + fwdX * 2.2;
  const sit_kneeR_y = y - 5;

  const fx_L = stand_fx_L + (sit_fx_L - stand_fx_L) * sitT;
  const fy_L = stand_fy_L + (sit_fy_L - stand_fy_L) * sitT;
  const fx_R = stand_fx_R + (sit_fx_R - stand_fx_R) * sitT;
  const fy_R = stand_fy_R + (sit_fy_R - stand_fy_R) * sitT;
  const kneeL_x = stand_kneeL_x + (sit_kneeL_x - stand_kneeL_x) * sitT;
  const kneeL_y = stand_kneeL_y + (sit_kneeL_y - stand_kneeL_y) * sitT;
  const kneeR_x = stand_kneeR_x + (sit_kneeR_x - stand_kneeR_x) * sitT;
  const kneeR_y = stand_kneeR_y + (sit_kneeR_y - stand_kneeR_y) * sitT;

  // Ground contact shadow on snow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  const shadowR = 11 + walk * 1.5;
  ctx.ellipse(sx, y + 2, shadowR, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Localized grounding shadow under planted foot
  if (legL.lift === 0) {
    ctx.fillStyle = "rgba(10,18,32,0.18)";
    ctx.beginPath(); ctx.ellipse(fx_L, fy_L + 1, 4.8, 2.2, angle * 0.2, 0, Math.PI * 2); ctx.fill();
  }
  if (legR.lift === 0) {
    ctx.fillStyle = "rgba(10,18,32,0.18)";
    ctx.beginPath(); ctx.ellipse(fx_R, fy_R + 1, 4.8, 2.2, angle * 0.2, 0, Math.PI * 2); ctx.fill();
  }

  // 5. Draw legs & boots
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Thigh & calf structure with fabric folds & knee articulation
  const legWidth = hasBoots ? 5.8 : 5.0;
  ctx.strokeStyle = trouserCol;
  ctx.lineWidth = legWidth;

  // Near & far leg drawing with knee joint bend
  ctx.beginPath(); ctx.moveTo(hx_L, hy_L); ctx.lineTo(kneeL_x, kneeL_y); ctx.lineTo(fx_L, fy_L - 1.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx_R, hy_R); ctx.lineTo(kneeR_x, kneeR_y); ctx.lineTo(fx_R, fy_R - 1.5); ctx.stroke();

  // Outseam stitch crease on trousers
  ctx.strokeStyle = "rgba(18, 22, 30, 0.35)";
  ctx.lineWidth = 1.0;
  ctx.beginPath(); ctx.moveTo(hx_L, hy_L); ctx.lineTo(kneeL_x, kneeL_y); ctx.lineTo(fx_L, fy_L - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx_R, hy_R); ctx.lineTo(kneeR_x, kneeR_y); ctx.lineTo(fx_R, fy_R - 2); ctx.stroke();

  // Heavy worn winter boots: rugged sole tread, toe cap, tongue, laces
  const bootCol = hasBoots ? "#332213" : "#181818";
  const drawBoot = (fx: number, fy: number, lift: number) => {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle * 0.25 - lift * 0.06);

    // Deep rubber / heavy leather tread sole
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(-3.5, 0.2, 7.2, 1.8);

    // Boot foot / vamp & toe box
    ctx.fillStyle = bootCol;
    ctx.beginPath();
    ctx.ellipse(0.2, -1.0, hasBoots ? 4.4 : 3.8, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Reinforced toe cap
    ctx.fillStyle = "#0e0e10";
    ctx.beginPath();
    ctx.arc(2.4, -0.8, 1.6, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Lace stays / eyelets
    ctx.fillStyle = "rgba(200, 190, 175, 0.6)";
    ctx.fillRect(-1.0, -2.4, 2.0, 0.7);
    ctx.fillRect(-0.8, -1.4, 2.0, 0.7);

    // Fur cuff or gaiter collar on ankle
    if (hasBoots) {
      ctx.fillStyle = "#c7b290";
      ctx.beginPath(); ctx.ellipse(-0.5, -3.2, 3.8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      // Rawhide cross ties
      ctx.strokeStyle = "#5a3d24"; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-2.5, -3.8); ctx.lineTo(1.8, -2.4); ctx.stroke();
    } else {
      // Rugged boot cuff
      ctx.fillStyle = "#22252a";
      ctx.fillRect(-2.5, -3.0, 5.0, 1.4);
    }
    ctx.restore();
  };

  drawBoot(fx_L, fy_L, legL.lift);
  drawBoot(fx_R, fy_R, legR.lift);

  // 6. Cloak (Back layer when facing forward/sideways, sinA >= -0.25)
  if (hasCloak && sinA >= -0.25) {
    ctx.fillStyle = hasCoat ? "#5c4326" : "#6b5236";
    const cloakTrailX = -fwdX * (walk * 5 + 2) - swayX * 0.5;
    const cloakTrailY = -fwdY * (walk * 3 + 1);
    ctx.beginPath();
    ctx.moveTo(tx - latX * 8, ty - 8);
    ctx.quadraticCurveTo(tx + cloakTrailX * 0.7, ty + 2 + bob, tx + cloakTrailX - latX * 4, ty + 12 + bob + cloakTrailY);
    ctx.lineTo(tx + cloakTrailX + latX * 4, ty + 12 + bob + cloakTrailY);
    ctx.quadraticCurveTo(tx + cloakTrailX * 0.7, ty + 2 + bob, tx + latX * 8, ty - 8);
    ctx.closePath();
    ctx.fill();
  }

  // 7. Layered Winter Torso & Clothing
  // Inner thermal turtleneck/sweater collar peeking above jacket
  ctx.fillStyle = "#222730";
  ctx.beginPath();
  ctx.ellipse(tx + cosA * 1.0, ty - 9.0, 4.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Weathered winter jacket silhouette (tapered chest to waist)
  const chestHalfW = torsoW * 0.5;
  const waistHalfW = torsoW * 0.44;
  ctx.fillStyle = bodyCol;
  ctx.beginPath();
  ctx.moveTo(tx - chestHalfW, ty - torsoH * 0.45);
  ctx.lineTo(tx + chestHalfW, ty - torsoH * 0.45);
  ctx.lineTo(tx + waistHalfW, ty + torsoH * 0.48);
  ctx.lineTo(tx - waistHalfW, ty + torsoH * 0.48);
  ctx.closePath();
  ctx.fill();

  // Shoulder caps / armhole seams
  ctx.strokeStyle = "rgba(20, 24, 32, 0.35)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(tx - chestHalfW * 0.7, ty - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(tx + chestHalfW * 0.7, ty - 2); ctx.stroke();

  // Weathered leather belt & buckle
  ctx.fillStyle = "#241b14";
  ctx.fillRect(tx - waistHalfW, ty + 3.8, waistHalfW * 2, 2.8);
  ctx.fillStyle = "#94a3b8"; // tarnished steel buckle
  ctx.fillRect(tx - 1.6, ty + 3.4, 3.2, 3.6);
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(tx - 0.7, ty + 4.2, 1.4, 2.0);

  // Storm flap, zipper seam and snap buttons
  if (sinA > -0.25) {
    const seamX = tx + cosA * 1.5;
    ctx.strokeStyle = "rgba(20, 24, 32, 0.45)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(seamX, ty - 9); ctx.lineTo(seamX, ty + 3.5); ctx.stroke();

    // Antiqued brass / bone snaps
    ctx.fillStyle = "#c5b090";
    ctx.beginPath();
    ctx.arc(seamX - 0.4, ty - 6.5, 0.9, 0, Math.PI * 2);
    ctx.arc(seamX - 0.4, ty - 3.2, 0.9, 0, Math.PI * 2);
    ctx.arc(seamX - 0.4, ty + 0.5, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Chest utility pocket flaps
    ctx.fillStyle = "rgba(20, 25, 34, 0.28)";
    ctx.fillRect(tx - chestHalfW * 0.75, ty - 4.5, 3.5, 3.2);
    ctx.fillRect(tx + chestHalfW * 0.2, ty - 4.5, 3.5, 3.2);
  } else {
    // Back center jacket seam
    const seamX = tx - cosA * 1.5;
    ctx.strokeStyle = "rgba(18, 22, 28, 0.4)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(seamX, ty - 8.5); ctx.lineTo(seamX, ty + 3.5); ctx.stroke();
  }

  // Shearling coat trim if upgraded
  if (hasCoat) {
    ctx.fillStyle = "#8a6a42";
    ctx.fillRect(tx - waistHalfW - 0.5, ty + torsoH * 0.45, waistHalfW * 2 + 1, 3.2);
    ctx.fillStyle = "#e2d5c1"; // sheepskin wool trim
    ctx.fillRect(tx - waistHalfW, ty + torsoH * 0.45 + 2.0, waistHalfW * 2, 1.4);
  }

  // Fur Wrap / Shoulder Cowl
  if (hasWrap) {
    ctx.fillStyle = hasCoat ? "#8a6a42" : "#725637";
    ctx.beginPath();
    ctx.moveTo(tx - latX * (shoulderHalf + 2.5), ty - 8.5);
    ctx.quadraticCurveTo(tx, ty - 13.5 - breath * 0.4, tx + latX * (shoulderHalf + 2.5), ty - 8.5);
    ctx.lineTo(tx + latX * (shoulderHalf + 1.2), ty);
    ctx.quadraticCurveTo(tx, ty - 3.5, tx - latX * (shoulderHalf + 1.2), ty);
    ctx.closePath();
    ctx.fill();
    // Rawhide stitching & bone toggles
    ctx.fillStyle = "#ded5c2";
    ctx.beginPath();
    ctx.arc(tx - 4, ty - 6.5, 1.2, 0, Math.PI * 2);
    ctx.arc(tx + 4, ty - 6.5, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cloak (Front layer when facing backward / North)
  if (hasCloak && sinA < -0.25) {
    ctx.fillStyle = hasCoat ? "#5c4326" : "#6b5236";
    const cloakTrailX = -fwdX * (walk * 5 + 2);
    ctx.beginPath();
    ctx.moveTo(tx - 9, ty - 8);
    ctx.quadraticCurveTo(tx, ty - 11, tx + 9, ty - 8);
    ctx.lineTo(tx + 8 + cloakTrailX, ty + 12 + bob);
    ctx.lineTo(tx - 8 + cloakTrailX, ty + 12 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // 8. Grounded Human Head, Neck, Face & Hair
  const neckX = tx + cosA * 1.5;
  const neckY = ty - 9.5 + sinA * 1.0;

  // Anatomical neck with warmth wrap
  ctx.fillStyle = "#dfba8e";
  ctx.fillRect(neckX - 2.5, neckY - 4.5, 5.0, 5.0);
  ctx.strokeStyle = "rgba(180, 120, 85, 0.4)";
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(neckX - 1.2, neckY - 4); ctx.lineTo(neckX - 1.5, neckY); ctx.stroke();

  // Head bobbing, breathing nod, and eating/drinking head motion
  let consumeHeadNod = 0, consumeHeadTiltY = 0;
  if (g.consuming) {
    if (g.consuming.isDrink) {
      // Visibly raise container and tilt head back slightly
      consumeHeadTiltY = -2.2;
    } else {
      // Small chew nod
      consumeHeadNod = Math.sin(Date.now() / 150) * 1.2;
    }
  }
  const headNod = (walk * Math.sin(stridePhase * 2) * 0.6) + breath * 0.3 + consumeHeadNod;
  const hx = neckX + cosA * 2.5;
  const hy = neckY - 6.2 + headNod + consumeHeadTiltY;

  // Natural human skull & jawline
  ctx.fillStyle = "#dfba8e";
  ctx.beginPath();
  ctx.ellipse(hx, hy, 5.6, 6.2, cosA * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Natural ear contour on profile side
  if (Math.abs(cosA) > 0.25) {
    const earX = hx - latX * 4.6;
    const earY = hy + 0.3;
    ctx.fillStyle = "#dfba8e";
    ctx.beginPath(); ctx.ellipse(earX, earY, 1.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(160, 105, 75, 0.5)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(earX, earY, 1.0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  }

  // Natural weathered dark brown hair (volume & wind-swept locks)
  const hairBase = "#2c221a";
  const hairMid = "#3f3126";
  const hairHi = "#544335";

  // Crown and back hair
  ctx.fillStyle = hairBase;
  ctx.beginPath();
  ctx.ellipse(hx, hy - 2.8, 6.0, 4.4, 0, Math.PI * 0.85, Math.PI * 2.15);
  ctx.fill();
  ctx.fillStyle = hairMid;
  ctx.beginPath();
  ctx.ellipse(hx - cosA * 0.8, hy - 3.4, 5.2, 3.4, cosA * 0.1, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();

  // Natural face features (visible when sinA > -0.25: front or profile view)
  if (sinA > -0.25) {
    // Rugged winter scruff & windburn chin shadow
    ctx.fillStyle = "rgba(45, 34, 24, 0.42)";
    ctx.beginPath();
    ctx.arc(hx + cosA * 1.6, hy + 2.4 + sinA * 0.8, 4.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.fill();

    // Wind-flushed cold cheeks blush
    ctx.fillStyle = "rgba(195, 75, 65, 0.28)";
    ctx.beginPath();
    ctx.ellipse(hx + cosA * 2.2 - 2.6, hy + 0.8, 1.8, 1.2, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + cosA * 2.2 + 2.6, hy + 0.8, 1.8, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Defined nose bridge & nostrils with cold windburn tip
    const noseX = hx + cosA * 3.4;
    const noseY = hy + 0.5;
    ctx.fillStyle = "rgba(165, 95, 70, 0.4)";
    ctx.beginPath();
    ctx.moveTo(noseX - 0.5, noseY - 2.2);
    ctx.lineTo(noseX + 0.8, noseY);
    ctx.lineTo(noseX - 0.8, noseY + 0.8);
    ctx.closePath();
    ctx.fill();
    // Cold red nose tip
    ctx.fillStyle = "rgba(195, 75, 65, 0.45)";
    ctx.beginPath(); ctx.arc(noseX + 0.4, noseY + 0.2, 1.0, 0, Math.PI * 2); ctx.fill();

    // Defined human mouth / chapped lip line
    const mouthX = hx + cosA * 2.4;
    const mouthY = hy + 3.2;
    ctx.strokeStyle = "#865449";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(mouthX - 1.8, mouthY);
    ctx.lineTo(mouthX + 1.8, mouthY);
    ctx.stroke();

    // Eyes with white sclera, dark brown iris & upper eyelid crease
    const drawHumanEye = (ex: number, ey: number) => {
      // White sclera
      ctx.fillStyle = "rgba(240, 242, 246, 0.9)";
      ctx.beginPath(); ctx.ellipse(ex, ey, 1.6, 1.0, 0, 0, Math.PI * 2); ctx.fill();
      // Dark brown iris & pupil
      ctx.fillStyle = "#1e1610";
      ctx.beginPath(); ctx.arc(ex + cosA * 0.4, ey, 0.9, 0, Math.PI * 2); ctx.fill();
      // Catchlight glint
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ex + cosA * 0.3 - 0.2, ey - 0.6, 0.6, 0.6);
      // Eyelid line
      ctx.strokeStyle = "#38291e";
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(ex, ey - 0.2, 1.5, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    };

    if (cosA > 0.42) {
      // Profile right: lead eye
      drawHumanEye(hx + 2.4, hy - 0.8);
    } else if (cosA < -0.42) {
      // Profile left: lead eye
      drawHumanEye(hx - 2.4, hy - 0.8);
    } else {
      // Facing forward: both eyes
      const eyeSpread = 2.4 - profileFactor * 0.6;
      drawHumanEye(hx + cosA * 1.5 - eyeSpread, hy - 0.8);
      drawHumanEye(hx + cosA * 1.5 + eyeSpread, hy - 0.8);
    }

    // Natural eyebrows
    ctx.strokeStyle = "#2c221a";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(hx + cosA * 1.5 - 3.6, hy - 2.4);
    ctx.lineTo(hx + cosA * 1.5 - 1.0, hy - 2.1);
    ctx.moveTo(hx + cosA * 1.5 + 1.0, hy - 2.1);
    ctx.lineTo(hx + cosA * 1.5 + 3.6, hy - 2.4);
    ctx.stroke();

    // Wind-swept hair strands framing the face with highlights
    ctx.strokeStyle = hairHi;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(hx - 4.5, hy - 3.8); ctx.quadraticCurveTo(hx - 2.5, hy - 1.8, hx - 4.0, hy);
    ctx.moveTo(hx + 4.5, hy - 3.8); ctx.quadraticCurveTo(hx + 2.5, hy - 1.8, hx + 4.0, hy);
    ctx.stroke();
  }

  // Headwear: Worn knit watch cap or fur parka hood
  if (hasHood) {
    ctx.fillStyle = hasCoat ? "#5a3f28" : "#685035";
    ctx.beginPath(); ctx.arc(hx, hy - 1.6, 8.4, 0, Math.PI * 2); ctx.fill();
    // Arctic fur ruff framing face
    if (sinA > -0.25) {
      ctx.strokeStyle = "#e2d7c5"; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.arc(hx, hy - 0.8, 7.6, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
    }
  } else {
    // Worn ribbed knit survival beanie / watch cap with folded cuff
    ctx.fillStyle = "#2c323c";
    ctx.beginPath(); ctx.arc(hx, hy - 2.6, 6.8, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
    // Folded cuff ribbing
    ctx.fillStyle = "#222730";
    ctx.fillRect(hx - 6.5, hy - 3.4, 13.0, 2.6);
    // Subtle knitted rib texture
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx - 4.5, hy - 3.4); ctx.lineTo(hx - 4.5, hy - 1.0);
    ctx.moveTo(hx - 1.5, hy - 3.4); ctx.lineTo(hx - 1.5, hy - 1.0);
    ctx.moveTo(hx + 1.5, hy - 3.4); ctx.lineTo(hx + 1.5, hy - 1.0);
    ctx.moveTo(hx + 4.5, hy - 3.4); ctx.lineTo(hx + 4.5, hy - 1.0);
    ctx.stroke();
  }

  // Helper to draw realistic articulated hand or insulated survival mitten
  const drawGripHand = (hx: number, hy: number, radius = 3.0) => {
    ctx.fillStyle = handCol;
    ctx.beginPath(); ctx.arc(hx, hy, radius, 0, Math.PI * 2); ctx.fill();
    // Distinct thumb & knuckles curl
    ctx.fillStyle = hasGloves ? "#3b2d1f" : "#cfa77d";
    ctx.beginPath(); ctx.arc(hx + cosA * 1.0, hy - 0.8, radius * 0.6, 0, Math.PI * 2); ctx.fill();
    if (hasGloves) {
      // Leather wrist cuff
      ctx.strokeStyle = "#33261a"; ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.arc(hx, hy, radius + 0.4, 0, Math.PI * 2); ctx.stroke();
    }
  };

  // 9. Arms, Hands & Tools
  if (isSitting) {
    // Both arms rest peacefully down toward knees/lap
    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.4; ctx.lineCap = "round";
    const oHandX = sx - latX * 3.2 + fwdX * 3.5;
    const oHandY = y - 5;
    const oElbowX = (shL_x + oHandX) * 0.5 - latX * 1.8;
    const oElbowY = (shL_y + oHandY) * 0.5 + 1;
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(oElbowX, oElbowY); ctx.lineTo(oHandX, oHandY); ctx.stroke();

    const tHandX = sx + latX * 3.2 + fwdX * 3.5;
    const tHandY = y - 5;
    const tElbowX = (shR_x + tHandX) * 0.5 + latX * 1.8;
    const tElbowY = (shR_y + tHandY) * 0.5 + 1;
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(tElbowX, tElbowY); ctx.lineTo(tHandX, tHandY); ctx.stroke();

    drawGripHand(oHandX, oHandY, 2.8);
    drawGripHand(tHandX, tHandY, 2.8);
  } else if (g.carrying) {
    // Carried carcass slung across shoulders
    const deer = g.carrying === "deer";
    ctx.fillStyle = deer ? "#8c6642" : g.carrying === "wolf" ? "#5a606c" : "#dcdce1";
    ctx.beginPath(); ctx.ellipse(tx, ty - 16, deer ? 18 : 10, deer ? 7 : 4.5, 0, 0, Math.PI * 2); ctx.fill();
    // Arms reach up to hold the carcass legs
    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(tx - 10, ty - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(tx + 10, ty - 14); ctx.stroke();
    drawGripHand(tx - 10, ty - 14, 3.0);
    drawGripHand(tx + 10, ty - 14, 3.0);
  } else if (tool === "axe") {
    // Believable two-handed axe posture and chopping swing
    let hand1_x: number, hand1_y: number; // lead hand (mid haft)
    let hand2_x: number, hand2_y: number; // rear hand (base of haft)
    let axeAngle: number;

    if (isChopping) {
      if (chopU < 0.28) {
        // Windup: Raise axe high above rear shoulder, arching back
        const w = chopU / 0.28;
        hand1_x = tx - fwdX * 2 - latX * 3;
        hand1_y = ty - 18 - 9 * w;
        hand2_x = tx - fwdX * 5 - latX * 4;
        hand2_y = ty - 11 - 7 * w;
        axeAngle = angle - Math.PI * 0.55 - 0.4 * w;
      } else if (chopU < 0.68) {
        // Power downswing: Drive downward along facing angle (cosA, sinA)
        const c = (chopU - 0.28) / 0.40;
        const ease = c * c;
        hand1_x = tx + fwdX * (1 + 15 * ease) + latX * (1 - ease);
        hand1_y = ty - 27 + 28 * ease;
        hand2_x = tx + fwdX * (7 * ease) - latX * (1 - ease);
        hand2_y = ty - 18 + 19 * ease;
        axeAngle = angle - Math.PI * 0.95 + 1.8 * ease;
      } else {
        // Recovery: Return smoothly to ready stance
        const r = (chopU - 0.68) / 0.32;
        hand1_x = tx + fwdX * (16 - 8 * r);
        hand1_y = ty + 1 - 10 * r;
        hand2_x = tx + fwdX * (7 - 4 * r);
        hand2_y = ty + 1 - 8 * r;
        axeAngle = angle + 0.85 - 0.5 * r;
      }
    } else {
      // Idle / Walking ready hold: axe held in two hands across the chest/hip
      hand1_x = tx + fwdX * 7 + latX * 1.5;
      hand1_y = ty - 3 + sinA * 1.5;
      hand2_x = tx + fwdX * 2 - latX * 2;
      hand2_y = ty + 1 + sinA * 1.0;
      axeAngle = angle + 0.35;
    }

    // Connect Left arm: shL -> elbow -> hand2
    // Connect Right arm: shR -> elbow -> hand1
    const elbowL_x = (shL_x + hand2_x) * 0.5 - latX * 1.5;
    const elbowL_y = (shL_y + hand2_y) * 0.5 + 1.5;
    const elbowR_x = (shR_x + hand1_x) * 0.5 + latX * 1.5;
    const elbowR_y = (shR_y + hand1_y) * 0.5 + 1.5;

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(elbowL_x, elbowL_y); ctx.lineTo(hand2_x, hand2_y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(elbowR_x, elbowR_y); ctx.lineTo(hand1_x, hand1_y); ctx.stroke();

    // Wooden haft spanning between both hands and out to axe head
    const hx0 = hand2_x - Math.cos(axeAngle) * 5;
    const hy0 = hand2_y - Math.sin(axeAngle) * 5;
    const hx1 = hand1_x + Math.cos(axeAngle) * 12;
    const hy1 = hand1_y + Math.sin(axeAngle) * 12;
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();

    // Stone axe head clamped at top of haft
    ctx.save();
    ctx.translate(hx1, hy1);
    ctx.rotate(axeAngle);
    ctx.fillStyle = "#5c4028"; ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = "#a4acb8";
    ctx.beginPath();
    ctx.moveTo(0, -3); ctx.lineTo(7, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#d8e0ec"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(7, -8); ctx.lineTo(6, 6); ctx.stroke();
    ctx.restore();

    // Hands clamped over handle
    drawGripHand(hand1_x, hand1_y, 3.2);
    drawGripHand(hand2_x, hand2_y, 3.2);
  } else if (tool === "spear") {
    // Spear ready / thrusting posture
    const thrust = g.pact > 0 ? Math.sin(((0.35 - g.pact) / 0.35) * Math.PI) * 14 : 0;
    const spAngle = angle - 0.25 * (cosA >= 0 ? 1 : -1);
    const hand1_x = tx + cosA * (9 + thrust) + latX * 2;
    const hand1_y = ty - 4 + sinA * (6 + thrust);
    const hand2_x = tx - cosA * 2 - latX * 2;
    const hand2_y = ty - 2;

    const elbowL_x = (shL_x + hand2_x) * 0.5 - latX * 1.5;
    const elbowL_y = (shL_y + hand2_y) * 0.5 + 1.5;
    const elbowR_x = (shR_x + hand1_x) * 0.5 + latX * 1.5;
    const elbowR_y = (shR_y + hand1_y) * 0.5 + 1.5;

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(elbowL_x, elbowL_y); ctx.lineTo(hand2_x, hand2_y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(elbowR_x, elbowR_y); ctx.lineTo(hand1_x, hand1_y); ctx.stroke();

    // Long spear shaft
    const sp0_x = hand2_x - Math.cos(spAngle) * 8;
    const sp0_y = hand2_y - Math.sin(spAngle) * 8;
    const sp1_x = hand1_x + Math.cos(spAngle) * 18;
    const sp1_y = hand1_y + Math.sin(spAngle) * 18;
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sp0_x, sp0_y); ctx.lineTo(sp1_x, sp1_y); ctx.stroke();

    // Sharpened stone tip
    ctx.save(); ctx.translate(sp1_x, sp1_y); ctx.rotate(spAngle);
    ctx.fillStyle = "#5c4028"; ctx.fillRect(-2, -2, 4, 4);
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(10, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    ctx.restore();

    drawGripHand(hand1_x, hand1_y, 3.0);
    drawGripHand(hand2_x, hand2_y, 3.0);
  } else if (tool === "drill") {
    // Friction fire drill
    const drillVibe = Math.sin(Date.now() / 35) * 3.5;
    const hx_d = tx + cosA * 6 + drillVibe;
    const hy_d = ty - 4;

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(hx_d - 2, hy_d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(hx_d + 2, hy_d); ctx.stroke();

    // Vertical spindle
    ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx_d, hy_d - 12); ctx.lineTo(hx_d, hy_d + 10); ctx.stroke();

    drawGripHand(hx_d - 2, hy_d, 3.0);
    drawGripHand(hx_d + 2, hy_d, 3.0);
  } else if (tool === "torch") {
    const tHandX = tx + cosA * 10 + latX * 2;
    const tHandY = ty - 14;
    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(tHandX, tHandY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(tx - 2, ty + 2); ctx.stroke();

    ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tHandX, tHandY); ctx.lineTo(tHandX + cosA * 6, tHandY - 14); ctx.stroke();

    const t = Date.now() / 100;
    ctx.fillStyle = "#ffb14e";
    ctx.beginPath(); ctx.arc(tHandX + cosA * 6, tHandY - 16 + Math.sin(t) * 1.5, 4.5, 0, Math.PI * 2); ctx.fill();

    drawGripHand(tHandX, tHandY, 3.0);
    drawGripHand(tx - 2, ty + 2, 3.0);
  } else if (g.consuming) {
    const isDrink = g.consuming.isDrink;
    const progress = 1 - (g.consuming.timer / g.consuming.total);
    // Dynamic raising and lowering motion
    const raise = Math.sin(Math.min(Math.PI, progress * Math.PI)); // 0..1..0
    
    // Hand positions holding item/container toward mouth
    const holdDist = 5 + (1 - raise) * 6;
    const itemX = tx + cosA * holdDist;
    const itemY = ty - 4 - raise * (isDrink ? 9 : 7);

    const handL_x = itemX - latX * 3.2;
    const handL_y = itemY - latY * 1.5;
    const handR_x = itemX + latX * 3.2;
    const handR_y = itemY + latY * 1.5;

    const elbowL_x = shL_x - latX * 3 + fwdX * 2;
    const elbowL_y = ty + 1;
    const elbowR_x = shR_x + latX * 3 + fwdX * 2;
    const elbowR_y = ty + 1;

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(elbowL_x, elbowL_y); ctx.lineTo(handL_x, handL_y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(elbowR_x, elbowR_y); ctx.lineTo(handR_x, handR_y); ctx.stroke();

    // Render the food or drink container in hands
    if (isDrink) {
      if (g.consuming.item === "snow") {
        // Handful of white snow
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(itemX, itemY, 3.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#bae6fd";
        ctx.beginPath(); ctx.arc(itemX + 0.5, itemY - 0.5, 2.2, 0, Math.PI * 2); ctx.fill();
      } else {
        // Carved birch bark / wooden cup
        ctx.save();
        ctx.translate(itemX, itemY);
        ctx.fillStyle = "#6b4a2d";
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.2, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#38bdf8"; // water glint
        ctx.beginPath();
        ctx.ellipse(0, -0.6, 2.6, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Food piece: roast meat, dried meat, or fish
      const item = g.consuming.item;
      ctx.save();
      ctx.translate(itemX, itemY);
      if (item === "driedMeat") {
        ctx.fillStyle = "#451a03"; // dark cured jerky
        ctx.fillRect(-3, -2, 6, 4);
      } else if (item === "cookedFish" || item === "fish") {
        ctx.fillStyle = item === "cookedFish" ? "#cbd5e1" : "#94a3b8";
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#d97706"; // grilled marks
        ctx.fillRect(-2, -1, 4, 1.5);
      } else {
        // Roasted meat portion
        ctx.fillStyle = "#b45309";
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef08a"; // bone handle
        ctx.fillRect(-4.5, -0.8, 2.5, 1.6);
      }
      ctx.restore();
    }

    drawGripHand(handL_x, handL_y, 3.0);
    drawGripHand(handR_x, handR_y, 3.0);
  } else if (sitT > 0.5 && walk < 0.1) {
    // Sitting: hands resting naturally on knees
    const handL_x = kneeL_x;
    const handL_y = kneeL_y - 2;
    const handR_x = kneeR_x;
    const handR_y = kneeR_y - 2;

    const elbowL_x = (shL_x + handL_x) * 0.5 - latX * 2.2;
    const elbowL_y = (shL_y + handL_y) * 0.5;
    const elbowR_x = (shR_x + handR_x) * 0.5 + latX * 2.2;
    const elbowR_y = (shR_y + handR_y) * 0.5;

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(elbowL_x, elbowL_y); ctx.lineTo(handL_x, handL_y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(elbowR_x, elbowR_y); ctx.lineTo(handR_x, handR_y); ctx.stroke();

    drawGripHand(handL_x, handL_y, 3.0);
    drawGripHand(handR_x, handR_y, 3.0);
  } else {
    // No tool: natural counter-swing or shivering arm-hug in extreme blizzard cold
    const isColdHugging = isStormCold && walk < 0.25;
    let handL_x: number, handL_y: number, elbowL_x: number, elbowL_y: number;
    let handR_x: number, handR_y: number, elbowR_x: number, elbowR_y: number;

    if (isColdHugging) {
      // Arms wrapped tightly across chest, hands tucked in against howling wind
      handL_x = tx + 3; handL_y = ty - 2;
      elbowL_x = shL_x - 3; elbowL_y = ty + 3;
      handR_x = tx - 3; handR_y = ty - 2;
      elbowR_x = shR_x + 3; elbowR_y = ty + 3;
    } else {
      const armSwingL = -Math.sin(stridePhase) * (isRunning ? 7.5 : 5.0) * walk * (isBacking ? -1 : 1);
      const armSwingR = Math.sin(stridePhase) * (isRunning ? 7.5 : 5.0) * walk * (isBacking ? -1 : 1);
      const idleArmSway = Math.sin(idleT * 2.2) * 0.5 * (1 - walk);

      handL_x = shL_x + fwdX * armSwingL * 0.8 - latX * 1.2;
      handL_y = ty + 5 + fwdY * armSwingL * 0.5 + idleArmSway;
      elbowL_x = (shL_x + handL_x) * 0.5 - latX * 1.8 + (armSwingL > 0 ? fwdX * 1.2 : 0);
      elbowL_y = (shL_y + handL_y) * 0.5 + (armSwingL > 0 ? -0.8 : 0.8);

      handR_x = shR_x + fwdX * armSwingR * 0.8 + latX * 1.2;
      handR_y = ty + 5 + fwdY * armSwingR * 0.5 + idleArmSway;
      elbowR_x = (shR_x + handR_x) * 0.5 + latX * 1.8 + (armSwingR > 0 ? fwdX * 1.2 : 0);
      elbowR_y = (shR_y + handR_y) * 0.5 + (armSwingR > 0 ? -0.8 : 0.8);
    }

    ctx.strokeStyle = bodyCol; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shL_x, shL_y); ctx.lineTo(elbowL_x, elbowL_y); ctx.lineTo(handL_x, handL_y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shR_x, shR_y); ctx.lineTo(elbowR_x, elbowR_y); ctx.lineTo(handR_x, handR_y); ctx.stroke();

    drawGripHand(handL_x, handL_y, 3.0);
    drawGripHand(handR_x, handR_y, 3.0);
  }

  // 10. Frozen breath vapor puff drifting in cold weather & blizzard
  const inStorm = g.weather === "storm" && g.storm > 0.3;
  const breathChance = inStorm ? 0.35 : g.temp < 50 ? ((50 - g.temp) / 50) * 0.12 : 0;
  if (Math.random() < breathChance) {
    g.particles.push({
      x: hx + cosA * 6,
      y: hy + 2 + sinA * 2,
      vx: (inStorm ? -g.storm * 48 : cosA * 16) + (Math.random() - 0.5) * 6,
      vy: (inStorm ? (Math.random() - 0.5) * 6 : sinA * 8 - 4) + (Math.random() - 0.5) * 3,
      life: inStorm ? 1.3 : 0.9,
      maxLife: inStorm ? 1.3 : 1,
      color: inStorm ? "rgba(240,248,255,0.72)" : "rgba(255,255,255,0.5)",
      size: inStorm ? 3.4 + Math.random() * 1.8 : 2.8,
      kind: "dust",
      gravity: inStorm ? -1 : -5,
    });
  }

  // 11. Warm firelight illumination on character when near fire or fireplace
  const nearFireWarmth = Math.max(g.fireHeat(), g.fireplaceHeat());
  if (nearFireWarmth > 0.05 || isSitting) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flicker = 0.86 + Math.sin(performance.now() / 130) * 0.14;
    const fireA = (isSitting ? 0.35 : nearFireWarmth * 0.30) * flicker;
    const fg = ctx.createRadialGradient(tx + fwdX * 3, ty + 2, 2, tx + fwdX * 3, ty + 2, 26);
    fg.addColorStop(0, `rgba(255, 145, 45, ${fireA})`);
    fg.addColorStop(0.5, `rgba(255, 105, 25, ${fireA * 0.45})`);
    fg.addColorStop(1, "rgba(255, 80, 0, 0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(tx + fwdX * 3, ty + 2, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
