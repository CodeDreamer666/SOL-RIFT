import "./styles.css";
import { RiftGame } from "./game";
import {
  addRun,
  clearRuns,
  getPersonalBests,
  loadScoreboard,
  loadSettings,
  saveDisplayName,
  saveSettings
} from "./storage";
import type {
  ActionName,
  Difficulty,
  RunRecord,
  RunStats,
  Settings
} from "./types";
import {
  APP_TEMPLATE,
  formatScore,
  formatTime,
  renderComparison,
  renderFinalStats,
  renderScoreboard
} from "./ui";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Game root was not found.");
}

app.innerHTML = APP_TEMPLATE;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) {
    throw new Error(`Required interface element is missing: ${selector}`);
  }
  return found;
}

const shell = element<HTMLDivElement>(".game-shell");
const canvas = element<HTMLCanvasElement>("#game-canvas");
const nameInput = element<HTMLInputElement>("#display-name");
const scoreboardContent = element<HTMLDivElement>("#scoreboard-content");
const scoreElement = element<HTMLElement>("#hud-score");
const distanceElement = element<HTMLElement>("#hud-distance");
const timeElement = element<HTMLElement>("#hud-time");
const speedElement = element<HTMLElement>("#hud-speed");
const multiplierElement = element<HTMLElement>("#hud-multiplier");
const multiplierFill = element<HTMLElement>("#multiplier-fill");
const healthCells = element<HTMLDivElement>("#health-cells");
const actionPrompt = element<HTMLDivElement>("#action-prompt");
const gameMessage = element<HTMLDivElement>("#game-message");
const muteSetting = element<HTMLInputElement>("#mute-setting");
const musicSetting = element<HTMLInputElement>("#music-setting");
const sfxSetting = element<HTMLInputElement>("#sfx-setting");
const motionSetting = element<HTMLInputElement>("#motion-setting");
const musicOutput = element<HTMLOutputElement>("#music-output");
const sfxOutput = element<HTMLOutputElement>("#sfx-output");

let selectedDifficulty: Difficulty = "normal";
let settings: Settings = loadSettings();
let tutorialIndex = 0;
let messageTimeout = 0;
let previousBestScore = 0;
let lastRun: RunRecord | null = null;
let activePanel: HTMLElement | null = null;

const game = new RiftGame(
  canvas,
  {
    onStats: updateHud,
    onGameOver: handleGameOver,
    onPauseChange: (paused) => {
      setPhase(paused ? "paused" : "playing");
    },
    onMessage: showMessage
  },
  settings
);

function setPhase(
  phase: "menu" | "playing" | "paused" | "gameover"
): void {
  shell.dataset.phase = phase;
  element("#main-menu").classList.toggle("is-active", phase === "menu");
  element("#game-hud").classList.toggle("is-active", phase === "playing");
  element("#pause-screen").classList.toggle(
    "is-active",
    phase === "paused"
  );
  element("#gameover-screen").classList.toggle(
    "is-active",
    phase === "gameover"
  );
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .trim()
    .slice(0, 12);
}

async function startRun(): Promise<void> {
  const name = saveDisplayName(normalizeName(nameInput.value) || "RUNNER");
  nameInput.value = name;
  closePanel();
  const scoreboard = loadScoreboard();
  previousBestScore = getPersonalBests(scoreboard).score;
  window.clearTimeout(messageTimeout);
  gameMessage.textContent = "";
  gameMessage.classList.remove("is-visible");
  setPhase("playing");
  await game.start(selectedDifficulty, name);
}

function restartRun(): void {
  void startRun();
}

function returnToMenu(): void {
  closePanel();
  game.setMenu();
  setPhase("menu");
  renderSavedRuns();
}

function updateHud(stats: RunStats): void {
  scoreElement.textContent = Math.floor(stats.score)
    .toString()
    .padStart(6, "0");
  distanceElement.textContent = `${Math.floor(stats.distance)}m`;
  timeElement.textContent = formatTime(stats.survivalSeconds);
  speedElement.textContent = Math.floor(stats.speed).toString();
  multiplierElement.textContent = `×${stats.multiplier.toFixed(2)}`;
  multiplierFill.style.width = `${((stats.multiplier - 1) % 1) * 100}%`;
  actionPrompt.textContent = stats.actionPrompt;
  shell.dataset.action = stats.activeAction;
  actionPrompt.classList.toggle("is-visible", Boolean(stats.actionPrompt));
  healthCells.innerHTML = Array.from(
    { length: stats.maxHealth },
    (_, index) =>
      `<i class="${index < stats.health ? "is-live" : ""}"></i>`
  ).join("");
  const dashButton = element<HTMLButtonElement>("#dash-action");
  dashButton.style.setProperty(
    "--cooldown",
    `${Math.min(100, (stats.dashCooldown / 2.45) * 100)}%`
  );
  dashButton.classList.toggle("is-cooling", stats.dashCooldown > 0);
  document
    .querySelectorAll<HTMLButtonElement>(
      '[data-action="dodgeLeft"], [data-action="dodgeRight"]'
    )
    .forEach((button) => {
      button.style.setProperty(
        "--cooldown",
        `${Math.min(100, (stats.dodgeCooldown / 1.05) * 100)}%`
      );
      button.classList.toggle("is-cooling", stats.dodgeCooldown > 0);
    });
}

function showMessage(
  message: string,
  tone: "good" | "warn" = "good"
): void {
  window.clearTimeout(messageTimeout);
  gameMessage.textContent = message;
  gameMessage.dataset.tone = tone;
  gameMessage.classList.remove("is-visible");
  requestAnimationFrame(() => gameMessage.classList.add("is-visible"));
  messageTimeout = window.setTimeout(() => {
    gameMessage.classList.remove("is-visible");
  }, 950);
}

function handleGameOver(record: RunRecord): void {
  lastRun = record;
  addRun(record);
  element("#gameover-result").textContent = record.result;
  element("#final-score").textContent = formatScore(record.score);
  element("#personal-best-label").textContent =
    previousBestScore === 0 || record.score > previousBestScore
      ? "NEW PERSONAL BEST"
      : `${formatScore(previousBestScore)} PERSONAL BEST`;
  element("#final-stats").innerHTML = renderFinalStats(record);
  element("#pb-comparison").innerHTML = renderComparison(
    record,
    previousBestScore
  );
  renderSavedRuns();
  setPhase("gameover");
}

function renderSavedRuns(): void {
  const data = loadScoreboard();
  scoreboardContent.innerHTML = renderScoreboard(data);
  nameInput.value = data.displayName;
}

function openPanel(id: string): void {
  const panel = document.getElementById(id);
  if (!panel) {
    return;
  }
  if (activePanel) {
    activePanel.classList.remove("is-active");
  }
  activePanel = panel;
  shell.classList.add("has-panel");
  element("#panel-layer").classList.add("is-active");
  panel.classList.add("is-active");
  if (id === "scoreboard-panel") {
    renderSavedRuns();
  }
  const focusTarget = panel.querySelector<HTMLElement>(
    "button, input, [tabindex]"
  );
  focusTarget?.focus();
}

function closePanel(): void {
  activePanel?.classList.remove("is-active");
  activePanel = null;
  shell.classList.remove("has-panel");
  element("#panel-layer").classList.remove("is-active");
}

function setDifficulty(difficulty: Difficulty): void {
  selectedDifficulty = difficulty;
  document
    .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
    .forEach((button) => {
      const selected = button.dataset.difficulty === difficulty;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected.toString());
    });
}

function updateTutorial(): void {
  const steps = [
    ...document.querySelectorAll<HTMLElement>("[data-tutorial-step]")
  ];
  steps.forEach((step, index) =>
    step.classList.toggle("is-active", index === tutorialIndex)
  );
  element<HTMLButtonElement>("#tutorial-back").disabled =
    tutorialIndex === 0;
  const next = element<HTMLButtonElement>("#tutorial-next");
  next.textContent =
    tutorialIndex === steps.length - 1 ? "START RUN" : "NEXT";
  element("#tutorial-dots").innerHTML = steps
    .map(
      (_, index) =>
        `<i class="${index === tutorialIndex ? "is-active" : ""}"></i>`
    )
    .join("");
}

function applySettingsFromControls(): void {
  settings = {
    muted: muteSetting.checked,
    musicVolume: Number(musicSetting.value) / 100,
    sfxVolume: Number(sfxSetting.value) / 100,
    reducedMotion: motionSetting.checked
  };
  musicOutput.value = `${musicSetting.value}%`;
  sfxOutput.value = `${sfxSetting.value}%`;
  shell.classList.toggle("reduced-motion", settings.reducedMotion);
  saveSettings(settings);
  game.updateSettings(settings);
}

function populateSettings(): void {
  muteSetting.checked = settings.muted;
  musicSetting.value = Math.round(settings.musicVolume * 100).toString();
  sfxSetting.value = Math.round(settings.sfxVolume * 100).toString();
  motionSetting.checked = settings.reducedMotion;
  applySettingsFromControls();
}

function triggerAction(action: ActionName): void {
  game.action(action);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>("button");
  if (!button) {
    return;
  }
  const panelId = button.dataset.openPanel;
  if (panelId) {
    openPanel(panelId);
    return;
  }
  if (button.hasAttribute("data-close-panel")) {
    closePanel();
    return;
  }
  const action = button.dataset.action as ActionName | undefined;
  if (action) {
    triggerAction(action);
  }
});

document
  .querySelectorAll<HTMLButtonElement>("[data-difficulty]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      setDifficulty(button.dataset.difficulty as Difficulty);
    });
  });

element("#start-run").addEventListener("click", () => void startRun());
element("#tutorial-button").addEventListener("click", () => {
  tutorialIndex = 0;
  updateTutorial();
  openPanel("tutorial-panel");
});
element("#skip-tutorial").addEventListener("click", () => void startRun());
element("#tutorial-back").addEventListener("click", () => {
  tutorialIndex = Math.max(0, tutorialIndex - 1);
  updateTutorial();
});
element("#tutorial-next").addEventListener("click", () => {
  if (tutorialIndex >= 3) {
    void startRun();
    return;
  }
  tutorialIndex += 1;
  updateTutorial();
});
element("#pause-button").addEventListener("click", () => game.pause());
element("#resume-run").addEventListener("click", () => void game.resume());
element("#restart-from-pause").addEventListener("click", restartRun);
element("#menu-from-pause").addEventListener("click", returnToMenu);
element("#restart-run").addEventListener("click", restartRun);
element("#menu-from-gameover").addEventListener("click", returnToMenu);
element("#clear-scoreboard").addEventListener("click", () =>
  openPanel("confirm-panel")
);
element("#cancel-clear").addEventListener("click", () =>
  openPanel("scoreboard-panel")
);
element("#confirm-clear").addEventListener("click", () => {
  clearRuns();
  openPanel("scoreboard-panel");
  renderSavedRuns();
});

for (const control of [
  muteSetting,
  musicSetting,
  sfxSetting,
  motionSetting
]) {
  control.addEventListener("input", applySettingsFromControls);
}

document
  .querySelectorAll<HTMLButtonElement>("[data-hold]")
  .forEach((button) => {
    const direction = button.dataset.hold as "left" | "right";
    const activate = (event: PointerEvent) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      game.setInput(direction, true);
    };
    const release = () => game.setInput(direction, false);
    button.addEventListener("pointerdown", activate);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

const keyMap: Partial<Record<string, ActionName>> = {
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  ArrowDown: "slide",
  KeyS: "slide",
  KeyQ: "dodgeLeft",
  KeyE: "dodgeRight",
  ShiftLeft: "dash",
  ShiftRight: "dash"
};

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyM" && !event.repeat) {
    settings.muted = !settings.muted;
    muteSetting.checked = settings.muted;
    applySettingsFromControls();
    showMessage(settings.muted ? "AUDIO MUTED" : "AUDIO LIVE");
    return;
  }
  if (
    (event.code === "Escape" || event.code === "KeyP") &&
    !event.repeat
  ) {
    if (activePanel) {
      closePanel();
    } else {
      game.togglePause();
    }
    return;
  }
  if (
    event.code === "Enter" &&
    shell.dataset.phase === "menu" &&
    !activePanel &&
    !event.repeat
  ) {
    void startRun();
    return;
  }
  if (
    event.code === "KeyR" &&
    shell.dataset.phase === "gameover" &&
    !event.repeat
  ) {
    restartRun();
    return;
  }
  if (
    event.code === "KeyA" ||
    event.code === "ArrowLeft"
  ) {
    event.preventDefault();
    game.setInput("left", true);
  }
  if (
    event.code === "KeyD" ||
    event.code === "ArrowRight"
  ) {
    event.preventDefault();
    game.setInput("right", true);
  }
  const action = keyMap[event.code];
  if (action) {
    event.preventDefault();
    if (!event.repeat) {
      triggerAction(action);
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyA" || event.code === "ArrowLeft") {
    game.setInput("left", false);
  }
  if (event.code === "KeyD" || event.code === "ArrowRight") {
    game.setInput("right", false);
  }
});

window.addEventListener("blur", () => {
  if (game.getPhase() === "playing") {
    game.pause();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.getPhase() === "playing") {
    game.pause();
  }
});

let swipeStart: { x: number; y: number; id: number } | null = null;
canvas.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
canvas.addEventListener("pointerup", (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) {
    return;
  }
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
    triggerAction(dx < 0 ? "dodgeLeft" : "dodgeRight");
  } else if (dy < -45) {
    triggerAction("jump");
  } else if (dy > 45) {
    triggerAction("slide");
  }
});

nameInput.addEventListener("input", () => {
  const cursor = nameInput.selectionStart;
  nameInput.value = normalizeName(nameInput.value);
  if (cursor !== null) {
    nameInput.setSelectionRange(cursor, cursor);
  }
});

const resizeObserver = new ResizeObserver(() => game.resize());
resizeObserver.observe(canvas);

renderSavedRuns();
populateSettings();
updateTutorial();
setDifficulty(selectedDifficulty);
setPhase("menu");

if (import.meta.env.DEV) {
  (
    window as typeof window & {
      __SOL_TEST__?: {
        snapshot: () => ReturnType<RiftGame["getSnapshot"]>;
        start: (difficulty: Difficulty, seed?: number) => Promise<void>;
        action: (action: ActionName) => boolean;
        endRun: () => void;
        latestRun: () => RunRecord | null;
      };
    }
  ).__SOL_TEST__ = {
    snapshot: () => game.getSnapshot(),
    start: (difficulty, seed = 77) =>
      game.start(difficulty, nameInput.value || "TEST", seed),
    action: (action) => game.action(action),
    endRun: () => game.debugEndRun(),
    latestRun: () => lastRun
  };
}
