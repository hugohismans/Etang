/**
 * Préférences de l'utilisateur (ambiance, volume), mémorisées localement.
 * Le stockage peut être indisponible (navigation privée) : tout est protégé.
 */
import { config } from './engine/config';
import { isMoodId, type MoodId } from './engine/moods';

const KEY = 'etang.settings.v1';

export interface Settings {
  mood: MoodId;
  volume: number;
}

export function loadSettings(): Settings {
  const fallback: Settings = { mood: 'nuit', volume: config.audio.defaultVolume };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      mood: isMoodId(v.mood) ? v.mood : fallback.mood,
      volume: typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : fallback.volume,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : tant pis, les réglages ne seront pas mémorisés */
  }
}
