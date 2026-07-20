import { describe, expect, it } from "vitest";
import {
  generateCoursePlan,
  MIN_OBSTACLE_SPACING,
  requiredClearSpacing,
  validateCoursePlan
} from "./course";
import type { Difficulty } from "./types";

describe("procedural course generation", () => {
  const difficulties: Difficulty[] = ["easy", "normal", "hard"];

  for (const difficulty of difficulties) {
    it(`creates fair ${difficulty} sectors across many seeds`, () => {
      for (let seed = 0; seed < 50; seed += 1) {
        let previousPlan: ReturnType<typeof generateCoursePlan> | undefined;
        for (let index = 0; index < 80; index += 1) {
          const plan = generateCoursePlan(
            index,
            difficulty,
            seed * 97,
            previousPlan
          );
          expect(validateCoursePlan(plan, previousPlan)).toEqual([]);
          previousPlan = plan;
        }
      }
    });
  }

  it("is deterministic for a run seed and sector index", () => {
    expect(generateCoursePlan(12, "normal", 42)).toEqual(
      generateCoursePlan(12, "normal", 42)
    );
    expect(generateCoursePlan(12, "normal", 42)).not.toEqual(
      generateCoursePlan(12, "normal", 43)
    );
  });

  it("keeps a recovery cadence on easy mode", () => {
    const recoveryPlans = Array.from({ length: 20 }, (_, index) =>
      generateCoursePlan(index, "easy", 7)
    ).filter((plan) => plan.index > 1 && plan.index % 4 === 3);

    expect(recoveryPlans.every((plan) => plan.pattern === "breather")).toBe(
      true
    );
  });

  it("keeps the first 30 meters challenge-free in every mode", () => {
    for (const difficulty of difficulties) {
      for (let seed = 0; seed < 50; seed += 1) {
        const plan = generateCoursePlan(0, difficulty, seed);

        expect(plan.pattern).toBe("breather");
        expect(plan.hazards).toEqual([]);
        expect(plan.gaps).toEqual([]);
        expect(
          plan.recommendedActions.filter((action) => action.localZ < 30)
        ).toEqual([]);
      }
    }
  });

  it("gives laser grids a safe slide-to-jump recovery window", () => {
    for (const difficulty of difficulties) {
      const laserPlan = Array.from({ length: 2_000 }, (_, index) =>
        generateCoursePlan(index + 2, difficulty, index * 31 + 9)
      ).find((plan) => plan.pattern === "laserGrid");

      expect(laserPlan).toBeDefined();
      expect(laserPlan?.recommendedActions.map((item) => item.action)).toEqual(
        ["slide", "jump"]
      );
      const [slideAction, jumpAction] =
        laserPlan?.recommendedActions ?? [];
      expect(slideAction).toBeDefined();
      expect(jumpAction).toBeDefined();
      expect(jumpAction!.localZ - slideAction!.localZ).toBeGreaterThan(20);
    }
  });

  it("scales clear obstacle spacing with speed across sector boundaries", () => {
    for (const difficulty of difficulties) {
      for (let seed = 0; seed < 20; seed += 1) {
        let previousPlan: ReturnType<typeof generateCoursePlan> | undefined;
        let previousChallengeEnd: number | undefined;

        for (let index = 0; index < 80; index += 1) {
          const plan = generateCoursePlan(
            index,
            difficulty,
            seed * 97,
            previousPlan
          );
          const challenges = [
            ...plan.hazards.map((hazard) => ({
              start: plan.startZ + hazard.localZ - hazard.depth / 2,
              end: plan.startZ + hazard.localZ + hazard.depth / 2
            })),
            ...plan.gaps.map((gap) => ({
              start: plan.startZ + gap.startZ,
              end: plan.startZ + gap.endZ
            }))
          ].sort((left, right) => left.start - right.start);

          for (const challenge of challenges) {
            if (previousChallengeEnd !== undefined) {
              const clearDistance =
                challenge.start - previousChallengeEnd;
              expect(clearDistance).toBeGreaterThanOrEqual(
                MIN_OBSTACLE_SPACING
              );
              expect(clearDistance).toBeGreaterThanOrEqual(
                requiredClearSpacing(
                  plan.expectedSpeed,
                  difficulty
                )
              );
            }
            previousChallengeEnd = challenge.end;
          }
          previousPlan = plan;
        }
      }
    }
  });

  it("regenerates multi-part patterns that cannot fit at top speed", () => {
    let previousPlan: ReturnType<typeof generateCoursePlan> | undefined;
    const latePlans = [];

    for (let index = 0; index < 90; index += 1) {
      const plan = generateCoursePlan(
        index,
        "hard",
        918_273,
        previousPlan
      );
      if (index >= 60) {
        latePlans.push(plan);
      }
      previousPlan = plan;
    }

    expect(
      latePlans.every(
        (plan) =>
          plan.hazards.length <= 1 &&
          validateCoursePlan(plan).length === 0
      )
    ).toBe(true);
  });

  it("rejects patterns outside the real jump and dash limits", () => {
    const jumpPlan = Array.from({ length: 500 }, (_, seed) =>
      generateCoursePlan(12, "normal", seed)
    ).find((plan) => plan.pattern === "jump");
    const dashPlan = Array.from({ length: 500 }, (_, seed) =>
      generateCoursePlan(12, "normal", seed)
    ).find((plan) => plan.pattern === "dashGate");

    expect(jumpPlan).toBeDefined();
    expect(dashPlan).toBeDefined();

    const impossibleJump = {
      ...jumpPlan!,
      hazards: jumpPlan!.hazards.map((hazard) => ({
        ...hazard,
        height: 4,
        y: 2
      }))
    };
    const impossibleDash = {
      ...dashPlan!,
      hazards: dashPlan!.hazards.map((hazard) => ({
        ...hazard,
        depth: 40
      }))
    };

    expect(validateCoursePlan(impossibleJump)).toContain(
      `${impossibleJump.hazards[0]!.id} is too tall for the jump arc.`
    );
    expect(validateCoursePlan(impossibleDash)).toContain(
      `${impossibleDash.hazards[0]!.id} is too deep for one dash.`
    );
  });

  it("can produce every declared Normal-mode obstacle family", () => {
    const observed = new Set(
      Array.from({ length: 2_000 }, (_, sample) => {
        const index = 10 + (sample % 10);
        return generateCoursePlan(index, "normal", sample * 31 + 9);
      }).map((plan) => plan.pattern)
    );
    const expected = [
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
    ];

    expect([...observed].sort()).toEqual(expected.sort());
  });
});
