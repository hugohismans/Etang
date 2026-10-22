/**
 * Ambiances. Pour l'étape 1 seule la palette de « Nuit » est utilisée ;
 * gammes, constantes audio et les ambiances Aube / Brume arrivent plus tard.
 */

/** Couleur RGB linéaire (0..1). */
export type RGB = [number, number, number];

export interface Palette {
  /** Eau profonde, au repos. */
  deep: RGB;
  /** Reflet diffus du ciel sur les pentes. */
  sky: RGB;
  /** Lumière des crêtes. */
  crest: RGB;
  /** Reflet de la lune. */
  moon: RGB;
  /** Flash d'impact. */
  flash: RGB;
}

export interface Mood {
  id: string;
  name: string;
  palette: Palette;
}

/** Convertit une couleur hexadécimale sRGB en RGB linéaire. */
export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

export const moods = {
  nuit: {
    id: 'nuit',
    name: 'Nuit',
    palette: {
      deep: hex('#03060f'),
      sky: hex('#1b2c55'),
      crest: hex('#8ea6d6'),
      moon: hex('#e4ebf7'),
      flash: hex('#dde6ff'),
    },
  },
} satisfies Record<string, Mood>;

export type MoodId = keyof typeof moods;
