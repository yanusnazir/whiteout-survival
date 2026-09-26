import { useState } from "react";
import type { Game } from "../game/engine";
import { JOURNEY } from "../game/journey";

export function ObjectiveCard({ game, index }: { game: Game; index: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const step = JOURNEY[index];
  if (!step) return null;
  const next = JOURNEY[index + 1];
  const reqs = step.reqs.map((r) => ({ ...r, cur: Math.min(r.need, r.have(game)) }));
  const allMet = reqs.every((r) => r.cur >= r.need);
  const buttons = (step.buttons || []).filter((b) => b.show(game));
  const isFinal = index === JOURNEY.length - 1;

  return (
    <div className="pointer-events-auto absolute top-2 left-2 sm:top-3 sm:left-3 z-10 w-[min(62vw,320px)] anim-float" key={step.id}>
      <div className="bg-slate-950/70 backdrop-blur-md rounded-xl ring-1 ring-amber-300/30 shadow-xl overflow-hidden">
        <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-between px-3 pt-2 pb-1 text-left">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-amber-300/80 truncate">{step.chapter}</span>
          <span className="text-[10px] text-white/50 ml-2 whitespace-nowrap">{isFinal ? "∞" : `${index + 1}/${JOURNEY.length - 1}`} {collapsed ? "▾" : "▴"}</span>
        </button>
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-400 text-slate-900 text-xs font-black flex items-center justify-center">{isFinal ? "★" : index + 1}</span>
            <h3 className="text-sm sm:text-[15px] font-bold text-white leading-tight">{step.title}</h3>
          </div>

          {!collapsed && (
            <>
              <p className="text-[11px] sm:text-xs text-white/75 mt-1.5 leading-snug">{step.what}</p>

              {reqs.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {reqs.map((r) => {
                    const done = r.cur >= r.need;
                    return (
                      <div key={r.label}>
                        <div className="flex items-center justify-between text-[11px] sm:text-xs">
                          <span className={done ? "text-emerald-300" : "text-white/85"}>{r.icon} {r.label}</span>
                          <span className={`tabular-nums font-bold ${done ? "text-emerald-300" : "text-white"}`}>{done ? "✓ " : ""}{r.cur} / {r.need}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-0.5">
                          <div className={`h-full rounded-full transition-[width] duration-300 ${done ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${(r.cur / r.need) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {buttons.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {buttons.map((b) => {
                    const en = b.enabled(game);
                    return (
                      <button
                        key={b.label}
                        disabled={!en}
                        onClick={() => b.run(game)}
                        className={`w-full rounded-lg px-2 py-2 text-[11px] sm:text-xs font-black tracking-wide transition active:scale-95 ${en ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/50 ring-2 ring-emerald-200/50 anim-pulse" : "bg-white/5 text-white/35 ring-1 ring-white/10"}`}
                      >
                        {b.icon} {b.label} {!en && "🔒"}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={`mt-2 text-[11px] leading-snug rounded-md px-2 py-1.5 ${allMet ? "bg-emerald-500/15 text-emerald-100" : "bg-white/5 text-white/70"}`}>
                <span className="font-bold text-amber-300">HOW → </span>{step.how(game)}
              </div>
              <div className="mt-1.5 text-[10px] sm:text-[11px] text-white/55 leading-snug">
                <span className="font-bold text-sky-300">WHY → </span>{step.why}
              </div>
              {next && (
                <div className="mt-1 text-[10px] sm:text-[11px] text-white/40 leading-snug">
                  <span className="font-bold">NEXT → </span>{next.title}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
