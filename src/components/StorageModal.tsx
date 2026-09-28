import { useState } from "react";
import { ITEMS, FOOD_STORAGE_ITEMS, WATER_STORAGE_ITEMS, MATERIAL_STORAGE_ITEMS } from "../game/data";
import type { Game, PublicState } from "../game/engine";
import type { Entity, ItemId } from "../game/types";

interface StorageModalProps {
  game: Game;
  storageEntity: Entity;
  s: PublicState;
  onClose: () => void;
}

export function StorageModal({ game, storageEntity, s, onClose }: StorageModalProps) {
  // Local state to force re-renders on transfer
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const kind = storageEntity.kind;
  const store = storageEntity.storage || {};
  const cap = storageEntity.capacity || 50;

  let currentCount = 0;
  for (const k in store) currentCount += store[k as ItemId] || 0;
  const freeSpace = Math.max(0, cap - currentCount);

  let title = "Camp Storage";
  let icon = "📦";
  let allowedItems: ItemId[] = [];

  if (kind === "woodStorage") {
    title = "Firewood Storage";
    icon = "🪵";
    allowedItems = ["wood"];
  } else if (kind === "foodStorage") {
    title = "Winter Food Cache";
    icon = "🥩";
    allowedItems = FOOD_STORAGE_ITEMS;
  } else if (kind === "waterStorage") {
    title = "Water Cistern";
    icon = "💧";
    allowedItems = WATER_STORAGE_ITEMS;
  } else if (kind === "materialStorage") {
    title = "General Materials";
    icon = "🧰";
    allowedItems = MATERIAL_STORAGE_ITEMS;
  }

  // Filter to items that the player either has or are currently stored
  const activeItems = allowedItems.filter((id) => (s.inventory[id] || 0) > 0 || (store[id] || 0) > 0);

  const handleDeposit = (id: ItemId, qty: number) => {
    game.depositToStorage(storageEntity, id, qty);
    rerender();
  };

  const handleWithdraw = (id: ItemId, qty: number) => {
    game.withdrawFromStorage(storageEntity, id, qty);
    rerender();
  };

  const handleDepositAll = () => {
    for (const id of allowedItems) {
      const have = s.inventory[id] || 0;
      if (have > 0) game.depositToStorage(storageEntity, id, have);
    }
    rerender();
  };

  const handleWithdrawAll = () => {
    for (const id of allowedItems) {
      const stored = store[id] || 0;
      if (stored > 0) game.withdrawFromStorage(storageEntity, id, stored);
    }
    rerender();
  };

  const pct = Math.min(100, Math.round((currentCount / cap) * 100));

  return (
    <div
      className="absolute inset-0 z-30 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 select-none"
      onClick={onClose}
    >
      <div
        className="anim-float w-full max-w-md max-h-[85vh] flex flex-col bg-slate-900/95 ring-1 ring-white/15 rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">{title}</h2>
              <div className="text-[11px] text-white/50">Camp homestead structure</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-white/70 hover:text-white flex items-center justify-center text-lg transition"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Capacity Bar */}
        <div className="my-3 bg-black/40 rounded-xl p-2.5 ring-1 ring-white/10">
          <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
            <span className="text-white/70">Stored Capacity</span>
            <span className="text-amber-300 font-bold tabular-nums">
              {currentCount} / {cap} {currentCount >= cap ? "(FULL)" : `(${freeSpace} free)`}
            </span>
          </div>
          <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden ring-1 ring-white/10">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                currentCount >= cap ? "bg-amber-500" : "bg-gradient-to-r from-emerald-500 to-sky-400"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Quick Batch Actions */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleDepositAll}
            disabled={freeSpace <= 0}
            className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 ring-1 ring-emerald-400/30 text-emerald-200 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none transition text-center"
          >
            + Store All Allowed
          </button>
          <button
            onClick={handleWithdrawAll}
            disabled={currentCount <= 0}
            className="flex-1 py-1.5 px-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 active:scale-95 ring-1 ring-sky-400/30 text-sky-200 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none transition text-center"
          >
            - Take All
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 space-y-2 min-h-[140px] max-h-[46vh]">
          {activeItems.length === 0 ? (
            <div className="text-center py-8 text-white/40 text-xs italic">
              No matching items in your pack or storage.
              <br />
              Gather supplies and return here to store them safely.
            </div>
          ) : (
            activeItems.map((id) => {
              const def = ITEMS[id];
              const inPack = s.inventory[id] || 0;
              const inStore = store[id] || 0;
              const canStore = inPack > 0 && freeSpace > 0;
              const canTake = inStore > 0;

              return (
                <div
                  key={id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/[0.07] transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl flex-shrink-0">{def.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">{def.name}</div>
                      <div className="text-[10px] text-white/50 flex gap-2">
                        <span>In pack: <strong className="text-emerald-300 tabular-nums">{inPack}</strong></span>
                        <span>·</span>
                        <span>Stored: <strong className="text-amber-300 tabular-nums">{inStore}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Store buttons */}
                    <button
                      onClick={() => handleDeposit(id, 1)}
                      disabled={!canStore}
                      className="px-2 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/40 active:scale-90 ring-1 ring-emerald-400/40 text-emerald-200 text-[11px] font-bold disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Store 1"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => handleDeposit(id, inPack)}
                      disabled={!canStore}
                      className="px-2 py-1 rounded bg-emerald-600/35 hover:bg-emerald-600/50 active:scale-90 ring-1 ring-emerald-400/50 text-emerald-100 text-[11px] font-bold disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Store all"
                    >
                      +All
                    </button>

                    <div className="w-[1px] h-5 bg-white/10 mx-0.5" />

                    {/* Take buttons */}
                    <button
                      onClick={() => handleWithdraw(id, 1)}
                      disabled={!canTake}
                      className="px-2 py-1 rounded bg-sky-600/25 hover:bg-sky-600/40 active:scale-90 ring-1 ring-sky-400/40 text-sky-200 text-[11px] font-bold disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Take 1"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => handleWithdraw(id, inStore)}
                      disabled={!canTake}
                      className="px-2 py-1 rounded bg-sky-600/35 hover:bg-sky-600/50 active:scale-90 ring-1 ring-sky-400/50 text-sky-100 text-[11px] font-bold disabled:opacity-30 disabled:pointer-events-none transition"
                      title="Take all"
                    >
                      -All
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2.5 mt-2 border-t border-white/10 text-[10px] text-white/40 flex justify-between items-center">
          <span>Items remain stored across game saves.</span>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white underline text-[11px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
