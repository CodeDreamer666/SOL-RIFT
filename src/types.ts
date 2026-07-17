export type Difficulty = "easy" | "normal" | "hard";

export type GamePhase =
  | "menu"
  | "playing"
  | "paused"
  | "gameover";

export type ActionName =
  | "jump"
  | "slide"
  | "dodgeLeft"
  | "dodgeRight"
  | "dash"
  | "wallrun";

export type EnvironmentKind =
  | "industrial"
  | "rooftop"
  | "tunnel"
  | "suspended"
  | "reactor";

export type PatternKind =
  | "breather"
  | "jump"
  | "slide"
  | "moving"
  | "spinner"
  | "dashGate"
  | "jumpSlide"
  | "dodgeDash"
  | "wallrun"
  | "movingPlatforms"
  | "splitRoute"
  | "laserGrid"
  | "collapse"
  | "swinging"
  | "falling";

export type HazardKind =
  | "barrier"
  | "overhead"
  | "moving"
  | "spinner"
  | "dashGate"
  | "laserLow"
  | "laserHigh"
  | "swinging"
  | "falling"
  | "routeBlock";

export interface DifficultyConfig {
  label: string;
  description: string;
  startSpeed: number;
  maxSpeed: number;
  acceleration: number;
  warningDistance: number;
  health: number;
  scoreScale: number;
  comboUnlock: number;
  recoveryEvery: number;
  actionWindow: number;
  patterns: PatternKind[];
}

export interface Settings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
}

export interface RunRecord {
  id: string;
  name: string;
  difficulty: Difficulty;
  score: number;
  distance: number;
  survivalSeconds: number;
  bestMultiplier: number;
  obstaclesAvoided: number;
  collectibles: number;
  cleanRun: boolean;
  result: string;
  createdAt: string;
}

export interface ScoreboardData {
  version: 1;
  displayName: string;
  runs: RunRecord[];
}

export interface HazardDefinition {
  id: string;
  kind: HazardKind;
  localZ: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  action: ActionName | "route";
  warningDistance: number;
  motion?: {
    axis: "x" | "y" | "rotation";
    amplitude: number;
    speed: number;
    phase: number;
  };
  risky?: boolean;
}

export interface CollectibleDefinition {
  localZ: number;
  x: number;
  y: number;
  risky?: boolean;
}

export interface GapDefinition {
  startZ: number;
  endZ: number;
  kind: "jump" | "wallrun" | "collapse" | "movingPlatform";
  wallSide?: -1 | 1;
}

export interface CoursePlan {
  index: number;
  seed: number;
  startZ: number;
  length: number;
  environment: EnvironmentKind;
  pattern: PatternKind;
  hazards: HazardDefinition[];
  collectibles: CollectibleDefinition[];
  gaps: GapDefinition[];
  recommendedActions: Array<{
    action: ActionName;
    localZ: number;
  }>;
  safeRouteX: number;
  intensity: number;
}

export interface RunStats {
  score: number;
  distance: number;
  survivalSeconds: number;
  multiplier: number;
  bestMultiplier: number;
  obstaclesAvoided: number;
  collectibles: number;
  health: number;
  maxHealth: number;
  cleanRun: boolean;
  speed: number;
  dashCooldown: number;
  dodgeCooldown: number;
  actionPrompt: string;
  activeAction: string;
}

export interface GameCallbacks {
  onStats: (stats: RunStats) => void;
  onGameOver: (record: RunRecord) => void;
  onPauseChange: (paused: boolean) => void;
  onMessage: (message: string, tone?: "good" | "warn") => void;
}
