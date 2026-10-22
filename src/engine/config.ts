/**
 * Étang — toutes les constantes de « ressenti ».
 *
 * Règle : aucune valeur de réglage ne doit être codée en dur ailleurs.
 * Les shaders reçoivent ces valeurs sous forme d'uniforms à chaque image,
 * donc les modifier à chaud (console : `etang.config.water.waveSpeed = 0.08`
 * avec `?debug` dans l'URL) prend effet immédiatement, sans recompilation.
 *
 * Unités :
 *  - « unité d'étang » : le petit côté de l'écran vaut 1. Une vitesse de 0.1
 *    veut donc dire « un dixième de la largeur d'un téléphone en portrait par seconde ».
 *  - les temps sont en secondes.
 */
export const config = {
  /** Rendu final à l'écran. */
  render: {
    /** Plafond du devicePixelRatio. L'eau est douce : inutile de rendre en 3x. */
    maxPixelRatio: 1.5,
    /** Durée maximale prise en compte entre deux images (évite un bond après un onglet en pause). */
    maxFrameDt: 0.1,
    /** Amplitude du tramage anti-banding (en 1/255). Indispensable sur des fonds aussi sombres. */
    dither: 1.0,
    /** Assombrissement des bords de l'écran (0 = aucun). */
    vignette: 0.55,
    /** Exposition avant le tone mapping doux. */
    exposure: 1.15,
  },

  /** Simulation de hauteur d'eau (équation d'onde discrète sur texture). */
  water: {
    /** Nombre de cellules sur le petit côté de l'écran. Le grand côté suit le ratio. */
    simShortSide: 256,
    /** Plafond de cellules sur le grand côté (écrans très allongés / desktop large). */
    simMaxLongSide: 640,
    /**
     * Vitesse du front d'onde, en unités d'étang par seconde.
     * 0.11 → une onde traverse un téléphone (portrait, largeur) en ~9 s.
     */
    waveSpeed: 0.11,
    /**
     * Nombre de Courant au carré (c²·dt²/dx²) d'un pas de simulation.
     * Doit rester < 0.75 (stabilité du laplacien 9 points). Plus petit = plus
     * de pas par seconde, front plus net mais plus coûteux.
     */
    courant2: 0.3,
    /** Fraction d'amplitude qui subsiste après 1 seconde (amortissement global). */
    damping: 0.72,
    /** Largeur de la bordure absorbante, en unités d'étang. Évite les rebonds sur les bords. */
    spongeWidth: 0.12,
    /** Amortissement par pas tout au bord de l'écran (1 = aucun, 0.9 = absorbe fort). */
    spongeDamping: 0.93,
    /** Nombre maximal de pas de simulation par image (garde-fou sur appareil lent). */
    maxStepsPerFrame: 6,
  },

  /** Impact d'une goutte dans la simulation. */
  drop: {
    /** Rayon de la bosse injectée, en unités d'étang. Plus grand = onde plus large et plus floue. */
    radius: 0.018,
    /** Hauteur injectée (négatif = la goutte creuse l'eau, comme une vraie goutte). */
    amplitude: -0.9,
  },

  /** Petit flash lumineux au point d'impact. */
  flash: {
    /** Intensité au pic. */
    intensity: 0.9,
    /** Rayon initial, en unités d'étang. */
    radius: 0.018,
    /** Croissance du rayon (unités d'étang par seconde) pendant qu'il s'éteint. */
    growth: 0.03,
    /** Constante de temps de l'extinction (s). Le flash est quasi éteint après 4×. */
    decay: 0.22,
    /** Temps de montée (s). Une montée de quelques ms évite un « pop » visuel. */
    attack: 0.025,
    /** Durée après laquelle un flash est retiré de la liste. */
    lifetime: 1.4,
  },

  /** Éclairage de la surface. */
  surface: {
    /** Gain appliqué à la pente de la simulation pour calculer la normale. */
    rippleNormal: 14.0,
    /** Luminosité ajoutée sur les crêtes (hauteur positive). */
    crestGain: 1.0,
    /** Assombrissement des creux (hauteur négative). */
    troughDarken: 0.35,
    /** Éclairage de pente, couleur des crêtes (un flanc de la vague s'éclaire, l'autre s'assombrit). */
    slopeGain: 0.45,
    /** Reflet du ciel selon l'inclinaison de la normale. */
    skyGain: 0.9,

    /** Houle de fond : échelle spatiale (cycles par unité d'étang). */
    swellScale: 1.6,
    /** Houle de fond : vitesse de dérive (unités d'étang par seconde). */
    swellSpeed: 0.012,
    /** Houle de fond : force de la pente induite. Très faible : on la devine plus qu'on ne la voit. */
    swellStrength: 0.004,

    /** Micro-ridules (n'affectent QUE le reflet de lune, pour qu'il scintille) : échelle (cycles par unité d'étang). */
    glintScale: 90.0,
    /** Micro-ridules : vitesse d'évolution. */
    glintSpeed: 0.25,
    /** Micro-ridules : force de la pente. */
    glintStrength: 0.03,

    /** Hauteur de la caméra au-dessus du centre (perspective du reflet). */
    cameraHeight: 1.5,
    /** Direction de la lune (sera normalisée). x vers la droite, y vers le haut, z vers le ciel. */
    moonDirection: [0.16, 0.3, 1.0] as [number, number, number],
    /** Netteté du reflet de lune (exposant spéculaire). */
    moonShininess: 2200.0,
    /** Intensité du reflet net de la lune. */
    moonGain: 0.22,
    /** Halo large et faible autour du reflet. */
    moonGlowShininess: 40.0,
    moonGlowGain: 0.025,
  },
};

export type Config = typeof config;

/** Nombre maximal de gouttes injectées dans un même pas (taille du tableau d'uniforms). */
export const MAX_DROPS_PER_STEP = 16;
/** Nombre maximal de flashs affichés simultanément (taille du tableau d'uniforms). */
export const MAX_FLASHES = 16;
