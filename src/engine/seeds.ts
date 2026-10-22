/**
 * Graines : chaque goutte posée revient en boucle et mute lentement.
 *
 * Règles (toutes les constantes sont dans config.seeds) :
 *  - une graine retombe toutes les `loopDuration` secondes, à sa propre phase
 *    (l'instant où elle a été posée), alignée sur une grille de 1/8 de boucle ;
 *  - à chaque retour : son volume baisse, elle perd une vie, et sa position
 *    dérive d'un petit pas aléatoire (marche aléatoire) — la note dépendant de
 *    la position, la mélodie glisse parfois d'un degré ;
 *  - deux graines trop proches fusionnent : une seule graine plus grosse,
 *    une octave plus bas, volumes additionnés puis plafonnés ;
 *  - petite chance d'engendrer une graine fille, plus faible, à côté.
 *
 * Seules les gouttes du joueur (et leurs descendantes) existent : aucune
 * goutte ne tombe d'elle-même.
 *
 * Les positions sont en coordonnées écran [0, 1] ; les distances sont
 * converties en unités d'étang (petit côté = 1) pour être isotropes.
 */
import { config } from './config';
import { pitchAxisCoefficients } from './scales';

export type DropKind = 'tap' | 'seed';

export interface DropEvent {
  /** Instant de l'impact (temps d'horloge). */
  time: number;
  x: number;
  y: number;
  /** Volume relatif (1 = un tap). */
  volume: number;
  /** Niveau de fusion : 0 = normal, chaque niveau = une octave plus bas, une onde plus ample. */
  level: number;
  /** Taille relative de l'onde, hors fusion. */
  size: number;
  kind: DropKind;
  /** La graine vient de fusionner à ce passage. */
  merged: boolean;
}

export interface Seed {
  id: number;
  x: number;
  y: number;
  volume: number;
  lives: number;
  level: number;
  /** Prochain passage (temps d'horloge, sur la grille). */
  next: number;
  size: number;
}

export type Random = () => number;

/** Tirage gaussien (Box-Muller). */
function gaussian(random: Random): number {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Seeds {
  private seeds: Seed[] = [];
  private nextId = 1;
  private readonly pond: () => { w: number; h: number };
  private readonly random: Random;

  constructor(pond: () => { w: number; h: number }, random: Random = Math.random) {
    this.pond = pond;
    this.random = random;
  }

  /** Nombre de graines vivantes. */
  get count(): number {
    return this.seeds.length;
  }

  /** Positions des graines (affichage de debug). */
  get snapshot(): ReadonlyArray<Readonly<Seed>> {
    return this.seeds;
  }

  /** Repart de zéro (démarrage, ou « vider l'étang »). */
  clear(): void {
    this.seeds = [];
  }

  /** Un toucher : impact immédiat, et une nouvelle graine qui reviendra sur la grille. */
  tap(x: number, y: number, now: number): DropEvent {
    const c = config.seeds;
    const seed = this.add({
      x,
      y,
      volume: c.tapVolume,
      lives: c.lives,
      level: 0,
      next: this.gridAfter(now + c.loopDuration),
      size: 1,
    });
    this.drift(seed);
    return { time: now, x, y, volume: c.tapVolume, level: 0, size: 1, kind: 'tap', merged: false };
  }

  /**
   * Fait avancer les graines : renvoie tous les impacts dont
   * l'instant tombe avant `horizon` (programmation anticipée pour l'audio).
   */
  update(now: number, horizon: number): DropEvent[] {
    const c = config.seeds;
    const events: DropEvent[] = [];
    // On traite les passages dans l'ordre chronologique : la fusion et
    // l'engendrement dépendent de l'état des autres graines à cet instant.
    for (;;) {
      let s: Seed | undefined;
      for (const cand of this.seeds) if (cand.next < horizon && (!s || cand.next < s.next)) s = cand;
      if (!s) break;
      if (s.next < now - 0.5) {
        // Passage manqué (appareil très lent) : on ne le rattrape pas, on saute à la boucle suivante.
        s.next += c.loopDuration * Math.ceil((now - s.next) / c.loopDuration);
        continue;
      }
      const ev = this.pass(s);
      if (ev) events.push(ev);
    }
    return events;
  }

  // ---------------------------------------------------------------------------

  private add(s: Omit<Seed, 'id'>): Seed {
    const seed: Seed = { ...s, id: this.nextId++ };
    this.seeds.push(seed);
    const max = config.seeds.maxSeeds;
    if (this.seeds.length > max) {
      // Trop de graines : les plus faibles s'éteignent (jamais celle qu'on vient d'ajouter).
      const others = this.seeds.filter((o) => o !== seed).sort((a, b) => a.volume - b.volume);
      const drop = new Set(others.slice(0, this.seeds.length - max));
      this.seeds = this.seeds.filter((o) => !drop.has(o));
    }
    return seed;
  }

  private remove(s: Seed): void {
    this.seeds = this.seeds.filter((o) => o !== s);
  }

  /** Premier point de grille à partir de `t` (arrondi au plus proche). */
  private gridAfter(t: number): number {
    const step = config.seeds.loopDuration / config.seeds.gridDivisions;
    return Math.round(t / step) * step;
  }

  /** Axes sur lesquels une graine peut bouger : [x, y], 1 = libre, 0 = bloqué. */
  private freeAxes(): [number, number] {
    const k = pitchAxisCoefficients(config.pitch.axis);
    if (!config.seeds.keepNote || !k) return [1, 1];
    return k[0] === 0 ? [1, 0] : [0, 1];
  }

  /**
   * Dérive : marche aléatoire en unités d'étang. Avec keepNote, elle est
   * confinée à l'axe perpendiculaire à celui des hauteurs : la note ne change
   * pas. Elle est tirée juste après une chute, pour la suivante : la position
   * affichée par la lueur d'annonce est donc toujours celle de la prochaine chute.
   */
  private drift(s: Seed): void {
    const c = config.seeds;
    const { w, h } = this.pond();
    const mx = c.edgeMargin / w;
    const my = c.edgeMargin / h;
    const [fx, fy] = this.freeAxes();
    s.x = Math.min(1 - mx, Math.max(mx, s.x + (gaussian(this.random) * c.driftAmplitude * fx) / w));
    s.y = Math.min(1 - my, Math.max(my, s.y + (gaussian(this.random) * c.driftAmplitude * fy) / h));
  }

  /** Un retour de graine : déclin, fusion, engendrement, puis dérive pour le retour suivant. */
  private pass(s: Seed): DropEvent | null {
    const c = config.seeds;
    const t = s.next;
    const { w, h } = this.pond();
    const mx = c.edgeMargin / w;
    const my = c.edgeMargin / h;
    const [fx, fy] = this.freeAxes();

    // Déclin.
    s.volume *= c.volumeDecay;
    s.lives--;

    // Fusion avec la graine la plus proche, si elle est assez près.
    let merged = false;
    let nearest: Seed | null = null;
    let best = c.mergeDistance;
    for (const o of this.seeds) {
      if (o === s) continue;
      const d = Math.hypot((o.x - s.x) * w, (o.y - s.y) * h);
      if (d < best) {
        best = d;
        nearest = o;
      }
    }
    if (nearest) {
      const o = nearest;
      const tw = s.volume + o.volume;
      // Barycentre, mais seulement sur les axes libres : avec keepNote, la
      // graine qui joue garde sa bande (sa note), une octave plus bas.
      s.x += fx * ((s.x * s.volume + o.x * o.volume) / tw - s.x);
      s.y += fy * ((s.y * s.volume + o.y * o.volume) / tw - s.y);
      s.volume = Math.min(c.mergeVolumeCap, tw);
      s.level = Math.min(c.maxMergeLevel, Math.max(s.level, o.level) + 1);
      s.lives = Math.max(s.lives, o.lives);
      this.remove(o);
      merged = true;
    }

    const ev: DropEvent = {
      time: t,
      x: s.x,
      y: s.y,
      volume: s.volume,
      level: s.level,
      size: s.size,
      kind: 'seed',
      merged,
    };

    // Engendrement : une fille, plus faible, juste à côté, décalée sur la grille.
    if (this.random() < c.spawnChance && this.seeds.length < c.maxSeeds) {
      // Avec keepNote, la fille naît à gauche ou à droite (même bande, même note).
      const a = fx === 1 && fy === 1 ? this.random() * Math.PI * 2 : this.random() < 0.5 ? 0 : Math.PI;
      const [ox, oy] = fx === 1 && fy === 1 ? [Math.cos(a), Math.sin(a)] : fx === 1 ? [Math.cos(a), 0] : [0, Math.cos(a)];
      const step = c.loopDuration / c.gridDivisions;
      const k = 1 + Math.floor(this.random() * c.spawnMaxOffsetSteps);
      this.add({
        x: Math.min(1 - mx, Math.max(mx, s.x + (ox * c.spawnDistance) / w)),
        y: Math.min(1 - my, Math.max(my, s.y + (oy * c.spawnDistance) / h)),
        volume: s.volume * c.spawnVolume,
        lives: c.spawnLives,
        level: 0,
        next: t + k * step,
        size: s.size,
      });
    }

    if (s.lives <= 0 || s.volume < c.minVolume) this.remove(s);
    else {
      s.next = t + c.loopDuration;
      this.drift(s);
    }

    return ev;
  }
}
