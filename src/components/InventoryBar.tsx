import { ITEMS } from "../game/data";
import type { Game, PublicState } from "../game/engine";
import type { ItemId } from "../game/types";

const CONSUMABLE: ItemId[] = ["water", "cookedMeat", "driedMeat", "cookedFish", "streamWater", "snow", "meat", "fish"];
const PERISHABLE: ItemId[] = ["meat", "fish", "cookedMeat", "cookedFish"];
const EQUIPPABLE: ItemId[] = ["axe", "spear"];
const WEARABLE: ItemId[] = ["furWrap", "boots", "cloak", "hood", "gloves", "warmCoat"];

export function InventoryBar({ game, s }: { game: Game; s: PublicState }) {
  const entries = Object.entries(s.inventory).filter(([, v]) => v > 0) as [ItemId, number][];
  const rank = (id: ItemId) => (EQUIPPABLE.includes(id) ? 0 : CONSUMABLE.includes(id) ? 1 : WEARABLE.includes(id) ? 3 : 2);
  entries.sort((a, b) => rank(a[0]) - rank(b[0]));

  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-10 max-w-[92vw]">
      <div className="pointer-events-auto flex gap-1.5 overflow-x-auto scrollbar-thin bg-black/35 backdrop-blur-sm rounded-xl p-1.5 ring-1 ring-white/10">
        {entries.length === 0 && (
          <div className="text-[11px] text-white/40 px-3 py-2 whitespace-nowrap">Empty: you have nothing</div>
        )}
        {entries.map(([id, qty]) => {
          const it = ITEMS[id];
          const eatable = CONSUMABLE.includes(id);
          const tool = EQUIPPABLE.includes(id);
          const worn = WEARABLE.includes(id);
          const inHand = s.equipped === id;
          const onClick = () => {
            if (eatable) game.eat(id);
            else if (tool) game.equip(inHand ? null : id);
          };
          return (
            <button
              key={id}
              disabled={!eatable && !tool}
              onClick={onClick}
              title={it.name + (eatable ? (id === "water" || id === "streamWater" ? ": tap to drink" : ": tap to eat") : tool ? (inHand ? ": in hand (tap to lower)" : ": tap to equip") : worn ? ": worn" : "") + " · " + it.desc}
              className={`relative flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-xl ring-1 transition active:scale-90 ${
                inHand ? "bg-amber-500/30 ring-2 ring-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.5)]"
                : tool ? "bg-sky-900/40 ring-sky-300/40 hover:bg-sky-800/50"
                : eatable ? "bg-emerald-900/40 ring-emerald-400/30 hover:bg-emerald-800/50"
                : worn ? "bg-amber-900/30 ring-amber-700/40"
                : "bg-white/5 ring-white/10"}`}
            >
              <span>{it.icon}</span>
              {inHand && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-black bg-amber-400 text-slate-900 rounded px-1 whitespace-nowrap">IN HAND</span>}
              {worn && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-black bg-amber-800 text-amber-100 rounded px-1">WORN</span>}
              {!tool && !worn && id !== "barkPot" && <span className="absolute -bottom-0.5 -right-0.5 text-[10px] font-bold bg-black/70 rounded px-1 text-white tabular-nums">{qty}</span>}
              {id === "barkPot" && <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-black/70 rounded px-1 text-sky-200 tabular-nums">{game.waterHeld()}/{game.waterCapacity()}</span>}
              {PERISHABLE.includes(id) && (() => {
                const age = game.foodAge(id);
                const col = age > 0.75 ? "#ef4444" : age > 0.45 ? "#f59e0b" : "#84cc16";
                return (
                  <span className="absolute left-1 right-1 top-0.5 h-1 rounded-full bg-black/50 overflow-hidden" title={age > 0.75 ? "About to spoil" : "Freshness"}>
                    <span className="block h-full rounded-full" style={{ width: `${(1 - age) * 100}%`, background: col }} />
                  </span>
                );
              })()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
