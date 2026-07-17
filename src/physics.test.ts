import { describe, expect, it } from "vitest";
import {
  canAttachWallrun,
  calculateForwardSpeed,
  canStartAction,
  lateralInputToWorldAxis,
  missedLanding,
  screenDirectionToWorldX,
  sweptPlayerIntersects
} from "./physics";

describe("runner physics safety", () => {
  it("detects a thin obstacle crossed in one high-speed step", () => {
    expect(
      sweptPlayerIntersects(
        {
          previousZ: 0,
          nextZ: 5,
          x: 0,
          bottomY: 0,
          halfWidth: 0.5,
          height: 2,
          halfDepth: 0.4
        },
        {
          minX: -1,
          maxX: 1,
          minY: 0,
          maxY: 2,
          minZ: 2.45,
          maxZ: 2.55
        }
      )
    ).toBe(true);
  });

  it("respects vertical and lateral clearance", () => {
    const basePlayer = {
      previousZ: 0,
      nextZ: 5,
      x: 3,
      bottomY: 0,
      halfWidth: 0.5,
      height: 0.8,
      halfDepth: 0.4
    };
    const obstacle = {
      minX: -1,
      maxX: 1,
      minY: 1.4,
      maxY: 2.5,
      minZ: 2,
      maxZ: 3
    };
    expect(sweptPlayerIntersects(basePlayer, obstacle)).toBe(false);
    expect(
      sweptPlayerIntersects({ ...basePlayer, x: 0 }, obstacle)
    ).toBe(false);
  });

  it("caps escalation but still applies dash and damage slowdown", () => {
    expect(calculateForwardSpeed(1_000, 20, 35, 0.2, 0, 0)).toBe(35);
    expect(calculateForwardSpeed(1_000, 20, 35, 0.2, 1, 0)).toBeCloseTo(
      21.7
    );
    expect(calculateForwardSpeed(1_000, 20, 35, 0.2, 0, 1)).toBe(46);
  });

  it("prevents conflicting or spammed actions", () => {
    const state = {
      grounded: false,
      sliding: false,
      wallrunning: false,
      dodgeCooldown: 1,
      dashCooldown: 1
    };
    expect(canStartAction("jump", state)).toBe(false);
    expect(canStartAction("slide", state)).toBe(false);
    expect(canStartAction("dodge", state)).toBe(false);
    expect(canStartAction("dash", state)).toBe(false);
  });

  it("maps screen directions correctly for the forward-facing camera", () => {
    expect(lateralInputToWorldAxis(true, false)).toBe(1);
    expect(lateralInputToWorldAxis(false, true)).toBe(-1);
    expect(screenDirectionToWorldX("left")).toBe(1);
    expect(screenDirectionToWorldX("right")).toBe(-1);
  });

  it("attaches only to the marked wall while airborne and held toward it", () => {
    expect(
      canAttachWallrun({
        gapKind: "wallrun",
        markedSide: 1,
        playerX: 5,
        grounded: false,
        holdingLeft: true,
        holdingRight: false,
        wallrunTimer: 0
      })
    ).toBe(true);
    expect(
      canAttachWallrun({
        gapKind: "wallrun",
        markedSide: 1,
        playerX: -5,
        grounded: false,
        holdingLeft: true,
        holdingRight: false,
        wallrunTimer: 0
      })
    ).toBe(false);
  });

  it("does not snap a player back onto a platform after falling below its edge", () => {
    expect(missedLanding(-0.2)).toBe(false);
    expect(missedLanding(-1.1)).toBe(true);
  });
});
