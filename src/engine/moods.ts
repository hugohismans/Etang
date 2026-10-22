/**
 * Ambiances : chacune définit une gamme, une palette et quelques constantes
 * audio et visuelles. Le passage d'une ambiance à l'autre se fait en fondu
 * (voir `lerpMood`), sans toucher aux graines en cours.
 */
import type { Scale } from './scales';

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

/** Réglages audio propres à une ambiance. */
export interface MoodSound {
  /** Durée de la queue de réverbération (s). */
  reverbSeconds: number;
  /** Niveau de la réverbération (0..1). */
  reverbWet: number;
  /** Niveau du son direct (0..1). */
  dry: number;
  /** Coupure du passe-bas général (Hz). */
  lowpass: number;
  /** Multiplicateur du gain des partiels (timbre plus ou moins brillant). */
  brightness: number;
}

/** Réglages visuels propres à une ambiance (multiplient ceux de config). */
export interface MoodLook {
  /** Rayon des gouttes : plus grand = onde plus large et plus floue. */
  dropScale: number;
  /** Relief visible des ondes. */
  rippleScale: number;
  /** Intensité du reflet de lune. */
  moonScale: number;
}

export interface Mood {
  id: string;
  name: string;
  /** Couleur CSS du fond de page (avant le premier rendu WebGL, barre d'état). */
  background: string;
  palette: Palette;
  scale: Scale;
  sound: MoodSound;
  look: MoodLook;
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
    background: '#03060f',
    palette: {
      deep: hex('#03060f'),
      sky: hex('#1b2c55'),
      crest: hex('#8ea6d6'),
      moon: hex('#e4ebf7'),
      flash: hex('#dde6ff'),
    },
    // Pentatonique mineure de Ré : Ré Fa Sol La Do.
    scale: { root: 62, intervals: [0, 3, 5, 7, 10] },
    sound: { reverbSeconds: 7, reverbWet: 0.62, dry: 0.7, lowpass: 5200, brightness: 1.0 },
    look: { dropScale: 1.0, rippleScale: 1.0, moonScale: 1.0 },
  },
  aube: {
    id: 'aube',
    name: 'Aube',
    background: '#0c1019',
    palette: {
      deep: hex('#0a0e18'),
      sky: hex('#4a5672'),
      crest: hex('#e9c3c9'),
      moon: hex('#ffe4dc'),
      flash: hex('#fff0ec'),
    },
    // Pentatonique majeure de Mi : Mi Fa# Sol# Si Do#.
    scale: { root: 64, intervals: [0, 2, 4, 7, 9] },
    sound: { reverbSeconds: 4.5, reverbWet: 0.5, dry: 0.78, lowpass: 7800, brightness: 1.5 },
    look: { dropScale: 1.0, rippleScale: 1.05, moonScale: 1.3 },
  },
  brume: {
    id: 'brume',
    name: 'Brume',
    background: '#050c0b',
    palette: {
      deep: hex('#050c0b'),
      sky: hex('#2b3b38'),
      crest: hex('#9fc4b9'),
      moon: hex('#cfdad5'),
      flash: hex('#dfeae5'),
    },
    // Pentatonique « suspendue » de La : La Si Ré Mi Sol. Sans tierce,
    // ni majeure ni mineure : la plus ambiguë des pentatoniques.
    // (L'exemple « Do Ré Mi Sol La sur La » est exactement la pentatonique
    // mineure de La, donc la même couleur que Nuit — voir README.)
    scale: { root: 57, intervals: [0, 2, 5, 7, 10] },
    sound: { reverbSeconds: 6, reverbWet: 0.7, dry: 0.6, lowpass: 2600, brightness: 0.7 },
    look: { dropScale: 1.7, rippleScale: 0.75, moonScale: 0.55 },
  },
} satisfies Record<string, Mood>;

export type MoodId = keyof typeof moods;
export const moodIds = Object.keys(moods) as MoodId[];

export function isMoodId(v: unknown): v is MoodId {
  return typeof v === 'string' && v in moods;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Mélange deux palettes (fondu d'ambiance). */
export function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    deep: lerpRGB(a.deep, b.deep, t),
    sky: lerpRGB(a.sky, b.sky, t),
    crest: lerpRGB(a.crest, b.crest, t),
    moon: lerpRGB(a.moon, b.moon, t),
    flash: lerpRGB(a.flash, b.flash, t),
  };
}

/** Mélange deux réglages visuels. */
export function lerpLook(a: MoodLook, b: MoodLook, t: number): MoodLook {
  return {
    dropScale: lerp(a.dropScale, b.dropScale, t),
    rippleScale: lerp(a.rippleScale, b.rippleScale, t),
    moonScale: lerp(a.moonScale, b.moonScale, t),
  };
}
