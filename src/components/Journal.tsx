import type { Game } from "../game/engine";
import { JOURNEY } from "../game/journey";

export function Journal({ game, index, onClose }: { game: Game; index: number; onClose: () => void }) {
  let lastChapter = "";
  return (
    <div className="absolute inset-0 z-30 bg-black/65 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div className="anim-float w-full max-w-md max-h-[86vh] overflow-y-auto scrollbar-thin rounded-2xl p-4 shadow-2xl ring-1 ring-amber-200/20"
        style={{ background: "linear-gradient(180deg,#2a2218 0%,#1c1712 100%)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-amber-100">📖 Survival Journal</h2>
          <button onClick={onClose} className="text-amber-100/60 hover:text-white text-xl px-2">✕</button>
        </div>
        <p className="text-[11px] text-amber-100/50 mb-3">Day {game.day}. {Math.min(index, JOURNEY.length - 1)} of {JOURNEY.length - 1} survival goals done.</p>

        <div className="space-y-1.5">
          {JOURNEY.map((s, i) => {
            const header = s.chapter !== lastChapter ? s.chapter : null;
            lastChapter = s.chapter;
            const done = i < index;
            const cur = i === index;
            return (
              <div key={s.id}>
                {header && <div className="text-[10px] uppercase tracking-widest text-amber-300/70 mt-3 mb-1">{header}</div>}
                <div className={`rounded-lg px-3 py-2 ring-1 ${cur ? "bg-amber-400/15 ring-amber-300/50" : done ? "bg-emerald-500/10 ring-emerald-400/20" : "bg-white/[0.03] ring-white/5"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-500 text-white" : cur ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white/40"}`}>
                      {done ? "✓" : i === JOURNEY.length - 1 ? "★" : i + 1}
                    </span>
                    <span className={`text-sm font-semibold ${done ? "text-emerald-200/80 line-through decoration-emerald-400/40" : cur ? "text-white" : "text-white/40"}`}>{s.title}</span>
                    {cur && <span className="ml-auto text-[9px] font-bold text-amber-300 uppercase">Current</span>}
                  </div>
                  {done && s.completeMsg && <p className="text-[11px] text-emerald-100/60 mt-1 ml-7 italic">“{s.completeMsg}”</p>}
                  {cur && (
                    <div className="ml-7 mt-1 space-y-1">
                      <p className="text-[11px] text-white/80">{s.what}</p>
                      {s.reqs.map((r) => {
                        const v = Math.min(r.need, r.have(game));
                        return <div key={r.label} className={`text-[11px] tabular-nums ${v >= r.need ? "text-emerald-300" : "text-amber-200"}`}>{r.icon} {r.label}: {v} / {r.need}</div>;
                      })}
                      <p className="text-[11px] text-sky-200/80"><b>Why:</b> {s.why}</p>
                      <p className="text-[11px] text-amber-100/70"><b>How:</b> {s.how(game)}</p>
                    </div>
                  )}
                  {!done && !cur && <p className="text-[10px] text-white/30 mt-0.5 ml-7">{s.why}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
