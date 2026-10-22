/**
 * Gammes et correspondance position → note.
 *
 * Toutes les gammes sont pentatoniques : quelles que soient les notes jouées
 * ensemble, rien ne sonne faux.
 */
import { config, type PitchAxis } from './config';

export interface Scale {
  /** Note MIDI de la tonique (la note la plus grave de l'étang). */
  root: number;
  /** Intervalles en demi-tons depuis la tonique, dans l'octave (5 notes). */
  intervals: number[];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Note MIDI du degré `degree` (0 = tonique, 5 = tonique à l'octave, etc.). */
export function degreeToMidi(scale: Scale, degree: number): number {
  const n = scale.intervals.length;
  const octave = Math.floor(degree / n);
  const step = ((degree % n) + n) % n;
  return scale.root + octave * 12 + (scale.intervals[step] ?? 0);
}

/** Nombre de bandes (notes) sur l'écran. */
export function laneCount(scale: Scale): number {
  return scale.intervals.length * config.pitch.octaves + 1;
}

/**
 * Position le long de l'axe des hauteurs, de 0 (grave) à 1 (aigu), pour les
 * axes linéaires : u = ax·x + ay·y + c. null pour le mode 'centre-bords'.
 */
export function pitchAxisCoefficients(axis: PitchAxis): [number, number, number] | null {
  switch (axis) {
    case 'bas-haut':
      return [0, -1, 1];
    case 'haut-bas':
      return [0, 1, 0];
    case 'gauche-droite':
      return [1, 0, 0];
    case 'droite-gauche':
      return [-1, 0, 1];
    case 'centre-bords':
      return null;
  }
}

/**
 * Degré correspondant à une position. x, y dans [0, 1] (repère écran).
 * Axe linéaire : l'écran est découpé en bandes égales, une par degré.
 * Mode 'centre-bords' : distance mesurée dans le repère normalisé de l'écran
 * (bords à ±1), arrondie au degré le plus proche.
 */
export function positionToDegree(scale: Scale, x: number, y: number): number {
  const n = laneCount(scale);
  const k = pitchAxisCoefficients(config.pitch.axis);
  if (k) {
    const u = k[0] * x + k[1] * y + k[2];
    return Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  }
  const qx = (x - 0.5) * 2;
  const qy = (y - 0.5) * 2;
  const u = Math.min(1, Math.hypot(qx, qy) / config.pitch.edgeDistance);
  return Math.round(u * (n - 1));
}

/** Note MIDI d'une position, avec décalage d'octave (fusion de graines). */
export function positionToMidi(scale: Scale, x: number, y: number, octaveShift = 0): number {
  return degreeToMidi(scale, positionToDegree(scale, x, y)) + octaveShift * 12;
}

/** La hauteur `midi` appartient-elle à la gamme (à l'octave près) ? */
export function inScale(scale: Scale, midi: number): boolean {
  const pc = (((Math.round(midi) - scale.root) % 12) + 12) % 12;
  return scale.intervals.includes(pc);
}

/**
 * Note harmonique d'un croisement : quinte ou octave au-dessus de la note
 * donnée. La quinte n'est choisie que si elle appartient à la gamme (ce n'est
 * pas toujours le cas en pentatonique) ; sinon c'est l'octave.
 */
export function harmonicAbove(scale: Scale, midi: number, random = Math.random): number {
  const fifth = midi + 7;
  if (inScale(scale, fifth) && random() < config.crossings.fifthChance) return fifth;
  return midi + 12;
}
