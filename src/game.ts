import * as THREE from "three";
import {
  ACTION_LABELS,
  COURSE_HALF_WIDTH,
  DIFFICULTIES,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  SEGMENT_LENGTH
} from "./config";
import { generateCoursePlan, validateCoursePlan } from "./course";
import { AudioEngine } from "./audio";
import {
  canAttachWallrun,
  calculateForwardSpeed,
  canStartAction,
  lateralInputToWorldAxis,
  missedLanding,
  screenDirectionToWorldX,
  sweptPlayerIntersects,
  type BoxBounds
} from "./physics";
import { SeededRandom } from "./rng";
import type {
  ActionName,
  CoursePlan,
  Difficulty,
  GameCallbacks,
  GamePhase,
  HazardDefinition,
  RunRecord,
  RunStats,
  Settings
} from "./types";

interface RuntimeHazard {
  definition: HazardDefinition;
  root: THREE.Group;
  visual: THREE.Object3D;
  worldZ: number;
  currentX: number;
  currentY: number;
  currentWidth: number;
  currentDepth: number;
  passed: boolean;
  hit: boolean;
}

interface RuntimeCollectible {
  mesh: THREE.Mesh;
  worldZ: number;
  x: number;
  y: number;
  risky: boolean;
  collected: boolean;
}

interface RuntimeSegment {
  plan: CoursePlan;
  group: THREE.Group;
  hazards: RuntimeHazard[];
  collectibles: RuntimeCollectible[];
  platforms: RuntimePlatform[];
}

interface RuntimePlatform {
  mesh: THREE.Mesh;
  worldStart: number;
  worldEnd: number;
  width: number;
  baseX: number;
  phase: number;
}

interface PlayerState {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  sliding: boolean;
  wallrunning: boolean;
  wallSide: -1 | 0 | 1;
  slideTimer: number;
  dashTimer: number;
  dashCooldown: number;
  dodgeTimer: number;
  dodgeCooldown: number;
  wallrunTimer: number;
  slowTimer: number;
  invulnerability: number;
  lastAction: ActionName | null;
  lastActionAt: number;
}

interface MutableRun {
  difficulty: Difficulty;
  name: string;
  seed: number;
  elapsed: number;
  score: number;
  distance: number;
  multiplier: number;
  bestMultiplier: number;
  obstaclesAvoided: number;
  collectibles: number;
  health: number;
  maxHealth: number;
  cleanRun: boolean;
  lastSuccessAt: number;
  result: string;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

const EMPTY_RUN: MutableRun = {
  difficulty: "normal",
  name: "RUNNER",
  seed: 1,
  elapsed: 0,
  score: 0,
  distance: 0,
  multiplier: 1,
  bestMultiplier: 1,
  obstaclesAvoided: 0,
  collectibles: 0,
  health: 3,
  maxHealth: 3,
  cleanRun: true,
  lastSuccessAt: 0,
  result: "RIFT CLOSED"
};

const ACTION_PROMPTS: Record<HazardDefinition["action"], string> = {
  jump: "JUMP",
  slide: "SLIDE",
  dodgeLeft: "DODGE LEFT",
  dodgeRight: "DODGE RIGHT",
  dash: "DASH",
  wallrun: "WALL-RUN",
  route: "CHOOSE ROUTE"
};

function damp(current: number, target: number, smoothing: number, dt: number) {
  return THREE.MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-smoothing * dt)
  );
}

export class RiftGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: GameCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
  private readonly timer = new THREE.Timer();
  private readonly playerRoot = new THREE.Group();
  private readonly playerBody = new THREE.Group();
  private readonly runnerLimbs: THREE.Object3D[] = [];
  private readonly segments: RuntimeSegment[] = [];
  private readonly particles: Particle[] = [];
  private readonly input = {
    left: false,
    right: false
  };
  private readonly audio: AudioEngine;
  private settings: Settings;
  private phase: GamePhase = "menu";
  private animationFrame = 0;
  private player: PlayerState = this.createPlayerState();
  private run: MutableRun = { ...EMPTY_RUN };
  private nextSegmentIndex = 0;
  private lastRenderedStats = 0;
  private cameraImpact = 0;
  private speedTrailTimer = 0;
  private disposed = false;

  private readonly materials = {
    floor: new THREE.MeshStandardMaterial({
      color: 0x111a2f,
      metalness: 0.72,
      roughness: 0.44
    }),
    floorAccent: new THREE.MeshStandardMaterial({
      color: 0x22efd0,
      emissive: 0x0b8e83,
      emissiveIntensity: 1.3,
      metalness: 0.5,
      roughness: 0.32
    }),
    structure: new THREE.MeshStandardMaterial({
      color: 0x26334b,
      metalness: 0.82,
      roughness: 0.38
    }),
    structureDark: new THREE.MeshStandardMaterial({
      color: 0x090e1c,
      metalness: 0.75,
      roughness: 0.5
    }),
    hazard: new THREE.MeshStandardMaterial({
      color: 0xff4d68,
      emissive: 0x7d0a24,
      emissiveIntensity: 1.15,
      metalness: 0.48,
      roughness: 0.34
    }),
    hazardBright: new THREE.MeshBasicMaterial({
      color: 0xff6b7f
    }),
    cue: new THREE.MeshBasicMaterial({
      color: 0xffca5c,
      transparent: true,
      opacity: 0.9
    }),
    wallrun: new THREE.MeshStandardMaterial({
      color: 0x34d7ff,
      emissive: 0x087da5,
      emissiveIntensity: 1.8,
      metalness: 0.28,
      roughness: 0.26
    }),
    collectible: new THREE.MeshStandardMaterial({
      color: 0xffd56b,
      emissive: 0xc45b14,
      emissiveIntensity: 1.7,
      metalness: 0.65,
      roughness: 0.22
    }),
    player: new THREE.MeshStandardMaterial({
      color: 0xe8f8ff,
      metalness: 0.58,
      roughness: 0.28
    }),
    playerAccent: new THREE.MeshStandardMaterial({
      color: 0x56ffe1,
      emissive: 0x0ba996,
      emissiveIntensity: 1.9,
      metalness: 0.45,
      roughness: 0.24
    }),
    particle: new THREE.MeshBasicMaterial({
      color: 0x62ffe3,
      transparent: true,
      opacity: 0.85
    })
  };

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: GameCallbacks,
    settings: Settings
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.settings = settings;
    this.audio = new AudioEngine(settings);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupScene();
    this.createRunner();
    this.createParticlePool();
    this.resize();
    this.setMenu();
    this.timer.connect(document);
    this.timer.update();
    this.loop();
  }

  private createPlayerState(): PlayerState {
    return {
      x: 0,
      y: 0,
      z: 3,
      velocityX: 0,
      velocityY: 0,
      grounded: true,
      sliding: false,
      wallrunning: false,
      wallSide: 0,
      slideTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      wallrunTimer: 0,
      slowTimer: 0,
      invulnerability: 0,
      lastAction: null,
      lastActionAt: -100
    };
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x060a16);
    this.scene.fog = new THREE.FogExp2(0x07101e, 0.012);

    const hemisphere = new THREE.HemisphereLight(0x8ddfff, 0x080b14, 1.6);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xe7f7ff, 3.2);
    keyLight.position.set(-8, 15, -6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -4;
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x25f5d0, 30, 38, 2);
    rimLight.position.set(7, 5, 8);
    this.scene.add(rimLight);

    const starsGeometry = new THREE.BufferGeometry();
    const stars = new Float32Array(540);
    const random = new SeededRandom(510_728);
    for (let index = 0; index < stars.length; index += 3) {
      stars[index] = random.range(-85, 85);
      stars[index + 1] = random.range(8, 65);
      stars[index + 2] = random.range(-80, 430);
    }
    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(stars, 3)
    );
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xa9c8ff,
      size: 0.18,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    starField.name = "star-field";
    this.scene.add(starField);
  }

  private createRunner(): void {
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.48, 0.72, 5, 12),
      this.materials.player
    );
    torso.position.y = 1.28;
    torso.castShadow = true;
    this.playerBody.add(torso);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.23, 0),
      this.materials.playerAccent
    );
    core.position.set(0, 1.36, -0.42);
    core.rotation.z = Math.PI / 4;
    this.playerBody.add(core);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 12),
      this.materials.player
    );
    head.scale.set(1, 0.82, 0.95);
    head.position.y = 2.08;
    head.castShadow = true;
    this.playerBody.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.13, 0.08),
      this.materials.playerAccent
    );
    visor.position.set(0, 2.1, 0.31);
    this.playerBody.add(visor);

    const limbGeometry = new THREE.CapsuleGeometry(0.11, 0.55, 3, 8);
    const limbPositions: Array<[number, number, number]> = [
      [-0.48, 1.35, 0],
      [0.48, 1.35, 0],
      [-0.25, 0.5, 0],
      [0.25, 0.5, 0]
    ];
    for (const [x, y, z] of limbPositions) {
      const limb = new THREE.Mesh(limbGeometry, this.materials.player);
      limb.position.set(x, y, z);
      limb.castShadow = true;
      this.playerBody.add(limb);
      this.runnerLimbs.push(limb);
    }

    const wake = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.8, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x4effe0,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, 1.2, -1.25);
    this.playerBody.add(wake);

    this.playerRoot.add(this.playerBody);
    this.scene.add(this.playerRoot);
  }

  private createParticlePool(): void {
    const geometry = new THREE.TetrahedronGeometry(0.08, 0);
    for (let index = 0; index < 72; index += 1) {
      const mesh = new THREE.Mesh(geometry, this.materials.particle.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1
      });
    }
  }

  setMenu(): void {
    this.phase = "menu";
    this.input.left = false;
    this.input.right = false;
    this.run = { ...EMPTY_RUN };
    this.player = this.createPlayerState();
    this.clearSegments();
    this.nextSegmentIndex = 0;
    for (let index = 0; index < 8; index += 1) {
      this.addSegment("normal", 927_441);
    }
    this.playerRoot.visible = true;
  }

  async start(
    difficulty: Difficulty,
    displayName: string,
    seed = Date.now() >>> 0
  ): Promise<void> {
    await this.audio.unlock();
    const config = DIFFICULTIES[difficulty];
    this.phase = "playing";
    this.player = this.createPlayerState();
    this.run = {
      ...EMPTY_RUN,
      difficulty,
      name: displayName,
      seed,
      health: config.health,
      maxHealth: config.health
    };
    this.clearSegments();
    this.nextSegmentIndex = 0;
    for (let index = 0; index < 9; index += 1) {
      this.addSegment(difficulty, seed);
    }
    this.playerRoot.visible = true;
    this.cameraImpact = 0;
    this.timer.reset();
    this.emitStats(true);
  }

  pause(): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "paused";
    this.input.left = false;
    this.input.right = false;
    this.callbacks.onPauseChange(true);
  }

  async resume(): Promise<void> {
    if (this.phase !== "paused") {
      return;
    }
    await this.audio.unlock();
    this.timer.reset();
    this.phase = "playing";
    this.callbacks.onPauseChange(false);
  }

  togglePause(): void {
    if (this.phase === "playing") {
      this.pause();
    } else if (this.phase === "paused") {
      void this.resume();
    }
  }

  setInput(direction: "left" | "right", active: boolean): void {
    this.input[direction] = active;
  }

  action(action: ActionName): boolean {
    if (this.phase !== "playing") {
      return false;
    }
    const state = {
      grounded: this.player.grounded,
      sliding: this.player.sliding,
      wallrunning: this.player.wallrunning,
      dodgeCooldown: this.player.dodgeCooldown,
      dashCooldown: this.player.dashCooldown
    };

    if (action === "jump" && canStartAction("jump", state)) {
      if (this.player.wallrunning) {
        this.player.velocityX = -this.player.wallSide * 6.5;
        this.player.wallrunning = false;
        this.player.wallSide = 0;
      }
      this.player.sliding = false;
      this.player.slideTimer = 0;
      this.player.velocityY = 8.2;
      this.player.grounded = false;
      this.registerAction("jump");
      this.audio.play("jump");
      return true;
    }

    if (action === "slide" && canStartAction("slide", state)) {
      this.player.slideTimer = 0.82;
      this.player.sliding = true;
      this.registerAction("slide");
      this.audio.play("slide");
      return true;
    }

    if (
      (action === "dodgeLeft" || action === "dodgeRight") &&
      canStartAction("dodge", state)
    ) {
      const direction = screenDirectionToWorldX(
        action === "dodgeLeft" ? "left" : "right"
      );
      this.player.velocityX = direction * 18;
      this.player.dodgeTimer = 0.26;
      this.player.dodgeCooldown = 1.05;
      this.registerAction(action);
      this.audio.play("dodge");
      return true;
    }

    if (action === "dash" && canStartAction("dash", state)) {
      this.player.dashTimer = 0.52;
      this.player.dashCooldown = 2.45;
      this.cameraImpact = Math.max(this.cameraImpact, 0.45);
      this.registerAction("dash");
      this.spawnBurst(
        this.player.x,
        this.player.y + 1,
        this.player.z - 0.5,
        14,
        0x62ffe3
      );
      this.audio.play("dash");
      return true;
    }

    return false;
  }

  private registerAction(action: ActionName): void {
    this.player.lastAction = action;
    this.player.lastActionAt = this.run.elapsed;
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.audio.applySettings(settings);
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getSnapshot(): RunStats & {
    phase: GamePhase;
    playerX: number;
    playerY: number;
    playerZ: number;
    segmentCount: number;
  } {
    return {
      ...this.getStats(),
      phase: this.phase,
      playerX: this.player.x,
      playerY: this.player.y,
      playerZ: this.player.z,
      segmentCount: this.segments.length
    };
  }

  debugEndRun(): void {
    if (this.phase === "playing") {
      this.finishRun("TEST TERMINATION");
    }
  }

  private loop = (timestamp?: number): void => {
    if (this.disposed) {
      return;
    }
    this.timer.update(timestamp);
    const frameDelta = Math.min(this.timer.getDelta(), 0.1);
    if (this.phase === "playing") {
      const steps = Math.max(1, Math.ceil(frameDelta / (1 / 60)));
      const dt = frameDelta / steps;
      for (let index = 0; index < steps; index += 1) {
        if (this.phase !== "playing") {
          break;
        }
        this.simulate(dt);
      }
    } else if (this.phase === "menu") {
      this.updateMenu(frameDelta);
    }
    this.updateVisuals(frameDelta);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private simulate(dt: number): void {
    const config = DIFFICULTIES[this.run.difficulty];
    this.run.elapsed += dt;
    this.player.slideTimer = Math.max(0, this.player.slideTimer - dt);
    this.player.dashTimer = Math.max(0, this.player.dashTimer - dt);
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
    this.player.dodgeTimer = Math.max(0, this.player.dodgeTimer - dt);
    this.player.dodgeCooldown = Math.max(0, this.player.dodgeCooldown - dt);
    this.player.slowTimer = Math.max(0, this.player.slowTimer - dt);
    this.player.invulnerability = Math.max(
      0,
      this.player.invulnerability - dt
    );
    this.cameraImpact = Math.max(0, this.cameraImpact - dt * 1.9);
    this.player.sliding = this.player.slideTimer > 0;

    const horizontalInput = lateralInputToWorldAxis(
      this.input.left,
      this.input.right
    );
    const targetLateralSpeed =
      this.player.dodgeTimer > 0
        ? this.player.velocityX
        : horizontalInput * 9.5;
    this.player.velocityX = damp(
      this.player.velocityX,
      targetLateralSpeed,
      horizontalInput === 0 ? 7.5 : 11,
      dt
    );
    this.player.x += this.player.velocityX * dt;
    const sideLimit = COURSE_HALF_WIDTH - 0.62;
    if (Math.abs(this.player.x) > sideLimit) {
      this.player.x = THREE.MathUtils.clamp(
        this.player.x,
        -sideLimit,
        sideLimit
      );
      this.player.velocityX *= -0.2;
    }

    const previousZ = this.player.z;
    const speed = calculateForwardSpeed(
      this.run.elapsed,
      config.startSpeed,
      config.maxSpeed,
      config.acceleration,
      this.player.slowTimer,
      this.player.dashTimer
    );
    this.player.z += speed * dt;
    this.run.distance = Math.max(this.run.distance, this.player.z - 3);
    this.run.score +=
      speed * dt * (1.05 + this.run.multiplier * 0.18) * config.scoreScale;
    this.run.score +=
      dt *
      config.scoreScale *
      (6 + (this.run.cleanRun ? 4 * this.run.multiplier : 0));

    this.updateGapPhysics(dt);
    if (this.phase !== "playing") {
      return;
    }
    this.updateHazards(previousZ);
    this.updateCollectibles();
    this.updateSegments();
    this.updateParticles(dt);
    this.updateMultiplier(dt);

    this.speedTrailTimer -= dt;
    if (
      this.speedTrailTimer <= 0 &&
      (!this.settings.reducedMotion || this.player.dashTimer > 0)
    ) {
      this.speedTrailTimer = this.player.dashTimer > 0 ? 0.025 : 0.085;
      this.spawnTrail();
    }

    this.audio.update(
      THREE.MathUtils.clamp(speed / config.maxSpeed, 0, 1),
      true
    );
    this.updatePrompt();
    this.emitStats();
  }

  private updateGapPhysics(dt: number): void {
    const gapContext = this.findCurrentGap();
    const gap = gapContext?.gap ?? null;
    const towardWall =
      (this.input.left && this.player.x > 4.2) ||
      (this.input.right && this.player.x < -4.2);
    const wallSide: -1 | 1 =
      gap?.kind === "wallrun"
        ? (gap.wallSide ?? 1)
        : this.player.wallSide === -1
          ? -1
          : 1;
    const atMarkedWall =
      gap?.kind === "wallrun" &&
      Math.sign(this.player.x || wallSide) === wallSide &&
      Math.abs(this.player.x) > 4.15;

    if (
      atMarkedWall &&
      canAttachWallrun({
        gapKind: gap?.kind ?? null,
        markedSide: wallSide,
        playerX: this.player.x,
        grounded: this.player.grounded,
        holdingLeft: this.input.left,
        holdingRight: this.input.right,
        wallrunTimer: this.player.wallrunTimer
      })
    ) {
      this.player.wallrunning = true;
      this.player.wallSide = wallSide;
      this.player.wallrunTimer = 1.55;
      this.player.velocityY = 0;
      this.registerAction("wallrun");
      this.callbacks.onMessage("WALL CONTACT", "good");
      this.audio.play("combo");
    }

    if (this.player.wallrunning) {
      this.player.wallrunTimer -= dt;
      this.player.y = Math.max(this.player.y, 1.15);
      this.player.velocityY = -0.35;
      this.player.x = damp(
        this.player.x,
        this.player.wallSide * 5.35,
        15,
        dt
      );
      if (
        this.player.wallrunTimer <= 0 ||
        gap?.kind !== "wallrun" ||
        !towardWall
      ) {
        this.player.wallrunning = false;
        this.player.wallSide = 0;
      }
    } else {
      this.player.velocityY -= 18.5 * dt;
      this.player.y += this.player.velocityY * dt;
    }

    const platformSupport =
      gap?.kind === "movingPlatform" &&
      gapContext !== null &&
      gapContext.segment.platforms.some(
        (platform) =>
          this.player.z >= platform.worldStart &&
          this.player.z <= platform.worldEnd &&
          Math.abs(this.player.x - platform.mesh.position.x) <
            platform.width / 2 - PLAYER_HALF_WIDTH * 0.5
      );
    const hasFloor = gap === null || platformSupport;
    if (hasFloor && this.player.y <= 0) {
      if (!this.player.grounded && missedLanding(this.player.y)) {
        this.run.result = "MISSED THE LANDING";
        this.finishRun(this.run.result);
        return;
      }
      if (!this.player.grounded && this.player.velocityY < -2) {
        this.audio.play("land");
        this.cameraImpact = Math.max(this.cameraImpact, 0.16);
        this.spawnBurst(
          this.player.x,
          0.08,
          this.player.z,
          8,
          0x62ffe3
        );
      }
      this.player.y = 0;
      this.player.velocityY = 0;
      this.player.grounded = true;
      this.player.wallrunning = false;
      this.player.wallSide = 0;
    } else {
      this.player.grounded = false;
    }

    if (this.player.y < -8) {
      this.run.result =
        gap?.kind === "wallrun" ? "LOST WALL CONTACT" : "FELL INTO THE RIFT";
      this.finishRun(this.run.result);
    }
  }

  private findCurrentGap(): {
    gap: CoursePlan["gaps"][number];
    segment: RuntimeSegment;
  } | null {
    for (const segment of this.segments) {
      for (const gap of segment.plan.gaps) {
        const start = segment.plan.startZ + gap.startZ;
        const end = segment.plan.startZ + gap.endZ;
        if (this.player.z >= start && this.player.z <= end) {
          return { gap, segment };
        }
      }
    }
    return null;
  }

  private updateHazards(previousZ: number): void {
    const config = DIFFICULTIES[this.run.difficulty];
    const playerHeight = this.player.sliding
      ? PLAYER_SLIDE_HEIGHT
      : PLAYER_HEIGHT;

    for (const segment of this.segments) {
      for (const hazard of segment.hazards) {
        if (hazard.passed) {
          continue;
        }
        const definition = hazard.definition;
        const distance = hazard.worldZ - this.player.z;
        hazard.currentX = definition.x;
        hazard.currentY = definition.y;
        hazard.currentWidth = definition.width;
        hazard.currentDepth = definition.depth;

        if (definition.motion?.axis === "x") {
          hazard.currentX =
            definition.x +
            Math.sin(
              this.run.elapsed * definition.motion.speed +
                definition.motion.phase
            ) *
              definition.motion.amplitude;
          hazard.root.position.x = hazard.currentX;
        }

        if (definition.kind === "spinner" && definition.motion) {
          const angle =
            this.run.elapsed * definition.motion.speed +
            definition.motion.phase;
          hazard.visual.rotation.y = angle;
          hazard.currentWidth =
            Math.abs(Math.cos(angle)) * definition.width + 0.65;
          hazard.currentDepth =
            Math.abs(Math.sin(angle)) * definition.width + 0.65;
        }

        if (definition.kind === "falling") {
          const fallProgress = THREE.MathUtils.clamp(
            1 - (distance - 3) / Math.max(10, definition.warningDistance),
            0,
            1
          );
          hazard.currentY =
            6 - THREE.MathUtils.smoothstep(fallProgress, 0.12, 0.82) * 4.8;
          hazard.root.position.y = hazard.currentY - definition.y;
        }

        if (definition.kind === "dashGate") {
          const closeProgress = THREE.MathUtils.clamp(
            1 - distance / definition.warningDistance,
            0,
            1
          );
          const panelOffset =
            this.player.dashTimer > 0 && Math.abs(distance) < 6
              ? 5.5
              : THREE.MathUtils.lerp(5.6, 2.85, closeProgress);
          const leftPanel = hazard.visual.children[0];
          const rightPanel = hazard.visual.children[1];
          if (leftPanel && rightPanel) {
            leftPanel.position.x = -panelOffset;
            rightPanel.position.x = panelOffset;
          }
        }

        if (hazard.hit) {
          continue;
        }

        const bounds: BoxBounds = {
          minX: hazard.currentX - hazard.currentWidth / 2,
          maxX: hazard.currentX + hazard.currentWidth / 2,
          minY: hazard.currentY - definition.height / 2,
          maxY: hazard.currentY + definition.height / 2,
          minZ: hazard.worldZ - hazard.currentDepth / 2,
          maxZ: hazard.worldZ + hazard.currentDepth / 2
        };
        const isDashingGate =
          definition.kind === "dashGate" && this.player.dashTimer > 0;
        const collision =
          !isDashingGate &&
          sweptPlayerIntersects(
            {
              previousZ,
              nextZ: this.player.z,
              x: this.player.x,
              bottomY: this.player.y,
              halfWidth: PLAYER_HALF_WIDTH,
              height: playerHeight,
              halfDepth: 0.42
            },
            bounds
          );

        if (collision) {
          this.hitHazard(hazard);
          if (this.phase !== "playing") {
            return;
          }
        }

        if (this.player.z > bounds.maxZ + 0.45) {
          hazard.passed = true;
          if (!hazard.hit) {
            this.run.obstaclesAvoided += 1;
            const actionSucceeded = this.actionMatches(definition.action);
            const lateralDistance = Math.max(
              0,
              Math.abs(this.player.x - hazard.currentX) -
                hazard.currentWidth / 2
            );
            const verticalClearance =
              this.player.y > bounds.maxY
                ? this.player.y - bounds.maxY
                : bounds.minY - (this.player.y + playerHeight);
            const nearMiss =
              !actionSucceeded &&
              (lateralDistance < 0.65 ||
                (verticalClearance >= 0 && verticalClearance < 0.48));
            const riskBonus = definition.risky ? 1.5 : 1;
            this.run.score +=
              105 * this.run.multiplier * config.scoreScale * riskBonus;
            this.registerSuccess(
              actionSucceeded ? ACTION_PROMPTS[definition.action] : "CLEAR",
              nearMiss ? 0.34 : actionSucceeded ? 0.2 : 0.08,
              nearMiss
            );
          }
        }
      }
    }
  }

  private actionMatches(action: HazardDefinition["action"]): boolean {
    if (action === "route") {
      return true;
    }
    if (action === "jump") {
      return this.player.y > 0.55;
    }
    if (action === "slide") {
      return this.player.sliding;
    }
    if (action === "dash") {
      return this.player.dashTimer > 0;
    }
    if (action === "wallrun") {
      return this.player.wallrunning;
    }
    return (
      this.player.lastAction === action &&
      this.run.elapsed - this.player.lastActionAt <
        DIFFICULTIES[this.run.difficulty].actionWindow
    );
  }

  private hitHazard(hazard: RuntimeHazard): void {
    if (this.player.invulnerability > 0) {
      return;
    }
    hazard.hit = true;
    hazard.root.visible = false;
    this.run.health -= 1;
    this.run.cleanRun = false;
    this.run.multiplier = 1;
    this.run.lastSuccessAt = this.run.elapsed;
    this.player.slowTimer = 1.2;
    this.player.invulnerability = 1.15;
    this.player.velocityX =
      (this.player.x >= hazard.currentX ? 1 : -1) * 6.5;
    this.cameraImpact = this.settings.reducedMotion ? 0.18 : 0.8;
    this.spawnBurst(
      this.player.x,
      this.player.y + 0.9,
      this.player.z,
      22,
      0xff4d68
    );
    this.callbacks.onMessage(
      `${hazard.definition.kind.toUpperCase()} IMPACT`,
      "warn"
    );
    this.audio.play("damage");
    if (this.run.health <= 0) {
      this.run.result = `${hazard.definition.kind
        .replace(/([A-Z])/g, " $1")
        .toUpperCase()} IMPACT`;
      this.finishRun(this.run.result);
    }
  }

  private updateCollectibles(): void {
    for (const segment of this.segments) {
      for (const collectible of segment.collectibles) {
        if (collectible.collected) {
          continue;
        }
        collectible.mesh.rotation.y += 0.055;
        collectible.mesh.rotation.x += 0.018;
        const distanceZ = Math.abs(collectible.worldZ - this.player.z);
        const distanceX = Math.abs(collectible.x - this.player.x);
        const distanceY = Math.abs(
          collectible.y - (this.player.y + 1.05)
        );
        if (distanceZ < 0.85 && distanceX < 0.8 && distanceY < 1.2) {
          collectible.collected = true;
          collectible.mesh.visible = false;
          this.run.collectibles += 1;
          this.run.score +=
            (collectible.risky ? 220 : 140) * this.run.multiplier;
          this.registerSuccess(
            collectible.risky ? "RISK SHARD" : "SOL SHARD",
            collectible.risky ? 0.16 : 0.07
          );
          this.spawnBurst(
            collectible.x,
            collectible.y,
            collectible.worldZ,
            6,
            0xffd56b
          );
          this.audio.play("collect");
        } else if (this.player.z > collectible.worldZ + 2) {
          collectible.collected = true;
        }
      }
    }
  }

  private registerSuccess(
    label: string,
    multiplierGain: number,
    nearMiss = false
  ): void {
    if (
      multiplierGain >= 0.16 &&
      this.run.elapsed - this.run.lastSuccessAt < 2.2
    ) {
      this.run.score += 160 * this.run.multiplier;
    }
    this.run.multiplier = Math.min(8, this.run.multiplier + multiplierGain);
    this.run.bestMultiplier = Math.max(
      this.run.bestMultiplier,
      this.run.multiplier
    );
    this.run.lastSuccessAt = this.run.elapsed;
    if (nearMiss) {
      this.cameraImpact = Math.max(this.cameraImpact, 0.28);
      this.callbacks.onMessage("NEAR MISS", "good");
    } else if (multiplierGain >= 0.16) {
      this.callbacks.onMessage(`${label} LINKED`, "good");
    }
    if (Math.floor(this.run.multiplier) > Math.floor(this.run.multiplier - multiplierGain)) {
      this.audio.play("combo");
    }
  }

  private updateMultiplier(dt: number): void {
    const idleTime = this.run.elapsed - this.run.lastSuccessAt;
    if (idleTime > 6.5 && this.run.multiplier > 1) {
      this.run.multiplier = Math.max(1, this.run.multiplier - dt * 0.13);
    }
  }

  private updatePrompt(): void {
    let nearestDistance = Number.POSITIVE_INFINITY;
    let prompt = "";
    for (const segment of this.segments) {
      for (const hazard of segment.hazards) {
        if (hazard.passed || hazard.hit) {
          continue;
        }
        const distance = hazard.worldZ - this.player.z;
        if (
          distance > 0 &&
          distance < nearestDistance &&
          distance <= hazard.definition.warningDistance
        ) {
          nearestDistance = distance;
          prompt = `${ACTION_PROMPTS[hazard.definition.action]} // ${Math.ceil(
            distance
          )}m`;
        }
      }
      for (const gap of segment.plan.gaps) {
        const distance = segment.plan.startZ + gap.startZ - this.player.z;
        if (
          distance > 0 &&
          distance < nearestDistance &&
          distance <= DIFFICULTIES[this.run.difficulty].warningDistance
        ) {
          nearestDistance = distance;
          prompt =
            gap.kind === "wallrun"
              ? `WALL-RUN ${gap.wallSide === 1 ? "LEFT" : "RIGHT"} // ${Math.ceil(distance)}m`
              : `JUMP // ${Math.ceil(distance)}m`;
        }
      }
    }
    this.currentPrompt = prompt;
  }

  private currentPrompt = "";

  private updateSegments(): void {
    while (
      this.nextSegmentIndex * SEGMENT_LENGTH <
      this.player.z + SEGMENT_LENGTH * 8
    ) {
      this.addSegment(this.run.difficulty, this.run.seed);
    }
    while (
      this.segments.length > 0 &&
      (this.segments[0]?.plan.startZ ?? 0) + SEGMENT_LENGTH <
        this.player.z - SEGMENT_LENGTH * 2
    ) {
      const segment = this.segments.shift();
      if (segment) {
        this.removeSegment(segment);
      }
    }
  }

  private addSegment(difficulty: Difficulty, seed: number): void {
    const plan = generateCoursePlan(this.nextSegmentIndex, difficulty, seed);
    const errors = validateCoursePlan(plan);
    if (errors.length > 0) {
      throw new Error(`Invalid generated sector: ${errors.join(" ")}`);
    }
    const runtime = this.buildSegment(plan);
    this.segments.push(runtime);
    this.scene.add(runtime.group);
    this.nextSegmentIndex += 1;
  }

  private buildSegment(plan: CoursePlan): RuntimeSegment {
    const group = new THREE.Group();
    group.position.z = plan.startZ;
    group.name = `sector-${plan.index}-${plan.pattern}`;
    const random = new SeededRandom(plan.seed);
    const platforms = this.buildFloor(plan, group);
    this.buildEnvironment(plan, group, random);
    const hazards = plan.hazards.map((definition) =>
      this.buildHazard(plan, group, definition)
    );
    const collectibleGeometry = new THREE.OctahedronGeometry(0.34, 0);
    const collectibles = plan.collectibles.map((definition, index) => {
      const mesh = new THREE.Mesh(
        collectibleGeometry,
        this.materials.collectible
      );
      mesh.position.set(definition.x, definition.y, definition.localZ);
      mesh.rotation.z = Math.PI / 4;
      mesh.castShadow = true;
      mesh.name = `sol-shard-${plan.index}-${index}`;
      group.add(mesh);
      return {
        mesh,
        worldZ: plan.startZ + definition.localZ,
        x: definition.x,
        y: definition.y,
        risky: Boolean(definition.risky),
        collected: false
      };
    });

    return { plan, group, hazards, collectibles, platforms };
  }

  private buildFloor(
    plan: CoursePlan,
    group: THREE.Group
  ): RuntimePlatform[] {
    const platforms: RuntimePlatform[] = [];
    const sortedGaps = [...plan.gaps].sort(
      (left, right) => left.startZ - right.startZ
    );
    let cursor = 0;
    const floorRanges: Array<[number, number]> = [];
    for (const gap of sortedGaps) {
      if (gap.startZ > cursor) {
        floorRanges.push([cursor, gap.startZ]);
      }
      cursor = Math.max(cursor, gap.endZ);
    }
    if (cursor < plan.length) {
      floorRanges.push([cursor, plan.length]);
    }

    for (const [start, end] of floorRanges) {
      const length = end - start;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(13, 0.42, length),
        this.materials.floor
      );
      slab.position.set(0, -0.24, (start + end) / 2);
      slab.receiveShadow = true;
      group.add(slab);

      const centerLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.025, Math.max(0.1, length - 0.5)),
        this.materials.floorAccent
      );
      centerLine.position.set(0, 0.015, (start + end) / 2);
      group.add(centerLine);
    }

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.12, plan.length),
        this.materials.floorAccent
      );
      edge.position.set(side * 6.42, 0.04, plan.length / 2);
      group.add(edge);
    }

    for (let z = 4; z < plan.length; z += 4) {
      if (
        plan.gaps.some((gap) => z >= gap.startZ && z <= gap.endZ)
      ) {
        continue;
      }
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(12.4, 0.015, 0.045),
        this.materials.structure
      );
      seam.position.set(0, 0.012, z);
      group.add(seam);
    }

    for (const gap of plan.gaps) {
      const warningLength = 4.5;
      const warning = new THREE.Mesh(
        new THREE.BoxGeometry(9.5, 0.03, warningLength),
        this.materials.cue
      );
      warning.position.set(0, 0.035, gap.startZ - warningLength / 2);
      group.add(warning);

      if (gap.kind === "wallrun") {
        const side = gap.wallSide ?? 1;
        const length = gap.endZ - gap.startZ;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 5.2, length),
          this.materials.structure
        );
        wall.position.set(side * 6.15, 2.5, (gap.startZ + gap.endZ) / 2);
        wall.castShadow = true;
        group.add(wall);
        for (let stripeZ = gap.startZ + 1; stripeZ < gap.endZ; stripeZ += 3) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 1.8, 0.42),
            this.materials.wallrun
          );
          stripe.position.set(side * 5.96, 2.15, stripeZ);
          group.add(stripe);
        }
      }

      if (gap.kind === "collapse") {
        for (let tileZ = gap.startZ; tileZ < gap.endZ; tileZ += 1.8) {
          const tile = new THREE.Mesh(
            new THREE.BoxGeometry(2.7, 0.16, 1.55),
            this.materials.hazard
          );
          tile.position.set(
            ((Math.floor(tileZ * 10) % 3) - 1) * 3.1,
            -0.08,
            tileZ + 0.7
          );
          tile.rotation.y = (tileZ % 2) * 0.05;
          tile.name = "collapse-tile";
          tile.userData.collapseStart = plan.startZ + gap.startZ;
          tile.userData.baseY = tile.position.y;
          tile.userData.fallOffset = Math.abs(tile.position.x) * 0.018;
          group.add(tile);
        }
      }

      if (gap.kind === "movingPlatform") {
        const platformLength = 7.7;
        const basePhase = plan.seed * 0.0001;
        let platformIndex = 0;
        for (
          let platformStart = gap.startZ;
          platformStart < gap.endZ;
          platformStart += 8.3
        ) {
          const platform = new THREE.Mesh(
            new THREE.BoxGeometry(6, 0.45, platformLength),
            this.materials.floor
          );
          const phase = basePhase + platformIndex * 0.55;
          const baseX = plan.safeRouteX * 0.42 + Math.sin(phase) * 0.3;
          platform.position.set(
            baseX,
            -0.2,
            platformStart + platformLength / 2
          );
          platform.castShadow = true;
          platform.receiveShadow = true;
          platform.name = "moving-platform";
          group.add(platform);

          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(4.8, 0.08, platformLength - 0.6),
            this.materials.wallrun
          );
          rail.position.y = 0.25;
          platform.add(rail);
          platforms.push({
            mesh: platform,
            worldStart: plan.startZ + platformStart,
            worldEnd:
              plan.startZ +
              Math.min(gap.endZ, platformStart + platformLength),
            width: 6,
            baseX,
            phase
          });
          platformIndex += 1;
        }
      }
    }
    return platforms;
  }

  private buildEnvironment(
    plan: CoursePlan,
    group: THREE.Group,
    random: SeededRandom
  ): void {
    const intensity = plan.intensity;
    const supportSpacing =
      plan.environment === "tunnel" ? 7 : plan.environment === "rooftop" ? 11 : 9;

    for (let z = 3; z < plan.length; z += supportSpacing) {
      for (const side of [-1, 1]) {
        const height = random.range(2.8, 7.5) + intensity * 2;
        const column = new THREE.Mesh(
          new THREE.BoxGeometry(
            random.range(0.5, 1.15),
            height,
            random.range(0.6, 1.4)
          ),
          this.materials.structure
        );
        column.position.set(
          side * random.range(7.4, 10.5),
          height / 2 - 0.2,
          z + random.range(-1.2, 1.2)
        );
        column.castShadow = true;
        group.add(column);

        const light = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, random.range(0.7, 2.2), 0.14),
          this.materials.floorAccent
        );
        light.position.set(
          column.position.x - side * 0.36,
          random.range(1.1, height - 0.4),
          column.position.z
        );
        group.add(light);
      }
    }

    if (plan.environment === "tunnel") {
      for (let z = 4; z < plan.length; z += 8) {
        const arch = new THREE.Mesh(
          new THREE.TorusGeometry(7.2, 0.2, 6, 20, Math.PI),
          this.materials.structure
        );
        arch.rotation.z = Math.PI;
        arch.rotation.y = Math.PI / 2;
        arch.position.set(0, 0.1, z);
        group.add(arch);
      }
    } else if (plan.environment === "reactor") {
      const reactor = new THREE.Mesh(
        new THREE.TorusKnotGeometry(2.4, 0.18, 64, 8, 2, 3),
        this.materials.wallrun
      );
      reactor.position.set(
        random.next() > 0.5 ? -10 : 10,
        5,
        plan.length / 2
      );
      reactor.scale.setScalar(1.3);
      reactor.name = "reactor-motion";
      group.add(reactor);
    } else if (plan.environment === "rooftop") {
      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(8, random.range(12, 25), 11),
          this.materials.structureDark
        );
        tower.position.set(
          side * random.range(16, 23),
          tower.geometry.parameters.height / 2 - 3,
          random.range(10, 34)
        );
        group.add(tower);
      }
    } else if (plan.environment === "suspended") {
      for (let z = 5; z < plan.length; z += 10) {
        const cable = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 18, 5),
          this.materials.floorAccent
        );
        cable.rotation.z = Math.PI / 2;
        cable.position.set(0, 7.5, z);
        group.add(cable);
      }
    } else {
      for (let z = 6; z < plan.length; z += 12) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 16, 8),
          this.materials.structure
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(0, 5.5, z);
        group.add(pipe);
      }
    }
  }

  private buildHazard(
    plan: CoursePlan,
    segmentGroup: THREE.Group,
    definition: HazardDefinition
  ): RuntimeHazard {
    const root = new THREE.Group();
    root.position.set(definition.x, 0, definition.localZ);
    root.name = `hazard-${definition.id}`;
    const visual = new THREE.Group();
    root.add(visual);

    const addBox = (
      width: number,
      height: number,
      depth: number,
      x = 0,
      y = definition.y,
      material: THREE.Material = this.materials.hazard
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
      );
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      visual.add(mesh);
      return mesh;
    };

    switch (definition.kind) {
      case "barrier":
        addBox(definition.width, definition.height, definition.depth);
        for (let x = -5; x <= 5; x += 2) {
          const stripe = addBox(
            0.32,
            definition.height + 0.04,
            definition.depth + 0.03,
            x,
            definition.y,
            this.materials.cue
          );
          stripe.rotation.z = 0.35;
        }
        break;
      case "overhead":
        addBox(definition.width, definition.height, definition.depth);
        addBox(0.55, 4.4, definition.depth, -6.8, 2.1, this.materials.structure);
        addBox(0.55, 4.4, definition.depth, 6.8, 2.1, this.materials.structure);
        break;
      case "moving":
      case "routeBlock":
        addBox(
          definition.width,
          definition.height,
          definition.depth
        );
        for (let y = 0.3; y < definition.height; y += 0.65) {
          addBox(
            definition.width + 0.06,
            0.08,
            definition.depth + 0.04,
            0,
            y,
            this.materials.cue
          );
        }
        break;
      case "spinner": {
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.48, 0.48, 2.2, 12),
          this.materials.structure
        );
        hub.position.y = 1.1;
        visual.add(hub);
        addBox(
          definition.width,
          definition.height,
          definition.depth,
          0,
          definition.y
        );
        break;
      }
      case "dashGate": {
        const leftPanel = addBox(
          5.5,
          definition.height,
          definition.depth,
          -5.6,
          definition.y
        );
        const rightPanel = addBox(
          5.5,
          definition.height,
          definition.depth,
          5.6,
          definition.y
        );
        leftPanel.rotation.z = -0.04;
        rightPanel.rotation.z = 0.04;
        const header = addBox(
          12.8,
          0.38,
          1,
          0,
          3.55,
          this.materials.structure
        );
        header.name = "gate-header";
        break;
      }
      case "laserLow":
      case "laserHigh": {
        addBox(
          definition.width,
          definition.height,
          definition.depth,
          0,
          definition.y,
          this.materials.hazardBright
        );
        for (const x of [
          -definition.width / 2,
          definition.width / 2
        ]) {
          const emitter = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10),
            this.materials.structure
          );
          emitter.rotation.z = Math.PI / 2;
          emitter.position.set(x, definition.y, 0);
          visual.add(emitter);
        }
        break;
      }
      case "swinging": {
        const chain = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 6, 6),
          this.materials.structure
        );
        chain.position.y = 4.7;
        visual.add(chain);
        const weight = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.25, 0),
          this.materials.hazard
        );
        weight.position.y = definition.y;
        weight.castShadow = true;
        visual.add(weight);
        break;
      }
      case "falling": {
        const crate = addBox(
          definition.width,
          definition.height,
          definition.depth
        );
        crate.rotation.set(0.12, 0.22, 0.08);
        break;
      }
    }

    const cueLength = Math.min(7, definition.warningDistance * 0.24);
    const cue = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.min(3.2, Math.max(1, definition.width * 0.45)),
        0.025,
        cueLength
      ),
      this.materials.cue
    );
    cue.position.set(
      0,
      0.04,
      -definition.depth / 2 - cueLength / 2 - 0.5
    );
    root.add(cue);
    segmentGroup.add(root);

    return {
      definition,
      root,
      visual,
      worldZ: plan.startZ + definition.localZ,
      currentX: definition.x,
      currentY: definition.y,
      currentWidth: definition.width,
      currentDepth: definition.depth,
      passed: false,
      hit: false
    };
  }

  private updateMenu(dt: number): void {
    this.run.elapsed += dt;
    this.player.z += dt * 5.2;
    this.player.x = Math.sin(this.run.elapsed * 0.45) * 0.65;
    if (this.player.z > SEGMENT_LENGTH * 3.5) {
      this.player.z = 4;
    }
    this.audio.update(0.22, false);
  }

  private updateVisuals(dt: number): void {
    const time = this.run.elapsed;
    const runCycle = time * (this.phase === "playing" ? 12 : 5);
    const airborne = this.player.y > 0.08;
    const slideScale = this.player.sliding ? 0.46 : 1;
    this.playerBody.scale.y = damp(
      this.playerBody.scale.y,
      slideScale,
      18,
      dt
    );
    this.playerBody.position.y = this.player.sliding ? -0.05 : 0;
    this.playerBody.rotation.z = damp(
      this.playerBody.rotation.z,
      -this.player.velocityX * 0.035 +
        (this.player.wallrunning ? -this.player.wallSide * 0.42 : 0),
      10,
      dt
    );
    this.playerBody.rotation.x = damp(
      this.playerBody.rotation.x,
      this.player.dashTimer > 0 ? -0.3 : this.player.sliding ? 0.24 : 0,
      11,
      dt
    );
    this.runnerLimbs.forEach((limb, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const upper = index < 2;
      const swing = airborne
        ? side * 0.6
        : Math.sin(runCycle + (upper ? 0 : Math.PI)) * side * 0.72;
      limb.rotation.x = damp(limb.rotation.x, swing, 15, dt);
    });
    this.playerRoot.position.set(
      this.player.x,
      this.player.y,
      this.player.z
    );

    for (const segment of this.segments) {
      const reactor = segment.group.getObjectByName("reactor-motion");
      if (reactor) {
        reactor.rotation.x += dt * 0.21;
        reactor.rotation.y += dt * 0.34;
      }
      for (const platform of segment.platforms) {
        platform.mesh.position.x =
          platform.baseX + Math.sin(time * 0.82 + platform.phase) * 1.45;
      }
      for (const tile of segment.group.children.filter(
        (child) => child.name === "collapse-tile"
      )) {
        const collapseStart =
          typeof tile.userData.collapseStart === "number"
            ? tile.userData.collapseStart
            : Number.POSITIVE_INFINITY;
        const baseY =
          typeof tile.userData.baseY === "number" ? tile.userData.baseY : 0;
        const fallOffset =
          typeof tile.userData.fallOffset === "number"
            ? tile.userData.fallOffset
            : 0;
        const progress = THREE.MathUtils.clamp(
          1 - (collapseStart - this.player.z) / 11 - fallOffset,
          0,
          1
        );
        tile.position.y = baseY - progress * progress * 9;
        tile.rotation.x = progress * 0.7;
        tile.rotation.z = progress * (tile.position.x > 0 ? 0.4 : -0.4);
      }
    }

    const reduced = this.settings.reducedMotion;
    const shake =
      reduced || this.phase !== "playing"
        ? 0
        : Math.sin(time * 47) * this.cameraImpact * 0.11;
    const dashOffset = this.player.dashTimer > 0 ? 1.3 : 0;
    const desiredCameraX =
      this.player.x * (this.phase === "menu" ? 0.18 : 0.38) + shake;
    const desiredCameraY =
      (this.phase === "menu" ? 4.1 : 4.7) + this.player.y * 0.28 + shake;
    const desiredCameraZ =
      this.player.z - (this.phase === "menu" ? 10.5 : 9.2) - dashOffset;
    this.camera.position.x = damp(
      this.camera.position.x,
      desiredCameraX,
      reduced ? 16 : 7,
      dt
    );
    this.camera.position.y = damp(
      this.camera.position.y,
      desiredCameraY,
      reduced ? 16 : 7,
      dt
    );
    this.camera.position.z = damp(
      this.camera.position.z,
      desiredCameraZ,
      reduced ? 16 : 9,
      dt
    );
    const targetFov =
      62 + (this.player.dashTimer > 0 ? 8 : 0) + this.cameraImpact * 1.8;
    this.camera.fov = damp(this.camera.fov, targetFov, 8, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(
      this.player.x * 0.35,
      1.3 + this.player.y * 0.35,
      this.player.z + (this.phase === "menu" ? 13 : 16)
    );

    const starField = this.scene.getObjectByName("star-field");
    if (starField) {
      starField.position.z =
        Math.floor(this.player.z / 350) * 350;
    }
  }

  private spawnTrail(): void {
    const particle = this.particles.find((candidate) => candidate.life <= 0);
    if (!particle) {
      return;
    }
    particle.life = this.player.dashTimer > 0 ? 0.48 : 0.3;
    particle.maxLife = particle.life;
    particle.mesh.visible = true;
    particle.mesh.position.set(
      this.player.x + (Math.random() - 0.5) * 0.7,
      this.player.y + 0.4 + Math.random() * 1.2,
      this.player.z - 0.8
    );
    particle.velocity.set(
      -this.player.velocityX * 0.08,
      (Math.random() - 0.3) * 0.7,
      -5 - Math.random() * 4
    );
    particle.mesh.scale.setScalar(this.player.dashTimer > 0 ? 1.6 : 0.7);
  }

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: number
  ): void {
    let remaining = count;
    for (const particle of this.particles) {
      if (particle.life > 0) {
        continue;
      }
      particle.life = 0.35 + Math.random() * 0.45;
      particle.maxLife = particle.life;
      particle.mesh.visible = true;
      particle.mesh.position.set(x, y, z);
      particle.velocity.set(
        (Math.random() - 0.5) * 7,
        Math.random() * 5,
        (Math.random() - 0.5) * 7
      );
      (
        particle.mesh.material as THREE.MeshBasicMaterial
      ).color.setHex(color);
      particle.mesh.scale.setScalar(0.65 + Math.random());
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      if (particle.life <= 0) {
        continue;
      }
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.mesh.visible = false;
        continue;
      }
      particle.velocity.y -= 5 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      const scale = Math.max(0.01, particle.life / particle.maxLife);
      particle.mesh.scale.multiplyScalar(Math.pow(scale, dt * 1.6));
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = scale * 0.86;
    }
  }

  private getStats(): RunStats {
    const config = DIFFICULTIES[this.run.difficulty];
    return {
      score: Math.floor(this.run.score),
      distance: this.run.distance,
      survivalSeconds: this.run.elapsed,
      multiplier: this.run.multiplier,
      bestMultiplier: this.run.bestMultiplier,
      obstaclesAvoided: this.run.obstaclesAvoided,
      collectibles: this.run.collectibles,
      health: this.run.health,
      maxHealth: this.run.maxHealth,
      cleanRun: this.run.cleanRun,
      speed: calculateForwardSpeed(
        this.run.elapsed,
        config.startSpeed,
        config.maxSpeed,
        config.acceleration,
        this.player.slowTimer,
        this.player.dashTimer
      ),
      dashCooldown: this.player.dashCooldown,
      dodgeCooldown: this.player.dodgeCooldown,
      actionPrompt: this.currentPrompt,
      activeAction: this.player.wallrunning
        ? "wallrun"
        : this.player.dashTimer > 0
          ? "dash"
          : this.player.dodgeTimer > 0
            ? "dodge"
            : this.player.sliding
              ? "slide"
              : this.player.y > 0.08
                ? "jump"
                : "run"
    };
  }

  private emitStats(force = false): void {
    if (!force && this.run.elapsed - this.lastRenderedStats < 1 / 20) {
      return;
    }
    this.lastRenderedStats = this.run.elapsed;
    this.callbacks.onStats(this.getStats());
  }

  private finishRun(result: string): void {
    if (this.phase !== "playing") {
      return;
    }
    this.phase = "gameover";
    this.input.left = false;
    this.input.right = false;
    this.run.result = result;
    this.audio.play("fail");
    const record: RunRecord = {
      id: `${Date.now()}-${this.run.seed.toString(16)}`,
      name: this.run.name,
      difficulty: this.run.difficulty,
      score: Math.floor(this.run.score),
      distance: Number(this.run.distance.toFixed(1)),
      survivalSeconds: Number(this.run.elapsed.toFixed(1)),
      bestMultiplier: Number(this.run.bestMultiplier.toFixed(2)),
      obstaclesAvoided: this.run.obstaclesAvoided,
      collectibles: this.run.collectibles,
      cleanRun: this.run.cleanRun,
      result,
      createdAt: new Date().toISOString()
    };
    this.callbacks.onGameOver(record);
  }

  private clearSegments(): void {
    for (const segment of this.segments) {
      this.removeSegment(segment);
    }
    this.segments.length = 0;
  }

  private removeSegment(segment: RuntimeSegment): void {
    this.scene.remove(segment.group);
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    segment.group.traverse((object) => {
      if (
        (object instanceof THREE.Mesh || object instanceof THREE.Points) &&
        !disposedGeometries.has(object.geometry)
      ) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose();
      }
    });
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.clearSegments();
    this.renderer.dispose();
    this.timer.dispose();
    const disposedParticleGeometries = new Set<THREE.BufferGeometry>();
    for (const particle of this.particles) {
      if (!disposedParticleGeometries.has(particle.mesh.geometry)) {
        disposedParticleGeometries.add(particle.mesh.geometry);
        particle.mesh.geometry.dispose();
      }
      (particle.mesh.material as THREE.Material).dispose();
    }
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    this.audio.suspend();
  }
}

export { ACTION_LABELS };
