import type { ItemDef, ItemId, Recipe } from "./types";

export const ITEMS: Record<ItemId, ItemDef> = {
  branch: { id: "branch", name: "Branch", icon: "🌿", stack: 99, desc: "Dry branches. Building, kindling & tools." },
  wood: { id: "wood", name: "Wood / Logs", icon: "🪵", stack: 99, desc: "Cut from trees with an axe. Fuel & building." },
  stone: { id: "stone", name: "Stone", icon: "🪨", stack: 99, desc: "Loose stones. Tool heads & fire rings." },
  fiber: { id: "fiber", name: "Fiber / Cord", icon: "🎋", stack: 99, desc: "Stripped bark & grass, twisted into cord." },
  tinder: { id: "tinder", name: "Dry Tinder", icon: "🍂", stack: 99, desc: "Dry grass & bark." },
  shaft: { id: "shaft", name: "Wooden Shaft", icon: "🦯", stack: 9, desc: "A straight carved pole for a spear." },
  bone: { id: "bone", name: "Bone", icon: "🦴", stack: 99, desc: "Awls and needles for sewing hides." },
  sinew: { id: "sinew", name: "Sinew", icon: "🧵", stack: 99, desc: "Animal cord." },
  sharpStone: { id: "sharpStone", name: "Sharp Stone", icon: "🔻", stack: 99, desc: "A knapped edge." },
  meat: { id: "meat", name: "Raw Meat", icon: "🥩", stack: 99, desc: "Cook it at your campfire." },
  cookedMeat: { id: "cookedMeat", name: "Cooked Meat", icon: "🍖", stack: 99, desc: "Tap to eat. Restores hunger." },
  fish: { id: "fish", name: "Raw Fish", icon: "🐟", stack: 99, desc: "Cook it at your campfire." },
  cookedFish: { id: "cookedFish", name: "Cooked Fish", icon: "🍣", stack: 99, desc: "Tap to eat." },
  snow: { id: "snow", name: "Snow", icon: "❄️", stack: 99, desc: "Tap to eat (chills you) or melt at a fire." },
  water: { id: "water", name: "Water", icon: "💧", stack: 99, desc: "Tap to drink." },
  hide: { id: "hide", name: "Animal Hide", icon: "🟫", stack: 99, desc: "Skin for clothing & shelter." },
  curedHide: { id: "curedHide", name: "Cured Hide", icon: "🟤", stack: 99, desc: "Dried skin." },
  axe: { id: "axe", name: "Stone Axe", icon: "🪓", stack: 1, desc: "Cuts trees for wood.", tool: true },
  spear: { id: "spear", name: "Spear", icon: "🗡️", stack: 1, desc: "Thrown at game. Retrieve it after.", tool: true },
  knife: { id: "knife", name: "Stone Knife", icon: "🔪", stack: 1, desc: "A cutting edge.", tool: true },
  fishingRod: { id: "fishingRod", name: "Fishing Line", icon: "🎣", stack: 1, desc: "Fish at open water.", tool: true },
  trap: { id: "trap", name: "Snare", icon: "🪤", stack: 9, desc: "Catches small game." },
  furWrap: { id: "furWrap", name: "Skin Wrap", icon: "🧣", stack: 1, desc: "Hide tied around the torso.", tool: true },
  boots: { id: "boots", name: "Skin Boots", icon: "🥾", stack: 1, desc: "Warm, dry feet.", tool: true },
  cloak: { id: "cloak", name: "Skin Cloak", icon: "🥼", stack: 1, desc: "Blocks the wind.", tool: true },
  hood: { id: "hood", name: "Fur Hood", icon: "🧢", stack: 1, desc: "Keeps your head warm.", tool: true },
  gloves: { id: "gloves", name: "Fur Mittens", icon: "🧤", stack: 1, desc: "Warm hands.", tool: true },
  warmCoat: { id: "warmCoat", name: "Winter Coat", icon: "🧥", stack: 1, desc: "Full skin outfit for deep cold.", tool: true },
  torch: { id: "torch", name: "Torch", icon: "🔥", stack: 9, desc: "Carried light." },
  barkPot: { id: "barkPot", name: "Bark Pot", icon: "🪣", stack: 9, desc: "Folded birch bark laced with cord. Melts snow at the fire. Holds 3 water.", tool: true },
  streamWater: { id: "streamWater", name: "Stream Water", icon: "🫗", stack: 99, desc: "Icy open water. Boil it at the fire before drinking." },
  driedMeat: { id: "driedMeat", name: "Dried Meat", icon: "🥓", stack: 99, desc: "Smoke-dried strips. Keeps for weeks. Tap to eat." },
};

// Perishable food: how many game days before it spoils (it's winter, so fresh food lasts a while).
export const SHELF_LIFE: Partial<Record<ItemId, number>> = {
  meat: 1.6, fish: 1.3, cookedMeat: 1.1, cookedFish: 1.0, driedMeat: 30,
};
export const POT_CAPACITY = 3;      // water portions one bark pot can hold
export const RACK_SLOTS = 4;        // meat strips per drying rack
export const DRY_DAYS = 0.5;        // game days to dry a strip (faster in the fire's smoke)
export const RACK_COST: Partial<Record<ItemId, number>> = { branch: 6, fiber: 3 };

export const RECIPES: Recipe[] = [
  { id: "axe", name: "Stone Axe", icon: "🪓", out: "axe", outQty: 1, cost: { branch: 4, stone: 3 }, desc: "Lash a stone head to a branch handle." },
  { id: "shaft", name: "Wooden Shaft", icon: "🦯", out: "shaft", outQty: 1, cost: { wood: 1 }, desc: "Carve a straight pole from wood." },
  { id: "spear", name: "Primitive Spear", icon: "🗡️", out: "spear", outQty: 1, cost: { shaft: 1, stone: 1, fiber: 2 }, desc: "Stone point bound to a shaft with cord." },
  { id: "trap", name: "Snare Trap", icon: "🪤", out: "trap", outQty: 1, cost: { branch: 1, fiber: 3 }, desc: "Set on trails to catch rabbits." },
  { id: "fishingRod", name: "Fishing Line", icon: "🎣", out: "fishingRod", outQty: 1, cost: { branch: 1, fiber: 4 }, desc: "Fish at open water." },
  { id: "torch", name: "Torch", icon: "🔥", out: "torch", outQty: 1, cost: { branch: 1, fiber: 1, tinder: 1 }, desc: "Carry light into the dark.", needFire: true },
  { id: "barkPot", name: "Bark Pot", icon: "🪣", out: "barkPot", outQty: 1, cost: { branch: 2, fiber: 2 }, desc: "Fold birch bark into a pot and lace it with cord. Reusable." },
  { id: "cookMeat", name: "Roast Meat", icon: "🍖", out: "cookedMeat", outQty: 1, cost: { meat: 1 }, needFire: true, timed: 14, desc: "Put meat on a stick over the flames. Takes time." },
  { id: "cookFish", name: "Roast Fish", icon: "🍣", out: "cookedFish", outQty: 1, cost: { fish: 1 }, needFire: true, timed: 10, desc: "Roast fish over the flames. Takes time." },
  { id: "water", name: "Melt Snow", icon: "💧", out: "water", outQty: 1, cost: { snow: 2 }, needFire: true, timed: 12, desc: "Pack snow into your bark pot and set it by the coals." },
  { id: "boil", name: "Boil Stream Water", icon: "💧", out: "water", outQty: 1, cost: { streamWater: 1 }, needFire: true, timed: 10, desc: "Boil icy stream water in your bark pot." },
  { id: "furWrap", name: "Skin Wrap", icon: "🧣", out: "furWrap", outQty: 1, cost: { hide: 1, fiber: 2 }, desc: "Hide tied around the body." },
  { id: "boots", name: "Skin Boots", icon: "🥾", out: "boots", outQty: 1, cost: { hide: 1, bone: 1 }, desc: "Sewn with a bone awl." },
  { id: "cloak", name: "Skin Cloak", icon: "🥼", out: "cloak", outQty: 1, cost: { hide: 1, bone: 1, fiber: 2 }, desc: "A cloak against the wind." },
  { id: "hood", name: "Fur Hood", icon: "🧢", out: "hood", outQty: 1, cost: { hide: 1, fiber: 1 }, desc: "Stops heat escaping your head." },
  { id: "gloves", name: "Fur Mittens", icon: "🧤", out: "gloves", outQty: 1, cost: { hide: 1, fiber: 1 }, desc: "Warm hands." },
  { id: "warmCoat", name: "Winter Coat", icon: "🧥", out: "warmCoat", outQty: 1, cost: { hide: 3, bone: 2, cloak: 1 }, desc: "Full outfit for the deep cold." },
];

export const WORLD_SIZE = 4000;

// build costs
export const SHELTER_COST: Partial<Record<ItemId, number>> = { wood: 12, branch: 10 };
export const FIRE_COST: Partial<Record<ItemId, number>> = { wood: 6, branch: 4, stone: 4 };
// The SAME shelter is improved in stages (index = current tier).
export const SHELTER_UPGRADES: Record<number, { name: string; cost: Partial<Record<ItemId, number>>; done: string }> = {
  1: { name: "Small wooden shelter", cost: { wood: 8, branch: 6, stone: 6 }, done: "Solid log walls chinked with snow. The wind can't reach you." },
  2: { name: "Proper wooden hut & fireplace", cost: { hide: 2, wood: 4, fiber: 4, branch: 4 }, done: "Heavy timber walls, stone chimney, and a real fireplace inside. A warm wooden hut." },
};
export const SHELTER_NAMES: Record<number, string> = { 1: "Lean-to", 2: "Small wooden shelter", 3: "Proper wooden hut" };
export const SHELTER_WARMTH: Record<number, number> = { 0: 0, 1: 7, 2: 14, 3: 24 };

export const CLOTHING_WARMTH: Partial<Record<ItemId, number>> = {
  furWrap: 7,
  boots: 5,
  cloak: 10,
  hood: 4,
  gloves: 3,
  warmCoat: 20,
};

// Camp storage capacities and allowed item categories
export const WOOD_STORAGE_CAPACITY = 50;
export const FOOD_STORAGE_CAPACITY = 30;
export const WATER_STORAGE_CAPACITY = 20;
export const MATERIAL_STORAGE_CAPACITY = 60;

export const FOOD_STORAGE_ITEMS: ItemId[] = ["meat", "cookedMeat", "driedMeat", "fish", "cookedFish"];
export const WATER_STORAGE_ITEMS: ItemId[] = ["water", "streamWater"];
export const MATERIAL_STORAGE_ITEMS: ItemId[] = [
  "stone",
  "branch",
  "fiber",
  "tinder",
  "bone",
  "hide",
  "curedHide",
  "sinew",
  "sharpStone",
  "shaft",
  "snow",
];

