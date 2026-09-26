import { audio } from "./audio";
import { CLOTHING_WARMTH, DRY_DAYS, FIRE_COST, ITEMS, POT_CAPACITY, RACK_COST, RACK_SLOTS, RECIPES, SHELF_LIFE, SHELTER_COST, SHELTER_NAMES, SHELTER_UPGRADES, SHELTER_WARMTH, WORLD_SIZE } from "./data";
import { JOURNEY, type GuideTarget } from "./journey";
import type { Entity, EntityKind, ItemId, Recipe } from "./types";

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  color: string; size: number; gravity?: number; kind?: "snow" | "spark" | "blood" | "dust" | "leaf";
}
export interface Floater { x: number; y: number; text: string; life: number; color: string; vy: number; }
export interface Projectile { x: number; y: number; vx: number; vy: number; dist: number; max: number; angle: number; }

export interface PublicState {
  health: number; temp: number; hunger: number; thirst: number; stamina: number;
  inventory: Record<string, number>;
  time: number; day: number; score: number; weather: string; ambientTemp: number;
  nearFire: boolean; nearWater: boolean; hasShelter: boolean;
  message: string; actionHint: string; storm: number; frozen: boolean; hurt: boolean;
  journeyIndex: number;
  toastId: number; toastTitle: string; toastMsg: string; toastNext: string;
  fireLighting: number; resting: boolean; restProgress: number; shelterTier: number;
  tracking: boolean; carrying: string | null;
  equipped: ItemId | null; running: boolean;
  interior: boolean; campFireFuel: number; // -1 = no fire pit near the shelter
}

export interface SaveData {
  v: number; seed: number; px: number; py: number;
  health: number; temp: number; hunger: number; thirst: number; stamina: number;
  inventory: Record<string, number>; time: number; day: number; score: number;
  weather: "clear" | "snow" | "storm"; weatherTimer: number;
  journeyIndex: number; treesCut: number; animalsKilled: number; butchered: number; cookedCount: number;
  fuelAdded: number; animalSpotted: boolean; carrying: "rabbit" | "deer" | "wolf" | null; equipped: ItemId | null;
  journeyId?: string; waterMade?: number; waterDrunk?: number; meatHung?: number; driedCollected?: number;
  food?: Partial<Record<ItemId, number[]>>;
  camp: Partial<Entity>[];
}

type Rng = () => number;
function mulberry32(a: number): Rng {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_LENGTH = 420; // seconds per full day
const ANIMALS = ["rabbit", "deer", "wolf"];
const STATIC_OBSTACLES = ["tree", "smallTree", "deadTree", "rock", "bush", "looseBranch", "looseStone", "snowPile", "stump"];

export class Game {
  static INTERACTABLE: EntityKind[] = ["tree", "smallTree", "deadTree", "rock", "looseBranch", "looseStone", "bush", "snowPile", "waterHole", "rabbit", "deer", "wolf", "trap", "firePit", "fire", "shelter", "buildSite", "carcass", "spearOnGround", "dryingRack"];

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;

  rng: Rng = Math.random;
  entities: Entity[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  projectiles: Projectile[] = [];
  nextId = 1;

  px = WORLD_SIZE / 2; py = WORLD_SIZE / 2;
  pfacing = 1; pmoving = false; panim = 0; pact = 0;
  aimX = 1; aimY = 0;
  camX = 0; camY = 0; shake = 0; hurtFlash = 0;

  input = { up: false, down: false, left: false, right: false, run: false };
  prunning = false;
  equipped: ItemId | null = null;
  seed = 0;
  saveTimer = 0;
  fuelAdded = 0;
  onSave?: (d: SaveData) => void;
  joy = { x: 0, y: 0, active: false };

  health = 100; temp = 62; hunger = 82; thirst = 82; stamina = 100;
  inventory: Record<ItemId, number> = {} as any;

  time = 0.26; day = 1; score = 0; alive = true; paused = false; running = true;
  weather: "clear" | "snow" | "storm" = "clear";
  weatherTimer = 60; storm = 0;

  message = ""; messageTimer = 0;
  footTimer = 0;
  warnTimer = 0;

  // journey
  journeyIndex = 0; journeyStarted = -1;
  toastId = 0; toastTitle = ""; toastMsg = ""; toastNext = "";
  treesCut = 0; animalsKilled = 0; butchered = 0; cookedCount = 0;
  waterMade = 0; waterDrunk = 0; meatHung = 0; driedCollected = 0;
  lastAbs = 0; // game time at the previous frame (drives drying)
  animalSpotted = false; trailIdx = -1;
  carrying: "rabbit" | "deer" | "wolf" | null = null;
  guideT: GuideTarget | null = null;
  aimTarget: Entity | null = null;
  animalNear = false;

  fireLighting = -1; fireSite: Entity | null = null;
  resting = false; restProgress = 0;
  tracking = false;
  actHeld = false;
  fishing: { hole: Entity; t: number; bite: boolean; biteT: number } | null = null;

  // shelter interior view (a temporary look inside; no teleport, no time skip)
  interiorHold = false;                 // ENTER SHELTER button / F key held
  shelterPress: { t: number; target: Entity } | null = null; // ACT pressed on the shelter
  eInterior = false;                    // ACT held long enough on the shelter
  wakeLinger = 0;                       // stay inside briefly after waking naturally

  onUpdate?: (s: PublicState) => void;
  onGameOver?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  reset(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.equipped = null; this.fuelAdded = 0; this.saveTimer = 0; this.prunning = false;
    this.entities = []; this.particles = []; this.floaters = []; this.projectiles = [];
    this.nextId = 1;
    this.px = WORLD_SIZE / 2; this.py = WORLD_SIZE / 2;
    this.camX = this.px - this.w / 2; this.camY = this.py - this.h / 2;
    this.health = 100; this.temp = 62; this.hunger = 82; this.thirst = 82; this.stamina = 100;
    this.inventory = {} as any;
    this.time = 0.26; this.day = 1; this.score = 0; this.alive = true; this.paused = false;
    this.weather = "clear"; this.weatherTimer = 60; this.storm = 0;
    this.fireLighting = -1; this.fireSite = null; this.resting = false; this.restProgress = 0;
    this.journeyIndex = 0; this.journeyStarted = -1;
    this.toastId = 0; this.toastTitle = ""; this.toastMsg = ""; this.toastNext = "";
    this.treesCut = 0; this.animalsKilled = 0; this.butchered = 0; this.cookedCount = 0;
    this.waterMade = 0; this.waterDrunk = 0; this.meatHung = 0; this.driedCollected = 0;
    this.food = {}; this.lastAbs = 0;
    this.animalSpotted = false; this.trailIdx = -1; this.carrying = null;
    this.fishing = null; this.actHeld = false; this.hurtFlash = 0; this.shake = 0;
    this.interiorHold = false; this.shelterPress = null; this.eInterior = false; this.wakeLinger = 0;
    this.message = "You wake alone in the snow with nothing. Read your objective (top-left).";
    this.messageTimer = 6;
    this.generateWorld();
  }

  private generateWorld() {
    const r = this.rng;
    const spawn = (kind: EntityKind, count: number, extra?: Partial<Entity>) => {
      for (let i = 0; i < count; i++) {
        const x = 120 + r() * (WORLD_SIZE - 240);
        const y = 120 + r() * (WORLD_SIZE - 240);
        if (Math.hypot(x - this.px, y - this.py) < 180) { i--; continue; }
        this.entities.push({ id: this.nextId++, kind, x, y, seed: r() * 1000, scale: 0.85 + r() * 0.4, ...extra });
      }
    };
    spawn("tree", 200, { hp: 100, maxHp: 100, amount: 2 });
    spawn("smallTree", 240, { hp: 60, maxHp: 60 });
    spawn("deadTree", 70, { hp: 40, maxHp: 40 });
    spawn("rock", 70, { hp: 60, maxHp: 60 });
    spawn("looseBranch", 340);
    spawn("looseStone", 240);
    spawn("bush", 170);
    spawn("snowPile", 170);
    spawn("waterHole", 26);
    for (let i = 0; i < 40; i++) this.spawnAnimal("rabbit");
    for (let i = 0; i < 18; i++) this.spawnAnimal("deer");
    for (let i = 0; i < 6; i++) this.spawnAnimal("wolf");

    const ring = (kind: EntityKind, n: number, rad: number, extra?: Partial<Entity>) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5;
        const dd = rad * (0.55 + r() * 0.7);
        this.entities.push({ id: this.nextId++, kind, x: this.px + Math.cos(a) * dd, y: this.py + Math.sin(a) * dd, scale: 0.9 + r() * 0.25, seed: r() * 1000, ...extra });
      }
    };
    ring("looseBranch", 13, 190);
    ring("looseStone", 9, 210);
    ring("smallTree", 7, 300, { hp: 60, maxHp: 60 });
    ring("bush", 4, 240);
    ring("snowPile", 3, 160);
    this.entities.push({ id: this.nextId++, kind: "waterHole", x: this.px - 380, y: this.py + 240 });
  }

  spawnAnimal(kind: "rabbit" | "deer" | "wolf") {
    const r = this.rng;
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 120 + r() * (WORLD_SIZE - 240);
      y = 120 + r() * (WORLD_SIZE - 240);
      if (Math.hypot(x - WORLD_SIZE / 2, y - WORLD_SIZE / 2) > 550 && Math.hypot(x - this.px, y - this.py) > 500) break;
    }
    this.entities.push({
      id: this.nextId++, kind, x, y, vx: 0, vy: 0,
      hp: kind === "deer" ? 3 : kind === "wolf" ? 4 : 1,
      maxHp: kind === "deer" ? 3 : kind === "wolf" ? 4 : 1,
      wanderT: r() * 3, seed: r() * 1000, scale: 0.9 + r() * 0.3, alert: 0,
    });
  }

  // ---------- inventory ----------
  add(item: ItemId, qty = 1) {
    this.inventory[item] = (this.inventory[item] || 0) + qty;
    if (SHELF_LIFE[item]) { const b = this.food[item] || (this.food[item] = []); for (let i = 0; i < qty; i++) b.push(this.absTime()); }
  }
  has(item: ItemId, qty = 1) { return (this.inventory[item] || 0) >= qty; }
  remove(item: ItemId, qty = 1) {
    const had = this.inventory[item] || 0;
    this.inventory[item] = Math.max(0, had - qty);
    if (this.inventory[item] === 0) delete this.inventory[item];
    // oldest food is used first
    const b = this.food[item];
    if (b) b.splice(0, Math.min(b.length, had - (this.inventory[item] || 0)));
  }

  // ---------- food freshness ----------
  food: Partial<Record<ItemId, number[]>> = {}; // per perishable item: creation times (game days), oldest first
  absTime() { return this.day + this.time; }
  // 0 = fresh .. 1 = about to spoil (oldest piece)
  foodAge(item: ItemId): number {
    const life = SHELF_LIFE[item]; const b = this.food[item];
    if (!life || !b || !b.length) return 0;
    return Math.min(1, (this.absTime() - b[0]) / life);
  }
  private updateSpoilage() {
    const now = this.absTime();
    for (const k in this.food) {
      const item = k as ItemId; const life = SHELF_LIFE[item]!; const b = this.food[item]!;
      // keep batches in sync with the inventory count (safety)
      const have = this.inventory[item] || 0;
      while (b.length > have) b.shift();
      while (b.length < have) b.push(now);
      let spoiled = 0;
      while (b.length && now - b[0] > life) { b.shift(); spoiled++; }
      if (spoiled) {
        this.inventory[item] = Math.max(0, have - spoiled);
        if (!this.inventory[item]) delete this.inventory[item];
        this.msg(`${spoiled} ${ITEMS[item].name.toLowerCase()} spoiled. Dry extra meat on a rack to preserve it.`, 5);
        this.floater(this.px, this.py - 50, `${ITEMS[item].icon} spoiled`, "#a3a38a");
      }
    }
  }

  // ---------- water ----------
  potsInUse() {
    let n = 0;
    for (const e of this.entities) if (e.cook) for (const c of e.cook) if (c.pot) n++;
    return n;
  }
  waterCapacity() { return (this.inventory.barkPot || 0) * POT_CAPACITY; }
  waterHeld() { return (this.inventory.water || 0) + (this.inventory.streamWater || 0) + this.potsInUse(); }
  campfireInRange(): Entity | null { return this.nearest((e) => e.kind === "fire" && (e.fuel || 0) > 0, 140); }
  cookingOf(out: ItemId) {
    for (const e of this.entities) if (e.cook) for (const c of e.cook) if (c.out === out) return c;
    return null;
  }
  hasCost(cost: Partial<Record<ItemId, number>>) {
    for (const k in cost) if (!this.has(k as ItemId, cost[k as ItemId]!)) return false;
    return true;
  }
  payCost(cost: Partial<Record<ItemId, number>>) {
    for (const k in cost) this.remove(k as ItemId, cost[k as ItemId]!);
  }
  missingText(cost: Partial<Record<ItemId, number>>) {
    const parts: string[] = [];
    for (const k in cost) {
      const need = cost[k as ItemId]! - (this.inventory[k as ItemId] || 0);
      if (need > 0) parts.push(`${need} ${ITEMS[k as ItemId].name.toLowerCase()}`);
    }
    return "Still need: " + parts.join(", ");
  }
  hasSpearAnywhere() {
    return this.has("spear") || this.entities.some((e) => e.kind === "spearOnGround") || this.projectiles.length > 0;
  }

  floater(x: number, y: number, text: string, color = "#fff") { this.floaters.push({ x, y, text, life: 1.3, color, vy: -34 }); }
  msg(t: string, dur = 3.5) { this.message = t; this.messageTimer = dur; }
  addShake(a: number) { this.shake = Math.min(18, this.shake + a); }
  burst(x: number, y: number, color: string, n: number, kind: Particle["kind"] = "dust", spd = 90) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const s = spd * (0.3 + this.rng());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.6 + this.rng() * 0.5, maxLife: 1, color, kind, size: 2 + this.rng() * 3, gravity: kind === "spark" ? 60 : 220 });
    }
  }

  // ---------- crafting ----------
  // why a recipe can't be made right now ("" = it can)
  craftBlock(rec: Recipe): string {
    if (!this.hasCost(rec.cost)) return this.missingText(rec.cost);
    if (rec.needFire && !this.nearFire()) return "You need to be at your burning campfire.";
    if (rec.timed) {
      const f = this.campfireInRange();
      if (f && (f.cook?.length || 0) >= 3) return "The fire is full. Wait for something to finish.";
      if (rec.out === "water") {
        if (!this.has("barkPot")) return "You need a bark pot to melt snow or boil water.";
        if (this.potsInUse() >= (this.inventory.barkPot || 0)) return "Your bark pot is already on the fire.";
        // melting snow adds a new portion; boiling converts one you already carry
        if (rec.id === "water" && this.waterHeld() >= this.waterCapacity()) return "Your pot is full. Drink some water first.";
      }
    }
    return "";
  }
  canCraft(rec: Recipe) { return this.craftBlock(rec) === ""; }
  canCraftId(id: string) {
    const rec = RECIPES.find((r) => r.id === id);
    return !!rec && this.canCraft(rec);
  }
  craft(recId: string) {
    const rec = RECIPES.find((r) => r.id === recId);
    if (!rec) return;
    const block = this.craftBlock(rec);
    if (block) { audio.hurt(); this.msg(block); return; }
    this.payCost(rec.cost);
    if (rec.timed) {
      // it goes ON the fire and takes real time
      const f = this.campfireInRange()!;
      (f.cook || (f.cook = [])).push({ out: rec.out, qty: rec.outQty, t: 0, dur: rec.timed, icon: rec.icon, pot: rec.out === "water" });
      audio.craft(); this.pact = 0.35;
      this.pfacing = f.x >= this.px ? 1 : -1;
      this.burst(f.x, f.y - 6, "#ffb14e", 8, "spark", 60);
      this.floater(f.x, f.y - 44, rec.out === "water" ? "Pot set by the coals…" : "On the fire…", "#fde68a");
      this.msg(rec.out === "water" ? `The snow is melting. Stay near (${rec.timed}s).` : `${rec.name}: it needs ${rec.timed}s over the flames.`, 3);
      return;
    }
    this.add(rec.out, rec.outQty);
    if (rec.out === "axe" || rec.out === "spear") this.equip(rec.out, true);
    audio.craft();
    this.pact = 0.35;
    this.floater(this.px, this.py - 46, rec.out === "axe" || rec.out === "spear" ? `+ ${rec.name} (in hand)` : `+ ${rec.name}`, "#7dd3fc");
    this.burst(this.px, this.py - 20, rec.needFire ? "#ffb14e" : "#e2e8f0", 10, rec.needFire ? "spark" : "dust", 70);
    this.addShake(3);
  }

  // ---------- world queries ----------
  nearFire() { return this.entities.some((e) => e.kind === "fire" && (e.fuel || 0) > 0 && Math.hypot(e.x - this.px, e.y - this.py) < 140); }
  nearWater() { return this.entities.some((e) => e.kind === "waterHole" && Math.hypot(e.x - this.px, e.y - this.py) < 90); }
  hasShelter() { return this.entities.some((e) => e.kind === "shelter" && Math.hypot(e.x - this.px, e.y - this.py) < 130); }
  // tier of a shelter near a given point (a hut shelters its fire from the wind)
  currentShelterTierAt(p: { x: number; y: number }) {
    let t = 0;
    for (const e of this.entities) if (e.kind === "shelter" && Math.hypot(e.x - p.x, e.y - p.y) < 160) t = Math.max(t, e.tier || 1);
    return t;
  }
  // radiant heat: strongest right at the fire, fading with distance, weaker when fuel is low
  fireHeat() {
    let h = 0;
    for (const e of this.entities) {
      if (e.kind !== "fire" || (e.fuel || 0) <= 0) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      const k = Math.max(0, 1 - d / 210);
      h = Math.max(h, Math.pow(k, 0.8) * Math.min(1, (e.fuel || 0) / 30 + 0.35));
    }
    return h;
  }
  currentShelterTier() {
    let t = 0;
    for (const e of this.entities) if (e.kind === "shelter" && Math.hypot(e.x - this.px, e.y - this.py) < 130) t = Math.max(t, e.tier || 1);
    return t;
  }
  clothingWarmth() {
    let w = 0;
    for (const id in CLOTHING_WARMTH) if (this.has(id as ItemId)) w += CLOTHING_WARMTH[id as ItemId]!;
    return w;
  }
  nearest(pred: (e: Entity) => boolean, maxD = 1e9) {
    let best: Entity | null = null; let bd = maxD;
    for (const e of this.entities) {
      if (e.dead || !pred(e)) continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // guide target helpers (used by journey)
  nearestOf(kind: EntityKind, label: string): GuideTarget | null {
    const e = this.nearest((x) => x.kind === kind, 1400);
    return e ? { x: e.x, y: e.y, label } : null;
  }
  nearestAnimal(): GuideTarget | null {
    const e = this.nearest((x) => x.kind === "rabbit" || x.kind === "deer", 1600);
    return e ? { x: e.x, y: e.y, label: e.kind === "deer" ? "Deer" : "Rabbit" } : null;
  }
  rackTarget(label: string): GuideTarget | null {
    const e = this.nearest((x) => x.kind === "dryingRack");
    return e ? { x: e.x, y: e.y, label } : null;
  }
  // ---------- drying rack ----------
  rack(): Entity | null { return this.entities.find((e) => e.kind === "dryingRack") || null; }
  rackHanging() { const r = this.rack(); return r?.slots?.length || 0; }
  rackDried() { const r = this.rack(); return r?.slots?.filter((s) => s >= 1).length || 0; }
  constructRackAt(x: number, y: number) {
    if (this.entities.some((e) => e.kind === "dryingRack")) { this.msg("You already have a drying rack at camp."); return false; }
    if (!this.hasCost(RACK_COST)) { this.msg("Drying rack: " + this.missingText(RACK_COST)); audio.hurt(); return false; }
    this.payCost(RACK_COST);
    this.entities.push({ id: this.nextId++, kind: "dryingRack", x, y, slots: [] });
    audio.craft(); audio.chop(); this.addShake(4); this.pact = 0.35;
    this.burst(x, y - 20, "#c8a06a", 18, "dust", 90);
    this.floater(x, y - 60, "Drying rack built!", "#fcd34d");
    this.msg("Hang raw meat on it (ACT). The cold air and the fire's smoke will dry it.", 5);
    return true;
  }
  buildRack() {
    const site = this.entities.find((e) => e.kind === "buildSite" && e.site === "rack" && Math.hypot(e.x - this.px, e.y - this.py) < 220);
    const x = site ? site.x : this.px + this.pfacing * 50, y = site ? site.y : this.py + 10;
    if (this.constructRackAt(x, y) && site) site.dead = true;
  }
  private useRack(r: Entity) {
    const slots = r.slots || (r.slots = []);
    const done = slots.filter((s) => s >= 1).length;
    if (done > 0) {
      r.slots = slots.filter((s) => s < 1);
      this.add("driedMeat", done);
      this.driedCollected += done;
      audio.pickup(); this.pact = 0.35;
      this.floater(r.x, r.y - 56, `+${done} 🥓 dried meat`, "#fcd34d");
      return;
    }
    if (this.has("meat") && slots.length < RACK_SLOTS) {
      this.remove("meat", 1); // the oldest piece goes up first
      slots.push(0);
      this.meatHung++;
      audio.pickup(); this.pact = 0.35;
      this.floater(r.x, r.y - 56, `Meat hung (${slots.length}/${RACK_SLOTS})`, "#fca5a5");
      return;
    }
    if (!slots.length) { this.msg(this.has("meat") ? "" : "The rack is empty. Hang extra raw meat here to preserve it."); return; }
    const best = Math.max(...slots);
    const hrs = Math.max(1, Math.round((1 - best) * DRY_DAYS * 24));
    this.msg(slots.length >= RACK_SLOTS && this.has("meat") ? "The rack is full." : `The meat is drying: about ${hrs} more hours. Smoke from the fire speeds it up.`);
  }
  // game-time driven: drying continues while you explore and while you sleep
  private updateRacks(daysPassed: number) {
    if (daysPassed <= 0) return;
    for (const r of this.entities) {
      if (r.kind !== "dryingRack" || !r.slots?.length) continue;
      const smoky = this.entities.some((f) => f.kind === "fire" && (f.fuel || 0) > 0 && Math.hypot(f.x - r.x, f.y - r.y) < 200);
      const wet = this.weather === "storm" ? 0.5 : 1;
      const rate = (daysPassed / DRY_DAYS) * (smoky ? 1.5 : 1) * wet;
      let finished = 0;
      r.slots = r.slots.map((s) => { const n = Math.min(1, s + rate); if (s < 1 && n >= 1) finished++; return n; });
      if (finished && Math.hypot(r.x - this.px, r.y - this.py) < 900 && !this.resting) {
        this.floater(r.x, r.y - 56, "🥓 Dried!", "#fcd34d");
        this.msg("Meat on the drying rack is ready. Collect it (ACT on the rack).", 4);
      }
    }
  }
  // fire cooking: things on the fire only progress while it burns; finished food is taken when you're close
  private updateCooking(dt: number) {
    for (const f of this.entities) {
      if (!f.cook?.length) continue;
      const burning = f.kind === "fire" && (f.fuel || 0) > 0;
      const near = Math.hypot(f.x - this.px, f.y - this.py) < 170;
      for (const c of f.cook) if (burning && c.t < c.dur) {
        c.t = Math.min(c.dur, c.t + dt);
        if (c.t >= c.dur && !near) this.floater(f.x, f.y - 50, `${c.icon} ready`, "#fde68a");
      }
      if (!near) continue;
      const ready = f.cook.filter((c) => c.t >= c.dur);
      if (!ready.length) continue;
      f.cook = f.cook.filter((c) => c.t < c.dur);
      for (const c of ready) {
        this.add(c.out, c.qty);
        if (c.out === "cookedMeat" || c.out === "cookedFish") this.cookedCount++;
        if (c.out === "water") this.waterMade++;
        this.floater(f.x, f.y - 50, `+${c.qty} ${ITEMS[c.out].icon} ${ITEMS[c.out].name}`, c.out === "water" ? "#7dd3fc" : "#fbbf24");
        audio.pickup();
      }
      this.msg(ready.some((c) => c.out === "water") ? "Warm water. Tap 💧 in your pack to drink." : "Cooked. Tap it in your pack to eat.", 3);
    }
  }
  siteTarget(site: "shelter" | "fire" | "rack", label: string): GuideTarget | null {
    const e = this.entities.find((x) => x.kind === "buildSite" && x.site === site);
    return e ? { x: e.x, y: e.y, label } : null;
  }
  fireTarget(label: string): GuideTarget | null {
    const e = this.nearest((x) => x.kind === "fire" || x.kind === "firePit");
    return e ? { x: e.x, y: e.y, label } : null;
  }
  shelterTarget(label: string): GuideTarget | null {
    const e = this.nearest((x) => x.kind === "shelter");
    return e ? { x: e.x, y: e.y, label } : null;
  }
  guidedDeer() { return this.entities.find((e) => e.guided && e.kind === "deer" && !e.dead) || null; }
  trailTarget(): GuideTarget | null {
    const tracks = this.entities.filter((e) => e.guided && e.kind === "trackDeer").sort((a, b) => (a.seed || 0) - (b.seed || 0));
    const deer = this.guidedDeer();
    const next = tracks.find((t) => (t.seed || 0) > this.trailIdx + 2);
    if (next) return { x: next.x, y: next.y, label: "Tracks" };
    return deer ? { x: deer.x, y: deer.y, label: "Deer" } : null;
  }
  huntTarget(): GuideTarget | null {
    if (!this.has("spear")) {
      const s = this.entities.find((e) => e.kind === "spearOnGround");
      if (s) return { x: s.x, y: s.y, label: "Your spear" };
    }
    const carcass = this.nearest((e) => e.kind === "carcass");
    if (carcass) return { x: carcass.x, y: carcass.y, label: "Carcass" };
    const d = this.guidedDeer();
    if (d) return { x: d.x, y: d.y, label: "Deer" };
    return this.nearestAnimal();
  }

  // ---------- journey support ----------
  placeSite(site: "shelter" | "fire" | "rack") {
    this.entities = this.entities.filter((e) => !(e.kind === "buildSite" && e.site === site));
    if (site === "rack" && this.entities.some((e) => e.kind === "dryingRack")) return;
    let x: number, y: number;
    if (site === "shelter") {
      x = this.px + this.pfacing * 130; y = this.py - 20;
    } else if (site === "rack") {
      // beside the fire, on the far side from the shelter, so the smoke drifts through it
      const sh = this.nearest((e) => e.kind === "shelter");
      const f = this.nearest((e) => e.kind === "fire" || e.kind === "firePit");
      if (f && sh) { x = f.x + (f.x >= sh.x ? 95 : -95); y = f.y + 35; }
      else if (f) { x = f.x + 95; y = f.y + 30; }
      else { x = this.px + 80; y = this.py + 40; }
    } else {
      const sh = this.nearest((e) => e.kind === "shelter");
      if (sh) { x = sh.x + 12; y = sh.y + 85; } else { x = this.px + 60; y = this.py + 40; }
    }
    x = Math.max(120, Math.min(WORLD_SIZE - 120, x));
    y = Math.max(120, Math.min(WORLD_SIZE - 120, y));
    // clear a small area so the site is buildable
    const clear = site === "shelter" ? 75 : site === "rack" ? 40 : 45;
    this.entities = this.entities.filter((e) => !(STATIC_OBSTACLES.includes(e.kind) && Math.hypot(e.x - x, e.y - y) < clear));
    this.entities.push({ id: this.nextId++, kind: "buildSite", site, x, y });
  }

  spawnGuidedDeer() {
    if (this.guidedDeer()) return;
    const origin = this.nearest((e) => e.kind === "fire") || { x: this.px, y: this.py };
    const a = this.rng() * Math.PI * 2;
    const dist = 620;
    const dx = Math.max(150, Math.min(WORLD_SIZE - 150, origin.x + Math.cos(a) * dist));
    const dy = Math.max(150, Math.min(WORLD_SIZE - 150, origin.y + Math.sin(a) * dist));
    this.entities.push({ id: this.nextId++, kind: "deer", x: dx, y: dy, vx: 0, vy: 0, hp: 3, maxHp: 3, wanderT: 1, scale: 1.05, guided: true, targetX: dx, targetY: dy, alert: 0 });
    // footprint trail from camp to the deer
    const sx = origin.x + Math.cos(a) * 70, sy = origin.y + Math.sin(a) * 70;
    const len = Math.hypot(dx - sx, dy - sy);
    const steps = Math.floor(len / 32);
    const px = -Math.sin(a), py = Math.cos(a);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const wob = Math.sin(t * 9) * 26;
      this.entities.push({ id: this.nextId++, kind: "trackDeer", x: sx + (dx - sx) * t + px * wob, y: sy + (dy - sy) * t + py * wob, life: 99999, guided: true, seed: i, angle: a });
    }
    this.trailIdx = -1;
  }

  // ---------- construction ----------
  constructShelterAt(x: number, y: number) {
    if (!this.hasCost(SHELTER_COST)) { this.msg(this.missingText(SHELTER_COST)); audio.hurt(); return false; }
    this.payCost(SHELTER_COST);
    this.entities.push({ id: this.nextId++, kind: "shelter", x, y, built: true, tier: 1 });
    audio.craft(); this.addShake(6); this.pact = 0.35;
    this.burst(x, y - 10, "#c8a06a", 26, "dust", 110);
    this.floater(x, y - 60, "Lean-to built!", "#fcd34d");
    return true;
  }
  constructFirePitAt(x: number, y: number) {
    if (!this.hasCost(FIRE_COST)) { this.msg(this.missingText(FIRE_COST)); audio.hurt(); return null; }
    this.payCost(FIRE_COST);
    const f: Entity = { id: this.nextId++, kind: "firePit", x, y, fuel: 0 };
    this.entities.push(f);
    audio.chop(); this.addShake(3);
    this.burst(x, y, "#9ca3af", 14, "dust", 70);
    this.floater(x, y - 26, "Fire pit ready. HOLD ACT", "#fcd34d");
    return f;
  }
  buildFire() {
    if (this.entities.some((e) => (e.kind === "fire" || e.kind === "firePit") && Math.hypot(e.x - this.px, e.y - this.py) < 100)) { this.msg("There's already a fire here."); audio.hurt(); return; }
    const site = this.entities.find((e) => e.kind === "buildSite" && e.site === "fire" && Math.hypot(e.x - this.px, e.y - this.py) < 200);
    const x = site ? site.x : this.px, y = site ? site.y : this.py + 24;
    if (this.constructFirePitAt(x, y) && site) site.dead = true;
    this.msg("Stand at the fire pit and HOLD ACT to spin the fire drill.", 5);
  }
  buildShelter() {
    if (this.entities.some((e) => e.kind === "shelter" && Math.hypot(e.x - this.px, e.y - this.py) < 160)) { this.msg("You already have a shelter here."); audio.hurt(); return; }
    const site = this.entities.find((e) => e.kind === "buildSite" && e.site === "shelter" && Math.hypot(e.x - this.px, e.y - this.py) < 220);
    const x = site ? site.x : this.px, y = site ? site.y : this.py + 30;
    if (this.constructShelterAt(x, y) && site) site.dead = true;
  }
  // Improve the SAME shelter one stage at a time.
  upgradeShelter(e: Entity) {
    const tier = e.tier || 1;
    const up = SHELTER_UPGRADES[tier];
    if (!up) { this.msg("Your winter hut. Press 😴 REST (R) to sleep inside."); return; }
    if (!this.hasCost(up.cost)) {
      const upgradeStep = JOURNEY.findIndex((s) => s.id === "reinforce");
      if (tier === 1 && this.journeyIndex < upgradeStep) { this.msg("Your lean-to. Press 😴 REST (R) to sleep here."); return; }
      this.msg(`${up.name}: ${this.missingText(up.cost)}`); audio.hurt(); return;
    }
    this.payCost(up.cost);
    e.tier = tier + 1;
    audio.craft(); audio.chop(); this.addShake(7); this.pact = 0.35;
    this.burst(e.x, e.y - 20, "#c8a06a", 30, "dust", 120);
    this.burst(e.x, e.y - 40, "#ffffff", 16, "snow", 80);
    this.floater(e.x, e.y - 74, `${SHELTER_NAMES[e.tier]} built!`, "#fcd34d");
    this.msg(up.done, 4);
  }
  nextShelterUpgrade(): { name: string; cost: Partial<Record<ItemId, number>> } | null {
    const s = this.entities.find((e) => e.kind === "shelter");
    return s ? SHELTER_UPGRADES[s.tier || 1] || null : null;
  }

  // ---------- tools ----------
  equip(tool: ItemId | null, quiet = false) {
    if (tool && !this.has(tool)) return;
    if (this.equipped === tool) return;
    this.equipped = tool;
    if (!quiet && tool) {
      audio.pickup();
      this.floater(this.px, this.py - 52, `${ITEMS[tool].icon} ${ITEMS[tool].name} in hand`, "#e2e8f0");
    }
  }
  cycleTool() {
    const tools = (["axe", "spear"] as ItemId[]).filter((t) => this.has(t));
    if (!tools.length) { this.msg("You have no tools yet."); return; }
    const i = this.equipped ? tools.indexOf(this.equipped) : -1;
    this.equip(tools[(i + 1) % tools.length]);
  }

  // ---------- persistence: the camp & progress survive between sessions ----------
  serialize(): SaveData {
    const campKinds: EntityKind[] = ["shelter", "fire", "firePit", "trap", "stump", "buildSite", "carcass", "spearOnGround", "dryingRack"];
    const flying: Partial<Entity>[] = this.projectiles.map((p) => ({ kind: "spearOnGround" as EntityKind, x: p.x, y: p.y + 20, angle: 0 }));
    return {
      v: 2, seed: this.seed, px: this.px, py: this.py,
      health: this.health, temp: this.temp, hunger: this.hunger, thirst: this.thirst, stamina: this.stamina,
      inventory: { ...this.inventory }, time: this.time, day: this.day, score: this.score,
      weather: this.weather, weatherTimer: this.weatherTimer,
      journeyIndex: this.journeyIndex, treesCut: this.treesCut, animalsKilled: this.animalsKilled,
      butchered: this.butchered, cookedCount: this.cookedCount, fuelAdded: this.fuelAdded,
      animalSpotted: this.animalSpotted, carrying: this.carrying, equipped: this.equipped,
      journeyId: JOURNEY[this.journeyIndex]?.id,
      waterMade: this.waterMade, waterDrunk: this.waterDrunk, meatHung: this.meatHung, driedCollected: this.driedCollected,
      food: JSON.parse(JSON.stringify(this.food)),
      camp: this.entities.filter((e) => campKinds.includes(e.kind) && !e.dead).map((e): Partial<Entity> => ({
        kind: e.kind, x: e.x, y: e.y, tier: e.tier, fuel: e.fuel, built: e.built, caught: e.caught, life: e.life,
        site: e.site, carcassOf: e.carcassOf, angle: e.angle, scale: e.scale, baited: e.baited,
        cook: e.cook ? e.cook.map((c) => ({ ...c })) : undefined, slots: e.slots ? [...e.slots] : undefined,
      })).concat(flying),
    };
  }
  restore(d: SaveData) {
    this.reset(d.seed);
    this.px = d.px; this.py = d.py;
    this.camX = this.px - this.w / 2; this.camY = this.py - this.h / 2;
    this.health = d.health; this.temp = d.temp; this.hunger = d.hunger; this.thirst = d.thirst; this.stamina = d.stamina;
    this.inventory = { ...(d.inventory as Record<ItemId, number>) };
    this.time = d.time; this.day = d.day; this.score = d.score;
    this.weather = d.weather; this.weatherTimer = d.weatherTimer;
    // find the step by id (new steps may have been inserted since the save was made)
    const OLD_ORDER = ["gather", "wood", "shelter", "fire", "warm", "find", "spear", "hunt", "carry", "cook", "clothes", "night", "reinforce", "hut", "endure", "forever"];
    const id = d.journeyId || OLD_ORDER[d.journeyIndex];
    const idx = JOURNEY.findIndex((s) => s.id === id);
    this.journeyIndex = idx >= 0 ? idx : Math.min(d.journeyIndex, JOURNEY.length - 1);
    this.treesCut = d.treesCut; this.animalsKilled = d.animalsKilled; this.butchered = d.butchered;
    this.cookedCount = d.cookedCount; this.fuelAdded = d.fuelAdded || 0;
    this.waterMade = d.waterMade || 0; this.waterDrunk = d.waterDrunk || 0;
    this.meatHung = d.meatHung || 0; this.driedCollected = d.driedCollected || 0;
    this.food = d.food ? JSON.parse(JSON.stringify(d.food)) : {};
    this.animalSpotted = d.animalSpotted; this.carrying = d.carrying;
    this.equipped = d.equipped && this.has(d.equipped) ? d.equipped : null;
    // clear the regenerated world where the camp stands, then put the camp back
    for (const c of d.camp) {
      const clear = c.kind === "shelter" ? 70 : c.kind === "fire" || c.kind === "firePit" || c.kind === "dryingRack" ? 40 : 0;
      if (clear) this.entities = this.entities.filter((e) => !(STATIC_OBSTACLES.includes(e.kind) && Math.hypot(e.x - c.x!, e.y - c.y!) < clear));
      if (c.kind === "stump") this.entities = this.entities.filter((e) => !((e.kind === "smallTree" || e.kind === "tree") && Math.hypot(e.x - c.x!, e.y - c.y!) < 8));
      this.entities.push({ ...(c as Entity), id: this.nextId++ });
    }
    this.message = `Day ${this.day}. Your camp is as you left it.`;
    this.messageTimer = 4;
  }

  // a fresh deer and footprint trail from camp, for when the player needs more hides
  huntTrail(): GuideTarget | null {
    if (!this.has("spear") && !this.hasSpearAnywhere()) return this.nearestAnimal();
    const carcass = this.nearest((e) => e.kind === "carcass", 1600);
    if (carcass) return { x: carcass.x, y: carcass.y, label: "Carcass" };
    if (!this.guidedDeer()) this.spawnGuidedDeer();
    return this.trailTarget();
  }
  addFuel() {
    const f = this.nearest((e) => e.kind === "fire", 150);
    if (!f) {
      if (this.nearest((e) => e.kind === "firePit", 150)) { this.msg("The fire is out. HOLD ACT at the pit to relight it."); }
      else this.msg("No fire nearby.");
      audio.hurt(); return;
    }
    const item: ItemId | null = this.has("wood") ? "wood" : this.has("branch") ? "branch" : null;
    if (!item) { this.msg("You need wood or branches to feed the fire."); audio.hurt(); return; }
    if ((f.fuel || 0) >= 96) { this.msg("The fire is burning well. Save your wood for later."); return; }
    this.remove(item, 1);
    this.fuelAdded++;
    f.fuel = Math.min(100, (f.fuel || 0) + (item === "wood" ? 25 : 12));
    audio.chop(); this.pact = 0.35;
    this.burst(f.x, f.y, "#ffb14e", 14, "spark", 130);
    this.floater(f.x, f.y - 34, item === "wood" ? "+log 🔥" : "+branch 🔥", "#ffb14e");
  }
  placeTrap() {
    if (!this.has("trap")) { this.msg("Craft a snare first."); audio.hurt(); return; }
    this.remove("trap", 1);
    this.entities.push({ id: this.nextId++, kind: "trap", x: this.px + 24, y: this.py, baited: true, caught: null, life: 0 });
    audio.craft();
    this.floater(this.px, this.py - 30, "Snare set", "#a3e635");
  }
  rest() {
    if (!this.hasShelter()) { this.msg("You can only rest inside a shelter."); audio.hurt(); return; }
    if (this.carrying) { this.msg("Butcher the carcass first."); return; }
    if (this.resting) { this.resting = false; return; }
    this.resting = true; this.restProgress = 0;
    this.msg("You curl up in the shelter. The fire crackles…", 3);
  }
  eat(item: ItemId) {
    if (!this.has(item)) return;
    this.remove(item, 1);
    if (item === "water") {
      this.thirst = Math.min(100, this.thirst + 35); this.waterDrunk++;
      this.temp = Math.min(100, this.temp + 1.5); // warm melt water
      audio.drink(); this.floater(this.px, this.py - 44, "+Thirst 💧", "#38bdf8"); return;
    }
    if (item === "streamWater") {
      this.thirst = Math.min(100, this.thirst + 22); this.temp = Math.max(0, this.temp - 6);
      audio.drink(); this.floater(this.px, this.py - 44, "+Thirst (icy)", "#bae6fd");
      if (this.rng() < 0.3) { this.health = Math.max(1, this.health - 8); this.floater(this.px, this.py - 24, "Stomach cramps: boil it next time", "#ef4444"); }
      return;
    }
    if (item === "snow") {
      // eating snow costs body heat and barely helps. Melt it instead.
      this.thirst = Math.min(100, this.thirst + 4); this.temp = Math.max(0, this.temp - 9);
      audio.drink(); this.floater(this.px, this.py - 44, "Brr! Barely helps", "#bae6fd");
      this.msg("Eating snow chills your body and hardly quenches thirst. Melt it at the fire in a bark pot.", 4);
      return;
    }
    const val = item === "cookedMeat" ? 40 : item === "cookedFish" ? 30 : item === "driedMeat" ? 28 : 12;
    if (item === "driedMeat") this.health = Math.min(100, this.health + 2);
    this.hunger = Math.min(100, this.hunger + val);
    audio.eat();
    this.floater(this.px, this.py - 44, "+Hunger", "#f59e0b");
    if (item === "cookedMeat" || item === "cookedFish") this.health = Math.min(100, this.health + 5);
    if (item === "meat" || item === "fish") { this.health = Math.max(1, this.health - 8); this.floater(this.px, this.py - 24, "Raw! You feel sick", "#ef4444"); }
  }

  // ---------- interaction ----------
  private nearestInteractable() {
    return this.nearest((e) => Game.INTERACTABLE.includes(e.kind) && !(e.kind === "buildSite" && false), 74);
  }

  throwTargetCandidate(): Entity | null {
    let best: Entity | null = null; let bd = 260;
    for (const e of this.entities) {
      if (e.dead || !ANIMALS.includes(e.kind)) continue;
      const dx = e.x - this.px, dy = (e.y - 10) - (this.py - 20);
      const d = Math.hypot(dx, dy);
      if (d > 250 || d < 1) continue;
      const dot = (dx / d) * this.aimX + (dy / d) * this.aimY;
      if (dot > 0.6 && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private throwSpear(t: Entity) {
    this.remove("spear", 1);
    this.equipped = null;
    const sx = this.px, sy = this.py - 22;
    // accuracy falls off with distance, and throwing while moving or exhausted is sloppy
    const d = Math.hypot(t.x - sx, (t.y - 10) - sy);
    const spread = 0.03 + Math.pow(d / 250, 2) * 0.12 + (this.pmoving ? 0.07 : 0) + (this.stamina < 20 ? 0.05 : 0);
    const ang = Math.atan2((t.y - 10) - sy, t.x - sx) + (this.rng() - 0.5) * 2 * spread;
    const sp = 520;
    this.projectiles.push({ x: sx, y: sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dist: 0, max: 300, angle: ang });
    this.pfacing = Math.cos(ang) >= 0 ? 1 : -1;
    this.pact = 0.35;
    this.stamina = Math.max(0, this.stamina - 6);
    t.alert = Math.min(1, (t.alert || 0) + 0.35);
    audio.throwWhoosh();
    this.addShake(2);
  }

  private butcher() {
    const k = this.carrying!;
    const y = k === "deer" ? { meat: 4, hide: 3, bone: 2 } : k === "wolf" ? { meat: 2, hide: 2, bone: 2 } : { meat: 1, hide: 1, bone: 1 };
    this.add("meat", y.meat); this.add("hide", y.hide); this.add("bone", y.bone);
    this.butchered++;
    this.carrying = null;
    this.pact = 0.35;
    audio.hunt(); this.addShake(5);
    this.burst(this.px + this.pfacing * 16, this.py - 6, "#b91c1c", 18, "blood", 90);
    this.floater(this.px, this.py - 50, `+${y.meat}🥩 +${y.hide}🟫 +${y.bone}🦴`, "#fca5a5");
    this.score += 10;
  }

  primaryAction() {
    this.actHeld = true;
    if (this.resting) { this.resting = false; return; }
    if (this.fireLighting >= 0) return;
    if (this.tryReel()) return;
    if (this.carrying) {
      if (this.nearFire() || this.nearest((e) => e.kind === "fire" || e.kind === "firePit", 150)) this.butcher();
      else this.msg("Too heavy to butcher out here. Carry it to your campfire (follow the arrow).");
      return;
    }
    const close = this.nearestInteractable();
    if (this.has("spear") && (!close || ANIMALS.includes(close.kind))) {
      const t = this.throwTargetCandidate();
      if (t && this.equipped !== "spear") { this.msg("Your spear isn't in hand. Press Q or tap 🗡️ in your pack to equip it."); audio.hurt(); return; }
      if (t) { this.throwSpear(t); return; }
      if (this.animalNear && !close && this.equipped === "spear") { this.msg("Face the animal to aim: walk slowly toward it, then throw."); return; }
    }
    // on the shelter: TAP = normal action, HOLD = look inside
    if (close && close.kind === "shelter") { this.shelterPress = { t: 0, target: close }; return; }
    if (close) this.act(close);
    else if (this.nearWater()) this.doDrink();
    else this.scoopSnow();
  }
  // snow is everywhere: scoop a handful from the ground
  private scoopSnow() {
    if ((this.inventory.snow || 0) >= 10) { this.msg("Your hands are full of snow (10). Melt it at the fire."); return; }
    this.add("snow", 1);
    this.pact = 0.35;
    audio.pickup();
    this.burst(this.px + this.pfacing * 14, this.py, "#ffffff", 8, "snow", 50);
    this.floater(this.px, this.py - 44, `+1 ❄️ snow (${this.inventory.snow})`, "#e0f2fe");
  }
  releaseAction() {
    this.actHeld = false;
    if (this.shelterPress) {
      const sp = this.shelterPress;
      this.shelterPress = null;
      if (!this.eInterior && !this.resting) this.act(sp.target);
      this.eInterior = false;
    }
  }

  // ---------- shelter interior ----------
  interiorShelter(): Entity | null { return this.nearest((e) => e.kind === "shelter", 130); }
  interiorActive(): boolean {
    return (this.interiorHold || this.eInterior || this.resting || this.wakeLinger > 0) && !!this.interiorShelter();
  }
  setInteriorHold(on: boolean) {
    if (on && (!this.interiorShelter() || this.carrying)) return;
    this.interiorHold = on;
  }
  campFireNear(e: { x: number; y: number }): Entity | null {
    let best: Entity | null = null; let bd = 280;
    for (const f of this.entities) {
      if (f.dead || (f.kind !== "fire" && f.kind !== "firePit")) continue;
      const d = Math.hypot(f.x - e.x, f.y - e.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // cupping icy open water in bare hands: it helps, but numbs you and isn't boiled
  private doDrink() {
    this.thirst = Math.min(100, this.thirst + 15);
    this.temp = Math.max(0, this.temp - 5);
    audio.drink();
    this.floater(this.px, this.py - 40, "+Thirst (icy hands)", "#7dd3fc");
    this.burst(this.px, this.py + 10, "#7dd3fc", 8, "dust", 60);
    if (!this.has("barkPot")) this.msg("Icy water numbs your hands. A bark pot would let you carry and boil it.", 4);
  }

  private fell(e: Entity, wood: number, branch: number) {
    this.add("wood", wood); this.add("branch", branch);
    if (this.rng() < 0.3) this.add("tinder", 1);
    this.treesCut++;
    this.floater(e.x, e.y - 50, `Timber! +${wood}🪵 +${branch}🌿`, "#a3e635");
    audio.pickup(); this.addShake(7);
    this.burst(e.x, e.y - 30, "#3f6b45", 22, "leaf", 130);
    this.burst(e.x, e.y - 10, "#ffffff", 16, "snow", 90);
    e.dead = true; this.score += 4;
    this.entities.push({ id: this.nextId++, kind: "stump", x: e.x, y: e.y, scale: e.scale });
    setTimeout(() => this.respawnResource(e), 40000);
  }

  private act(e: Entity) {
    this.pact = 0.35;
    const d = Math.hypot(e.x - this.px, e.y - this.py);
    if (Math.abs(e.x - this.px) > 4) this.pfacing = e.x > this.px ? 1 : -1;
    switch (e.kind) {
      case "looseBranch":
        this.add("branch", 1);
        this.floater(e.x, e.y - 16, `+1 🌿 (${this.inventory.branch})`, "#a3e635");
        audio.pickup(); this.burst(e.x, e.y, "#e8f2ff", 6, "snow", 40);
        e.dead = true; this.score += 1;
        setTimeout(() => this.respawnResource(e), 30000);
        break;
      case "looseStone":
        this.add("stone", 1);
        this.floater(e.x, e.y - 16, `+1 🪨 (${this.inventory.stone})`, "#cbd5e1");
        audio.pickup(); this.burst(e.x, e.y, "#9ca3af", 6, "dust", 40);
        e.dead = true; this.score += 1;
        setTimeout(() => this.respawnResource(e), 30000);
        break;
      case "smallTree": {
        if (!this.has("axe")) { this.msg("Too thick to break by hand. You need a stone axe."); audio.hurt(); return; }
        if (this.equipped !== "axe") this.equip("axe");
        e.hp = (e.hp || 60) - 21;
        audio.chop(); this.addShake(4);
        this.burst(e.x + (this.px < e.x ? -6 : 6), e.y - 12, "#c89a64", 8, "leaf", 80);
        this.burst(e.x, e.y - 40, "#ffffff", 6, "snow", 50);
        const left = Math.max(0, Math.ceil((e.hp || 0) / 21));
        if ((e.hp || 0) <= 0) this.fell(e, 4, 1);
        else this.floater(e.x, e.y - 60, `chop! ${3 - left}/3`, "#fde68a");
        break;
      }
      case "tree": {
        if (!this.has("axe")) {
          if ((e.amount ?? 2) > 0) {
            e.amount = (e.amount ?? 2) - 1;
            this.add("branch", 1);
            audio.chop(); this.addShake(2);
            this.burst(e.x, e.y - 30, "#3f6b45", 6, "leaf", 70);
            this.floater(e.x, e.y - 50, "+1 🌿 snapped", "#a3e635");
          } else this.msg("No low branches left. This big pine needs an axe.");
          break;
        }
        if (this.equipped !== "axe") this.equip("axe");
        e.hp = (e.hp || 100) - 34;
        audio.chop(); this.addShake(5);
        this.burst(e.x, e.y - 14, "#c89a64", 8, "leaf", 80);
        if ((e.hp || 0) <= 0) this.fell(e, 5, 2);
        else this.floater(e.x, e.y - 80, "chop!", "#fde68a");
        break;
      }
      case "deadTree":
        e.hp = (e.hp || 40) - (this.has("axe") ? 40 : 14);
        audio.chop(); this.addShake(2);
        this.burst(e.x, e.y - 20, "#8a6a4a", 6, "leaf", 70);
        if ((e.hp || 0) <= 0) {
          this.add("branch", 3); this.add("tinder", 1);
          if (this.has("axe")) this.add("wood", 1);
          this.floater(e.x, e.y - 40, this.has("axe") ? "+3🌿 +1🪵" : "+3🌿", "#a3e635");
          audio.pickup(); e.dead = true; this.score += 2;
          setTimeout(() => this.respawnResource(e), 35000);
        } else this.floater(e.x, e.y - 50, "snap", "#d6b98c");
        break;
      case "rock":
        e.hp = (e.hp || 60) - (this.has("axe") ? 30 : 20);
        audio.chop(); this.addShake(3);
        this.burst(e.x, e.y - 10, "#9ca3af", 8, "dust", 70);
        if ((e.hp || 0) <= 0) {
          this.add("stone", 3);
          this.floater(e.x, e.y - 30, "+3 🪨", "#cbd5e1");
          audio.pickup(); e.dead = true; this.score += 2;
          setTimeout(() => this.respawnResource(e), 40000);
        } else this.floater(e.x, e.y - 30, "crack", "#cbd5e1");
        break;
      case "bush":
        this.add("fiber", 2); this.add("tinder", 1);
        this.floater(e.x, e.y - 24, "+2 🎋 fiber", "#a3e635");
        audio.pickup(); this.burst(e.x, e.y - 6, "#4d7c0f", 10, "leaf", 70);
        e.dead = true; this.score += 1;
        setTimeout(() => this.respawnResource(e), 30000);
        break;
      case "snowPile":
        this.add("snow", 2);
        this.floater(e.x, e.y - 20, "+2 ❄️", "#e0f2fe");
        audio.pickup(); this.burst(e.x, e.y, "#ffffff", 12, "snow", 60);
        e.dead = true;
        setTimeout(() => this.respawnResource(e), 25000);
        break;
      case "waterHole": {
        // with a bark pot: fill it (boil at the fire later). Otherwise fish, or cup icy water in your hands.
        const room = this.waterCapacity() - this.waterHeld();
        if (this.has("barkPot") && room > 0) {
          this.add("streamWater", room);
          audio.drink(); this.burst(e.x, e.y, "#7dd3fc", 10, "dust", 50);
          this.floater(e.x, e.y - 24, `+${room} 🫗 stream water`, "#7dd3fc");
          this.msg("Boil it at your campfire before drinking (🛠️ or objective).", 4);
        } else if (this.has("fishingRod")) this.startFishing(e);
        else this.doDrink();
        break;
      }
      case "rabbit":
        if (d < 46 && (e.alert || 0) < 0.45) { this.killAnimal(e); this.floater(e.x, e.y - 30, "Caught it!", "#a3e635"); }
        else { e.fleeing = true; e.alert = 1; this.msg("Too slow. The rabbit bolts. A spear would help."); audio.hurt(); }
        break;
      case "deer": case "wolf":
        e.fleeing = e.kind === "deer"; e.alert = 1;
        this.msg("You can't bring it down with bare hands. You need a spear.");
        audio.hurt();
        break;
      case "trap":
        if (e.caught) {
          this.add("meat", 1); this.add("hide", 1); this.add("bone", 1);
          this.floater(e.x, e.y - 20, "+🥩 +🟫 +🦴", "#fca5a5");
          audio.pickup(); this.score += 5;
          e.caught = null; e.life = 0;
        } else this.msg("The snare is empty. Check back later.");
        break;
      case "firePit":
        this.fireSite = e; this.fireLighting = 0;
        this.msg("Keep HOLDING to spin the drill…", 2.5);
        break;
      case "fire":
        this.addFuel();
        break;
      case "buildSite":
        if (e.site === "shelter") {
          if (this.constructShelterAt(e.x, e.y)) e.dead = true;
        } else if (e.site === "rack") {
          if (this.constructRackAt(e.x, e.y)) e.dead = true;
        } else {
          const pit = this.constructFirePitAt(e.x, e.y);
          if (pit) {
            e.dead = true;
            this.fireSite = pit; this.fireLighting = 0;
            this.msg("Keep HOLDING ACT to spin the fire drill!", 4);
          }
        }
        break;
      case "shelter":
        this.upgradeShelter(e);
        break;
      case "dryingRack":
        this.useRack(e);
        break;
      case "carcass":
        this.carrying = e.carcassOf || "rabbit";
        e.dead = true;
        audio.chop(); this.addShake(3);
        this.msg("You heave it onto your shoulders. Carry it back to your campfire.", 4);
        break;
      case "spearOnGround":
        this.add("spear", 1);
        this.equip("spear", true);
        e.dead = true;
        audio.pickup();
        this.floater(e.x, e.y - 20, "Spear retrieved", "#e2e8f0");
        break;
    }
  }

  startFishing(hole: Entity) {
    if (this.fishing) return;
    this.fishing = { hole, t: 0, bite: false, biteT: 2 + this.rng() * 4 };
    this.msg("Fishing… press ACT when it bites!");
  }
  tryReel() {
    if (this.fishing && this.fishing.bite) {
      this.add("fish", 1); this.score += 8;
      this.floater(this.px, this.py - 40, "+Fish! 🐟", "#7dd3fc");
      audio.pickup(); this.addShake(4);
      this.fishing = null;
      return true;
    }
    return false;
  }

  private killAnimal(e: Entity) {
    e.dead = true;
    this.animalsKilled++;
    this.entities.push({ id: this.nextId++, kind: "carcass", x: e.x, y: e.y, carcassOf: e.kind as any, scale: e.scale });
    const pts = e.kind === "deer" ? 20 : e.kind === "wolf" ? 25 : 8;
    this.score += pts;
    audio.hunt(); this.addShake(8);
    this.burst(e.x, e.y - 10, "#b91c1c", 22, "blood", 130);
    this.floater(e.x, e.y - 40, `Kill! +${pts}`, "#fca5a5");
    if (e.guided) for (const t of this.entities) if (t.guided && t.kind === "trackDeer") t.life = 20;
    this.msg("Pick up the carcass (ACT) and carry it back to camp.", 4);
    setTimeout(() => this.spawnAnimal(e.kind as any), 25000);
  }

  private respawnResource(old: Entity) {
    if (!this.running) return;
    const r = this.rng;
    for (let i = 0; i < 10; i++) {
      const x = 120 + r() * (WORLD_SIZE - 240), y = 120 + r() * (WORLD_SIZE - 240);
      if (Math.hypot(x - this.px, y - this.py) < 500) continue;
      this.entities.push({ id: this.nextId++, kind: old.kind, x, y, hp: old.maxHp, maxHp: old.maxHp, amount: old.kind === "tree" ? 2 : undefined, seed: r() * 1000, scale: 0.85 + r() * 0.4 });
      return;
    }
  }

  // ---------- update ----------
  update(dt: number) {
    if (this.paused || !this.alive) return;
    dt = Math.min(dt, 0.05);

    this.time += dt / DAY_LENGTH;
    if (this.time >= 1) this.newDay();
    this.score += dt * 0.4;

    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.pickWeather();
    const targetStorm = this.weather === "storm" ? 1 : this.weather === "snow" ? 0.4 : 0.05;
    this.storm += (targetStorm - this.storm) * dt * 0.5;
    // shelter view bookkeeping
    if (this.shelterPress && this.actHeld) {
      this.shelterPress.t += dt;
      if (this.shelterPress.t > 0.22) this.eInterior = true;
    }
    if (this.wakeLinger > 0) {
      this.wakeLinger -= dt;
      if (this.input.up || this.input.down || this.input.left || this.input.right || this.joy.active) this.wakeLinger = 0;
    }
    const inside = this.interiorActive();

    // movement
    let dx = 0, dy = 0;
    if (!this.resting && this.fireLighting < 0 && !inside) {
      if (this.input.up) dy -= 1;
      if (this.input.down) dy += 1;
      if (this.input.left) dx -= 1;
      if (this.input.right) dx += 1;
      if (this.joy.active) { dx += this.joy.x; dy += this.joy.y; }
    }
    const mag = Math.hypot(dx, dy);
    if (mag > 0.15) {
      const nx = dx / Math.max(1, mag), ny = dy / Math.max(1, mag);
      // run with Shift, or by pushing the touch stick all the way out
      const wantRun = this.input.run || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92);
      this.prunning = wantRun && this.stamina > 8 && !this.carrying;
      const winter = 1 - Math.min(0.3, (this.day - 1) * 0.025);
      const cold = this.temp < 25 ? 0.65 : 1;
      const tired = this.stamina < 15 ? 0.6 : 1;
      const load = this.carrying ? (this.carrying === "deer" ? 0.65 : 0.85) : 1;
      const gait = this.prunning ? 1.5 : 1;
      const speed = 155 * gait * winter * cold * tired * load * (1 - this.storm * 0.3);
      this.px = Math.max(40, Math.min(WORLD_SIZE - 40, this.px + nx * speed * dt));
      this.py = Math.max(40, Math.min(WORLD_SIZE - 40, this.py + ny * speed * dt));
      const m = Math.hypot(nx, ny);
      this.aimX = nx / m; this.aimY = ny / m;
      if (Math.abs(nx) > 0.05) this.pfacing = nx > 0 ? 1 : -1;
      this.pmoving = true;
      this.panim += dt * (this.prunning ? 17 : 11);
      this.stamina = Math.max(0, this.stamina - dt * (this.prunning ? 7 : this.carrying ? 2.2 : 0.9));
      this.footTimer -= dt;
      if (this.footTimer <= 0) {
        audio.footstep(this.prunning);
        this.footTimer = this.prunning ? 0.27 : this.carrying ? 0.5 : 0.42;
        this.burst(this.px, this.py + 2, "#e8f2ff", this.prunning ? 4 : 2, "snow", this.prunning ? 50 : 26);
      }
    } else {
      this.pmoving = false;
      this.prunning = false;
      this.footTimer = 0.08;
      this.stamina = Math.min(100, this.stamina + dt * 5);
    }
    if (this.pact > 0) this.pact -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // temperature
    const daylight = this.daylight();
    const heat = this.fireHeat();
    const byFire = heat > 0.3;
    const ambient = 8 - (1 - daylight) * 22 - (this.day - 1) * 2.2 - this.storm * 20;
    let warm = 34 * heat;
    if (this.has("torch")) warm += 4;
    const tier = this.currentShelterTier();
    warm += SHELTER_WARMTH[Math.min(3, tier)] || 0;
    // a good shelter also blocks most of the storm wind
    if (tier > 0) warm += this.storm * (tier >= 2 ? 14 : 7);
    warm += this.clothingWarmth();
    const target = Math.max(0, Math.min(100, 55 + ambient + warm));
    const rate = this.temp < target ? 0.25 + heat * 0.7 : 0.33;
    this.temp += (target - this.temp) * dt * rate;
    this.temp = Math.max(0, Math.min(100, this.temp));

    this.hunger = Math.max(0, this.hunger - dt * 0.16);
    this.thirst = Math.max(0, this.thirst - dt * 0.21);

    let hp = this.health;
    if (this.temp < 20) hp -= dt * (20 - this.temp) * 0.15;
    if (this.hunger <= 0) hp -= dt * 1.5;
    if (this.thirst <= 0) hp -= dt * 2;
    if (this.temp > 35 && this.hunger > 20 && this.thirst > 20) hp += dt * (byFire ? 1.5 : 0.4);
    this.health = Math.max(0, Math.min(100, hp));
    if (this.health <= 0) { this.die(); return; }

    // survival warnings
    this.warnTimer -= dt;
    if (this.warnTimer <= 0 && this.messageTimer <= 0) {
      if (this.thirst < 30) {
        this.msg(this.has("water") ? "Your water is low. Tap 💧 in your pack to drink."
          : this.has("barkPot") ? "Your water is low. Melt snow in your bark pot at the fire."
          : "Your water is low. Craft a bark pot (🛠️) and melt snow at the fire.", 4);
        this.warnTimer = 25;
      }
      else if (this.hunger < 25) { this.msg("You're starving. Cook meat at the fire and tap it to eat.", 4); this.warnTimer = 25; }
      else if (this.temp < 30) { this.msg("You're freezing! Get to your fire.", 4); this.warnTimer = 20; }
    }

    // fires: burn fuel gradually (faster in storms and while you sleep, since time passes faster)
    let fireProx = 0, fireIntensity = 0, firePan = 0;
    for (const e of this.entities) {
      if (e.kind !== "fire") continue;
      const burn = (0.42 + this.storm * 0.45) * (this.resting ? 5 : 1) * (this.currentShelterTierAt(e) >= 3 ? 0.8 : 1);
      const before = e.fuel || 0;
      e.fuel = Math.max(0, before - dt * burn);
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (before > 20 && (e.fuel || 0) <= 20 && d < 700) this.msg("Your fire is burning low. Feed it wood (ACT on the fire).", 4);
      if ((e.fuel || 0) <= 0) {
        e.kind = "firePit";
        this.burst(e.x, e.y - 6, "rgba(120,120,120,0.6)", 12, "dust", 40);
        if (d < 700) { this.msg("Your fire has gone out! HOLD ACT at the pit to relight it.", 5); audio.hurt(); }
        continue;
      }
      const intensity = Math.min(1, (e.fuel || 0) / 40 + 0.3);
      const prox = Math.max(0, 1 - d / 460);
      if (prox > fireProx) { fireProx = prox; fireIntensity = intensity; firePan = Math.max(-1, Math.min(1, (e.x - this.px) / 260)); }
      if (this.rng() < 0.7 * intensity) this.particles.push({ x: e.x + (this.rng() - 0.5) * 14, y: e.y - 6, vx: (this.rng() - 0.5) * 10, vy: -30 - this.rng() * 30, life: 0.5 + this.rng() * 0.5, maxLife: 1, color: this.rng() < 0.5 ? "#ffb14e" : "#ff7b00", size: 2 + this.rng() * 3, gravity: -30, kind: "spark" });
      if (this.rng() < 0.25) this.particles.push({ x: e.x + (this.rng() - 0.5) * 6, y: e.y - 26, vx: 6 + this.rng() * 8 - this.storm * 20, vy: -22 - this.rng() * 10, life: 1.8, maxLife: 2, color: "rgba(150,150,155,0.35)", size: 4 + this.rng() * 4, gravity: -4, kind: "dust" });
    }
    audio.update({
      dt, storm: this.storm, snowing: this.weather !== "clear", night: this.daylight() < 0.3,
      day: this.day, fireProx, fireIntensity, firePan,
      inside: this.resting ? 2 : inside ? 1 : 0,
    });

    // autosave: the camp and progress persist
    this.saveTimer += dt;
    if (this.saveTimer > 6 && this.onSave) { this.saveTimer = 0; this.onSave(this.serialize()); }

    this.updateAnimals(dt);
    this.updateProjectiles(dt);

    for (const e of this.entities) {
      if (e.kind === "trap" && !e.caught) {
        e.life = (e.life || 0) + dt;
        if (e.life > 20 && this.rng() < dt * 0.05) { e.caught = "rabbit"; this.floater(e.x, e.y - 20, "Snare caught something!", "#a3e635"); }
      }
    }

    if (this.fishing) {
      const f = this.fishing;
      if (Math.hypot(f.hole.x - this.px, f.hole.y - this.py) > 110) this.fishing = null;
      else {
        f.t += dt;
        if (!f.bite && f.t > f.biteT) { f.bite = true; audio.fishBite(); this.floater(f.hole.x, f.hole.y - 20, "! BITE !", "#fde047"); }
        if (f.bite && f.t > f.biteT + 1.6) { this.fishing = null; this.msg("The fish got away…"); }
      }
    }

    this.updateParticles(dt);
    for (const fl of this.floaters) { fl.y += fl.vy * dt; fl.vy *= 0.94; fl.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    for (const e of this.entities) if ((e.kind === "trackRabbit" || e.kind === "trackDeer")) e.life = (e.life || 0) - dt;
    this.entities = this.entities.filter((e) => !e.dead && !((e.kind === "trackRabbit" || e.kind === "trackDeer") && (e.life || 0) <= 0));

    if (this.rng() < (0.3 + this.storm) * dt * 60) this.spawnSnowParticle();

    this.camX += (this.px - this.w / 2 - this.camX) * Math.min(1, dt * 8);
    this.camY += (this.py - this.h / 2 - this.camY) * Math.min(1, dt * 8);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.messageTimer > 0) this.messageTimer -= dt;

    this.updateFireDrill(dt);
    this.updateRest(dt);
    // food & water: things on the fire, meat drying on the rack (by game time), spoilage
    this.updateCooking(dt);
    const abs = this.absTime();
    if (this.lastAbs > 0) this.updateRacks(Math.max(0, Math.min(0.2, abs - this.lastAbs)));
    this.lastAbs = abs;
    this.updateSpoilage();

    // tracking & trail progress
    this.tracking = false;
    for (const e of this.entities) {
      if (e.kind !== "trackDeer" && e.kind !== "trackRabbit") continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d < 120) this.tracking = true;
      if (e.guided && d < 70 && (e.seed || 0) > this.trailIdx) this.trailIdx = e.seed || 0;
    }
    const gd = this.guidedDeer();
    if (gd && Math.hypot(gd.x - this.px, gd.y - this.py) < 320) this.animalSpotted = true;
    if (!gd && this.journeyIndex >= JOURNEY.findIndex((s) => s.id === "find") && this.nearest((e) => e.kind === "deer" || e.kind === "rabbit", 280)) this.animalSpotted = true;

    // aim info
    this.animalNear = !!this.nearest((e) => ANIMALS.includes(e.kind), 360);
    this.aimTarget = this.has("spear") ? this.throwTargetCandidate() : null;

    this.updateJourney();
    this.emit();
  }

  private newDay() {
    this.time -= 1; this.day++;
    this.score += 50;
    audio.levelUp();
    this.msg(`Dawn of day ${this.day}. The winter grows harsher.`, 4);
  }

  private updateJourney() {
    const step = JOURNEY[this.journeyIndex];
    if (!step) return;
    if (this.journeyStarted !== this.journeyIndex) {
      this.journeyStarted = this.journeyIndex;
      step.onStart?.(this);
    }
    // universal guide overrides: carrying, lost spear
    if (this.carrying) this.guideT = this.fireTarget("Campfire");
    else if (!this.has("spear") && this.entities.some((e) => e.kind === "spearOnGround") && this.journeyIndex >= JOURNEY.findIndex((s) => s.id === "find")) {
      const s = this.entities.find((e) => e.kind === "spearOnGround")!;
      this.guideT = { x: s.x, y: s.y, label: "Your spear" };
    } else this.guideT = step.target ? step.target(this) : null;

    if (this.journeyIndex < JOURNEY.length - 1 && step.done(this)) {
      if (step.id === "shelter" || step.id === "fire" || step.id === "preserve") {
        const site = step.id === "preserve" ? "rack" : step.id;
        this.entities = this.entities.filter((e) => !(e.kind === "buildSite" && e.site === site));
      }
      this.journeyIndex++;
      const next = JOURNEY[this.journeyIndex];
      this.toastId++;
      this.toastTitle = step.title;
      this.toastMsg = step.completeMsg;
      this.toastNext = next ? next.title : "";
      this.score += 50;
      audio.complete();
      this.addShake(3);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        this.particles.push({ x: this.px, y: this.py - 20, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 - 40, life: 1, maxLife: 1, color: i % 2 ? "#fcd34d" : "#a3e635", size: 3, gravity: 120, kind: "spark" });
      }
    }
  }

  private updateFireDrill(dt: number) {
    if (this.fireLighting < 0 || !this.fireSite) return;
    const site = this.fireSite;
    const near = Math.hypot(site.x - this.px, site.y - this.py) < 80;
    if (!this.actHeld || !near || site.kind !== "firePit" || !this.entities.includes(site)) {
      if (this.fireLighting > 0.08 && site.kind === "firePit") this.msg("The ember died. HOLD ACT without letting go.", 3);
      this.fireLighting = -1; this.fireSite = null;
      return;
    }
    this.pfacing = site.x >= this.px ? 1 : -1;
    const speed = 0.4 * (1 - this.storm * 0.35) * (this.temp < 30 ? 0.7 : 1);
    this.fireLighting += dt * speed;
    if (this.rng() < 0.5) this.particles.push({ x: site.x + (this.rng() - 0.5) * 8, y: site.y - 4, vx: (this.rng() - 0.5) * 8, vy: -18 - this.rng() * 14, life: 0.7, maxLife: 1, color: "rgba(140,140,140,0.5)", size: 2 + this.rng() * 2, gravity: -8, kind: "dust" });
    if (this.fireLighting > 0.6 && this.rng() < 0.3) this.particles.push({ x: site.x, y: site.y - 2, vx: (this.rng() - 0.5) * 30, vy: -20, life: 0.4, maxLife: 0.5, color: "#ff9a3c", size: 1.5, gravity: 40, kind: "spark" });
    if (this.rng() < dt * 6) audio.drill();
    if (this.fireLighting >= 1) {
      site.kind = "fire";
      site.fuel = 70;
      this.fireLighting = -1; this.fireSite = null;
      audio.fireLit();
      this.burst(site.x, site.y, "#ffb14e", 30, "spark", 160);
      this.addShake(6);
      this.floater(site.x, site.y - 40, "🔥 FIRE!", "#ffb14e");
      this.score += 20;
    }
  }

  private updateRest(dt: number) {
    if (!this.resting) return;
    if (!this.hasShelter()) { this.resting = false; return; }
    this.restProgress += dt;
    this.time += (dt * 16) / DAY_LENGTH;
    if (this.time >= 1) this.newDay();
    const warmEnough = this.nearFire() || this.currentShelterTier() >= 3;
    this.stamina = Math.min(100, this.stamina + dt * 25);
    if (warmEnough) { this.health = Math.min(100, this.health + dt * 2); this.temp = Math.min(100, this.temp + dt * 5); }
    this.hunger = Math.max(0, this.hunger - dt * 1.2);
    this.thirst = Math.max(0, this.thirst - dt * 1.2);
    if ((this.time > 0.28 && this.time < 0.4 && this.restProgress > 1) || this.health < 20 || this.temp < 18) {
      this.resting = false;
      this.wakeLinger = 2.5; // open your eyes inside the shelter, then step out
      this.msg(this.health < 20 || this.temp < 18 ? "You wake shivering. The fire needs wood!" : "You wake at first light, rested.", 4);
    }
  }

  private spawnSnowParticle() {
    const x = this.camX + this.rng() * (this.w + 100);
    const y = this.camY - 20 + this.rng() * 40;
    this.particles.push({ x, y, vx: -20 - this.storm * 60 + (this.rng() - 0.5) * 20, vy: 40 + this.rng() * 60 + this.storm * 60, life: 4, maxLife: 4, color: "rgba(255,255,255,0.9)", size: 1 + this.rng() * 2.2, kind: "snow" });
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.kind === "snow") p.x += Math.sin((p.life + p.x) * 2) * 8 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      const stepX = p.vx * dt, stepY = p.vy * dt;
      p.x += stepX; p.y += stepY; p.dist += Math.hypot(stepX, stepY);
      let hit: Entity | null = null;
      for (const e of this.entities) {
        if (e.dead || !ANIMALS.includes(e.kind)) continue;
        const r = e.kind === "deer" ? 22 : e.kind === "wolf" ? 18 : 12;
        if (Math.hypot(e.x - p.x, (e.y - 10) - p.y) < r) { hit = e; break; }
      }
      if (hit) {
        hit.hp = (hit.hp || 1) - 3;
        this.burst(hit.x, hit.y - 10, "#b91c1c", 10, "blood", 100);
        this.addShake(4);
        if ((hit.hp || 0) <= 0) this.killAnimal(hit);
        else { hit.fleeing = true; hit.alert = 1; this.floater(hit.x, hit.y - 30, "Wounded!", "#fca5a5"); audio.hunt(); }
        this.dropSpear(hit.x + 10, hit.y + 4);
        p.dist = 99999;
      } else if (p.dist >= p.max) {
        this.dropSpear(p.x, p.y + 20);
        this.floater(p.x, p.y - 10, "Missed!", "#e2e8f0");
        this.msg("Missed. Retrieve your spear and try again. Moving animals are hard to hit.");
        for (const e of this.entities) if (ANIMALS.includes(e.kind) && e.kind !== "wolf" && Math.hypot(e.x - p.x, e.y - p.y) < 200) { e.alert = 1; e.fleeing = true; }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.dist < p.max);
  }
  private dropSpear(x: number, y: number) {
    this.entities.push({ id: this.nextId++, kind: "spearOnGround", x: Math.max(40, Math.min(WORLD_SIZE - 40, x)), y: Math.max(40, Math.min(WORLD_SIZE - 40, y)), angle: this.rng() * 0.6 - 0.3 });
  }

  private updateAnimals(dt: number) {
    for (const e of this.entities) {
      if (e.dead || !ANIMALS.includes(e.kind)) continue;
      const dToPlayer = Math.hypot(e.x - this.px, e.y - this.py);
      if (e.kind === "wolf") {
        // Wolves are wary wild animals, not enemies: they keep their distance,
        // watch from afar, and slip away if you come close or stand by a fire.
        const tooClose = dToPlayer < (this.nearFire() ? 420 : 230);
        if (tooClose) {
          const a = Math.atan2(e.y - this.py, e.x - this.px);
          e.vx = Math.cos(a) * 120; e.vy = Math.sin(a) * 120;
          e.alert = 1;
        } else if (dToPlayer < 340) {
          e.vx = (e.vx || 0) * 0.8; e.vy = (e.vy || 0) * 0.8; // pause and watch
          e.angle = this.px > e.x ? 1 : -1;
          e.alert = 0.5;
        } else { e.alert = 0; this.wander(e, dt, 50); }
      } else {
        // awareness: walking slowly is quiet; running is loud; standing still lets them calm down
        const detect = e.guided ? 210 : e.kind === "deer" ? 240 : 170;
        const noise = this.prunning ? 1.6 : this.pmoving ? 1 : 0.45;
        const range = detect * noise;
        if (dToPlayer < range) e.alert = Math.min(1, (e.alert || 0) + dt * (this.prunning ? 2.6 : this.pmoving ? 1.1 : 0.25) * (1 - dToPlayer / (range * 1.3)));
        else e.alert = Math.max(0, (e.alert || 0) - dt * 0.35);
        if ((e.alert || 0) > 0.75 || e.fleeing) {
          const a = Math.atan2(e.y - this.py, e.x - this.px) + Math.sin(performance.now() / 400 + (e.id % 7)) * 0.35;
          const sp = e.kind === "deer" ? 175 : 155;
          e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
          e.fleeing = true;
          if (dToPlayer > detect * 1.8) { e.fleeing = false; e.alert = 0.35; }
        } else if ((e.alert || 0) > 0.3) {
          // noticed something: freeze, head up, watching the player
          e.vx = (e.vx || 0) * 0.7; e.vy = (e.vy || 0) * 0.7;
          e.angle = this.px > e.x ? 1 : -1;
        } else if (e.guided && e.targetX !== undefined && Math.hypot(e.x - e.targetX, e.y - (e.targetY || 0)) > 90) {
          const a = Math.atan2((e.targetY || 0) - e.y, e.targetX - e.x);
          e.vx = Math.cos(a) * 45; e.vy = Math.sin(a) * 45;
        } else this.wander(e, dt, e.guided ? 16 : e.kind === "deer" ? 38 : 48);
      }
      if (Math.abs(e.vx || 0) > 8) e.angle = (e.vx || 0) > 0 ? 1 : -1;
      e.x = Math.max(30, Math.min(WORLD_SIZE - 30, e.x + (e.vx || 0) * dt));
      e.y = Math.max(30, Math.min(WORLD_SIZE - 30, e.y + (e.vy || 0) * dt));
      e.vx = (e.vx || 0) * 0.93; e.vy = (e.vy || 0) * 0.93;
      if (e.kind !== "wolf" && Math.abs(e.vx || 0) + Math.abs(e.vy || 0) > 25 && this.rng() < dt * 3.5) {
        this.entities.push({ id: this.nextId++, kind: e.kind === "deer" ? "trackDeer" : "trackRabbit", x: e.x, y: e.y + 4, life: 30 + this.rng() * 15, angle: Math.atan2(e.vy || 0, e.vx || 0) });
      }
    }
  }

  private wander(e: Entity, dt: number, sp: number) {
    e.wanderT = (e.wanderT || 0) - dt;
    if ((e.wanderT || 0) <= 0) {
      const a = this.rng() * Math.PI * 2;
      const moving = this.rng() < 0.6;
      e.vx = moving ? Math.cos(a) * sp : 0; e.vy = moving ? Math.sin(a) * sp : 0;
      e.wanderT = 1 + this.rng() * 2.5;
    } else if (Math.abs(e.vx || 0) + Math.abs(e.vy || 0) > 1) {
      // keep walking — counteract damping
      e.vx = (e.vx || 0) / 0.93 * 0.995; e.vy = (e.vy || 0) / 0.93 * 0.995;
    }
  }

  private pickWeather() {
    const r = this.rng();
    const stormChance = this.day === 1 ? 0 : 0.18 + Math.min(0.4, (this.day - 2) * 0.06);
    if (r < stormChance) { this.weather = "storm"; this.weatherTimer = 20 + this.rng() * 15; this.msg("⚠ A snowstorm is coming! Get to your shelter and fire.", 5); audio.wolf(); }
    else if (r < stormChance + 0.4) { this.weather = "snow"; this.weatherTimer = 30 + this.rng() * 25; }
    else { this.weather = "clear"; this.weatherTimer = 30 + this.rng() * 30; }
  }

  daylight() {
    const t = this.time;
    if (t < 0.18 || t > 0.85) return 0;
    if (t < 0.3) return (t - 0.18) / 0.12;
    if (t > 0.72) return (0.85 - t) / 0.13;
    return 1;
  }

  private die() {
    this.alive = false;
    audio.gameOver();
    this.addShake(14);
    this.emit();
    this.onGameOver?.();
  }

  private emit() {
    if (!this.onUpdate) return;
    const inv: Record<string, number> = {};
    for (const k in this.inventory) inv[k] = this.inventory[k as ItemId];
    let hint = "";
    const best = this.nearestInteractable();
    if (this.fireLighting >= 0) hint = "Keep holding: spinning the drill…";
    else if (this.resting) hint = "Resting…";
    else if (this.fishing) hint = this.fishing.bite ? "REEL IN! 🎣" : "Fishing…";
    else if (this.carrying) hint = this.nearFire() || this.nearest((e) => e.kind === "fire" || e.kind === "firePit", 150) ? "Butcher the carcass" : "Carrying carcass → campfire";
    else if (this.aimTarget && (!best || ANIMALS.includes(best.kind))) hint = this.equipped === "spear" ? `Throw spear at ${this.aimTarget.kind} 🎯` : "Equip your spear first (Q)";
    else if (best) {
      const map: Partial<Record<EntityKind, string>> = {
        tree: this.has("axe") ? "Chop big pine" : "Snap a branch", smallTree: this.has("axe") ? "Chop tree 🪓" : "Need a stone axe",
        deadTree: "Break dead wood", rock: "Break rock for stones", looseBranch: "Pick up branch", looseStone: "Pick up stone",
        bush: "Strip fiber", snowPile: "Scoop snow", waterHole: this.has("fishingRod") ? "Fish / drink" : "Drink water",
        rabbit: "Grab rabbit", deer: "Need a spear", wolf: "Wolf! Back away", trap: best.caught ? "Collect catch" : "Check snare",
        firePit: "HOLD to light fire", fire: "Feed the fire", carcass: "Lift carcass", spearOnGround: "Pick up spear",
        buildSite: best.site === "shelter" ? "Build lean-to" : best.site === "rack" ? "Build drying rack" : "Build fire",
        dryingRack: (() => {
          const s = best.slots || [];
          if (s.some((v) => v >= 1)) return "Collect dried meat 🥓";
          if (this.has("meat") && s.length < RACK_SLOTS) return `Hang raw meat (${s.length}/${RACK_SLOTS})`;
          return s.length ? "Meat drying…" : "Drying rack (empty)";
        })(),
        shelter: (() => {
          const up = SHELTER_UPGRADES[best.tier || 1];
          const name = SHELTER_NAMES[best.tier || 1];
          return up && this.hasCost(up.cost) ? `Tap: build ${up.name.toLowerCase()} · Hold: go inside` : `Hold: go inside your ${name.toLowerCase()}`;
        })(),
      };
      hint = map[best.kind] || "";
    } else if (this.has("spear") && this.animalNear) hint = this.equipped === "spear" ? "Walk slowly toward it to aim" : "Equip your spear (Q)";
    else if (!this.has("water") && (this.inventory.snow || 0) < 2 && (JOURNEY[this.journeyIndex]?.id === "water" || (this.has("barkPot") && this.thirst < 45))) hint = "Scoop snow ❄️";
    this.onUpdate({
      health: this.health, temp: this.temp, hunger: this.hunger, thirst: this.thirst, stamina: this.stamina,
      inventory: inv, time: this.time, day: this.day, score: Math.floor(this.score),
      weather: this.weather, ambientTemp: Math.round(8 - (1 - this.daylight()) * 22 - (this.day - 1) * 2.2 - this.storm * 20),
      nearFire: this.nearFire(), nearWater: this.nearWater(), hasShelter: this.hasShelter(),
      message: this.messageTimer > 0 ? this.message : "", actionHint: hint, storm: this.storm,
      frozen: this.temp < 22, hurt: this.hurtFlash > 0,
      journeyIndex: this.journeyIndex,
      toastId: this.toastId, toastTitle: this.toastTitle, toastMsg: this.toastMsg, toastNext: this.toastNext,
      equipped: this.equipped, running: this.prunning,
      interior: this.interiorActive(),
      campFireFuel: (() => {
        const sh = this.interiorShelter();
        const f = sh ? this.campFireNear(sh) : null;
        return f ? (f.kind === "fire" ? f.fuel || 0 : 0) : -1;
      })(),
      fireLighting: this.fireLighting, resting: this.resting, restProgress: this.restProgress,
      shelterTier: this.currentShelterTier(), tracking: this.tracking, carrying: this.carrying,
    });
  }
}
