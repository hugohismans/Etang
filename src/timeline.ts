/**
 * Frise de boucle : une ligne fine en haut de l'écran qui représente une
 * boucle entière (8 s par défaut), graduée selon la grille. Un point lumineux
 * la parcourt ; chaque graine y est un point placé à l'instant de la boucle
 * où elle retombe, qui s'illumine quand elle tombe.
 */
import { config } from './engine/config';
import type { TimelineState } from './engine/pond';

export function drawTimeline(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, s: TimelineState): void {
  ctx.clearRect(0, 0, cssW, cssH);
  if (s.visibility <= 0.001) return;
  const t = config.timeline;
  const [r, g, b] = s.color;
  const rgba = (a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a * s.visibility))})`;
  const y = cssH / 2;
  const pad = 6;
  const w = cssW - pad * 2;
  const X = (p: number) => pad + p * w;

  // Ligne de fond.
  ctx.fillStyle = rgba(t.lineAlpha);
  ctx.fillRect(pad, y - 0.5, w, 1);

  // Graduations de la grille (la première, début de boucle, un peu plus haute).
  for (let i = 0; i <= s.divisions; i++) {
    const hgt = i === 0 || i === s.divisions ? 7 : 4;
    ctx.fillStyle = rgba(t.tickAlpha);
    ctx.fillRect(Math.round(X(i / s.divisions)) - 0.5, y - hgt / 2, 1, hgt);
  }

  // Traîne et point de lecture.
  const tail = t.tailLength;
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const p0 = s.phase - (tail * (i + 1)) / segs;
    const p1 = s.phase - (tail * i) / segs;
    const a = t.headAlpha * 0.5 * (1 - i / segs);
    ctx.fillStyle = rgba(a);
    // La traîne revient par la fin de la frise quand le point repart au début.
    for (const off of [0, 1]) {
      const q0 = p0 + off;
      const q1 = p1 + off;
      if (q1 <= 0 || q0 >= 1) continue;
      ctx.fillRect(X(Math.max(q0, 0)), y - 1, X(Math.min(q1, 1)) - X(Math.max(q0, 0)), 2);
    }
  }
  // Tête de lecture : une barre verticale, pour ne pas la confondre avec une graine.
  ctx.fillStyle = rgba(t.headAlpha);
  ctx.fillRect(X(s.phase) - 0.75, y - 6, 1.5, 12);

  // Graines : un point par prochaine chute.
  for (const d of s.dots) {
    ctx.fillStyle = rgba(t.seedAlpha + 0.4 * Math.min(d.volume, 1));
    ctx.beginPath();
    ctx.arc(X(d.phase), y, 1.6 + 1.6 * Math.min(d.volume, 1.2), 0, Math.PI * 2);
    ctx.fill();
  }

  // Éclat des chutes récentes.
  for (const f of s.falls) {
    const k = Math.exp(-f.age / t.seedFlash);
    if (k < 0.02) continue;
    const grad = ctx.createRadialGradient(X(f.phase), y, 0, X(f.phase), y, 9);
    grad.addColorStop(0, rgba(0.9 * k));
    grad.addColorStop(1, rgba(0));
    ctx.fillStyle = grad;
    ctx.fillRect(X(f.phase) - 9, y - 9, 18, 18);
  }
}
