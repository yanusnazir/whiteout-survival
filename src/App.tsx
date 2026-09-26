import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import type { PublicState } from "./game/engine";
import { render } from "./game/render";
import { audio } from "./game/audio";
import { loadHighScores, saveHighScore, isHighScore, writeSave, readSave, clearSave } from "./game/storage";
import type { HighScore, Phase } from "./game/types";
import { HUD } from "./components/HUD";
import { InventoryBar } from "./components/InventoryBar";
import { TouchControls } from "./components/TouchControls";
import { CraftPanel } from "./components/CraftPanel";
import { ObjectiveCard } from "./components/ObjectiveCard";
import { Journal } from "./components/Journal";
import { StartScreen, PauseScreen, GameOverScreen } from "./components/Screens";
import { EnterShelterButton, InteriorOverlay } from "./components/ShelterView";

const DEFAULT_STATE: PublicState = {
  health: 100, temp: 62, hunger: 82, thirst: 82, stamina: 100,
  inventory: {}, time: 0.26, day: 1, score: 0, weather: "clear",
  ambientTemp: 5, nearFire: false, nearWater: false, hasShelter: false,
  message: "", actionHint: "", storm: 0, frozen: false, hurt: false,
  journeyIndex: 0, toastId: 0, toastTitle: "", toastMsg: "", toastNext: "",
  fireLighting: -1, resting: false, restProgress: 0, shelterTier: 0, tracking: false, carrying: null,
  equipped: null, running: false, interior: false, campFireFuel: -1,
};

interface Toast { id: number; title: string; msg: string; next: string; }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("start");

  const [phase, setPhase] = useState<Phase>("start");
  const [state, setState] = useState<PublicState>(DEFAULT_STATE);
  const [showCraft, setShowCraft] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [muted, setMuted] = useState(false);
  const [scores, setScores] = useState<HighScore[]>(() => loadHighScores());
  const [isNew, setIsNew] = useState(false);
  const [finalScore, setFinalScore] = useState({ score: 0, day: 1 });
  const [toast, setToast] = useState<Toast | null>(null);
  const [saveDay, setSaveDay] = useState<number | null>(() => readSave()?.day ?? null);
  const [sleepHover, setSleepHover] = useState(false);
  const lastToastId = useRef(0);

  const setPhaseBoth = useCallback((p: Phase) => {
    const g = gameRef.current;
    // save whenever the player leaves active play (pause / menu)
    if (phaseRef.current === "playing" && p !== "playing" && p !== "over" && g && g.alive) writeSave(g.serialize());
    phaseRef.current = p; setPhase(p);
    audio.setPaused(p !== "playing");
    if (p === "start") setSaveDay(readSave()?.day ?? null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas);
    gameRef.current = game;
    game.reset();
    game.onUpdate = (s) => setState(s);
    game.onSave = (d) => writeSave(d);
    const onHide = () => { if (document.hidden && phaseRef.current === "playing" && game.alive) writeSave(game.serialize()); };
    document.addEventListener("visibilitychange", onHide);
    game.onGameOver = () => {
      clearSave();
      setSaveDay(null);
      const sc = Math.floor(game.score);
      setIsNew(isHighScore(sc));
      setFinalScore({ score: sc, day: game.day });
      setScores(saveHighScore(sc, game.day));
      setPhaseBoth("over");
    };
    const onResize = () => game.resize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvas);

    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      game.paused = phaseRef.current !== "playing";
      if (!game.paused) game.update(dt);
      render(game);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHide);
      ro.disconnect();
    };
  }, [setPhaseBoth]);

  // objective-complete toast
  useEffect(() => {
    if (state.toastId > 0 && state.toastId !== lastToastId.current) {
      lastToastId.current = state.toastId;
      setToast({ id: state.toastId, title: state.toastTitle, msg: state.toastMsg, next: state.toastNext });
      const id = state.toastId;
      const t = setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 4200);
      return () => clearTimeout(t);
    }
  }, [state.toastId, state.toastTitle, state.toastMsg, state.toastNext]);

  const cont = useCallback(() => {
    const d = readSave();
    if (!d) return;
    audio.init(); audio.resume(); audio.setMuted(muted);
    gameRef.current!.restore(d);
    lastToastId.current = 0; setToast(null);
    setShowCraft(false); setShowJournal(false);
    setPhaseBoth("playing");
  }, [muted, setPhaseBoth]);

  const start = useCallback(() => {
    audio.init(); audio.resume(); audio.setMuted(muted);
    clearSave();
    gameRef.current!.reset();
    lastToastId.current = 0; setToast(null);
    setShowCraft(false); setShowJournal(false);
    setPhaseBoth("playing");
  }, [muted, setPhaseBoth]);

  const restart = useCallback(() => {
    audio.init(); audio.resume();
    clearSave();
    gameRef.current!.reset();
    lastToastId.current = 0; setToast(null);
    setShowCraft(false); setShowJournal(false);
    setPhaseBoth("playing");
  }, [setPhaseBoth]);

  const startRef = useRef(start); startRef.current = start;
  const restartRef = useRef(restart); restartRef.current = restart;

  useEffect(() => {
    const game = gameRef.current!;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") game.input.up = true;
      if (k === "s" || k === "arrowdown") game.input.down = true;
      if (k === "a" || k === "arrowleft") game.input.left = true;
      if (k === "d" || k === "arrowright") game.input.right = true;
      if (k === "shift") game.input.run = true;
      const p = phaseRef.current;
      if (p === "playing") {
        if (k === "q" && !e.repeat) game.cycleTool();
        if (k === "f" && !e.repeat) game.setInteriorHold(true);
        if ((k === "e" || k === " ") && !e.repeat) { e.preventDefault(); game.primaryAction(); }
        if (k === "c") { setShowJournal(false); setShowCraft((v) => !v); }
        if (k === "j" || k === "tab") { e.preventDefault(); setShowCraft(false); setShowJournal((v) => !v); }
        if (k === "r") game.rest();
        if (k === "escape") {
          setShowCraft((c) => { if (c) return false; return c; });
          setShowJournal((j) => { if (j) return false; return j; });
          setPhaseBoth("paused");
        }
        if (k === "p") setPhaseBoth("paused");
      } else if (p === "paused") {
        if (k === "escape" || k === "p") setPhaseBoth("playing");
      } else if (p === "over") {
        if (k === "enter" || k === " ") { e.preventDefault(); restartRef.current(); }
      } else if (p === "start") {
        if (k === "enter" || k === " ") { e.preventDefault(); startRef.current(); }
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") game.input.up = false;
      if (k === "s" || k === "arrowdown") game.input.down = false;
      if (k === "a" || k === "arrowleft") game.input.left = false;
      if (k === "d" || k === "arrowright") game.input.right = false;
      if (k === "shift") game.input.run = false;
      if (k === "f") game.setInteriorHold(false);
      if (k === "e" || k === " ") game.releaseAction();
    };
    const blur = () => { game.input.up = game.input.down = game.input.left = game.input.right = game.input.run = false; game.setInteriorHold(false); game.releaseAction(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [setPhaseBoth]);

  const doAction = useCallback(() => { audio.resume(); gameRef.current!.primaryAction(); }, []);
  const toggleMute = useCallback(() => { setMuted((m) => { audio.setMuted(!m); return !m; }); }, []);
  const game = gameRef.current;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#05080f] select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {game && (phase === "playing" || phase === "paused") && (
        <>
          <ObjectiveCard game={game} index={state.journeyIndex} />
          <HUD
            s={state}
            paused={phase === "paused"}
            onJournal={() => { setShowCraft(false); setShowJournal((v) => !v); }}
            onCraft={() => { setShowJournal(false); setShowCraft((v) => !v); }}
            onRest={() => game.rest()}
            onPause={() => setPhaseBoth(phase === "paused" ? "playing" : "paused")}
          />
          <InventoryBar game={game} s={state} />

          {state.actionHint && phase === "playing" && !state.interior && (
            <div className="pointer-events-none absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 z-10">
              <div className="bg-emerald-500/90 text-white text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded-full ring-1 ring-emerald-200/40 shadow-lg whitespace-nowrap">
                {state.actionHint} <span className="opacity-70 hidden sm:inline">· E</span>
              </div>
            </div>
          )}

          {state.message && !toast && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 z-10 max-w-[88vw] sm:max-w-md">
              <div className="bg-black/65 backdrop-blur text-white/90 text-xs sm:text-sm px-4 py-2 rounded-xl ring-1 ring-white/15 text-center anim-float">
                {state.message}
              </div>
            </div>
          )}

          {toast && (
            <div key={toast.id} className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[min(88vw,380px)] anim-float">
              <div className="rounded-2xl bg-gradient-to-b from-emerald-600/95 to-emerald-800/95 ring-2 ring-emerald-200/50 shadow-2xl px-4 py-3 text-center">
                <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-100/80 font-bold">✓ Objective complete</div>
                <div className="text-lg font-black text-white mt-0.5">{toast.title}</div>
                {toast.msg && <div className="text-xs text-emerald-50/90 mt-1 italic">“{toast.msg}”</div>}
                {toast.next && <div className="mt-2 text-xs text-white bg-black/25 rounded-lg px-2 py-1"><span className="text-amber-300 font-bold">NEW OBJECTIVE → </span>{toast.next}</div>}
              </div>
            </div>
          )}

          {state.fireLighting >= 0 && (
            <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 z-20">
              <div className="bg-black/60 rounded-2xl px-5 py-3 text-center">
                <div className="text-white/85 text-xs sm:text-sm mb-2">🔥 Spinning the fire drill. Keep holding!</div>
                <div className="w-52 h-3 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/15 mx-auto">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-700 via-amber-400 to-yellow-200" style={{ width: `${Math.max(0, state.fireLighting) * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          <InteriorOverlay game={game} s={state} sleepHover={sleepHover} />
          {phase === "playing" && <EnterShelterButton game={game} s={state} onHover={setSleepHover} />}

          <TouchControls game={game} onAction={doAction} onRest={() => game.rest()} />

          {showCraft && <CraftPanel game={game} s={state} onClose={() => setShowCraft(false)} />}
          {showJournal && <Journal game={game} index={state.journeyIndex} onClose={() => setShowJournal(false)} />}
        </>
      )}

      {phase === "start" && <StartScreen onStart={start} best={scores[0]} saveDay={saveDay} onContinue={cont} />}
      {phase === "paused" && <PauseScreen onResume={() => setPhaseBoth("playing")} onRestart={restart} muted={muted} onToggleMute={toggleMute} />}
      {phase === "over" && (
        <GameOverScreen score={finalScore.score} day={finalScore.day} scores={scores} isNew={isNew} onRestart={restart} onMenu={() => setPhaseBoth("start")} />
      )}
    </div>
  );
}
