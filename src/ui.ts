import { DIFFICULTIES } from "./config";
import { getPersonalBests } from "./storage";
import type {
  Difficulty,
  RunRecord,
  ScoreboardData
} from "./types";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character] ?? character
  );
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatScore(value: number): string {
  return Math.floor(value).toLocaleString("en-US");
}

export const APP_TEMPLATE = `
  <div class="game-shell" data-phase="menu">
    <canvas id="game-canvas" aria-label="SOL RIFT 3D game view"></canvas>
    <div class="world-overlay" aria-hidden="true">
      <div class="scanlines"></div>
      <div class="vignette"></div>
    </div>

    <header class="top-brand">
      <span class="brand-glyph">S</span>
      <span>SOL // RIFT</span>
      <span class="local-badge">LOCAL ARCADE</span>
    </header>

    <main id="main-menu" class="screen menu-screen is-active">
      <div class="menu-content">
        <p class="eyebrow"><span></span> SUNSET PROTOCOL / 07</p>
        <h1>SOL <small>//</small> <em>RIFT</em></h1>
        <p class="menu-lede">
          Run the city after the last light. Read the route. Chain the impossible.
        </p>

        <div class="identity-row">
          <label for="display-name">RUNNER CALLSIGN</label>
          <input
            id="display-name"
            name="display-name"
            maxlength="12"
            autocomplete="off"
            spellcheck="false"
            value="RUNNER"
          />
        </div>

        <fieldset class="difficulty-picker">
          <legend>SELECT SIGNAL</legend>
          <div class="difficulty-grid">
            ${(
              Object.entries(DIFFICULTIES) as Array<
                [Difficulty, (typeof DIFFICULTIES)[Difficulty]]
              >
            )
              .map(
                ([key, config]) => `
                  <button
                    class="difficulty-card ${key === "normal" ? "is-selected" : ""}"
                    type="button"
                    data-difficulty="${key}"
                    aria-pressed="${key === "normal"}"
                  >
                    <span class="difficulty-index">0${key === "easy" ? 1 : key === "normal" ? 2 : 3}</span>
                    <strong>${config.label}</strong>
                    <span>${config.description}</span>
                    <i>${key === "hard" ? "+30% SCORE" : key === "easy" ? "FORGIVING" : "INTENDED"}</i>
                  </button>
                `
              )
              .join("")}
          </div>
        </fieldset>

        <div class="primary-actions">
          <button id="start-run" class="button button-primary" type="button">
            <span>ENTER THE RIFT</span>
            <kbd>ENTER</kbd>
          </button>
          <button id="tutorial-button" class="button button-ghost" type="button">
            FIRST RUN TUTORIAL
          </button>
        </div>

        <nav class="menu-links" aria-label="Game information">
          <button type="button" data-open-panel="controls-panel">CONTROLS</button>
          <button type="button" data-open-panel="scoreboard-panel">SCOREBOARD</button>
          <button type="button" data-open-panel="settings-panel">SETTINGS</button>
        </nav>
      </div>
      <aside class="menu-status" aria-hidden="true">
        <span>COURSE</span><strong>PROCEDURAL</strong>
        <span>LINK</span><strong>DEVICE LOCAL</strong>
        <span>THREAT</span><strong>ADAPTIVE</strong>
      </aside>
    </main>

    <section id="game-hud" class="hud" aria-label="Run status">
      <div class="hud-top">
        <div class="score-block">
          <span>SCORE</span>
          <strong id="hud-score">000000</strong>
          <div><span id="hud-distance">0m</span><i></i><span id="hud-time">0:00</span></div>
        </div>
        <div id="action-prompt" class="action-prompt"></div>
        <div class="run-status">
          <div id="health-cells" class="health-cells" aria-label="Integrity"></div>
          <div class="speed-readout"><span>VELOCITY</span><strong id="hud-speed">20</strong><small>m/s</small></div>
          <button id="pause-button" class="icon-button" type="button" aria-label="Pause game">Ⅱ</button>
        </div>
      </div>
      <div class="multiplier-block">
        <span>CHAIN</span>
        <strong id="hud-multiplier">×1.00</strong>
        <div class="multiplier-track"><i id="multiplier-fill"></i></div>
      </div>
      <div id="game-message" class="game-message" role="status"></div>
      <div class="action-dock" aria-label="Action status and touch controls">
        <button class="action-key lateral-control" type="button" data-hold="left" aria-label="Move left">
          <kbd>A</kbd><span>LEFT</span>
        </button>
        <button class="action-key" type="button" data-action="dodgeLeft">
          <kbd>Q</kbd><span>DODGE</span><i></i>
        </button>
        <button class="action-key" type="button" data-action="jump">
          <kbd>SPACE</kbd><span>JUMP</span><i></i>
        </button>
        <button class="action-key" type="button" data-action="slide">
          <kbd>S</kbd><span>SLIDE</span><i></i>
        </button>
        <button id="dash-action" class="action-key action-key-accent" type="button" data-action="dash">
          <kbd>SHIFT</kbd><span>DASH</span><i></i>
        </button>
        <button class="action-key" type="button" data-action="dodgeRight">
          <kbd>E</kbd><span>DODGE</span><i></i>
        </button>
        <button class="action-key lateral-control" type="button" data-hold="right" aria-label="Move right">
          <kbd>D</kbd><span>RIGHT</span>
        </button>
      </div>
    </section>

    <section id="pause-screen" class="overlay-screen" aria-label="Game paused">
      <div class="pause-card">
        <p class="eyebrow"><span></span> SIGNAL HELD</p>
        <h2>RUN PAUSED</h2>
        <p>The course is frozen. Your chain is safe.</p>
        <button id="resume-run" class="button button-primary" type="button">RESUME <kbd>ESC</kbd></button>
        <button id="restart-from-pause" class="button button-ghost" type="button">RESTART RUN</button>
        <button class="button button-ghost" type="button" data-open-panel="settings-panel">SETTINGS</button>
        <button id="menu-from-pause" class="text-button" type="button">ABANDON TO MENU</button>
      </div>
    </section>

    <section id="gameover-screen" class="overlay-screen" aria-label="Run complete">
      <div class="gameover-card">
        <p class="eyebrow danger"><span></span> LINK SEVERED</p>
        <h2 id="gameover-result">RIFT CLOSED</h2>
        <div class="final-score">
          <span>FINAL SCORE</span>
          <strong id="final-score">0</strong>
          <small id="personal-best-label">SECTOR RECORD</small>
        </div>
        <div id="final-stats" class="final-stats"></div>
        <div id="pb-comparison" class="pb-comparison"></div>
        <div class="gameover-actions">
          <button id="restart-run" class="button button-primary" type="button">RUN AGAIN <kbd>R</kbd></button>
          <button class="button button-ghost" type="button" data-open-panel="scoreboard-panel">SCOREBOARD</button>
          <button id="menu-from-gameover" class="text-button" type="button">MAIN MENU</button>
        </div>
      </div>
    </section>

    <div id="panel-layer" class="panel-layer">
      <section id="tutorial-panel" class="modal-panel tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <button class="panel-close" type="button" data-close-panel aria-label="Close tutorial">×</button>
        <div class="panel-kicker">FIELD CALIBRATION</div>
        <h2 id="tutorial-title">MOVE LIKE WATER.</h2>
        <div class="tutorial-steps">
          <article class="tutorial-step is-active" data-tutorial-step="0">
            <div class="tutorial-visual movement-visual"><i></i><i></i><b>S</b></div>
            <span>01 / STEERING</span>
            <h3>OWN THE WHOLE PATH</h3>
            <p>Hold <kbd>A</kbd>/<kbd>D</kbd> or the arrows to carve across the route. Tap <kbd>Q</kbd>/<kbd>E</kbd> for a sharp lateral dodge with a short cooldown.</p>
          </article>
          <article class="tutorial-step" data-tutorial-step="1">
            <div class="tutorial-visual clearance-visual"><i></i><b>↟</b><i></i></div>
            <span>02 / CLEARANCE</span>
            <h3>READ THE SILHOUETTE</h3>
            <p>Red low barriers demand <kbd>SPACE</kbd>. Overhead frames demand <kbd>S</kbd>. The amber runway cue tells you what is coming before it can hurt you.</p>
          </article>
          <article class="tutorial-step" data-tutorial-step="2">
            <div class="tutorial-visual wall-visual"><i></i><b>S</b><i></i></div>
            <span>03 / COMMITMENT</span>
            <h3>CROSS WHAT ISN'T THERE</h3>
            <p><kbd>SHIFT</kbd> phases through closing crimson gates. For cyan wall gaps, jump toward the marked wall and keep holding into it; jump again to kick away.</p>
          </article>
          <article class="tutorial-step" data-tutorial-step="3">
            <div class="tutorial-visual chain-visual"><span>×</span><b>4.25</b></div>
            <span>04 / FLOW</span>
            <h3>MAKE SURVIVAL A CHAIN</h3>
            <p>Correct actions, close calls and gold SOL shards build multiplier. Damage breaks the chain. Risk routes glow gold and score higher.</p>
          </article>
        </div>
        <div class="tutorial-nav">
          <button id="tutorial-back" class="button button-ghost" type="button" disabled>BACK</button>
          <div id="tutorial-dots" class="tutorial-dots" aria-label="Tutorial progress"></div>
          <button id="tutorial-next" class="button button-primary" type="button">NEXT</button>
        </div>
        <button id="skip-tutorial" class="text-button" type="button">SKIP CALIBRATION</button>
      </section>

      <section id="controls-panel" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="controls-title">
        <button class="panel-close" type="button" data-close-panel aria-label="Close controls">×</button>
        <div class="panel-kicker">INPUT MAP</div>
        <h2 id="controls-title">CONTROLS</h2>
        <div class="control-grid">
          <div><kbd>A</kbd><kbd>D</kbd><span><strong>STEER</strong>Momentum movement / hold into cyan walls</span></div>
          <div><kbd>SPACE</kbd><span><strong>JUMP</strong>Low barriers, broken floors, wall kick</span></div>
          <div><kbd>S</kbd><span><strong>SLIDE</strong>Overhead frames and high laser lines</span></div>
          <div><kbd>Q</kbd><kbd>E</kbd><span><strong>DODGE</strong>Fast lateral burst / 1.05s cooldown</span></div>
          <div><kbd>SHIFT</kbd><span><strong>DASH</strong>Closing gates / 2.45s cooldown</span></div>
          <div><kbd>ESC</kbd><span><strong>PAUSE</strong>Also pauses automatically when focus is lost</span></div>
          <div><kbd>M</kbd><span><strong>MUTE</strong>Toggle all generated audio</span></div>
          <div><kbd>R</kbd><span><strong>RESTART</strong>Instant restart after a run</span></div>
        </div>
        <p class="panel-note">Arrow keys mirror movement, jump and slide. Touch controls appear at the bottom of the game view.</p>
      </section>

      <section id="scoreboard-panel" class="modal-panel scoreboard-panel" role="dialog" aria-modal="true" aria-labelledby="scoreboard-title">
        <button class="panel-close" type="button" data-close-panel aria-label="Close scoreboard">×</button>
        <div class="panel-kicker">DEVICE-LOCAL RECORDS</div>
        <h2 id="scoreboard-title">RUN ARCHIVE</h2>
        <div id="scoreboard-content"></div>
        <button id="clear-scoreboard" class="text-button danger-text" type="button">CLEAR SAVED RUNS</button>
      </section>

      <section id="settings-panel" class="modal-panel settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button class="panel-close" type="button" data-close-panel aria-label="Close settings">×</button>
        <div class="panel-kicker">LOCAL CONFIGURATION</div>
        <h2 id="settings-title">SETTINGS</h2>
        <div class="setting-list">
          <label class="toggle-row">
            <span><strong>MUTE ALL</strong><small>Silence music and effects</small></span>
            <input id="mute-setting" type="checkbox" />
            <i aria-hidden="true"></i>
          </label>
          <label class="range-row">
            <span><strong>MUSIC</strong><output id="music-output">45%</output></span>
            <input id="music-setting" type="range" min="0" max="100" step="1" value="45" />
          </label>
          <label class="range-row">
            <span><strong>SOUND EFFECTS</strong><output id="sfx-output">70%</output></span>
            <input id="sfx-setting" type="range" min="0" max="100" step="1" value="70" />
          </label>
          <label class="toggle-row">
            <span><strong>REDUCED MOTION</strong><small>Removes camera shake and limits particles</small></span>
            <input id="motion-setting" type="checkbox" />
            <i aria-hidden="true"></i>
          </label>
        </div>
        <p class="panel-note">Settings are stored only in this browser.</p>
      </section>

      <section id="confirm-panel" class="modal-panel confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="panel-kicker danger-text">IRREVERSIBLE</div>
        <h2 id="confirm-title">CLEAR THE ARCHIVE?</h2>
        <p>This removes every saved run from this browser. Your callsign and settings stay intact.</p>
        <div class="confirm-actions">
          <button id="cancel-clear" class="button button-ghost" type="button">KEEP RUNS</button>
          <button id="confirm-clear" class="button button-danger" type="button">CLEAR ALL</button>
        </div>
      </section>
    </div>
  </div>
`;

export function renderScoreboard(data: ScoreboardData): string {
  const bests = getPersonalBests(data);
  const topRuns = data.runs.slice(0, 10);
  const recentRuns = [...data.runs]
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt)
    )
    .slice(0, 5);

  if (data.runs.length === 0) {
    return `
      <div class="empty-scoreboard">
        <span>Ø</span>
        <h3>NO SIGNALS RECORDED</h3>
        <p>Finish a run to write the first entry to this device.</p>
      </div>
    `;
  }

  return `
    <div class="best-grid">
      <div><span>HIGH SCORE</span><strong>${formatScore(bests.score)}</strong></div>
      <div><span>LONGEST RUN</span><strong>${Math.floor(bests.distance)}m</strong></div>
      <div><span>BEST TIME</span><strong>${formatTime(bests.survivalSeconds)}</strong></div>
      <div><span>BEST CHAIN</span><strong>×${bests.bestMultiplier.toFixed(2)}</strong></div>
      <div><span>MOST CLEARS</span><strong>${bests.obstaclesAvoided}</strong></div>
    </div>
    <div class="scoreboard-table-wrap">
      <table class="scoreboard-table">
        <caption>TOP TEN BY SCORE</caption>
        <thead><tr><th>#</th><th>RUNNER</th><th>SIGNAL</th><th>SCORE</th><th>DIST.</th><th>DATE / RESULT</th></tr></thead>
        <tbody>
          ${topRuns
            .map(
              (run, index) => `
                <tr>
                  <td>${(index + 1).toString().padStart(2, "0")}</td>
                  <td>${escapeHtml(run.name)}</td>
                  <td>${DIFFICULTIES[run.difficulty].label}</td>
                  <td>${formatScore(run.score)}</td>
                  <td>${Math.floor(run.distance)}m</td>
                  <td><span>${new Date(run.createdAt).toLocaleDateString()}</span><small>${escapeHtml(run.result)}</small></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="recent-runs">
      <h3>RECENT SIGNALS</h3>
      ${recentRuns
        .map(
          (run) => `
            <div>
              <span class="${run.cleanRun ? "clean-dot" : "impact-dot"}"></span>
              <strong>${formatScore(run.score)}</strong>
              <span>${Math.floor(run.distance)}m / ${formatTime(run.survivalSeconds)}</span>
              <time datetime="${run.createdAt}">${new Date(run.createdAt).toLocaleString()}</time>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderFinalStats(record: RunRecord): string {
  return `
    <div><span>DISTANCE</span><strong>${Math.floor(record.distance)}m</strong></div>
    <div><span>SURVIVAL</span><strong>${formatTime(record.survivalSeconds)}</strong></div>
    <div><span>BEST CHAIN</span><strong>×${record.bestMultiplier.toFixed(2)}</strong></div>
    <div><span>HAZARDS CLEARED</span><strong>${record.obstaclesAvoided}</strong></div>
    <div><span>SOL SHARDS</span><strong>${record.collectibles}</strong></div>
    <div><span>INTEGRITY</span><strong>${record.cleanRun ? "CLEAN" : "DAMAGED"}</strong></div>
  `;
}

export function renderComparison(
  record: RunRecord,
  previousBest: number
): string {
  if (previousBest === 0 || record.score > previousBest) {
    const difference = record.score - previousBest;
    return `
      <span class="comparison-up">PERSONAL BEST</span>
      <strong>+${formatScore(Math.max(0, difference))}</strong>
      <small>above previous record</small>
    `;
  }
  const difference = previousBest - record.score;
  const percentage = previousBest > 0 ? (record.score / previousBest) * 100 : 0;
  return `
    <span>LATEST VS BEST</span>
    <strong>${percentage.toFixed(0)}%</strong>
    <small>${formatScore(difference)} points to the record</small>
  `;
}
