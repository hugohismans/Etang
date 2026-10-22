/**
 * Horloge commune au son et à l'image.
 *
 * Tant qu'aucun AudioContext n'est branché (étape 1, ou avant le premier tap),
 * on utilise performance.now(). Ensuite, le temps est dérivé de
 * audioContext.currentTime, lissé avec performance.now() : currentTime avance
 * par blocs (128 échantillons, parfois plus), ce qui ferait saccader l'image.
 */
export class Clock {
  private ctx: BaseAudioContext | null = null;
  private offset = 0;
  private readonly t0 = performance.now();

  private perfSeconds(): number {
    return (performance.now() - this.t0) / 1000;
  }

  /** Branche l'horloge sur un contexte audio, sans saut de temps. */
  attach(ctx: BaseAudioContext): void {
    const before = this.now();
    this.ctx = ctx;
    this.offset = 0;
    this.offset = before - this.now();
  }

  /** Temps courant en secondes. */
  now(): number {
    const p = this.perfSeconds();
    if (!this.ctx) return p + this.offset;
    // Recalage doux : on suit performance.now() mais on converge vers l'audio.
    const target = this.ctx.currentTime;
    const drift = target - (p + this.offset);
    if (Math.abs(drift) > 0.25) this.offset += drift; // gros écart (pause) : on se recale d'un coup
    else this.offset += drift * 0.05;
    return p + this.offset;
  }
}
