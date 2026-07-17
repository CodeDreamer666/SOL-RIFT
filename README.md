# SOL // RIFT

**A fast, third-person 3D endless-action runner through a collapsing futuristic megastructure.**

SOL // RIFT is a self-contained browser game built with TypeScript, Three.js, and Vite. The runner moves forward automatically while the player steers, jumps, slides, dodges, dashes, and wall-runs through a seeded procedural course. Each run combines readable hazards, recovery sectors, route choices, and increasingly demanding action chains.

No account, backend, API key, database, or downloaded proprietary asset is required.

## Gameplay

The objective is simple: survive as long as possible, travel farther, and build a high-scoring clean run.

The course continuously generates ahead of the player and removes completed sectors behind them. Its five visual environments—industrial corridors, rooftops, tunnels, suspended platforms, and reactor spaces—use distinct silhouettes and environmental details while sharing a consistent hazard language:

- Low barriers require a jump.
- Overhead structures require a slide.
- Side hazards reward a quick dodge.
- Crimson closing gates require a dash.
- Cyan marked walls support wall-running across otherwise impossible gaps.
- Moving blocks, rotating arms, lasers, swinging hazards, falling objects, collapsing floors, and moving platforms demand route reading and timing.
- Gold SOL shards and risky alternate routes offer optional score rewards.

Warnings appear before dangerous sections, and generated sectors are assembled from validated patterns with bounded gaps, action windows, recovery spacing, and open escape routes.

## Controls

| Action | Keyboard |
| --- | --- |
| Move left / hold toward a left wall | `A` or `←` |
| Move right / hold toward a right wall | `D` or `→` |
| Jump / wall kick | `Space`, `W`, or `↑` |
| Slide | `S` or `↓` |
| Dodge left | `Q` |
| Dodge right | `E` |
| Forward dash | `Shift` |
| Pause / resume | `Esc` or `P` |
| Restart after a run | `R` |
| Mute / unmute | `M` |

For a wall-run, jump toward the marked cyan wall and keep holding in that screen direction. Press jump again to kick away from it.

Touch and pointer action controls appear automatically on narrow screens.

## Movement and survival

Movement is momentum-based rather than lane-locked. Steering accelerates and decelerates smoothly, while dodges provide a sharper lateral burst. Jumping, sliding, dashing, and wall-running each answer different hazards and cannot be substituted for one another in their required challenge patterns.

The dash and dodge have cooldowns, and incompatible actions are prevented from overlapping. Minor impacts remove an integrity cell, slow the player, break the multiplier, and briefly grant invulnerability. Falling into the rift, losing all integrity, or suffering a severe failure ends the run.

## Difficulty modes

| Mode | Experience |
| --- | --- |
| **FLOW** | Longer warnings, wider recovery windows, simpler combinations, three integrity cells, and a gentler speed curve. |
| **PULSE** | The intended balanced experience with layered hazards, measured recovery, and the complete action set. |
| **RUPTURE** | Earlier combinations, stricter action timing, fewer recovery sectors, two integrity cells, and a 1.3× score scale. |

Difficulty changes warning distance, available patterns, combination timing, recovery frequency, health, acceleration, maximum speed, and score rewards—not just the player’s speed.

## Scoring

Score is awarded for:

- Distance travelled and time survived
- Passing obstacles with the correct action
- Near misses and successful action chains
- Collecting SOL shards
- Taking risky routes
- Maintaining an undamaged clean run
- Playing on a higher-reward difficulty

Successful actions and close calls increase the multiplier, up to `×8`. Taking damage resets it to `×1`, while spending too long without meaningful action gradually drains it.

## Run archive

The local scoreboard stores:

- Highest score
- Longest distance
- Longest survival time
- Best multiplier
- Most obstacles avoided
- The top ten runs by score
- Recent runs with their date and result
- A short local display name

The game-over screen compares the latest result with the previous personal best. Saved runs can be cleared from the scoreboard after confirmation.

All scores, names, and settings are stored only in the browser’s local storage. The game does not claim to provide an online leaderboard.

## Menus and settings

The game includes a title screen, difficulty selection, skippable tutorial, controls reference, gameplay HUD, pause menu, settings panel, scoreboard, and complete game-over summary.

Settings provide separate music and sound-effect levels, a mute toggle, and a reduced-motion option. Browser-generated audio begins only after user interaction, as required by modern browser autoplay policies.

## Run locally

### Requirements

- A current Node.js release with npm
- A browser with WebGL support

### Setup

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The development server is not configured to start automatically.

To create a production build:

```bash
npm run build
```

The compiled files are written to `dist/`.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build in `dist/` |
| `npm run lint` | Run ESLint across the project |
| `npm run typecheck` | Run the TypeScript project build without formatted output |
| `npm run test` | Run the Vitest test suite once |
| `npm run check` | Run lint, type-checking, tests, and the production build |

## Project structure

```text
src/
├── main.ts          Application lifecycle, input, menus, and run orchestration
├── game.ts          Three.js scene, player runtime, collisions, effects, and scoring
├── course.ts        Seeded procedural course generation and validation
├── physics.ts       Action rules, cooldowns, wall-run checks, and lateral mapping
├── audio.ts         Generated music and sound effects
├── storage.ts       Defensive local scoreboard and settings persistence
├── ui.ts            Menu, HUD, tutorial, scoreboard, and results markup
├── styles.css       Responsive interface and visual presentation
├── config.ts        Difficulty tuning and shared gameplay constants
├── types.ts         Shared TypeScript models
└── *.test.ts        Course, physics, controls, and storage regression tests
```

## Technical notes

- Three.js renders the game world, character, lighting, particles, hazards, and camera effects.
- Vite provides the local development and production build workflow.
- Vitest covers procedural validity, action rules, screen-relative steering, and scoreboard persistence.
- Course sections are seeded for variety and validated before use.
- Old sections and their Three.js resources are removed as the run advances, preventing unlimited scene growth.
- Input state is reset when the window loses focus, and the game pauses to prevent stuck keys or unfair deaths.
- Browser resize and reduced-motion preferences are handled at runtime.

## Current limitations

- The scoreboard is intentionally local to one browser profile and does not sync between devices.
- Audio availability and timing depend on the browser’s Web Audio support and user-interaction policy.
- Performance depends on the device’s GPU and WebGL implementation; reduced motion lowers presentation intensity but is not a complete low-spec graphics mode.
- The generated player and environment use procedural geometry rather than imported character animation or art assets.

For implementation and verification history, see [`BENCHMARK_REPORT.md`](./BENCHMARK_REPORT.md).
