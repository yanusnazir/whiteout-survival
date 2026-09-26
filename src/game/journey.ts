import type { Game } from "./engine";
import type { ItemId } from "./types";
import { RACK_COST } from "./data";

export interface Req { icon: string; label: string; have: (g: Game) => number; need: number; }
export interface StepButton {
  label: string; icon: string;
  show: (g: Game) => boolean;
  enabled: (g: Game) => boolean;
  run: (g: Game) => void;
}
export interface GuideTarget { x: number; y: number; label: string; }
export interface Step {
  id: string;
  chapter: string;
  title: string;
  what: string;   // WHAT & HOW MANY
  why: string;    // WHAT WILL IT LET ME DO
  reqs: Req[];
  buttons?: StepButton[];
  how: (g: Game) => string;
  done: (g: Game) => boolean;
  onStart?: (g: Game) => void;
  target?: (g: Game) => GuideTarget | null;
  completeMsg: string;
}

const inv = (id: ItemId) => (g: Game) => g.inventory[id] || 0;
const has = (id: ItemId) => (g: Game) => (g.has(id) ? 1 : 0);
const met = (id: string, g: Game) => {
  const s = JOURNEY.find((x) => x.id === id);
  return !!s && s.reqs.every((r) => r.have(g) >= r.need);
};
const shelterTier = (g: Game) => Math.max(0, ...g.entities.filter((e) => e.kind === "shelter").map((e) => e.tier || 1));
const campFire = (g: Game) => g.entities.find((e) => e.kind === "fire");

const craftBtn = (id: string, label: string, icon: string, owned?: ItemId): StepButton => ({
  label, icon,
  show: (g) => (owned ? !g.has(owned) : true),
  enabled: (g) => g.canCraftId(id),
  run: (g) => g.craft(id),
});

// guide toward the first missing material in a list
const missingTarget = (g: Game, list: [ItemId, number][]): GuideTarget | null => {
  for (const [id, n] of list) {
    if ((g.inventory[id] || 0) >= n) continue;
    if (id === "branch") return g.nearestOf("looseBranch", "Branch");
    if (id === "stone") return g.nearestOf("looseStone", "Stone");
    if (id === "wood") return g.nearestOf("smallTree", "Small tree (axe)");
    if (id === "fiber") return g.nearestOf("bush", "Bush: fiber");
    if (id === "hide" || id === "bone" || id === "meat") return g.huntTrail();
  }
  return null;
};

const CH1 = "Day 1 · Survive the first night";
const CH2 = "Day 2+ · Make the camp a home";
const CH3 = "The long winter";

export const JOURNEY: Step[] = [
  {
    id: "gather", chapter: CH1, title: "Gather materials",
    what: "You have nothing. Gather 10 branches and 6 stones to make your first tool.",
    why: "Craft a stone axe so you can cut small trees for firewood.",
    reqs: [
      { icon: "🌿", label: "Branches", have: inv("branch"), need: 10 },
      { icon: "🪨", label: "Stones", have: inv("stone"), need: 6 },
    ],
    buttons: [{
      label: "CRAFT STONE AXE (uses 4🌿 + 3🪨)", icon: "🪓",
      show: (g) => !g.has("axe"),
      enabled: (g) => met("gather", g) && g.canCraftId("axe"),
      run: (g) => g.craft("axe"),
    }],
    how: (g) => met("gather", g)
      ? "Tap CRAFT STONE AXE. It uses 4 branches and 3 stones; keep the rest for your camp."
      : "Branches and stones lie half-buried in the snow. Walk up to one and press ACT (E) to pick it up.",
    done: (g) => g.has("axe"),
    target: (g) => missingTarget(g, [["branch", 10], ["stone", 6]]),
    completeMsg: "You can finally cut small trees for firewood.",
  },
  {
    id: "wood", chapter: CH1, title: "Gather firewood",
    what: "Use your stone axe to cut 3 small trees. You need 12 pieces of wood.",
    why: "Wood builds your lean-to and feeds your fire.",
    reqs: [
      { icon: "🌲", label: "Small trees cut", have: (g) => g.treesCut, need: 3 },
      { icon: "🪵", label: "Wood", have: inv("wood"), need: 12 },
    ],
    how: () => "Walk to a small pine and press ACT to swing your axe. 3 chops fell it: 4 wood + 1 branch each.",
    done: (g) => g.treesCut >= 3 && (g.inventory.wood || 0) >= 12,
    target: (g) => g.nearestOf("smallTree", "Small tree"),
    completeMsg: "Enough wood. The light is already fading.",
  },
  {
    id: "shelter", chapter: CH1, title: "Build a temporary lean-to",
    what: "Night is approaching. Build a shelter before the temperature drops.",
    why: "A lean-to blocks the wind and gives you a place to sleep. You'll improve it later.",
    reqs: [
      { icon: "🪵", label: "Wood", have: inv("wood"), need: 12 },
      { icon: "🌿", label: "Branches", have: inv("branch"), need: 10 },
    ],
    how: (g) => met("shelter", g)
      ? "Walk to the glowing outline and press ACT. Building uses 12 wood + 10 branches."
      : "Collect the missing materials (follow the arrow), then walk to the glowing outline.",
    onStart: (g) => g.placeSite("shelter"),
    done: (g) => g.entities.some((e) => e.kind === "shelter"),
    target: (g) => missingTarget(g, [["branch", 10], ["wood", 12]]) || g.siteTarget("shelter", "Build lean-to here"),
    completeMsg: "A lean-to of branches and logs. It breaks the wind. This is your camp now.",
  },
  {
    id: "fire", chapter: CH1, title: "Build & light a fire",
    what: "You have shelter, but the temperature is falling. Build a fire beside the lean-to.",
    why: "Fire warms you, cooks meat and gets you through the night.",
    reqs: [
      { icon: "🪵", label: "Firewood", have: inv("wood"), need: 6 },
      { icon: "🌿", label: "Dry branches", have: inv("branch"), need: 4 },
      { icon: "🪨", label: "Stones (fire ring)", have: inv("stone"), need: 4 },
    ],
    how: (g) => {
      if (g.entities.some((e) => e.kind === "firePit")) return "HOLD ACT at the fire pit to spin the fire drill until the tinder catches.";
      return met("fire", g)
        ? "Walk to the fire outline beside your lean-to and press ACT. Then keep HOLDING to spin the drill."
        : "Collect the missing materials (follow the arrow), then walk to the fire outline.";
    },
    onStart: (g) => g.placeSite("fire"),
    done: (g) => !!campFire(g),
    target: (g) => {
      const pit = g.entities.find((e) => e.kind === "firePit");
      if (pit) return { x: pit.x, y: pit.y, label: "HOLD ACT here" };
      return missingTarget(g, [["wood", 6], ["branch", 4], ["stone", 4]]) || g.siteTarget("fire", "Build fire here");
    },
    completeMsg: "Flames! Warmth, light and a little safety.",
  },
  {
    id: "warm", chapter: CH1, title: "Keep the fire alive & warm up",
    what: "Feed the fire 2 pieces of fuel and warm your body to 70.",
    why: "A fire burns down and dies unless you keep feeding it. Its heat is strongest up close.",
    reqs: [
      { icon: "🔥", label: "Fuel added", have: (g) => g.fuelAdded, need: 2 },
      { icon: "🌡️", label: "Body warmth", have: (g) => Math.round(g.temp), need: 70 },
    ],
    how: (g) => {
      if (!campFire(g)) return "Your fire went out! HOLD ACT at the pit to relight it.";
      if (g.fuelAdded < 2 && !g.has("wood") && !g.has("branch")) return "You have no fuel. Cut a small tree or pick up branches, then come back.";
      if (g.fuelAdded < 2) return "Stand at the fire and press ACT to add a log (or a branch).";
      return "Stand close to the flames. The closer you stand, the faster you warm up.";
    },
    done: (g) => g.fuelAdded >= 2 && g.temp >= 70,
    target: (g) => {
      if (g.fuelAdded < 2 && !g.has("wood") && !g.has("branch")) return g.nearestOf("looseBranch", "Branch");
      return g.nearFire() ? null : g.fireTarget("Campfire");
    },
    completeMsg: "Warm at last. But your mouth is dry.",
  },
  {
    id: "water", chapter: CH1, title: "Make drinking water",
    what: "Your water is low, and eating snow only chills you. Make a bark pot, then melt snow in it at the fire.",
    why: "You can't survive long without water. Warm melt water also helps against the cold.",
    reqs: [
      { icon: "🪣", label: "Bark pot", have: has("barkPot"), need: 1 },
      { icon: "❄️", label: "Snow", have: (g) => (g.waterMade > 0 || g.cookingOf("water") ? 2 : inv("snow")(g)), need: 2 },
      { icon: "💧", label: "Water drunk", have: (g) => g.waterDrunk, need: 1 },
    ],
    buttons: [
      craftBtn("barkPot", "CRAFT BARK POT (2🌿 + 2🎋)", "🪣", "barkPot"),
      { label: "MELT SNOW (uses 2❄️)", icon: "💧", show: (g) => g.has("barkPot") && !g.cookingOf("water") && !g.has("water"), enabled: (g) => g.canCraftId("water"), run: (g) => g.craft("water") },
    ],
    how: (g) => {
      if (!g.has("barkPot")) return (g.inventory.fiber || 0) < 2 ? "Strip fiber from a bush for cord, then craft a bark pot (2 branches + 2 fiber)." : "Tap CRAFT BARK POT.";
      if (g.cookingOf("water")) return "The snow is melting in your pot by the coals. Stay near the fire.";
      if (g.has("water")) return "Tap 💧 in your pack to drink.";
      if ((g.inventory.snow || 0) < 2) return "Press ACT on open ground (away from objects) to scoop snow. You need 2 handfuls.";
      if (!g.nearFire()) return "Go back to your burning campfire.";
      return "Tap MELT SNOW. It takes a few seconds by the fire.";
    },
    done: (g) => g.waterDrunk >= 1,
    target: (g) => {
      if (!g.has("barkPot")) return missingTarget(g, [["branch", 2], ["fiber", 2]]);
      if (!g.has("water") && !g.cookingOf("water") && (g.inventory.snow || 0) < 2) return null;
      return g.nearFire() || g.has("water") ? null : g.fireTarget("Campfire");
    },
    completeMsg: "Snow, pot, fire, water. Keep your pot close. Now you need food before tomorrow.",
  },
  {
    id: "find", chapter: CH1, title: "Find food: track an animal",
    what: "You need food before tomorrow. Follow the deer tracks leading away from camp.",
    why: "Meat keeps you alive; its hide becomes warm clothing.",
    reqs: [{ icon: "👣", label: "Deer found", have: (g) => (g.animalSpotted ? 1 : 0), need: 1 }],
    how: () => "Follow the hoof prints in the snow. WALK, don't run (Shift). Running scares animals from far away.",
    onStart: (g) => g.spawnGuidedDeer(),
    done: (g) => g.animalSpotted,
    target: (g) => g.trailTarget(),
    completeMsg: "A deer, grazing. You can't bring it down with bare hands.",
  },
  {
    id: "spear", chapter: CH1, title: "Make a hunting weapon",
    what: "You need a weapon. Carve a shaft and craft a primitive spear.",
    why: "A thrown spear can bring down a deer from a distance.",
    reqs: [
      { icon: "🦯", label: "Wooden shaft", have: (g) => (g.has("shaft") || g.hasSpearAnywhere() ? 1 : 0), need: 1 },
      { icon: "🪨", label: "Stone", have: (g) => (g.hasSpearAnywhere() ? 1 : inv("stone")(g)), need: 1 },
      { icon: "🎋", label: "Cord / fiber", have: (g) => (g.hasSpearAnywhere() ? 2 : inv("fiber")(g)), need: 2 },
    ],
    buttons: [
      { label: "CARVE SHAFT (uses 1🪵)", icon: "🦯", show: (g) => !g.has("shaft") && !g.hasSpearAnywhere(), enabled: (g) => g.canCraftId("shaft"), run: (g) => g.craft("shaft") },
      { label: "CRAFT SPEAR (shaft + 1🪨 + 2🎋)", icon: "🗡️", show: (g) => !g.hasSpearAnywhere(), enabled: (g) => g.canCraftId("spear"), run: (g) => g.craft("spear") },
    ],
    how: (g) => {
      if (!g.has("shaft") && !g.has("wood")) return "You need 1 wood to carve a shaft. Cut a small tree.";
      if ((g.inventory.fiber || 0) < 2) return "Strip fiber from the dark green bushes (ACT) to twist into cord.";
      if ((g.inventory.stone || 0) < 1) return "Pick up a stone for the spear point.";
      return g.has("shaft") ? "Tap CRAFT SPEAR." : "Tap CARVE SHAFT, then CRAFT SPEAR.";
    },
    onStart: (g) => g.spawnGuidedDeer(),
    done: (g) => g.hasSpearAnywhere(),
    target: (g) => missingTarget(g, g.has("shaft") ? [["fiber", 2], ["stone", 1]] : [["wood", 1], ["fiber", 2], ["stone", 1]]),
    completeMsg: "A stone point lashed to a straight shaft. Now you can hunt.",
  },
  {
    id: "hunt", chapter: CH1, title: "Hunt the deer",
    what: "Spear in hand, creep within range, face the animal and throw.",
    why: "One clean hit gives you meat, hide and bones.",
    reqs: [
      { icon: "🗡️", label: "Spear in hand", have: (g) => (g.equipped === "spear" || g.animalsKilled > 0 || g.projectiles.length > 0 ? 1 : 0), need: 1 },
      { icon: "🎯", label: "Animals hunted", have: (g) => g.animalsKilled, need: 1 },
    ],
    buttons: [
      { label: "EQUIP SPEAR (Q)", icon: "🗡️", show: (g) => g.has("spear") && g.equipped !== "spear", enabled: () => true, run: (g) => g.equip("spear") },
      { label: "CARVE SHAFT (uses 1🪵)", icon: "🦯", show: (g) => !g.hasSpearAnywhere() && !g.has("shaft"), enabled: (g) => g.canCraftId("shaft"), run: (g) => g.craft("shaft") },
      { label: "CRAFT NEW SPEAR", icon: "🗡️", show: (g) => !g.hasSpearAnywhere(), enabled: (g) => g.canCraftId("spear"), run: (g) => g.craft("spear") },
    ],
    how: (g) => {
      if (!g.hasSpearAnywhere()) return "Your spear is lost. Carve a shaft (1 wood) and craft a new spear (+1 stone, 2 fiber).";
      if (!g.has("spear") && g.entities.some((e) => e.kind === "spearOnGround")) return "Pick up your thrown spear (follow the arrow), then try again.";
      if (g.equipped !== "spear") return "Take your spear in hand: tap EQUIP SPEAR, press Q, or tap 🗡️ in your pack.";
      return "WALK slowly toward the deer. If it stops and stares (?), stand still until it calms. When the aim line turns green, press ACT to throw.";
    },
    onStart: (g) => g.spawnGuidedDeer(),
    done: (g) => g.animalsKilled >= 1,
    target: (g) => g.huntTarget(),
    completeMsg: "A clean kill. Now carry it back to camp.",
  },
  {
    id: "carry", chapter: CH1, title: "Take the animal back to camp",
    what: "Carry the carcass to your campfire and butcher it there.",
    why: "Butchering gives meat, hide and bones.",
    reqs: [{ icon: "🦌", label: "Butchered at camp", have: (g) => g.butchered, need: 1 }],
    how: (g) => g.carrying
      ? "Carry it to your campfire (follow the arrow), then press ACT to butcher."
      : "Walk to the carcass and press ACT to lift it onto your shoulders.",
    done: (g) => g.butchered >= 1,
    target: (g) => (g.carrying ? g.fireTarget("Campfire") : g.nearestOf("carcass", "Carcass")),
    completeMsg: "You now have meat, hide and bones.",
  },
  {
    id: "cook", chapter: CH1, title: "Cook the meat",
    what: "Roast 1 piece of meat over your campfire, then eat it.",
    why: "Raw meat makes you sick. Cooked meat restores hunger and health.",
    reqs: [{ icon: "🍖", label: "Meat cooked", have: (g) => g.cookedCount, need: 1 }],
    buttons: [{ label: "PUT MEAT ON THE FIRE (1🥩)", icon: "🍖", show: (g) => !g.cookingOf("cookedMeat"), enabled: (g) => g.canCraftId("cookMeat"), run: (g) => g.craft("cookMeat") }],
    how: (g) => {
      if (!campFire(g)) return "Your fire is out. HOLD ACT at the pit to relight it first.";
      if (g.cookingOf("cookedMeat")) return "It's roasting over the flames. Stay close; you'll take it off when it's done.";
      if (!g.nearFire()) return "Go back to your campfire to cook.";
      if ((g.inventory.meat || 0) < 1) return "You have no raw meat. Hunt again.";
      return "Tap COOK MEAT, then tap 🍖 in your pack to eat.";
    },
    done: (g) => g.cookedCount >= 1,
    target: (g) => (g.nearFire() ? null : g.fireTarget("Campfire")),
    completeMsg: "Hot food. Tap the 🍖 in your pack to eat it.",
  },
  {
    id: "clothes", chapter: CH1, title: "Make warm clothing",
    what: "The hide can protect you from the cold. Craft a skin wrap, boots and a cloak.",
    why: "Each piece slows how fast you freeze. Your survivor will wear them.",
    reqs: [
      { icon: "🧣", label: "Skin wrap", have: has("furWrap"), need: 1 },
      { icon: "🥾", label: "Skin boots", have: has("boots"), need: 1 },
      { icon: "🥼", label: "Skin cloak", have: has("cloak"), need: 1 },
    ],
    buttons: [
      craftBtn("furWrap", "WRAP (1🟫 + 2🎋)", "🧣", "furWrap"),
      craftBtn("boots", "BOOTS (1🟫 + 1🦴)", "🥾", "boots"),
      craftBtn("cloak", "CLOAK (1🟫 + 1🦴 + 2🎋)", "🥼", "cloak"),
    ],
    how: (g) => {
      const need = clothesNeed(g);
      if ((g.inventory.hide || 0) < need.hide) return "Not enough hide. Hunt again: a deer gives 3 hides, a rabbit 1. Follow the fresh tracks.";
      if ((g.inventory.fiber || 0) < need.fiber) return "You need more fiber. Strip it from bushes.";
      if ((g.inventory.bone || 0) < need.bone) return "You need bones (from butchering). Hunt again.";
      return "Craft each piece below. Watch your survivor: his clothes change.";
    },
    done: (g) => g.has("furWrap") && g.has("boots") && g.has("cloak"),
    target: (g) => {
      const n = clothesNeed(g);
      return missingTarget(g, [["hide", n.hide], ["fiber", n.fiber], ["bone", n.bone]]);
    },
    completeMsg: "Wrapped in skins, you finally stop shivering.",
  },
  {
    id: "night", chapter: CH1, title: "Survive the first night",
    what: "Feed the fire, then rest in your lean-to until dawn.",
    why: "Sleeping restores energy and moves time forward to morning. The fire burns while you sleep.",
    reqs: [{ icon: "🌅", label: "Dawn of day 2", have: (g) => (g.day >= 2 ? 1 : 0), need: 1 }],
    how: (g) => {
      const f = campFire(g);
      if (!f) return "Your fire is out! Relight it (HOLD ACT at the pit) before you sleep.";
      if ((f.fuel || 0) < 55) return "Feed the fire until it burns high (ACT on the fire), so it lasts the night.";
      if (!g.hasShelter()) return "Go back to your lean-to.";
      return "Press 😴 REST (R) inside your lean-to to sleep until dawn.";
    },
    done: (g) => g.day >= 2,
    target: (g) => {
      const f = campFire(g);
      if (!f || (f.fuel || 0) < 55) return g.nearFire() ? null : g.fireTarget("Campfire");
      return g.hasShelter() ? null : g.shelterTarget("Lean-to");
    },
    completeMsg: "Dawn. You survived your first night alone.",
  },
  {
    id: "preserve", chapter: CH2, title: "Preserve your meat",
    what: "You have more meat than you can eat, and fresh meat spoils. Build a drying rack beside the fire and hang 2 strips of raw meat.",
    why: "Dried meat keeps for weeks: food for the storms ahead.",
    reqs: [
      { icon: "🪵", label: "Drying rack built", have: (g) => (g.rack() ? 1 : 0), need: 1 },
      { icon: "🥩", label: "Meat hung to dry", have: (g) => g.meatHung, need: 2 },
    ],
    how: (g) => {
      if (!g.rack()) return g.hasCost(RACK_COST)
        ? "Walk to the rack outline beside your fire and press ACT (uses 6 branches + 3 fiber)."
        : "Gather 6 branches and 3 fiber, then walk to the rack outline beside your fire.";
      if (g.has("meat")) return "Press ACT on the rack to hang a strip of raw meat. The oldest meat goes up first.";
      return "You have no raw meat left. Hunt again: follow the fresh tracks from camp.";
    },
    onStart: (g) => g.placeSite("rack"),
    done: (g) => !!g.rack() && g.meatHung >= 2,
    target: (g) => {
      if (!g.rack()) return missingTarget(g, [["branch", 6], ["fiber", 3]]) || g.siteTarget("rack", "Build drying rack");
      return g.has("meat") ? g.rackTarget("Hang meat") : g.huntTrail();
    },
    completeMsg: "The strips hang in the cold and the smoke. In about half a day they'll be dried.",
  },
  {
    id: "reinforce", chapter: CH2, title: "Improve the shelter: log walls",
    what: "Your lean-to won't hold in the coming storms. Build log walls around the same shelter.",
    why: "Walls keep the heat in and block storm winds.",
    reqs: [
      { icon: "🪵", label: "Logs", have: inv("wood"), need: 8 },
      { icon: "🌿", label: "Branches", have: inv("branch"), need: 6 },
      { icon: "🪨", label: "Stones", have: inv("stone"), need: 6 },
    ],
    how: (g) => met("reinforce", g)
      ? "Walk to your lean-to and press ACT to raise the log walls."
      : "Collect the materials (follow the arrow). Keep the fire fed while you work.",
    done: (g) => shelterTier(g) >= 2,
    target: (g) => missingTarget(g, [["wood", 8], ["branch", 6], ["stone", 6]]) || g.shelterTarget("Improve shelter"),
    completeMsg: "Log walls packed with snow. The wind can't reach you.",
  },
  {
    id: "hut", chapter: CH2, title: "Improve the shelter: hide roof",
    what: "Line the roof with animal hides and add insulation to finish a small winter hut.",
    why: "A hut holds heat even when the fire burns low.",
    reqs: [
      { icon: "🟫", label: "Hides", have: inv("hide"), need: 2 },
      { icon: "🪵", label: "Logs", have: inv("wood"), need: 4 },
      { icon: "🎋", label: "Fiber (insulation)", have: inv("fiber"), need: 4 },
      { icon: "🌿", label: "Branches", have: inv("branch"), need: 4 },
    ],
    how: (g) => {
      if (met("hut", g)) return "Walk to your shelter and press ACT to finish the hut.";
      if ((g.inventory.hide || 0) < 2) return "Hunt again for hides: follow the fresh deer tracks from camp.";
      return "Collect the remaining materials (follow the arrow).";
    },
    done: (g) => shelterTier(g) >= 3,
    target: (g) => missingTarget(g, [["hide", 2], ["wood", 4], ["fiber", 4], ["branch", 4]]) || g.shelterTarget("Finish hut"),
    completeMsg: "A small hide-roofed hut. It's home now.",
  },
  {
    id: "dried", chapter: CH2, title: "Collect your dried meat",
    what: "Check the drying rack. When the strips turn dark and hard, collect them.",
    why: "Stored food means you can wait out a storm instead of hunting in it.",
    reqs: [{ icon: "🥓", label: "Dried meat collected", have: (g) => g.driedCollected, need: 1 }],
    how: (g) => {
      if (g.rackDried() > 0) return "The meat is ready. Press ACT on the rack to collect it.";
      const r = g.rack();
      if (r?.slots?.length) {
        const pct = Math.round(Math.max(...r.slots) * 100);
        return `Still drying (${pct}%). Smoke from a burning fire speeds it up. Keep the fire going, work, or sleep.`;
      }
      return g.has("meat") ? "The rack is empty. Hang raw meat on it (ACT)." : "The rack is empty. Hunt, then hang the raw meat on it.";
    },
    done: (g) => g.driedCollected >= 1,
    target: (g) => {
      if (g.rackDried() > 0) return g.rackTarget("Collect 🥓");
      if (g.rackHanging() > 0) return null;
      return g.has("meat") ? g.rackTarget("Hang meat") : g.huntTrail();
    },
    completeMsg: "Food that won't spoil. Your camp can feed you now.",
  },
  {
    id: "endure", chapter: CH3, title: "Endure the winter",
    what: "Reach day 7. Storms and cold grow harsher every day.",
    why: "Keep the fire fed. Eat, drink and stay warm.",
    reqs: [{ icon: "📅", label: "Day", have: (g) => g.day, need: 7 }],
    how: () => "Hunt, roast what you'll eat soon and dry the rest. Melt snow for water. Feed the fire before you sleep.",
    done: (g) => g.day >= 7,
    completeMsg: "A week alone in the wild. You've become a survivor.",
  },
  {
    id: "forever", chapter: CH3, title: "Survive as long as you can",
    what: "Every dawn is a victory.",
    why: "Your score grows with every day survived.",
    reqs: [],
    how: () => "Craft a fur hood, mittens and a winter coat for the deep cold.",
    done: () => false,
    completeMsg: "",
  },
];

function clothesNeed(g: Game) {
  const wrap = g.has("furWrap") ? 0 : 1, boots = g.has("boots") ? 0 : 1, cloak = g.has("cloak") ? 0 : 1;
  return { hide: wrap + boots + cloak, fiber: wrap * 2 + cloak * 2, bone: boots + cloak };
}
