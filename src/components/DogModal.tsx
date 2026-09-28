import { ITEMS } from "../game/data";
import type { Game, PublicState } from "../game/engine";
import type { ItemId } from "../game/types";

interface DogModalProps {
  game: Game;
  s: PublicState;
  onClose: () => void;
}

export function DogModal({ game, s, onClose }: DogModalProps) {
  const dog = game.dog();
  if (!dog) return null;

  const hunger = s.dogHunger >= 0 ? s.dogHunger : Math.round(dog.dogHunger ?? 80);
  const state = s.dogState || dog.dogState || "follow";
  const isWaiting = s.dogWaiting ?? !!dog.dogWait;

  const foodOptions: { id: ItemId; val: number }[] = [
    { id: "cookedMeat", val: 45 },
    { id: "cookedFish", val: 45 },
    { id: "driedMeat", val: 35 },
    { id: "meat", val: 25 },
    { id: "fish", val: 25 },
  ];

  const availableFoods = foodOptions.filter((f) => (s.inventory[f.id] || 0) > 0);

  const handleFeed = (id?: ItemId) => {
    game.feedDog(id);
  };

  const handlePet = () => {
    game.petDog();
  };

  const handleRestByFire = () => {
    game.commandDogRest();
  };

  const handleFollow = () => {
    game.commandDogFollow();
  };

  const handleToggleWait = () => {
    game.toggleDogWait();
  };

  // Status description
  let statusText = "Following you loyally";
  if (state === "rest") statusText = "Resting peacefully near the fire";
  else if (state === "sit") statusText = isWaiting ? "Waiting here for you" : "Sitting alertly, watching you";
  else if (state === "eat") statusText = "Happily eating food";
  else if (state === "pet") statusText = "Panting happily from your affection";
  else if (isWaiting) statusText = "Staying at this spot";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0c1017]/95 border border-amber-900/40 shadow-2xl p-5 text-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🐕</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Loyal Companion</h2>
              <p className="text-[11px] text-amber-200/80">{statusText}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Hunger Bar */}
        <div className="mt-4 bg-white/5 rounded-xl p-3 border border-white/5">
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span className="text-stone-300 flex items-center gap-1.5">
              <span>🍖</span> Food & Energy
            </span>
            <span
              className={
                hunger > 60
                  ? "text-emerald-400 font-bold"
                  : hunger > 30
                  ? "text-amber-400 font-bold"
                  : "text-rose-400 font-bold"
              }
            >
              {hunger}% · {hunger > 65 ? "Well-fed" : hunger > 30 ? "Hungry" : "Very Hungry"}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/10">
            <div
              className={`h-full transition-all duration-300 ${
                hunger > 60
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                  : hunger > 30
                  ? "bg-gradient-to-r from-amber-600 to-amber-400"
                  : "bg-gradient-to-r from-rose-700 to-orange-500"
              }`}
              style={{ width: `${Math.max(5, hunger)}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-2 leading-relaxed">
            A medium-sized northern mutt with a thick winter coat. Give meat or fish to sustain your bond.
          </p>
        </div>

        {/* Interaction Actions */}
        <div className="mt-4 space-y-2">
          {/* Pet Button */}
          <button
            onClick={handlePet}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-900/60 to-amber-800/60 hover:from-amber-800/80 hover:to-amber-700/80 border border-amber-600/40 text-amber-100 font-medium text-xs sm:text-sm shadow-md transition active:scale-[0.98]"
          >
            <span>🐾</span>
            <span>Pet Dog</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            {/* Rest near fire */}
            <button
              onClick={handleRestByFire}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-orange-950/60 hover:bg-orange-900/60 border border-orange-600/40 text-orange-200 text-xs font-medium transition active:scale-[0.98]"
            >
              <span>🔥</span>
              <span>Rest by Fire</span>
            </button>

            {/* Follow / Wait Button */}
            <button
              onClick={isWaiting ? handleFollow : handleToggleWait}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition active:scale-[0.98] ${
                isWaiting
                  ? "bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-600/40 text-emerald-200"
                  : "bg-stone-800/60 hover:bg-stone-700/60 border-stone-600/40 text-stone-300"
              }`}
            >
              <span>{isWaiting ? "🐕" : "✋"}</span>
              <span>{isWaiting ? "Follow Me" : "Wait Here"}</span>
            </button>
          </div>
        </div>

        {/* Feeding Section */}
        <div className="mt-4 pt-3 border-t border-white/10">
          <div className="text-[11px] font-semibold text-stone-300 uppercase tracking-wider mb-2">
            Feed Suitable Food
          </div>
          {availableFoods.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {availableFoods.map((f) => {
                const item = ITEMS[f.id];
                const count = s.inventory[f.id] || 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => handleFeed(f.id)}
                    className="flex items-center gap-2 p-2 rounded-xl bg-stone-900/80 hover:bg-stone-800 border border-white/10 hover:border-amber-400/40 text-left transition active:scale-[0.97]"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{item.name}</div>
                      <div className="text-[10px] text-amber-200/70">
                        x{count} · +{f.val}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 p-3 text-center border border-white/5">
              <p className="text-xs text-stone-400">No meat or fish in pack.</p>
              <p className="text-[10px] text-stone-500 mt-1">
                Hunt small game, check snares, or dry meat at camp.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
