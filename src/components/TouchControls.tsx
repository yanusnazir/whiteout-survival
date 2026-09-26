import { useEffect, useRef } from "react";
import type { Game } from "../game/engine";

export function TouchControls({ game, onAction, onRest }: { game: Game; onAction: () => void; onRest: () => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ id: -1, cx: 0, cy: 0 });

  useEffect(() => {
    const base = baseRef.current!;
    const knob = knobRef.current!;
    const R = 52;

    const start = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const rect = base.getBoundingClientRect();
      stateRef.current = { id: t.identifier, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
      game.joy.active = true;
      move(e);
    };
    const move = (e: TouchEvent) => {
      const st = stateRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== st.id) continue;
        let dx = t.clientX - st.cx;
        let dy = t.clientY - st.cy;
        const d = Math.hypot(dx, dy);
        const cl = Math.min(d, R);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * cl;
        const ky = Math.sin(ang) * cl;
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
        game.joy.x = (Math.cos(ang) * cl) / R;
        game.joy.y = (Math.sin(ang) * cl) / R;
        e.preventDefault();
      }
    };
    const end = (e: TouchEvent) => {
      const st = stateRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === st.id) {
          st.id = -1;
          game.joy.active = false;
          game.joy.x = 0; game.joy.y = 0;
          knob.style.transform = "translate(0,0)";
        }
      }
    };
    base.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      base.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [game]);

  return (
    <div className="sm:hidden pointer-events-none absolute inset-0 z-20">
      {/* joystick */}
      <div
        ref={baseRef}
        className="pointer-events-auto absolute bottom-6 left-6 w-32 h-32 rounded-full bg-white/5 ring-2 ring-white/15 backdrop-blur-sm flex items-center justify-center"
      >
        <div ref={knobRef} className="w-14 h-14 rounded-full bg-white/25 ring-2 ring-white/40 transition-transform duration-75" />
      </div>
      {/* rest button */}
      <button
        onTouchStart={(e) => { e.preventDefault(); onRest(); }}
        className="pointer-events-auto absolute bottom-40 right-10 w-14 h-14 rounded-full bg-indigo-500/70 active:bg-indigo-400 active:scale-95 ring-2 ring-indigo-300/40 shadow-lg flex items-center justify-center text-white text-xl transition-transform"
        title="Rest in shelter"
      >
        😴
      </button>
      {/* action button — press & HOLD (for the fire drill) */}
      <button
        onTouchStart={(e) => { e.preventDefault(); onAction(); }}
        onTouchEnd={(e) => { e.preventDefault(); game.releaseAction(); }}
        onTouchCancel={() => game.releaseAction()}
        className="pointer-events-auto absolute bottom-10 right-8 w-24 h-24 rounded-full bg-emerald-500/80 active:bg-emerald-400 active:scale-95 ring-4 ring-emerald-300/40 shadow-lg shadow-emerald-900/40 flex items-center justify-center text-white font-bold text-lg transition-transform"
      >
        ACT
      </button>
    </div>
  );
}
