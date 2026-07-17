import type { Settings } from "./types";

type SoundName =
  | "jump"
  | "slide"
  | "dodge"
  | "dash"
  | "land"
  | "collect"
  | "combo"
  | "damage"
  | "fail"
  | "ui";

const SOUND_FREQUENCIES: Record<SoundName, [number, number, number]> = {
  jump: [220, 520, 0.16],
  slide: [180, 90, 0.18],
  dodge: [320, 180, 0.12],
  dash: [120, 680, 0.3],
  land: [110, 70, 0.09],
  collect: [720, 1040, 0.08],
  combo: [520, 880, 0.2],
  damage: [130, 42, 0.28],
  fail: [240, 45, 0.6],
  ui: [410, 520, 0.06]
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private settings: Settings;
  private nextMusicNote = 0;
  private noteIndex = 0;
  private available = true;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  async unlock(): Promise<void> {
    if (!this.available) {
      return;
    }
    try {
      if (!this.context) {
        const AudioContextClass =
          window.AudioContext ??
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!AudioContextClass) {
          this.available = false;
          return;
        }
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.sfx = this.context.createGain();
        this.music.connect(this.master);
        this.sfx.connect(this.master);
        this.master.connect(this.context.destination);
        this.applySettings(this.settings);
      }
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
    } catch {
      this.available = false;
      this.context = null;
    }
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    if (!this.context || !this.master || !this.music || !this.sfx) {
      return;
    }
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : 0.72, now, 0.02);
    this.music.gain.setTargetAtTime(settings.musicVolume, now, 0.02);
    this.sfx.gain.setTargetAtTime(settings.sfxVolume, now, 0.02);
  }

  play(name: SoundName): void {
    if (!this.context || !this.sfx || this.settings.muted) {
      return;
    }
    const [startFrequency, endFrequency, duration] =
      SOUND_FREQUENCIES[name];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type =
      name === "damage" || name === "fail" ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      now + duration
    );
    gain.gain.setValueAtTime(name === "damage" ? 0.28 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  update(intensity: number, playing: boolean): void {
    if (
      !playing ||
      !this.context ||
      !this.music ||
      this.settings.muted ||
      this.settings.musicVolume <= 0
    ) {
      return;
    }
    const now = this.context.currentTime;
    if (now < this.nextMusicNote) {
      return;
    }
    const scale = [55, 65.41, 73.42, 82.41, 98];
    const frequency = scale[this.noteIndex % scale.length] ?? 55;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = this.noteIndex % 4 === 0 ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(
      frequency * (this.noteIndex % 8 === 7 ? 2 : 1),
      now
    );
    gain.gain.setValueAtTime(0.055 + intensity * 0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    oscillator.connect(gain);
    gain.connect(this.music);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    this.noteIndex += 1;
    this.nextMusicNote = now + Math.max(0.16, 0.3 - intensity * 0.1);
  }

  suspend(): void {
    if (this.context?.state === "running") {
      void this.context.suspend();
    }
  }
}
