import type {
  Difficulty,
  DifficultyConfig,
  Settings
} from "./types";

export const COURSE_WIDTH = 13;
export const COURSE_HALF_WIDTH = COURSE_WIDTH / 2;
export const SEGMENT_LENGTH = 44;
export const PLAYER_HALF_WIDTH = 0.48;
export const PLAYER_HEIGHT = 2.1;
export const PLAYER_SLIDE_HEIGHT = 0.82;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: "FLOW",
    description: "Longer warnings, wider recovery windows, three integrity cells.",
    startSpeed: 17,
    maxSpeed: 30,
    acceleration: 0.13,
    warningDistance: 33,
    health: 3,
    scoreScale: 0.85,
    comboUnlock: 45,
    recoveryEvery: 4,
    actionWindow: 1.25,
    patterns: [
      "breather",
      "jump",
      "slide",
      "moving",
      "spinner",
      "dashGate",
      "splitRoute",
      "movingPlatforms",
      "laserGrid",
      "collapse",
      "swinging",
      "falling"
    ]
  },
  normal: {
    label: "PULSE",
    description: "The intended rhythm: layered hazards and measured recovery.",
    startSpeed: 20,
    maxSpeed: 35,
    acceleration: 0.18,
    warningDistance: 28,
    health: 3,
    scoreScale: 1,
    comboUnlock: 30,
    recoveryEvery: 5,
    actionWindow: 1,
    patterns: [
      "breather",
      "jump",
      "slide",
      "moving",
      "spinner",
      "dashGate",
      "jumpSlide",
      "dodgeDash",
      "wallrun",
      "movingPlatforms",
      "splitRoute",
      "laserGrid",
      "collapse",
      "swinging",
      "falling"
    ]
  },
  hard: {
    label: "RUPTURE",
    description: "Earlier combinations, stricter timing, fewer safe sectors.",
    startSpeed: 22,
    maxSpeed: 39,
    acceleration: 0.22,
    warningDistance: 25,
    health: 2,
    scoreScale: 1.3,
    comboUnlock: 12,
    recoveryEvery: 7,
    actionWindow: 0.78,
    patterns: [
      "jump",
      "slide",
      "moving",
      "spinner",
      "dashGate",
      "jumpSlide",
      "dodgeDash",
      "wallrun",
      "movingPlatforms",
      "splitRoute",
      "laserGrid",
      "collapse",
      "swinging",
      "falling"
    ]
  }
};

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  musicVolume: 0.45,
  sfxVolume: 0.7,
  reducedMotion: false
};

export const ACTION_LABELS = {
  jump: "JUMP",
  slide: "SLIDE",
  dodgeLeft: "DODGE",
  dodgeRight: "DODGE",
  dash: "DASH",
  wallrun: "WALL-RUN"
} as const;
