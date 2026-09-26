import type { PublicState } from "../game/engine";

function Stat({ icon, value, color, label }: { icon: string; value: number; color: string; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const low = v < 25;
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={`text-sm leading-none ${low ? "anim-pulse" : ""}`}>{icon}</span>
      <div className="w-14 sm:w-20 h-2 rounded-full bg-black/40 overflow-hidden ring-1 ring-white/10">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${v}%`, background: color, boxShadow: low ? `0 0 8px ${color}` : "none" }} />
      </div>
    </div>
  );
}

function timeLabel(t: number) {
  const hr = Math.floor((t * 24 + 0) % 24);
  const icon = t < 0.2 || t > 0.85 ? "🌙" : t < 0.32 || t > 0.72 ? "🌅" : "☀️";
  return `${icon} ${hr.toString().padStart(2, "0")}:00`;
}

export function HUD({ s, paused, onJournal, onCraft, onRest, onPause }: {
  s: PublicState; paused: boolean; onJournal: () => void; onCraft: () => void; onRest: () => void; onPause: () => void;
}) {
  const weatherIcon = s.weather === "storm" ? "🌨️" : s.weather === "snow" ? "❄️" : "🌤️";
  const btn = "pointer-events-auto w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-black/45 hover:bg-black/65 active:scale-90 ring-1 ring-white/15 text-lg transition flex items-center justify-center";
  return (
    <div className="pointer-events-none absolute top-2 right-2 sm:top-3 sm:right-3 z-10 flex flex-col items-end gap-1.5">
      <div className="bg-black/40 backdrop-blur-sm rounded-xl px-3 py-2 ring-1 ring-white/10 text-right">
        <div className="text-lg sm:text-xl font-bold tabular-nums text-white leading-none">{s.score.toLocaleString()}</div>
        <div className="text-[11px] text-sky-200 font-semibold mt-0.5">Day {s.day} · {timeLabel(s.time)}</div>
        <div className="text-[11px] text-white/60">{weatherIcon} {s.ambientTemp}°C</div>
      </div>
      <div className="bg-black/40 backdrop-blur-sm rounded-xl p-2 space-y-1 ring-1 ring-white/10">
        <Stat icon="❤️" value={s.health} color="#ef4444" label="Health" />
        <Stat icon="🌡️" value={s.temp} color={s.temp < 30 ? "#60a5fa" : "#f59e0b"} label="Body warmth" />
        <Stat icon="🍖" value={s.hunger} color="#f59e0b" label="Food" />
        <Stat icon="💧" value={s.thirst} color="#38bdf8" label="Water" />
        <Stat icon="⚡" value={s.stamina} color="#a3e635" label="Energy" />
      </div>
      <div className="flex gap-1.5">
        <button onClick={onJournal} className={btn} title="Survival Journal (J)">📖</button>
        <button onClick={onCraft} className={btn} title="Craft (C)">🛠️</button>
        <button onClick={onRest} className={btn} title="Rest in shelter (R)">😴</button>
        <button onClick={onPause} className={btn} title="Pause (Esc)">{paused ? "▶" : "⏸"}</button>
      </div>
      {s.nearFire && <div className="text-[10px] bg-orange-500/30 text-orange-100 rounded-md px-2 py-0.5 ring-1 ring-orange-300/30">🔥 Warming by fire</div>}
    </div>
  );
}
