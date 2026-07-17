import { describe, expect, it } from "vitest";
import {
  addRun,
  clearRuns,
  loadScoreboard,
  loadSettings,
  saveDisplayName,
  saveSettings,
  storageKeys
} from "./storage";
import type { RunRecord } from "./types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function record(score: number, name = "NOVA"): RunRecord {
  return {
    id: `run-${score}`,
    name,
    difficulty: "normal",
    score,
    distance: score / 10,
    survivalSeconds: score / 100,
    bestMultiplier: 2,
    obstaclesAvoided: 3,
    collectibles: 4,
    cleanRun: true,
    result: "IMPACT",
    createdAt: new Date(1_700_000_000_000 + score).toISOString()
  };
}

describe("local run history", () => {
  it("sorts saved runs by score", () => {
    const storage = new MemoryStorage();
    addRun(record(200), storage);
    addRun(record(900), storage);
    addRun(record(500), storage);

    expect(loadScoreboard(storage).runs.map((run) => run.score)).toEqual([
      900, 500, 200
    ]);
  });

  it("sanitizes names and survives corrupted data", () => {
    const storage = new MemoryStorage();
    expect(saveDisplayName("<script>NOVA!✨", storage)).toBe("scriptNOVA");
    storage.setItem(storageKeys.scoreboard, "{broken");
    expect(loadScoreboard(storage).runs).toEqual([]);
  });

  it("clears runs without discarding the display name", () => {
    const storage = new MemoryStorage();
    saveDisplayName("SOL", storage);
    addRun(record(100), storage);
    expect(clearRuns(storage)).toMatchObject({
      displayName: "SOL",
      runs: []
    });
  });

  it("clamps and persists audio settings", () => {
    const storage = new MemoryStorage();
    saveSettings(
      {
        muted: true,
        musicVolume: 0.25,
        sfxVolume: 0.9,
        reducedMotion: true
      },
      storage
    );
    expect(loadSettings(storage)).toEqual({
      muted: true,
      musicVolume: 0.25,
      sfxVolume: 0.9,
      reducedMotion: true
    });
  });
});
