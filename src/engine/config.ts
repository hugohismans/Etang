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
    /** Amortissement (fraction restante après 1 s) au plus fort d'un « vider l'étang ». */
    settleDamping: 0.12,
    /** Durée du calme après « vider l'étang » (s). */
    settleDuration: 2.5,
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
    /** Durée après laquelle un flash est retiré de la liste (multipliée par l'échelle de durée du flash). */
    lifetime: 1.4,
  },

  /** Étincelle au point de croisement de deux ondes (relative au flash d'impact). */
  spark: {
    /** Intensité au pic. */
    intensity: 0.75,
    /** Rayon, relatif au flash d'impact. */
    radiusScale: 0.45,
    /** Durée, relative au flash d'impact. */
    timeScale: 1.6,
    /** 0 = couleur du flash, 1 = couleur de la lune (plus argentée). */
    moonTint: 0.7,
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

  /** Hauteur des notes. */
  pitch: {
    /**
     * Sens « du grave vers l'aigu » sur l'écran. L'écran est découpé en
     * bandes égales, une par note de la gamme.
     *  - 'bas-haut'     : en bas grave, en haut aigu (défaut : en portrait,
     *                     c'est le grand côté, donc les bandes les plus larges) ;
     *  - 'haut-bas', 'gauche-droite' (comme un piano), 'droite-gauche' ;
     *  - 'centre-bords' : ancien mode, grave au centre, aigu vers les bords.
     */
    axis: 'bas-haut' as PitchAxis,
    /** Étendue, en octaves. Le nombre de bandes est 5 × octaves + 1. */
    octaves: 2,
    /** Mode 'centre-bords' : distance (repère écran, coins = √2) de la note la plus aiguë. */
    edgeDistance: 1.2,
  },

  /** Repères de notes : bandes qui apparaissent sur l'eau quand on touche. */
  lanes: {
    /** Montée (s) quand on touche. */
    attack: 0.15,
    /** Maintien (s) après le dernier toucher. */
    hold: 1.2,
    /** Disparition (s). */
    fade: 2.5,
    /** Lumière des traits entre les bandes. */
    lineGain: 0.05,
    /** Lumière de fond des bandes « maison » (la tonique de chaque octave). */
    tonicGain: 0.018,
    /** Lumière de la bande qu'on vient de toucher. */
    activeGain: 0.035,
  },

  /** Moteur audio. */
  audio: {
    /** Volume général par défaut (0..1), modifiable dans le panneau. */
    defaultVolume: 0.8,
    /** Nombre maximal de voix simultanées ; au-delà, la plus ancienne est volée. */
    maxVoices: 24,
    /** Durée du fondu d'une voix volée (s). Assez long pour ne jamais cliquer. */
    stealFade: 0.06,
    /** Temps d'anticipation de la programmation audio (s). Doit dépasser la latence de sortie. */
    lookahead: 0.25,
    /** Panoramique maximal (0 = mono, 1 = gauche/droite complets). */
    panWidth: 0.55,
    /** Variation aléatoire de vélocité (±, relative). */
    velocityJitter: 0.15,
    /** Variation aléatoire d'accordage (±, en cents). */
    detuneCents: 4,
    /** Fondu du volume général et des changements d'ambiance (constante de temps, s). */
    smoothing: 0.08,

    /** Compresseur du bus master : doux, il ne fait que tenir les accumulations. */
    compressor: { threshold: -20, knee: 18, ratio: 3, attack: 0.02, release: 0.4 },
    /** Gain avant le limiteur doux (saturation tanh). */
    limiterDrive: 1.1,
    /** Gain de sortie après le limiteur. */
    outputGain: 0.9,
  },

  /** Synthé de goutte : cloche douce. */
  bell: {
    /** Volume de base d'une goutte (avant vélocité). */
    gain: 0.22,
    /** Attaque (s). 20 ms : assez court pour être une percussion, assez long pour ne pas cliquer. */
    attack: 0.02,
    /** Décroissance de la fondamentale (s, jusqu'à −60 dB environ). Tirée entre min et max. */
    decayMin: 3.2,
    decayMax: 5.0,
    /**
     * Partiels inharmoniques : rapport de fréquence, gain relatif, durée relative.
     * Les rapports viennent des modes d'une petite cloche (non entiers → timbre de métal).
     */
    partials: [
      { ratio: 2.76, gain: 0.09, decay: 0.45 },
      { ratio: 5.4, gain: 0.035, decay: 0.25 },
      { ratio: 8.93, gain: 0.012, decay: 0.15 },
    ],
    /** Légère seconde fondamentale désaccordée : battement lent, son plus vivant (cents). */
    chorusCents: 3,
    chorusGain: 0.25,
  },

  /** Synthé de croisement : plus fin, plus aigu, plus faible. */
  chime: {
    gain: 0.075,
    attack: 0.012,
    decay: 2.4,
    /** Un seul partiel discret, harmonique (le croisement est un écho clair, pas une cloche). */
    partialRatio: 3.0,
    partialGain: 0.06,
  },

  /** Réverbération à convolution, réponse impulsionnelle générée (bruit à décroissance exponentielle). */
  reverb: {
    /** Pré-délai (s) avant la queue de réverbération. */
    preDelay: 0.025,
    /** Assombrissement de la queue : plus grand = aigus qui meurent plus vite que les graves. */
    damping: 2.4,
    /** Durée du fondu enchaîné entre deux réverbérations (changement d'ambiance). */
    crossfade: 3.0,
  },

  /** Graines : gouttes qui reviennent en boucle et mutent. */
  seeds: {
    /** Durée de la boucle (s). */
    loopDuration: 8,
    /** Subdivision de la grille temporelle (8 = croches d'une boucle de 8 s). */
    gridDivisions: 8,
    /** Nombre de passages avant extinction. */
    lives: 6,
    /** Volume multiplié à chaque passage. */
    volumeDecay: 0.8,
    /** Volume sous lequel une graine s'éteint. */
    minVolume: 0.12,
    /** Amplitude de la dérive à chaque retour (écart type, unités d'étang). */
    driftAmplitude: 0.035,
    /**
     * true : la dérive (et la position des filles) reste dans la bande de la
     * note — la mélodie que tu as jouée est conservée, seul l'endroit bouge.
     * false : la dérive peut faire glisser la note d'un degré (mélodie qui mute).
     */
    keepNote: true,
    /** Marge (unités d'étang) que les graines ne franchissent pas en dérivant. */
    edgeMargin: 0.06,
    /** Distance de fusion de deux graines (unités d'étang). */
    mergeDistance: 0.06,
    /** Volume maximal d'une graine fusionnée. */
    mergeVolumeCap: 1.25,
    /** Nombre maximal de fusions successives (chacune descend d'une octave). */
    maxMergeLevel: 2,
    /** Agrandissement de l'onde par niveau de fusion. */
    mergeSizeGain: 0.45,
    /** Probabilité, à chaque passage, d'engendrer une graine fille. */
    spawnChance: 0.05,
    /** Distance de la fille à sa mère (unités d'étang). */
    spawnDistance: 0.09,
    /** Volume de la fille, relatif à la mère. */
    spawnVolume: 0.6,
    /** Vies de la fille. */
    spawnLives: 3,
    /** Décalage de la fille dans la boucle, en pas de grille (tiré entre 1 et ce nombre). */
    spawnMaxOffsetSteps: 3,
    /** Nombre maximal de graines vivantes. Au-delà, les plus faibles s'éteignent. */
    maxSeeds: 24,
    /** Volume relatif d'un tap (graine au premier passage). */
    tapVolume: 1.0,
  },

  /** Croisements entre fronts d'onde. */
  crossings: {
    /** Durée pendant laquelle une onde peut encore croiser une autre (s). */
    waveLifetime: 6,
    /** Nombre maximal de croisements joués par seconde. */
    maxPerSecond: 4,
    /** Fenêtre glissante du plafond (s). */
    window: 1,
    /** Probabilité de choisir la quinte plutôt que l'octave (si la quinte est dans la gamme). */
    fifthChance: 0.6,
    /** Volume en fonction de l'âge de l'onde : 1 à la naissance, (1 − fade) en fin de vie. */
    ageFade: 0.6,
    /** Seuil de volume en dessous duquel un croisement est muet. */
    minVolume: 0.08,
    /**
     * Facteur correctif sur la vitesse du front (pour caler l'étincelle sur l'image).
     * La crête visible avance un peu moins vite que la vitesse théorique
     * (dispersion numérique de la grille) : mesuré ≈ 0.94 × waveSpeed.
     */
    speedFactor: 0.94,
  },

  /** Lueur d'annonce : un halo monte sous l'eau là où une goutte va retomber. */
  omen: {
    /** Combien de temps avant la chute la lueur commence à monter (s). */
    lead: 2.0,
    /** Intensité au moment de la chute (multipliée par le volume de la graine). */
    gain: 0.16,
    /** Rayon du halo (unités d'étang). */
    radius: 0.03,
  },

  /** Frise de boucle, en haut de l'écran. */
  timeline: {
    /** Afficher la frise. */
    enabled: true,
    /** Durée d'apparition / disparition (s), quand des graines apparaissent ou s'éteignent toutes. */
    fade: 1.5,
    /** Opacité de la ligne de fond. */
    lineAlpha: 0.14,
    /** Opacité des graduations (une par pas de grille). */
    tickAlpha: 0.22,
    /** Opacité du point qui parcourt la boucle. */
    headAlpha: 0.75,
    /** Longueur de la traîne du point (fraction de boucle). */
    tailLength: 0.12,
    /** Opacité d'un point de graine (plus le volume restant). */
    seedAlpha: 0.3,
    /** Éclat d'un point de graine au moment où elle tombe (s). */
    seedFlash: 0.8,
  },

  /** Interface. */
  ui: {
    /** Délai avant que le bouton de réglages ne s'estompe (s). */
    buttonFadeDelay: 3,
    /** Durée des fondus d'interface (s). */
    fade: 1.6,
    /** Durée du fondu d'ambiance (couleurs, son) (s). */
    moodFade: 4,
  },
};

export type Config = typeof config;

export type PitchAxis = 'bas-haut' | 'haut-bas' | 'gauche-droite' | 'droite-gauche' | 'centre-bords';

/** Nombre maximal de gouttes injectées dans un même pas (taille du tableau d'uniforms). */
export const MAX_DROPS_PER_STEP = 16;
/** Nombre maximal de flashs affichés simultanément (taille du tableau d'uniforms). */
export const MAX_FLASHES = 16;
/** Nombre maximal de lueurs d'annonce (au plus une par graine). */
export const MAX_OMENS = 24;
