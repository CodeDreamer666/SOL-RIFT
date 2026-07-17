# SOL // RIFT — Benchmark Report

## Execution metadata

- Model: GPT-5 Codex
- Reasoning level: Not available to the model.
- Implementation began: 2026-07-17T16:27:43+08:00
- Time zone: Asia/Singapore (UTC+08:00)
- Input tokens: Not available to the model; record from Codex usage statistics.
- Output tokens: Not available to the model; record from Codex usage statistics.
- Cached tokens: Not available to the model; record from Codex usage statistics.
- Credit use: Not available to the model; record from Codex usage statistics.
- Monetary cost: Not available to the model; record from Codex usage statistics.

The testing and repair phases overlapped because browser findings were repaired
and immediately re-tested.

| Phase | Began | Ended |
| --- | --- | --- |
| Repository inspection and planning | 2026-07-17T16:25:44+08:00 | 2026-07-17T16:27:42+08:00 |
| Implementation | 2026-07-17T16:27:43+08:00 | 2026-07-17T18:01:51+08:00 |
| Testing and verification | 2026-07-17T17:45:57+08:00 | 2026-07-17T18:05:10+08:00 |
| Repairs and final review | 2026-07-17T17:50:39+08:00 | 2026-07-17T18:05:10+08:00 |

## Commands executed

Significant setup, development and verification commands:

```text
bash .../sites-building/scripts/init-site.sh <workspace>/Sol
npm install three --no-audit --no-fund
npm install --save-dev typescript vite vitest eslint @eslint/js typescript-eslint @types/three --no-audit --no-fund
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
npm audit --omit=dev --audit-level=high
```

The bundled site initializer was attempted once as required by the available
site workflow. It failed before writing files because its CRLF shell files were
not executable by the available WSL Bash. The requested Vite/TypeScript project
was then created directly. The first configured development port (4173) was
already occupied by an unrelated process, so the game was moved to port 4817
without terminating that process.

Repository inspection and final review also used PowerShell file listings,
`rg --files`, `rg` placeholder scans, package metadata inspection and development
server log reads.

## Automated tests performed

Final result: 3 test files, 16 tests, all passing.

- Generated and validated 12,000 course sectors across Easy, Normal and Hard
  (50 seeds × 80 sectors × 3 difficulties).
- Verified all declared Normal obstacle families are reachable across 600
  additional generated sectors.
- Verified deterministic generation for the same seed and variation between
  different seeds.
- Verified Easy recovery-sector cadence.
- Validated warning distance, safe approach/landing space, action spacing,
  maximum jump and wall-run gaps, moving-platform field length and route width.
- Verified swept collision catches a thin obstacle crossed in one high-speed
  simulation step.
- Verified vertical and lateral collision clearance.
- Verified speed escalation caps, damage slowdown and dash boost.
- Verified action cooldown/overlap guards.
- Verified wall-run attachment requires an airborne player holding toward the
  marked wall.
- Verified a player below the platform edge is not snapped back onto the floor.
- Verified score sorting, local run clearing, name sanitization, corrupt-data
  recovery and settings persistence.

## Browser play-testing performed

The game was tested in the Codex in-app browser against the live Vite server.

- Loaded the title screen and verified the Three.js scene, menu and canvas.
- Stepped through all four tutorial pages and started a run from the tutorial.
- Opened and checked the controls page (eight documented control groups).
- Triggered jump, slide, dodge and dash through the visible gameplay controls;
  verified action/cooldown state and dash state.
- Verified pause, resume, immediate restart, abandon-to-menu and settings access
  from the pause screen.
- Ran repeated start/restart sessions on Easy, Normal and Hard. Confirmed the
  intended initial health and speed differences (Easy 3/17, Normal 3/20,
  Hard 2/22).
- Completed crash/fall runs and verified the game-over statistics, failure
  reason, personal-best comparison and fast restart.
- Verified falling below a broken platform ends with `MISSED THE LANDING`.
- Verified saved runs render in score order with recent-run dates and results.
- Verified clear-score confirmation cancellation preserves runs, then verified
  confirmation clears all runs while preserving the callsign.
- Verified mute and reduced-motion settings persist after closing and reopening
  settings, then restored both defaults.
- Inspected layouts at 1280×720, 1024×768 and 390×844. The title actions
  remained visible and the 390px gameplay action dock stayed within the viewport.
- Checked a fresh final browser tab for console warnings and errors: none.

The test harness did not emit a real operating-system blur event when another
background tab was created. The blur/visibility pause listeners and the
visibility-aware Three.js timer are present, but the external-window focus-loss
path remains unverified end to end.

## Final check results

```text
npm run lint       PASS
npm run typecheck  PASS
npm run test       PASS — 16 tests
npm run build      PASS
npm audit --omit=dev --audit-level=high
                    PASS — 0 vulnerabilities
```

Production output:

```text
dist/index.html                  0.71 kB (0.41 kB gzip)
dist/assets/index-*.css         24.55 kB (6.32 kB gzip)
dist/assets/index-*.js         598.74 kB (153.97 kB gzip)
```

Vite reports its advisory warning for a minified chunk over 500 kB. The chunk is
primarily the Three.js runtime; it is 153.97 kB after gzip and is the known
remaining bundle-size limitation.

## Bugs discovered and fixed

- Replaced the incompatible bundled initializer with a direct Vite setup after
  confirming the initializer failed before writing project files.
- Changed the local development port after the original port was occupied.
- Added Vite client declarations and removed an unused parameter to resolve the
  first strict TypeScript failure.
- Removed menu-brand overlap from the gameplay score area.
- Cleared stale impact messages during immediate restarts.
- Made collapsing-floor tiles visibly fall instead of remaining static.
- Added real laterally moving platforms with physical support checks.
- Constrained adjacent platform motion so every transition remains laterally
  reachable.
- Reworked the laser grid into a safely spaced jump-then-slide sequence after
  identifying an unfair route switch.
- Prevented below-edge players from being snapped back onto a landing platform.
- Added bounded geometry disposal when old procedural sectors are removed.
- Moved decorative overhead supports outside the playable collision space.
- Styled panel scrollbars and checked scoreboards with multiple entries.
- Replaced deprecated Three.js clock and soft-shadow APIs; the final browser
  console is clean.
- Added explicit survival-time, clean-run and linked-action score bonuses.

## Known limitations and unverified assumptions

- Procedural survivability is enforced through bounded, validated templates and
  extensive generated-plan tests; it is not a formal physics-agent proof of
  every possible player trajectory.
- Wall-run attachment logic is automated-test verified, but a complete
  wall-run-gap traversal was not manually completed during the browser session.
- External operating-system focus loss was not reproducible in the browser
  harness, as described above.
- Generated Web Audio starts only after a user gesture, as required by browser
  autoplay policy. Browsers without Web Audio continue silently.
- The production JavaScript chunk carries the documented Three.js size advisory.

## Requested features not completed

No requested user-facing game system was intentionally omitted. The scoreboard
is device-local and no online players, authentication, backend, database, paid
service or proprietary assets were added, as requested.

## Follow-up repair: lateral controls

- Repair window: 2026-07-17T18:35:00+08:00 to
  2026-07-17T18:40:33+08:00.
- User-reported bug: `D` appeared to move left and `A` appeared to move right.
- Root cause: the camera faces positive Z, so positive world X appears on the
  left side of the rendered screen.
- Fix: centralized screen-to-world lateral mapping and applied it consistently
  to held steering, dodges, wall-run attachment, wall-run prompts, moving
  platforms and split-route guidance.
- Regression coverage: added automated left/right mapping assertions. The final
  suite passes with 17 tests.
- Browser verification: repeated `D` input moved the character visibly right;
  repeated `A` input moved the character visibly left. No console warnings or
  errors were recorded.
- Final command: `npm run check` — lint, type-check, 17 tests and production
  build passed. The existing Three.js bundle-size advisory remains unchanged.
