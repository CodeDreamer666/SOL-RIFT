export interface BoxBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SweptPlayer {
  previousZ: number;
  nextZ: number;
  x: number;
  bottomY: number;
  halfWidth: number;
  height: number;
  halfDepth: number;
}

export const JUMP_VELOCITY = 8.2;
export const GRAVITY = 18.5;
export const JUMP_BUFFER_SECONDS = 0.12;
export const COYOTE_TIME_SECONDS = 0.1;
export const LANDING_LOCKOUT_SECONDS = 0;
export const DASH_DURATION_SECONDS = 0.52;
export const DASH_SPEED_BOOST = 11;
export const DASH_COOLDOWN_SECONDS = 0.3;

export function calculateJumpAirtime(): number {
  return (2 * JUMP_VELOCITY) / GRAVITY;
}

export function calculateJumpHeight(): number {
  return (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
}

export function calculateJumpDistance(forwardSpeed: number): number {
  return forwardSpeed * calculateJumpAirtime();
}

export function calculateDashDistance(forwardSpeed: number): number {
  return (
    (forwardSpeed + DASH_SPEED_BOOST) * DASH_DURATION_SECONDS
  );
}

export function shouldConsumeJumpBuffer(
  jumpBufferTimer: number,
  grounded: boolean
): boolean {
  return jumpBufferTimer > 0 && grounded;
}

export function sweptPlayerIntersects(
  player: SweptPlayer,
  obstacle: BoxBounds
): boolean {
  const playerMinX = player.x - player.halfWidth;
  const playerMaxX = player.x + player.halfWidth;
  const playerMinY = player.bottomY;
  const playerMaxY = player.bottomY + player.height;
  const playerMinZ =
    Math.min(player.previousZ, player.nextZ) - player.halfDepth;
  const playerMaxZ =
    Math.max(player.previousZ, player.nextZ) + player.halfDepth;

  return (
    playerMaxX > obstacle.minX &&
    playerMinX < obstacle.maxX &&
    playerMaxY > obstacle.minY &&
    playerMinY < obstacle.maxY &&
    playerMaxZ > obstacle.minZ &&
    playerMinZ < obstacle.maxZ
  );
}

export function calculateForwardSpeed(
  elapsedSeconds: number,
  startSpeed: number,
  maxSpeed: number,
  acceleration: number,
  slowTimer: number,
  dashTimer: number
): number {
  const baseSpeed = Math.min(
    maxSpeed,
    startSpeed + elapsedSeconds * acceleration
  );
  const slowedSpeed = slowTimer > 0 ? baseSpeed * 0.62 : baseSpeed;
  return slowedSpeed + (dashTimer > 0 ? DASH_SPEED_BOOST : 0);
}

export function lateralInputToWorldAxis(
  holdingLeft: boolean,
  holdingRight: boolean
): number {
  // The camera looks toward positive Z, so positive world X is screen-left.
  return (holdingLeft ? 1 : 0) - (holdingRight ? 1 : 0);
}

export function screenDirectionToWorldX(
  direction: "left" | "right"
): -1 | 1 {
  return direction === "left" ? 1 : -1;
}

export function canStartAction(
  action: "jump" | "slide" | "dodge" | "dash",
  state: {
    grounded: boolean;
    sliding: boolean;
    wallrunning: boolean;
    coyoteTimer?: number;
    dodgeCooldown: number;
    dashCooldown: number;
  }
): boolean {
  switch (action) {
    case "jump":
      return (
        state.grounded ||
        state.wallrunning ||
        (state.coyoteTimer ?? 0) > 0
      );
    case "slide":
      return state.grounded && !state.sliding;
    case "dodge":
      return state.dodgeCooldown <= 0 && !state.wallrunning;
    case "dash":
      return state.dashCooldown <= 0;
  }
}

export function canAttachWallrun(state: {
  gapKind: string | null;
  markedSide: -1 | 1;
  playerX: number;
  grounded: boolean;
  holdingLeft: boolean;
  holdingRight: boolean;
  wallrunTimer: number;
}): boolean {
  const holdingTowardMarkedWall =
    (state.markedSide === 1 &&
      state.holdingLeft &&
      state.playerX > 4.15) ||
    (state.markedSide === -1 &&
      state.holdingRight &&
      state.playerX < -4.15);
  return (
    state.gapKind === "wallrun" &&
    !state.grounded &&
    state.wallrunTimer <= 0 &&
    holdingTowardMarkedWall
  );
}

export function missedLanding(bottomY: number): boolean {
  return bottomY < -0.75;
}
