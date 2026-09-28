export type ItemId =
  | "wood"
  | "branch"
  | "stone"
  | "fiber"
  | "tinder"
  | "shaft"
  | "bone"
  | "meat"
  | "cookedMeat"
  | "fish"
  | "cookedFish"
  | "snow"
  | "water"
  | "hide"
  | "curedHide"
  | "sinew"
  | "sharpStone"
  | "axe"
  | "spear"
  | "knife"
  | "fishingRod"
  | "trap"
  | "furWrap"
  | "cloak"
  | "hood"
  | "gloves"
  | "boots"
  | "warmCoat"
  | "torch"
  | "barkPot"
  | "streamWater"
  | "driedMeat";

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  stack: number;
  desc: string;
  tool?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  icon: string;
  out: ItemId;
  outQty: number;
  cost: Partial<Record<ItemId, number>>;
  desc: string;
  needFire?: boolean;
  timed?: number; // seconds on the fire (placed on the campfire instead of instant)
}

export interface CookItem { out: ItemId; qty: number; t: number; dur: number; icon: string; pot?: boolean; }

export type EntityKind =
  | "tree"
  | "smallTree"
  | "stump"
  | "deadTree"
  | "rock"
  | "bush"
  | "looseBranch"
  | "looseStone"
  | "rabbit"
  | "deer"
  | "wolf"
  | "carcass"
  | "spearOnGround"
  | "waterHole"
  | "fire"
  | "firePit"
  | "buildSite"
  | "dryingRack"
  | "shelter"
  | "trap"
  | "trackRabbit"
  | "trackDeer"
  | "snowPile"
  | "woodStorage"
  | "foodStorage"
  | "waterStorage"
  | "materialStorage"
  | "dog";

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
  tier?: number;
  alert?: number;
  vx?: number;
  vy?: number;
  wanderT?: number;
  fleeing?: boolean;
  dead?: boolean;
  amount?: number;
  fuel?: number;
  built?: boolean;
  baited?: boolean;
  caught?: EntityKind | null;
  life?: number;
  seed?: number;
  targetX?: number;
  targetY?: number;
  scale?: number;
  guided?: boolean;
  site?: "shelter" | "fire" | "rack";
  cook?: CookItem[];   // things roasting / melting on a fire
  slots?: number[];    // drying rack: drying progress (0..1) of each hanging strip
  carcassOf?: "rabbit" | "deer" | "wolf";
  angle?: number;
  storage?: Partial<Record<ItemId, number>>;
  foodTimestamps?: Partial<Record<ItemId, number[]>>;
  capacity?: number;
  fireplaceFuel?: number; // Fuel for the fireplace in wooden hut (tier 3 shelter)
  dogHunger?: number; // 0..100 (100 = full)
  dogState?: "follow" | "idle" | "rest" | "eat" | "pet" | "sit" | "run" | "walk";
  dogStateTimer?: number;
  dogTailWag?: number;
  dogAnim?: number;
  dogWait?: boolean;
}

export interface HighScore {
  score: number;
  days: number;
  date: string;
}

export type Phase = "start" | "playing" | "paused" | "over";
