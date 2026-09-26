import type { SaveData } from "./engine";
import type { HighScore } from "./types";

const HS_KEY = "whiteout_highscores_v1";
const SAVE_KEY = "whiteout_save_v2";

export function loadHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(HS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveHighScore(score: number, days: number): HighScore[] {
  const list = loadHighScores();
  list.push({ score, days, date: new Date().toLocaleDateString() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 8);
  try { localStorage.setItem(HS_KEY, JSON.stringify(top)); } catch { /* ignore */ }
  return top;
}

export function isHighScore(score: number): boolean {
  const list = loadHighScores();
  return list.length < 8 || score > (list[list.length - 1]?.score || 0);
}

// ---- persistent camp / progress ----
export function writeSave(d: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 2 ? d : null;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
