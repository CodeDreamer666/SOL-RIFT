import { DIFFICULTIES, SEGMENT_LENGTH } from "./config";
import {
  calculateDashDistance,
  calculateJumpDistance,
  calculateJumpHeight
} from "./physics";
import { SeededRandom } from "./rng";
import type {
  ActionName,
  CoursePlan,
  Difficulty,
  EnvironmentKind,
  HazardDefinition,
  PatternKind
} from "./types";

const ENVIRONMENTS: EnvironmentKind[] = [
  "industrial",
  "rooftop",
  "tunnel",
  "suspended",
  "reactor"
];

export const MIN_OBSTACLE_SPACING = 8;
export const COURSE_SAFETY_MARGIN = 0.75;
const MAX_GENERATION_ATTEMPTS = 16;
const GENERATION_CLEARANCE_EPSILON = 0.05;
const WALLRUN_DURATION_SECONDS = 1.55;
const REACTION_SECONDS: Record<Difficulty, number> = {
  easy: 1,
  normal: 0.9,
  hard: 0.8
};

interface ChallengeSpan {
  id: string;
  startZ: number;
  endZ: number;
}

export function requiredClearSpacing(
  speed: number,
  difficulty: Difficulty
): number {
  return (
    Math.max(
      MIN_OBSTACLE_SPACING,
      speed * REACTION_SECONDS[difficulty]
    ) + COURSE_SAFETY_MARGIN
  );
}

function expectedSpeedAtDistance(
  distance: number,
  difficulty: Difficulty
): number {
  const config = DIFFICULTIES[difficulty];
  return Math.min(
    config.maxSpeed,
    Math.sqrt(
      config.startSpeed * config.startSpeed +
        2 * config.acceleration * Math.max(0, distance)
    )
  );
}

function challengeSpans(plan: CoursePlan): ChallengeSpan[] {
  return [
    ...plan.hazards.map((item) => ({
      id: item.id,
      startZ: plan.startZ + item.localZ - item.depth / 2,
      endZ: plan.startZ + item.localZ + item.depth / 2
    })),
    ...plan.gaps.map((gap, index) => ({
      id: `${plan.index}-gap-${index}`,
      startZ: plan.startZ + gap.startZ,
      endZ: plan.startZ + gap.endZ
    }))
  ].sort((left, right) => left.startZ - right.startZ);
}

function hazard(
  id: string,
  kind: HazardDefinition["kind"],
  localZ: number,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  action: HazardDefinition["action"],
  warningDistance: number,
  motion?: HazardDefinition["motion"],
  risky = false
): HazardDefinition {
  return {
    id,
    kind,
    localZ,
    x,
    y,
    width,
    height,
    depth,
    action,
    warningDistance,
    motion,
    risky
  };
}

function createPattern(
  plan: CoursePlan,
  pattern: PatternKind,
  random: SeededRandom,
  difficulty: Difficulty
): void {
  const warning = DIFFICULTIES[difficulty].warningDistance;
  const clearSpacing = requiredClearSpacing(
    plan.expectedSpeed,
    difficulty
  );
  const phase = random.range(0, Math.PI * 2);
  const addAction = (action: ActionName, localZ: number): void => {
    plan.recommendedActions.push({ action, localZ });
  };
  const collectLine = (
    x: number,
    from: number,
    count: number,
    risky = false,
    y = 1.25
  ): void => {
    for (let index = 0; index < count; index += 1) {
      plan.collectibles.push({
        localZ: from + index * 2.2,
        x,
        y,
        risky
      });
    }
  };
  const comboPositions = (
    firstDepth: number,
    secondDepth: number,
    mustLandAfterFirst = false
  ): [number, number] => {
    const landingSpacing = mustLandAfterFirst
      ? calculateJumpDistance(plan.expectedSpeed) + COURSE_SAFETY_MARGIN
      : 0;
    const clearDistance =
      Math.max(clearSpacing, landingSpacing) +
      GENERATION_CLEARANCE_EPSILON;
    const first = 11 + firstDepth / 2;
    return [
      first,
      first + firstDepth / 2 + clearDistance + secondDepth / 2
    ];
  };

  switch (pattern) {
    case "breather":
      collectLine(random.pick([-2.8, 0, 2.8]), 9, 10);
      break;
    case "jump":
      plan.hazards.push(
        hazard(
          `${plan.index}-jump`,
          "barrier",
          23,
          0,
          0.65,
          12,
          1.3,
          1.2,
          "jump",
          warning
        )
      );
      addAction("jump", 23);
      collectLine(0, 19, 5, false, 2.35);
      break;
    case "slide":
      plan.hazards.push(
        hazard(
          `${plan.index}-slide`,
          "overhead",
          23,
          0,
          2.25,
          12,
          1.25,
          2.4,
          "slide",
          warning
        )
      );
      addAction("slide", 23);
      collectLine(0, 21, 4, false, 0.55);
      break;
    case "moving":
      plan.hazards.push(
        hazard(
          `${plan.index}-moving`,
          "moving",
          24,
          0,
          1.25,
          2.2,
          2.5,
          2,
          random.next() > 0.5 ? "dodgeLeft" : "dodgeRight",
          warning,
          {
            axis: "x",
            amplitude: 4.6,
            speed: difficulty === "easy" ? 1.15 : 1.55,
            phase
          }
        )
      );
      addAction("dodgeLeft", 24);
      collectLine(random.pick([-4.2, 4.2]), 19, 6);
      break;
    case "spinner":
      plan.hazards.push(
        hazard(
          `${plan.index}-spinner`,
          "spinner",
          24,
          0,
          1.05,
          10.5,
          0.32,
          0.7,
          "jump",
          warning,
          {
            axis: "rotation",
            amplitude: 1,
            speed: difficulty === "hard" ? 2.5 : 1.8,
            phase
          }
        )
      );
      addAction("jump", 24);
      collectLine(random.pick([-4.5, 4.5]), 19, 7, true);
      break;
    case "dashGate":
      plan.hazards.push(
        hazard(
          `${plan.index}-gate`,
          "dashGate",
          25,
          0,
          1.55,
          12,
          3.1,
          1.2,
          "dash",
          warning
        )
      );
      addAction("dash", 25);
      collectLine(0, 21, 5, false, 1.4);
      break;
    case "jumpSlide": {
      const [jumpZ, slideZ] = comboPositions(1, 2, true);
      plan.hazards.push(
        hazard(
          `${plan.index}-combo-jump`,
          "barrier",
          jumpZ,
          0,
          0.65,
          12,
          1.3,
          1,
          "jump",
          warning
        ),
        hazard(
          `${plan.index}-combo-slide`,
          "overhead",
          slideZ,
          0,
          2.2,
          12,
          1.25,
          2,
          "slide",
          warning
        )
      );
      addAction("jump", jumpZ);
      addAction("slide", slideZ);
      collectLine(0, jumpZ + 1, 6, true, 1.6);
      break;
    }
    case "dodgeDash": {
      const dodge = random.next() > 0.5 ? "dodgeLeft" : "dodgeRight";
      const [dodgeZ, dashZ] = comboPositions(2, 1.2);
      plan.hazards.push(
        hazard(
          `${plan.index}-combo-dodge`,
          "moving",
          dodgeZ,
          0,
          1.25,
          2.5,
          2.5,
          2,
          dodge,
          warning,
          {
            axis: "x",
            amplitude: 3.4,
            speed: 1.7,
            phase
          }
        ),
        hazard(
          `${plan.index}-combo-dash`,
          "dashGate",
          dashZ,
          0,
          1.55,
          12,
          3.1,
          1.2,
          "dash",
          warning
        )
      );
      addAction(dodge, dodgeZ);
      addAction("dash", dashZ);
      collectLine(dodge === "dodgeLeft" ? 3 : -3, dodgeZ + 1, 5, true);
      break;
    }
    case "wallrun": {
      const side = random.next() > 0.5 ? 1 : -1;
      plan.gaps.push({
        startZ: 13,
        endZ: 36,
        kind: "wallrun",
        wallSide: side
      });
      addAction("wallrun", 13);
      collectLine(side * 5.25, 14, 10, true, 2.25);
      break;
    }
    case "movingPlatforms": {
      const direction = random.next() > 0.5 ? 1 : -1;
      plan.gaps.push({
        startZ: 12,
        endZ: 37,
        kind: "movingPlatform"
      });
      plan.safeRouteX = direction * 2.3;
      addAction(direction === 1 ? "dodgeLeft" : "dodgeRight", 13);
      collectLine(direction * 2.4, 15, 10, true, 1.45);
      break;
    }
    case "splitRoute": {
      const safeSide = random.next() > 0.5 ? -1 : 1;
      const [routeZ, jumpZ] = comboPositions(3.2, 1);
      plan.safeRouteX = safeSide * 3.6;
      plan.hazards.push(
        hazard(
          `${plan.index}-route`,
          "routeBlock",
          routeZ,
          -safeSide * 3.3,
          1.4,
          5.5,
          2.8,
          3.2,
          "route",
          warning,
          undefined,
          true
        ),
        hazard(
          `${plan.index}-safe-low`,
          "barrier",
          jumpZ,
          safeSide * 3.3,
          0.55,
          4.9,
          1.1,
          1,
          "jump",
          warning
        )
      );
      addAction(
        safeSide === 1 ? "dodgeLeft" : "dodgeRight",
        routeZ
      );
      addAction("jump", jumpZ);
      collectLine(-safeSide * 4.2, routeZ + 1, 9, true, 1.4);
      break;
    }
    case "laserGrid": {
      const [highZ, lowZ] = comboPositions(0.5, 0.5);
      plan.hazards.push(
        hazard(
          `${plan.index}-laser-high`,
          "laserHigh",
          highZ,
          0,
          1.7,
          12,
          0.16,
          0.5,
          "slide",
          warning
        ),
        hazard(
          `${plan.index}-laser-low`,
          "laserLow",
          lowZ,
          0,
          0.85,
          12,
          0.16,
          0.5,
          "jump",
          warning
        )
      );
      addAction("slide", highZ);
      addAction("jump", lowZ);
      collectLine(0, highZ - 2, 12);
      break;
    }
    case "collapse":
      plan.gaps.push({
        startZ: 24,
        endZ: 31.5,
        kind: "collapse"
      });
      addAction("jump", 23);
      collectLine(0, 21, 7, true, 2.1);
      break;
    case "swinging":
      plan.hazards.push(
        hazard(
          `${plan.index}-swing`,
          "swinging",
          25,
          0,
          1.65,
          2.5,
          3.3,
          1.5,
          random.next() > 0.5 ? "dodgeLeft" : "dodgeRight",
          warning,
          {
            axis: "x",
            amplitude: 4.5,
            speed: 1.6,
            phase
          }
        )
      );
      addAction("dodgeRight", 25);
      collectLine(random.pick([-4.4, 4.4]), 21, 6, true);
      break;
    case "falling":
      plan.hazards.push(
        hazard(
          `${plan.index}-falling`,
          "falling",
          26,
          random.pick([-2.6, 0, 2.6]),
          6,
          2.4,
          2.4,
          2.4,
          "dodgeLeft",
          warning,
          {
            axis: "y",
            amplitude: 5,
            speed: 1,
            phase
          }
        )
      );
      addAction("dodgeLeft", 26);
      collectLine(random.pick([-4.4, 4.4]), 19, 7);
      break;
  }
}

export function generateCoursePlan(
  index: number,
  difficulty: Difficulty,
  runSeed: number,
  previousPlan?: CoursePlan
): CoursePlan {
  const config = DIFFICULTIES[difficulty];
  const intensity = Math.min(1, index / (difficulty === "hard" ? 14 : 22));
  const availablePatterns = config.patterns.filter((pattern) => {
    if (pattern === "jumpSlide" || pattern === "dodgeDash") {
      return index >= config.comboUnlock / 3;
    }
    if (pattern === "wallrun") {
      return index >= 3;
    }
    return true;
  });
  const recoveryDue =
    index > 1 && index % config.recoveryEvery === config.recoveryEvery - 1;
  const expectedSpeed = expectedSpeedAtDistance(
    index * SEGMENT_LENGTH,
    difficulty
  );

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const seed =
      (runSeed +
        index * 2_654_435_761 +
        attempt * 1_013_904_223) >>>
      0;
    const random = new SeededRandom(seed);
    const selectablePatterns =
      index === 0
        ? (["breather"] as const)
        : index === 1
          ? (["breather", "slide"] as const)
          : availablePatterns;
    const pattern = recoveryDue
      ? "breather"
      : random.pick(selectablePatterns);
    const plan: CoursePlan = {
      index,
      seed,
      difficulty,
      expectedSpeed,
      startZ: index * SEGMENT_LENGTH,
      length: SEGMENT_LENGTH,
      environment: random.pick(ENVIRONMENTS),
      pattern,
      hazards: [],
      collectibles: [],
      gaps: [],
      recommendedActions: [],
      safeRouteX: 0,
      intensity
    };

    createPattern(plan, pattern, random, difficulty);
    if (validateCoursePlan(plan, previousPlan).length === 0) {
      return plan;
    }
  }

  const fallbackSeed =
    (runSeed + index * 2_654_435_761 + 0xf4a7c15) >>> 0;
  const fallbackRandom = new SeededRandom(fallbackSeed);
  const fallback: CoursePlan = {
    index,
    seed: fallbackSeed,
    difficulty,
    expectedSpeed,
    startZ: index * SEGMENT_LENGTH,
    length: SEGMENT_LENGTH,
    environment: fallbackRandom.pick(ENVIRONMENTS),
    pattern: "breather",
    hazards: [],
    collectibles: [],
    gaps: [],
    recommendedActions: [],
    safeRouteX: 0,
    intensity
  };
  createPattern(fallback, "breather", fallbackRandom, difficulty);
  return fallback;
}

export function validateCoursePlan(
  plan: CoursePlan,
  previousPlan?: CoursePlan
): string[] {
  const errors: string[] = [];
  const actions = [...plan.recommendedActions].sort(
    (left, right) => left.localZ - right.localZ
  );
  const hazards = [...plan.hazards].sort(
    (left, right) => left.localZ - right.localZ
  );
  const clearSpacing = requiredClearSpacing(
    plan.expectedSpeed,
    plan.difficulty
  );

  for (const hazardItem of plan.hazards) {
    if (hazardItem.localZ < 10 || hazardItem.localZ > plan.length - 5) {
      errors.push(`${hazardItem.id} is outside the readable spawn band.`);
    }
    if (hazardItem.warningDistance < 20) {
      errors.push(`${hazardItem.id} has insufficient warning.`);
    }
    if (
      hazardItem.action === "route" &&
      hazardItem.width >= 11.5
    ) {
      errors.push(`${hazardItem.id} blocks every route.`);
    }
    if (
      hazardItem.action === "jump" &&
      hazardItem.y + hazardItem.height / 2 + COURSE_SAFETY_MARGIN / 3 >
        calculateJumpHeight()
    ) {
      errors.push(`${hazardItem.id} is too tall for the jump arc.`);
    }
    if (
      hazardItem.action === "dash" &&
      hazardItem.depth + COURSE_SAFETY_MARGIN * 2 >
        calculateDashDistance(plan.expectedSpeed)
    ) {
      errors.push(`${hazardItem.id} is too deep for one dash.`);
    }
  }

  for (let index = 1; index < actions.length; index += 1) {
    const previous = actions[index - 1];
    const current = actions[index];
    if (
      previous &&
      current &&
      current.localZ - previous.localZ <
        Math.max(
          MIN_OBSTACLE_SPACING,
          plan.expectedSpeed * REACTION_SECONDS[plan.difficulty]
        )
    ) {
      errors.push(
        `${previous.action} and ${current.action} have contradictory timing.`
      );
    }
  }

  const spans = challengeSpans(plan);
  const previousSpans = previousPlan
    ? challengeSpans(previousPlan)
    : [];
  const spansToValidate =
    previousSpans.length > 0 && spans.length > 0
      ? [previousSpans[previousSpans.length - 1]!, ...spans]
      : spans;
  for (let index = 1; index < spansToValidate.length; index += 1) {
    const previous = spansToValidate[index - 1];
    const current = spansToValidate[index];
    if (
      previous &&
      current &&
      current.startZ - previous.endZ < clearSpacing
    ) {
      errors.push(
        `${previous.id} and ${current.id} lack the required reaction distance.`
      );
    }
  }

  if (hazards.length > 1) {
    for (let index = 1; index < hazards.length; index += 1) {
      const previous = hazards[index - 1];
      const current = hazards[index];
      if (
        previous?.action === "jump" &&
        current &&
        current.localZ -
          current.depth / 2 -
          (previous.localZ + previous.depth / 2) <
          calculateJumpDistance(plan.expectedSpeed) +
            COURSE_SAFETY_MARGIN
      ) {
        errors.push(
          `${previous.id} does not allow landing before ${current.id}.`
        );
      }
    }
  }

  for (const gap of plan.gaps) {
    const length = gap.endZ - gap.startZ;
    if (
      (gap.kind === "jump" || gap.kind === "collapse") &&
      length >
        calculateJumpDistance(plan.expectedSpeed) -
          COURSE_SAFETY_MARGIN * 2
    ) {
      errors.push(`Jump gap ${length.toFixed(1)} exceeds the jump arc.`);
    }
    if (
      gap.kind === "wallrun" &&
      length >
        plan.expectedSpeed * WALLRUN_DURATION_SECONDS -
          COURSE_SAFETY_MARGIN
    ) {
      errors.push(`Wall-run gap ${length.toFixed(1)} exceeds safe range.`);
    }
    if (gap.kind === "movingPlatform" && length > 26) {
      errors.push(`Moving-platform field ${length.toFixed(1)} is too long.`);
    }
    if (gap.startZ < 10 || gap.endZ > plan.length - 5) {
      errors.push("Gap lacks a safe approach or landing.");
    }
  }

  if (
    plan.pattern !== "breather" &&
    plan.hazards.length === 0 &&
    plan.gaps.length === 0
  ) {
    errors.push("Active pattern contains no challenge.");
  }

  return errors;
}
