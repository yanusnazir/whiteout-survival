import { RECIPES, ITEMS } from "../game/data";
import type { Game } from "../game/engine";
import type { PublicState } from "../game/engine";
import type { ItemId } from "../game/types";

export function CraftPanel({ game, s, onClose }: { game: Game; s: PublicState; onClose: () => void }) {
  // force re-render helper via key on parent; here we read live
  const inv = s.inventory;

  const build: { id: string; name: string; icon: string; cost: Record<string, number>; action: () => void; desc: string }[] = [
    { id: "fire", name: "Build Fire Pit", icon: "🪵", cost: { wood: 6, branch: 4, stone: 4 }, action: () => { game.buildFire(); onClose(); }, desc: "Stone ring + wood. Then HOLD ACT to spin the drill." },
    { id: "addfuel", name: "Feed Fire", icon: "🔥", cost: {}, action: () => game.addFuel(), desc: "Add wood or a branch to a nearby fire." },
    { id: "shelter", name: "Lean-to Shelter", icon: "⛺", cost: { wood: 12, branch: 10 }, action: () => { game.buildShelter(); onClose(); }, desc: "Built at the glowing outline if nearby." },
    { id: "settrap", name: "Set Snare", icon: "🪤", cost: { trap: 1 }, action: () => game.placeTrap(), desc: "Place a crafted snare on an animal trail." },
    ...(game.rack() ? [] : [{ id: "rack", name: "Drying Rack", icon: "🥓", cost: { branch: 6, fiber: 3 } as Record<string, number>, action: () => { game.buildRack(); onClose(); }, desc: "Poles & cord beside the fire. Dries extra meat so it keeps." }]),
  ];

  const canAfford = (cost: Record<string, number>, needFire?: boolean) => {
    for (const k in cost) if ((inv[k] || 0) < cost[k]) return false;
    if (needFire && !s.nearFire) return false;
    return true;
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        className="anim-float w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin bg-slate-900/95 ring-1 ring-white/15 rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">🛠️ Craft & Build</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl px-2">✕</button>
        </div>

        <h3 className="text-xs uppercase tracking-wide text-white/40 mb-2">Build in world</h3>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {build.map((b) => {
            const ok = canAfford(b.cost);
            return (
              <button
                key={b.id}
                disabled={!ok}
                onClick={() => { b.action(); }}
                className={`text-left rounded-xl p-2.5 ring-1 transition ${ok ? "bg-emerald-600/20 ring-emerald-400/30 hover:bg-emerald-600/30 active:scale-95" : "bg-white/5 ring-white/10 opacity-50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{b.icon}</span>
                  <span className="font-semibold text-sm text-white">{b.name}</span>
                </div>
                <div className="text-[10px] text-white/50 mt-0.5">{b.desc}</div>
                <CostRow cost={b.cost} inv={inv} />
              </button>
            );
          })}
        </div>

        {STAGES.map((stage) => {
          const recs = RECIPES.filter((r) => stage.ids.includes(r.id));
          if (recs.length === 0) return null;
          return (
            <div key={stage.title} className="mb-3">
              <h3 className="text-xs uppercase tracking-wide text-white/40 mb-2">{stage.title}</h3>
              <div className="grid grid-cols-2 gap-2">
                {recs.map((r) => {
                  const ok = game.canCraftId(r.id);
                  return (
                    <button
                      key={r.id}
                      disabled={!ok}
                      onClick={() => game.craft(r.id)}
                      className={`text-left rounded-xl p-2.5 ring-1 transition ${ok ? "bg-sky-600/20 ring-sky-400/30 hover:bg-sky-600/30 active:scale-95" : "bg-white/5 ring-white/10 opacity-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{r.icon}</span>
                        <span className="font-semibold text-sm text-white">{r.name}</span>
                        {r.needFire && <span className="text-[9px] text-amber-300 ml-auto">🔥</span>}
                      </div>
                      <div className="text-[10px] text-white/50 mt-0.5 line-clamp-2">{r.desc}</div>
                      <CostRow cost={r.cost as Record<string, number>} inv={inv} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STAGES: { title: string; ids: string[] }[] = [
  { title: "① Tools & weapons", ids: ["axe", "shaft", "spear"] },
  { title: "② Water & campfire (stand at your fire)", ids: ["barkPot", "water", "boil", "cookMeat", "cookFish", "torch"] },
  { title: "③ Animal-skin clothing", ids: ["furWrap", "boots", "cloak", "hood", "gloves", "warmCoat"] },
  { title: "④ Trapping & fishing", ids: ["trap", "fishingRod"] },
];

function CostRow({ cost, inv }: { cost: Record<string, number>; inv: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {Object.entries(cost).map(([k, v]) => {
        const have = inv[k] || 0;
        const enough = have >= v;
        const it = ITEMS[k as ItemId];
        return (
          <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded-md ${enough ? "bg-white/10 text-white/80" : "bg-red-900/40 text-red-300"}`}>
            {it?.icon} {have}/{v}
          </span>
        );
      })}
    </div>
  );
}
