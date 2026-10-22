/**
 * Croisements : détection analytique de la première rencontre entre fronts d'onde.
 *
 * Chaque onde est un cercle de rayon r(t) = v·(t − t0) autour de son centre.
 * Deux ondes (t0a ≤ t0b), de centres distants de d, voient leurs fronts se
 * toucher pour la première fois quand ra + rb = d :
 *
 *     v(t − t0a) + v(t − t0b) = d   ⇒   t = (d/v + t0a + t0b) / 2
 *
 * au point situé à ra de A sur le segment AB. Si l'onde A a déjà englobé
 * le centre de B à la naissance de B (v·(t0b − t0a) ≥ d), les deux fronts
 * avancent à la même vitesse sans jamais se croiser : pas d'événement.
 *
 * Tout se calcule à la naissance de chaque onde : pas de lecture GPU, et les
 * notes peuvent être programmées à l'avance, exactement à l'instant visuel.
 */
import { config } from './config';

export interface WaveInput {
  x: number;
  y: number;
  t0: number;
  /** Note de la goutte (MIDI). */
  midi: number;
  volume: number;
}

interface Wave extends WaveInput {
  id: number;
}

export interface CrossingEvent {
  time: number;
  /** Point de croisement, coordonnées écran [0, 1]. */
  x: number;
  y: number;
  /** Plus grave des deux notes ; la note harmonique est choisie au déclenchement. */
  lowerMidi: number;
  volume: number;
}

export class Crossings {
  private waves: Wave[] = [];
  private pending: CrossingEvent[] = [];
  private fired: number[] = [];
  private nextId = 1;
  private readonly pond: () => { w: number; h: number };

  constructor(pond: () => { w: number; h: number }) {
    this.pond = pond;
  }

  /** Enregistre une onde et calcule ses croisements avec les ondes encore vivantes. */
  addWave(input: WaveInput): void {
    const c = config.crossings;
    const v = config.water.waveSpeed * c.speedFactor;
    const life = c.waveLifetime;
    const { w, h } = this.pond();
    const b: Wave = { ...input, id: this.nextId++ };
    this.waves = this.waves.filter((o) => b.t0 - o.t0 < life);

    for (const o of this.waves) {
      // a = la plus ancienne des deux.
      const [a, bb] = o.t0 <= b.t0 ? [o, b] : [b, o];
      const d = Math.hypot((bb.x - a.x) * w, (bb.y - a.y) * h);
      if (d < 1e-4) continue;
      if (v * (bb.t0 - a.t0) >= d) continue; // b est né à l'intérieur de a : jamais de croisement
      const t = (d / v + a.t0 + bb.t0) / 2;
      const ageA = t - a.t0;
      if (ageA > life) continue; // a est éteinte avant la rencontre
      const k = (v * ageA) / d;
      const x = a.x + (bb.x - a.x) * k;
      const y = a.y + (bb.y - a.y) * k;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue; // hors de l'écran
      const fade = 1 - c.ageFade * (ageA / life);
      const volume = Math.sqrt(a.volume * bb.volume) * fade;
      if (volume < c.minVolume) continue;
      this.pending.push({ time: t, x, y, lowerMidi: Math.min(a.midi, bb.midi), volume });
    }
    this.waves.push(b);
    this.pending.sort((p, q) => p.time - q.time);
  }

  /**
   * Croisements à déclencher avant `horizon`, après application du plafond
   * par seconde. Les croisements trop en retard sont abandonnés.
   */
  update(now: number, horizon: number): CrossingEvent[] {
    const c = config.crossings;
    const out: CrossingEvent[] = [];
    while (this.pending.length > 0 && (this.pending[0]?.time ?? Infinity) < horizon) {
      const ev = this.pending.shift();
      if (!ev || ev.time < now - 0.1) continue;
      this.fired = this.fired.filter((t) => ev.time - t < c.window);
      if (this.fired.length >= c.maxPerSecond) continue;
      this.fired.push(ev.time);
      out.push(ev);
    }
    return out;
  }

  clear(): void {
    this.waves = [];
    this.pending = [];
    this.fired = [];
  }
}
