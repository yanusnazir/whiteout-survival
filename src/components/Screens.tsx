import type { HighScore } from "../game/types";

function SnowBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(120,160,220,0.25), transparent), linear-gradient(180deg,#0a1120 0%, #0e1a30 50%, #142238 100%)",
        }}
      />
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white/60"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            animation: `floatUp ${3 + (i % 5)}s ease-in-out ${i * 0.1}s infinite alternate`,
            opacity: 0.3 + (i % 5) * 0.12,
          }}
        />
      ))}
    </div>
  );
}

export function StartScreen({ onStart, best, saveDay, onContinue }: { onStart: () => void; best?: HighScore; saveDay?: number | null; onContinue?: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-5 text-center">
      <SnowBg />
      <div className="relative anim-float max-w-md">
        <div className="text-6xl mb-3">🏔️</div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-lg">WHITEOUT</h1>
        <p className="text-sky-200/80 mt-1 mb-5 text-sm tracking-widest uppercase">Snow Survival</p>
        <p className="text-white/60 text-sm mb-6 leading-relaxed">
          One man. No tools, no fire, no proper clothes — only the snow.
          Scavenge branches and stones, knap a crude blade, spin a fire drill,
          raise a lean-to, then track and hunt to earn hides for warm clothing
          and a real winter hut.
          <span className="text-white/80 font-medium"> Learn to survive. Live one more day.</span>
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {saveDay && onContinue && (
            <button
              onClick={onContinue}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-900 text-lg font-bold shadow-lg shadow-amber-900/40 transition ring-2 ring-amber-200/50"
            >
              ⛺ Continue · Day {saveDay}
            </button>
          )}
          <button
            onClick={onStart}
            className={`w-full sm:w-auto px-10 py-4 rounded-2xl active:scale-95 text-lg font-bold transition ${saveDay ? "bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/20" : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/50 ring-2 ring-emerald-300/40"}`}
          >
            {saveDay ? "New game" : "▶  Begin"}
          </button>
        </div>
        {saveDay && <p className="text-[11px] text-white/40 mt-2">Your camp is saved automatically.</p>}
        {best && (
          <p className="text-amber-300/80 text-xs mt-4">🏆 Best: {best.score.toLocaleString()} pts · {best.days} days</p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2 text-[11px] text-white/50">
          <div className="bg-white/5 rounded-lg p-2 ring-1 ring-white/10">
            <div className="text-white/70 font-semibold mb-0.5">Move · Run</div>
            WASD · Shift to run (or push the stick fully)
          </div>
          <div className="bg-white/5 rounded-lg p-2 ring-1 ring-white/10">
            <div className="text-white/70 font-semibold mb-0.5">Act / Hold</div>
            E / Space · hold to light fire
          </div>
          <div className="bg-white/5 rounded-lg p-2 ring-1 ring-white/10">
            <div className="text-white/70 font-semibold mb-0.5">Tool · Craft · Journal</div>
            Q swap tool · C · J
          </div>
          <div className="bg-white/5 rounded-lg p-2 ring-1 ring-white/10">
            <div className="text-white/70 font-semibold mb-0.5">Rest · Pause</div>
            R · Esc / P
          </div>
        </div>
      </div>
    </div>
  );
}

export function PauseScreen({ onResume, onRestart, muted, onToggleMute }: {
  onResume: () => void; onRestart: () => void; muted: boolean; onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-5">
      <div className="anim-float text-center max-w-xs w-full">
        <h2 className="text-3xl font-black text-white mb-6">Paused</h2>
        <div className="space-y-2.5">
          <button onClick={onResume} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold transition">Resume</button>
          <button onClick={onToggleMute} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-semibold transition">
            {muted ? "🔇 Sound Off" : "🔊 Sound On"}
          </button>
          <button onClick={onRestart} className="w-full py-3 rounded-xl bg-red-500/80 hover:bg-red-500 active:scale-95 text-white font-semibold transition">Restart</button>
        </div>
      </div>
    </div>
  );
}

export function GameOverScreen({ score, day, scores, isNew, onRestart, onMenu }: {
  score: number; day: number; scores: HighScore[]; isNew: boolean; onRestart: () => void; onMenu: () => void;
}) {
  const causes = [
    "The cold claimed you.",
    "Alone, the wilderness won.",
    "Your fire went out for the last time.",
    "The storm was too much.",
  ];
  const cause = causes[Math.min(causes.length - 1, Math.floor(score) % causes.length)];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-5">
      <SnowBg />
      <div className="relative anim-float max-w-sm w-full text-center">
        <div className="text-5xl mb-2">💀</div>
        <h2 className="text-3xl font-black text-white">You Died</h2>
        <p className="text-white/50 text-sm mt-1 mb-4">{cause}</p>

        <div className="bg-white/5 rounded-xl p-4 ring-1 ring-white/10 mb-4">
          <div className="text-4xl font-black text-amber-300 tabular-nums">{score.toLocaleString()}</div>
          <div className="text-white/50 text-xs">FINAL SCORE · {day} {day === 1 ? "day" : "days"} survived</div>
          {isNew && <div className="mt-2 text-emerald-300 font-bold text-sm anim-pulse">🏆 New High Score!</div>}
        </div>

        {scores.length > 0 && (
          <div className="bg-black/30 rounded-xl p-3 ring-1 ring-white/10 mb-4 text-left">
            <div className="text-xs uppercase tracking-wide text-white/40 mb-1.5">🏆 High Scores</div>
            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
              {scores.map((h, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-white/60">{i + 1}. <span className="text-white/80">{h.score.toLocaleString()}</span></span>
                  <span className="text-white/40 text-xs">{h.days}d · {h.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onRestart} className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold transition">↻ Try Again</button>
          <button onClick={onMenu} className="px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-semibold transition">Menu</button>
        </div>
      </div>
    </div>
  );
}
