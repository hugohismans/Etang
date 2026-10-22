/**
 * Horloge commune au son et à l'image.
 *
 * Quand l'audio tourne, le temps est dérivé de l'AudioContext : on utilise
 * getOutputTimestamp(), qui dit quel instant audio sort des haut-parleurs
 * *maintenant*. Une note programmée à l'instant T est entendue quand cette
 * horloge vaut T : l'image et le son sont donc alignés, latence comprise.
 * Entre deux mises à jour du contexte (par blocs de 128 échantillons ou
 * plus), on interpole avec performance.now() pour une animation fluide.
 *
 * Quand l'audio ne tourne pas (avant le premier geste, onglet masqué, iOS
 * interrompu), l'horloge avance seule, au rythme des images, sans compter
 * le temps passé en arrière-plan. Au retour de l'audio, on se recale avec
 * un décalage pour que le temps reste continu et monotone.
 *
 *   temps_horloge = temps_audio + offset
 */
export class Clock {
  private ctx: AudioContext | null = null;
  private offset = 0;
  private last = 0;
  private lastPerf = performance.now();
  private synced = false;

  /** Pas maximal compté quand l'horloge avance seule (s). */
  maxFreeStep = 0.1;

  attach(ctx: AudioContext): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.synced = false;
  }

  /** L'horloge suit-elle l'audio (et peut-on donc programmer des notes) ? */
  get audioSynced(): boolean {
    return this.synced && this.ctx?.state === 'running';
  }

  /** Temps audio « en sortie » estimé. */
  private audioNow(ctx: AudioContext): number {
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.contextTime > 0) {
        return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  /** Temps courant (s). Monotone. */
  now(): number {
    const p = performance.now();
    const dp = Math.min(Math.max((p - this.lastPerf) / 1000, 0), this.maxFreeStep);
    this.lastPerf = p;
    let t: number;
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running') {
      const a = this.audioNow(ctx);
      if (!this.synced) {
        this.offset = this.last - a;
        this.synced = true;
      }
      t = a + this.offset;
    } else {
      this.synced = false;
      t = this.last + dp;
    }
    if (t < this.last) t = this.last;
    this.last = t;
    return t;
  }

  /** Convertit un temps d'horloge en temps audio (pour programmer une note). */
  toAudio(t: number): number {
    return t - this.offset;
  }
}
