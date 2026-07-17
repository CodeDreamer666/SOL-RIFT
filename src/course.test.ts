import { describe, expect, it } from "vitest";
import { generateCoursePlan, validateCoursePlan } from "./course";
import type { Difficulty } from "./types";

describe("procedural course generation", () => {
  const difficulties: Difficulty[] = ["easy", "normal", "hard"];

  for (const difficulty of difficulties) {
    it(`creates fair ${difficulty} sectors across many seeds`, () => {
      for (let seed = 0; seed < 50; seed += 1) {
        for (let index = 0; index < 80; index += 1) {
          const plan = generateCoursePlan(index, difficulty, seed * 97);
          expect(validateCoursePlan(plan)).toEqual([]);
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

  it("can produce every declared Normal-mode obstacle family", () => {
    const observed = new Set(
      Array.from({ length: 600 }, (_, index) =>
        generateCoursePlan(index + 2, "normal", index * 31 + 9)
      ).map((plan) => plan.pattern)
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
