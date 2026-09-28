import { SHELTER_NAMES } from "../game/data";
import type { Game, PublicState } from "../game/engine";
import { audio } from "../game/audio";

// Contextual button shown beside the shelter to step inside or step out.
export function EnterShelterButton({ game, s, onHover }: { game: Game; s: PublicState; onHover: (v: boolean) => void }) {
  if (!s.hasShelter && !s.interior) return null;
  if (s.resting) return null;

  const isHut = s.shelterTier >= 3;
  const isInside = s.interior;

  if (isInside) {
    return (
      <button
        onClick={() => {
          game.setInteriorHold(false);
          onHover(false);
        }}
        className="pointer-events-auto absolute z-30 left-3 bottom-[10.5rem] sm:bottom-20 select-none rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-black tracking-wide ring-2 shadow-lg transition bg-slate-900/85 text-amber-100 ring-amber-300/50 hover:bg-slate-800"
      >
        🚪 STEP OUTSIDE
        <span className="block text-[9px] font-semibold text-amber-100/60 tracking-normal">or press Esc</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        audio.resume();
        game.setInteriorHold(true);
      }}
      className="pointer-events-auto absolute z-30 left-3 bottom-[10.5rem] sm:bottom-20 select-none touch-none rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-black tracking-wide ring-2 shadow-lg transition bg-slate-900/85 text-amber-100 ring-amber-300/50 hover:bg-slate-800/95 hover:scale-105 active:scale-95"
    >
      {isHut ? "🪵 ENTER WOODEN HUT" : "⛺ ENTER SHELTER"}
      <span className="block text-[9px] font-semibold text-amber-100/60 tracking-normal">
        {isHut ? "🔥 Fireplace inside · or tap E" : "press E · escape storm"}
      </span>
    </button>
  );
}

// Overlay shown while viewing the interior (or sleeping).
export function InteriorOverlay({ game, s }: { game: Game; s: PublicState; sleepHover: boolean }) {
  if (!s.interior) return null;
  const tier = Math.max(1, s.shelterTier);
  const name = SHELTER_NAMES[tier] || "Shelter";
  const isHut = tier >= 3;

  // Outdoor campfire fuel
  const f = s.campFireFuel;
  const fireTxt = f < 0 ? "No fire outside" : f <= 0 ? "Fire outside: out" : f < 25 ? "Fire outside: burning low" : "Fire outside: burning well";

  // Fireplace fuel and heat
  const fpFuel = s.fireplaceFuel >= 0 ? s.fireplaceFuel : 80;
  const fpLogs = Math.max(0, Math.min(10, Math.ceil(fpFuel / 10)));
  const woodInPack = (s.inventory.wood || 0);
  const branchInPack = (s.inventory.branch || 0);
  const hasFuelItem = woodInPack > 0 || branchInPack > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Header: Shelter status */}
      <div className="flex flex-col items-center gap-1.5 text-center anim-float mt-2">
        <div className="bg-black/60 backdrop-blur-md rounded-full px-5 py-2 ring-1 ring-amber-200/30 text-amber-50 text-xs sm:text-sm font-bold shadow-xl">
          {isHut ? "🪵 Inside your proper wooden hut" : `⛺ Inside your ${name.toLowerCase()}`}
        </div>
        <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1 text-[11px] text-amber-200/90 ring-1 ring-white/10">
          🌡️ Warmth: {Math.round(s.temp)}° · {fireTxt}
        </div>
      </div>

      {/* Top Right: Compact FIREPLACE STATUS for Wooden Hut */}
      {isHut && (
        <div className="pointer-events-auto absolute top-4 right-4 sm:top-6 sm:right-6 bg-slate-950/85 backdrop-blur-md rounded-2xl p-3.5 ring-2 ring-amber-500/40 shadow-2xl text-left min-w-[160px] sm:min-w-[180px]">
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1.5 mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1">
              🔥 FIRE
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              s.fireplaceHeat === "Strong"
                ? "bg-orange-500/25 text-orange-300 ring-1 ring-orange-400/50"
                : s.fireplaceHeat === "Moderate"
                ? "bg-amber-500/25 text-amber-300 ring-1 ring-amber-400/50"
                : s.fireplaceHeat === "Low"
                ? "bg-yellow-500/25 text-yellow-300 ring-1 ring-yellow-400/50"
                : "bg-stone-700 text-stone-300"
            }`}>
              Heat: {s.fireplaceHeat}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-white/90 mb-1.5 font-medium">
            <span>Fuel:</span>
            <span className="font-bold text-amber-200">{fpLogs} / 10 logs</span>
          </div>

          {/* Mini progress fuel bar */}
          <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden ring-1 ring-white/10 mb-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-yellow-300 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, fpFuel))}%` }}
            />
          </div>

          {/* Quick Add Wood button */}
          <button
            onClick={() => game.addFireplaceWood()}
            disabled={!hasFuelItem || fpFuel >= 95}
            className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ring-1 ${
              hasFuelItem && fpFuel < 95
                ? "bg-amber-600 hover:bg-amber-500 text-white ring-amber-300/50 shadow-md active:scale-95"
                : "bg-stone-800/80 text-stone-400 ring-stone-700 cursor-not-allowed opacity-60"
            }`}
          >
            <span>🪵</span>
            <span>Add Wood</span>
            <span className="text-[10px] opacity-75 font-normal">
              ({woodInPack ? `${woodInPack}🪵` : `${branchInPack}🌿`})
            </span>
          </button>
        </div>
      )}

      {/* Bottom Center: Primary Hut & Fireplace Interactions */}
      <div className="pointer-events-auto mx-auto mb-16 sm:mb-20 flex flex-col items-center gap-2.5">
        {!s.resting ? (
          <div className="flex flex-wrap items-center justify-center gap-2.5 bg-black/60 backdrop-blur-md p-2.5 rounded-2xl ring-1 ring-white/15 shadow-2xl">
            {/* Sit / Stand button */}
            <button
              onClick={() => game.toggleSit()}
              className={`rounded-xl px-5 py-2.5 text-xs sm:text-sm font-black tracking-wide ring-2 shadow-lg transition flex items-center gap-1.5 ${
                s.sitting
                  ? "bg-amber-400 text-slate-950 ring-amber-200 scale-105"
                  : "bg-amber-600/90 hover:bg-amber-500 text-white ring-amber-300/50 active:scale-95"
              }`}
            >
              <span>{s.sitting ? "🧍" : "🪑"}</span>
              <span>{s.sitting ? "Stand (E)" : "Sit beside fire (E)"}</span>
            </button>

            {/* Sleep button */}
            <button
              data-sleep
              onClick={() => game.rest()}
              className="rounded-xl px-6 py-2.5 text-xs sm:text-sm font-black tracking-wide ring-2 shadow-lg bg-indigo-600/90 hover:bg-indigo-500 text-white ring-indigo-300/50 active:scale-95 flex items-center gap-1.5"
            >
              <span>😴</span>
              <span>REST / SLEEP (R)</span>
            </button>

            {/* Step Outside button */}
            <button
              onClick={() => game.setInteriorHold(false)}
              className="rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 text-white/90 ring-1 ring-white/25 active:scale-95 flex items-center gap-1.5"
            >
              <span>🚪</span>
              <span>Step Outside (Esc)</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md p-3 rounded-2xl ring-1 ring-white/15 text-center">
            <div className="text-white/90 text-sm font-medium">Sleeping peacefully by the hearth…</div>
            <button
              onClick={() => game.rest()}
              className="rounded-xl px-6 py-2 text-xs font-bold bg-white/20 hover:bg-white/30 text-white ring-1 ring-white/30 shadow-lg"
            >
              Wake up (E / Space)
            </button>
          </div>
        )}

        {isHut && !s.resting && (
          <div className="text-[11px] text-amber-200/80 bg-black/45 backdrop-blur-sm rounded-full px-3.5 py-1 text-center ring-1 ring-amber-500/20">
            Press <span className="font-bold text-white">E</span> to {s.sitting ? "stand" : "sit"} · Press <span className="font-bold text-white">F</span> to add wood
          </div>
        )}
      </div>
    </div>
  );
}
