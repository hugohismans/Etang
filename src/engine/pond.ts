/**
 * L'étang : relie horloge, graines, croisements, audio et eau.
 *
 * Boucle par image :
 *   1. temps courant `now` (dérivé de l'AudioContext quand il tourne) ;
 *   2. graines → impacts jusqu'à `now + lookahead` ;
 *      chaque impact est programmé dans l'audio à son instant exact, déclare
 *      une onde aux croisements, et son image est mise en file d'attente ;
 *   3. croisements → notes harmoniques et étincelles, même principe ;
 *   4. la file d'images est vidée jusqu'à `now` ; l'eau avance et se dessine.
 *
 * Les impacts au toucher, eux, sont immédiats (image et son).
 */
import { AudioEngine } from './audio';
import { Clock } from './clock';
import { config } from './config';
import { Crossings, type CrossingEvent } from './crossings';
import { lerpLook, lerpPalette, moods, type MoodId, type MoodLook, type Palette } from './moods';
import { harmonicAbove, positionToMidi } from './scales';
import { Seeds, type DropEvent } from './seeds';
import { Water, type Tier } from './water';

interface Visual {
  time: number;
  apply: () => void;
}

export class Pond {
  readonly water: Water;
  readonly audio: AudioEngine;
  readonly clock = new Clock();
  readonly seeds: Seeds;
  readonly crossings: Crossings;

  private started = false;
  private visuals: Visual[] = [];
  private moodId: MoodId;
  private palette: Palette;
  private look: MoodLook;
  private fromPalette: Palette;
  private fromLook: MoodLook;
  private moodStart = -Infinity;
  private now = 0;

  constructor(canvas: HTMLCanvasElement, mood: MoodId, options: { forceTier?: Tier } = {}) {
    const m = moods[mood];
    this.moodId = mood;
    this.palette = m.palette;
    this.look = m.look;
    this.fromPalette = m.palette;
    this.fromLook = m.look;
    this.water = new Water(canvas, m.palette, options);
    this.audio = new AudioEngine(m.sound);
    const size = () => this.water.pondSize;
    this.seeds = new Seeds(size);
    this.crossings = new Crossings(size);
  }

  get ready(): boolean {
    return this.water.ready;
  }

  get mood(): MoodId {
    return this.moodId;
  }

  /** Le premier toucher a-t-il eu lieu ? */
  get isStarted(): boolean {
    return this.started;
  }

  /**
   * À appeler dans pointerdown ET pointerup (voir AudioEngine.unlock).
   * Sans effet une fois l'audio lancé.
   */
  unlockAudio(): void {
    this.audio.unlock();
    if (this.audio.ctx) this.clock.attach(this.audio.ctx);
  }

  /** Un toucher : goutte immédiate + nouvelle graine. */
  tap(x: number, y: number): void {
    this.unlockAudio();
    if (!this.started) {
      this.started = true;
      this.seeds.clear();
    }
    const ev = this.seeds.tap(x, y, this.now);
    this.handleDrop(ev, true);
  }

  /** Avance d'une image. */
  frame(): void {
    const now = this.clock.now();
    this.now = now;
    if (this.started) {
      const horizon = now + config.audio.lookahead;
      for (const ev of this.seeds.update(now, horizon)) this.handleDrop(ev, false);
      for (const ev of this.crossings.update(now, horizon)) this.handleCrossing(ev);
    }
    this.flushVisuals(now);
    this.updateMood(now);
    this.water.frame(now);
  }

  setMood(id: MoodId): void {
    if (id === this.moodId) return;
    this.moodId = id;
    this.fromPalette = this.palette;
    this.fromLook = this.look;
    this.moodStart = this.now;
    this.audio.setMood(moods[id].sound);
  }

  setVolume(v: number): void {
    this.audio.setVolume(v);
  }

  /** Vider l'étang : graines effacées, ondes et sons qui s'éteignent en douceur. */
  clear(): void {
    this.seeds.clear();
    this.crossings.clear();
    this.visuals = [];
    this.water.settle(config.water.settleDuration);
    this.audio.releaseAll(config.water.settleDuration * 0.6);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.water.resize(cssW, cssH, dpr);
  }

  /** Onglet masqué / visible. */
  setHidden(hidden: boolean): void {
    if (hidden) this.audio.suspend();
    else this.audio.resume();
  }

  destroy(): void {
    this.audio.suspend();
    void this.audio.ctx?.close().catch(() => undefined);
    this.water.destroy();
  }

  // ---------------------------------------------------------------------------

  private handleDrop(ev: DropEvent, immediate: boolean): void {
    const scale = moods[this.moodId].scale;
    const midi = positionToMidi(scale, ev.x, ev.y, -ev.level);
    if (this.clock.audioSynced || immediate) {
      this.audio.playBell({
        midi,
        when: immediate ? 0 : this.clock.toAudio(ev.time),
        velocity: ev.volume,
        pan: (ev.x - 0.5) * 2,
      });
    }
    this.crossings.addWave({ x: ev.x, y: ev.y, t0: ev.time, midi, volume: ev.volume });

    const strength = Math.pow(ev.volume, 0.6);
    const size = ev.size * (1 + ev.level * config.seeds.mergeSizeGain) * this.look.dropScale;
    const apply = () => {
      this.water.drop(ev.x, ev.y, strength * (1 + ev.level * 0.25), size);
      this.water.flash(ev.x, ev.y, Math.pow(ev.volume, 0.7));
    };
    if (immediate) apply();
    else this.visuals.push({ time: ev.time, apply });
  }

  private handleCrossing(ev: CrossingEvent): void {
    const scale = moods[this.moodId].scale;
    const midi = harmonicAbove(scale, ev.lowerMidi);
    if (this.clock.audioSynced) {
      this.audio.playChime({
        midi,
        when: this.clock.toAudio(ev.time),
        velocity: ev.volume,
        pan: (ev.x - 0.5) * 2,
      });
    }
    const sp = config.spark;
    this.visuals.push({
      time: ev.time,
      apply: () =>
        this.water.flash(ev.x, ev.y, sp.intensity * ev.volume, {
          radiusScale: sp.radiusScale,
          timeScale: sp.timeScale,
          tint: sp.moonTint,
        }),
    });
  }

  private flushVisuals(now: number): void {
    if (this.visuals.length === 0) return;
    const due = this.visuals.filter((v) => v.time <= now);
    if (due.length === 0) return;
    this.visuals = this.visuals.filter((v) => v.time > now);
    due.sort((a, b) => a.time - b.time);
    for (const v of due) v.apply();
  }

  private updateMood(now: number): void {
    const target = moods[this.moodId];
    const raw = (now - this.moodStart) / config.ui.moodFade;
    if (raw >= 1) {
      if (this.palette !== target.palette) {
        this.palette = target.palette;
        this.look = target.look;
        this.water.setPalette(this.palette);
        this.water.look = { rippleScale: this.look.rippleScale, moonScale: this.look.moonScale };
      }
      return;
    }
    const t = Math.max(0, raw);
    const e = t * t * (3 - 2 * t);
    this.palette = lerpPalette(this.fromPalette, target.palette, e);
    this.look = lerpLook(this.fromLook, target.look, e);
    this.water.setPalette(this.palette);
    this.water.look = { rippleScale: this.look.rippleScale, moonScale: this.look.moonScale };
  }
}
