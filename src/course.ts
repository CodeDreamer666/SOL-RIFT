import { DIFFICULTIES, SEGMENT_LENGTH } from "./config";
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

const ACTION_SPACING = 7.5;
const MAX_JUMP_GAP = 10;
const MAX_WALLRUN_GAP = 25;

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
    case "jumpSlide":
      plan.hazards.push(
        hazard(
          `${plan.index}-combo-jump`,
          "barrier",
          17,
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
          30,
          0,
          2.2,
          12,
          1.25,
          2,
          "slide",
          warning
        )
      );
      addAction("jump", 17);
      addAction("slide", 30);
      collectLine(0, 18, 6, true, 1.6);
      break;
    case "dodgeDash": {
      const dodge = random.next() > 0.5 ? "dodgeLeft" : "dodgeRight";
      plan.hazards.push(
        hazard(
          `${plan.index}-combo-dodge`,
          "moving",
          17,
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
          30,
          0,
          1.55,
          12,
          3.1,
          1.2,
          "dash",
          warning
        )
      );
      addAction(dodge, 17);
      addAction("dash", 30);
      collectLine(dodge === "dodgeLeft" ? 3 : -3, 18, 5, true);
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
      plan.safeRouteX = safeSide * 3.6;
      plan.hazards.push(
        hazard(
          `${plan.index}-route`,
          "routeBlock",
          24,
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
          31,
          safeSide * 3.3,
          0.55,
          4.9,
          1.1,
          1,
          "jump",
          warning
        )
      );
      addAction(safeSide === 1 ? "dodgeLeft" : "dodgeRight", 20);
      addAction("jump", 31);
      collectLine(-safeSide * 4.2, 17, 9, true, 1.4);
      break;
    }
    case "laserGrid":
      plan.hazards.push(
        hazard(
          `${plan.index}-laser-low`,
          "laserLow",
          20,
          0,
          0.85,
          12,
          0.16,
          0.5,
          "jump",
          warning
        ),
        hazard(
          `${plan.index}-laser-high`,
          "laserHigh",
          32,
          0,
          1.7,
          12,
          0.16,
          0.5,
          "slide",
          warning
        )
      );
      addAction("jump", 20);
      addAction("slide", 32);
      collectLine(0, 18, 8);
      break;
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
  runSeed: number
): CoursePlan {
  const seed = (runSeed + index * 2_654_435_761) >>> 0;
  const random = new SeededRandom(seed);
  const config = DIFFICULTIES[difficulty];
  const intensity = Math.min(1, index / (difficulty === "hard" ? 14 : 22));
  let availablePatterns = config.patterns.filter((pattern) => {
    if (pattern === "jumpSlide" || pattern === "dodgeDash") {
      return index >= config.comboUnlock / 3;
    }
    if (pattern === "wallrun") {
      return index >= 3;
    }
    return true;
  });

  if (index < 2) {
    availablePatterns = ["breather", index === 0 ? "jump" : "slide"];
  }

  const recoveryDue =
    index > 1 && index % config.recoveryEvery === config.recoveryEvery - 1;
  const pattern = recoveryDue
    ? "breather"
    : random.pick(availablePatterns);
  const environment = random.pick(ENVIRONMENTS);
  const plan: CoursePlan = {
    index,
    seed,
    startZ: index * SEGMENT_LENGTH,
    length: SEGMENT_LENGTH,
    environment,
    pattern,
    hazards: [],
    collectibles: [],
    gaps: [],
    recommendedActions: [],
    safeRouteX: 0,
    intensity
  };

  createPattern(plan, pattern, random, difficulty);
  return plan;
}

export function validateCoursePlan(plan: CoursePlan): string[] {
  const errors: string[] = [];
  const actions = [...plan.recommendedActions].sort(
    (left, right) => left.localZ - right.localZ
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
  }

  for (let index = 1; index < actions.length; index += 1) {
    const previous = actions[index - 1];
    const current = actions[index];
    if (
      previous &&
      current &&
      current.localZ - previous.localZ < ACTION_SPACING
    ) {
      errors.push(
        `${previous.action} and ${current.action} have contradictory timing.`
      );
    }
  }

  for (const gap of plan.gaps) {
    const length = gap.endZ - gap.startZ;
    if (gap.kind === "jump" && length > MAX_JUMP_GAP) {
      errors.push(`Jump gap ${length.toFixed(1)} exceeds safe range.`);
    }
    if (gap.kind === "wallrun" && length > MAX_WALLRUN_GAP) {
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
