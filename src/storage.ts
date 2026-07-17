import { DEFAULT_SETTINGS } from "./config";
import type {
  Difficulty,
  RunRecord,
  ScoreboardData,
  Settings
} from "./types";

const SCORE_KEY = "sol-rift-scoreboard-v1";
const SETTINGS_KEY = "sol-rift-settings-v1";
const MAX_STORED_RUNS = 50;
const VALID_DIFFICULTIES = new Set<Difficulty>(["easy", "normal", "hard"]);

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function safeName(value: unknown): string {
  if (typeof value !== "string") {
    return "RUNNER";
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .trim()
    .slice(0, 12);
  return normalized || "RUNNER";
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RunRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.result === "string" &&
    typeof candidate.difficulty === "string" &&
    VALID_DIFFICULTIES.has(candidate.difficulty as Difficulty)
  );
}

function sanitizeRun(value: RunRecord): RunRecord {
  const createdAt = Number.isNaN(Date.parse(value.createdAt))
    ? new Date().toISOString()
    : value.createdAt;
  return {
    id: value.id.slice(0, 80),
    name: safeName(value.name),
    difficulty: value.difficulty,
    score: Math.floor(finiteNonNegative(value.score)),
    distance: finiteNonNegative(value.distance),
    survivalSeconds: finiteNonNegative(value.survivalSeconds),
    bestMultiplier: Math.max(1, finiteNonNegative(value.bestMultiplier)),
    obstaclesAvoided: Math.floor(finiteNonNegative(value.obstaclesAvoided)),
    collectibles: Math.floor(finiteNonNegative(value.collectibles)),
    cleanRun: Boolean(value.cleanRun),
    result: value.result.slice(0, 80),
    createdAt
  };
}

export function emptyScoreboard(): ScoreboardData {
  return {
    version: 1,
    displayName: "RUNNER",
    runs: []
  };
}

export function loadScoreboard(storage: Storage = localStorage): ScoreboardData {
  try {
    const raw = storage.getItem(SCORE_KEY);
    if (!raw) {
      return emptyScoreboard();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return emptyScoreboard();
    }
    const candidate = parsed as Partial<ScoreboardData>;
    const runs = Array.isArray(candidate.runs)
      ? candidate.runs
          .filter(isRunRecord)
          .map(sanitizeRun)
          .sort((left, right) => right.score - left.score)
          .slice(0, MAX_STORED_RUNS)
      : [];
    return {
      version: 1,
      displayName: safeName(candidate.displayName),
      runs
    };
  } catch {
    return emptyScoreboard();
  }
}

export function saveDisplayName(
  value: string,
  storage: Storage = localStorage
): string {
  const scoreboard = loadScoreboard(storage);
  scoreboard.displayName = safeName(value);
  storage.setItem(SCORE_KEY, JSON.stringify(scoreboard));
  return scoreboard.displayName;
}

export function addRun(
  record: RunRecord,
  storage: Storage = localStorage
): ScoreboardData {
  const scoreboard = loadScoreboard(storage);
  scoreboard.runs = [...scoreboard.runs, sanitizeRun(record)]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    })
    .slice(0, MAX_STORED_RUNS);
  storage.setItem(SCORE_KEY, JSON.stringify(scoreboard));
  return scoreboard;
}

export function clearRuns(storage: Storage = localStorage): ScoreboardData {
  const scoreboard = loadScoreboard(storage);
  scoreboard.runs = [];
  storage.setItem(SCORE_KEY, JSON.stringify(scoreboard));
  return scoreboard;
}

export function getPersonalBests(data: ScoreboardData): {
  score: number;
  distance: number;
  survivalSeconds: number;
  bestMultiplier: number;
  obstaclesAvoided: number;
} {
  return data.runs.reduce(
    (best, run) => ({
      score: Math.max(best.score, run.score),
      distance: Math.max(best.distance, run.distance),
      survivalSeconds: Math.max(best.survivalSeconds, run.survivalSeconds),
      bestMultiplier: Math.max(best.bestMultiplier, run.bestMultiplier),
      obstaclesAvoided: Math.max(
        best.obstaclesAvoided,
        run.obstaclesAvoided
      )
    }),
    {
      score: 0,
      distance: 0,
      survivalSeconds: 0,
      bestMultiplier: 1,
      obstaclesAvoided: 0
    }
  );
}

export function loadSettings(storage: Storage = localStorage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return {
      muted:
        typeof parsed.muted === "boolean"
          ? parsed.muted
          : DEFAULT_SETTINGS.muted,
      musicVolume:
        typeof parsed.musicVolume === "number"
          ? Math.min(1, Math.max(0, parsed.musicVolume))
          : DEFAULT_SETTINGS.musicVolume,
      sfxVolume:
        typeof parsed.sfxVolume === "number"
          ? Math.min(1, Math.max(0, parsed.sfxVolume))
          : DEFAULT_SETTINGS.sfxVolume,
      reducedMotion:
        typeof parsed.reducedMotion === "boolean"
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  storage: Storage = localStorage
): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const storageKeys = {
  scoreboard: SCORE_KEY,
  settings: SETTINGS_KEY
};
