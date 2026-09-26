import { useState } from "react";
import { SHELTER_NAMES } from "../game/data";
import type { Game, PublicState } from "../game/engine";
import { audio } from "../game/audio";

const overSleep = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return !!el && !!el.closest("[data-sleep]");
};

// Contextual HOLD button shown beside the shelter.
export function EnterShelterButton({ game, s, onHover }: { game: Game; s: PublicState; onHover: (v: boolean) => void }) {
  const [holding, setHolding] = useState(false);
  if (!s.hasShelter && !holding) return null;
  if (s.resting) return null;
  const end = (x: number, y: number) => {
    if (overSleep(x, y)) game.rest(); // released on SLEEP -> go to sleep inside
    game.setInteriorHold(false);
    setHolding(false);
    onHover(false);
  };
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        audio.resume();
        game.setInteriorHold(true);
        setHolding(true);
      }}
      onPointerMove={(e) => { if (holding) onHover(overSleep(e.clientX, e.clientY)); }}
      onPointerUp={(e) => end(e.clientX, e.clientY)}
      onPointerCancel={() => { game.setInteriorHold(false); setHolding(false); onHover(false); }}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto absolute z-30 left-3 bottom-[10.5rem] sm:bottom-20 select-none touch-none rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-black tracking-wide ring-2 shadow-lg transition ${
        holding ? "bg-amber-500 text-slate-900 ring-amber-200 scale-95" : "bg-slate-900/75 text-amber-100 ring-amber-300/50 hover:bg-slate-800/85"}`}
    >
      ⛺ {holding ? "INSIDE… release to step out" : "ENTER SHELTER"}
      {!holding && <span className="block text-[9px] font-semibold text-amber-100/60 tracking-normal">hold · or hold E / F</span>}
    </button>
  );
}

// Overlay shown while viewing the interior (or sleeping).
export function InteriorOverlay({ game, s, sleepHover }: { game: Game; s: PublicState; sleepHover: boolean }) {
  if (!s.interior) return null;
  const name = SHELTER_NAMES[Math.max(1, s.shelterTier)] || "Shelter";
  const f = s.campFireFuel;
  const fireTxt = f < 0 ? "No fire outside" : f <= 0 ? "Fire outside: out" : f < 25 ? "Fire outside: burning low" : "Fire outside: burning well";
  const fireCol = f < 0 || f <= 0 ? "text-sky-200" : f < 25 ? "text-amber-300" : "text-orange-300";
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center anim-float">
        <div className="bg-black/45 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-amber-200/20 text-amber-50 text-xs sm:text-sm font-semibold whitespace-nowrap">
          ⛺ Inside your {name.toLowerCase()}
        </div>
        <div className={`mt-1 text-[11px] ${fireCol}`}>{fireTxt} · 🌡️ {Math.round(s.temp)}</div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-24 sm:bottom-28 flex flex-col items-center gap-2">
        {!s.resting ? (
          <>
            <button
              data-sleep
              onClick={() => game.rest()}
              className={`pointer-events-auto rounded-2xl px-8 py-3 text-base sm:text-lg font-black tracking-widest ring-2 shadow-xl transition ${
                sleepHover ? "bg-indigo-400 text-white ring-white scale-110" : "bg-indigo-600/85 text-white ring-indigo-200/50 hover:bg-indigo-500"}`}
            >
              😴 SLEEP
            </button>
            <div className="text-[11px] text-white/60 bg-black/35 rounded-md px-2 py-0.5 text-center">
              Slide onto SLEEP & release · or press R · release elsewhere to step outside
            </div>
            {f >= 0 && f < 25 && <div className="text-[11px] text-amber-200/90">Feed the fire before you sleep. It burns while you rest.</div>}
          </>
        ) : (
          <>
            <div className="text-white/80 text-sm bg-black/35 rounded-full px-4 py-1">Sleeping… the night passes slowly</div>
            <button
              onClick={() => game.rest()}
              className="pointer-events-auto rounded-xl px-5 py-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/25"
            >
              Wake up (ACT)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
