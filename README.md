# Étang

Un instrument génératif contemplatif. Un étang vu du dessus, de nuit : chaque
toucher fait tomber une goutte, une onde lumineuse s'étend, une note se joue.
Les ondes qui se croisent répondent en harmonie, et chaque goutte revient en
boucle en dérivant un peu, si bien que la composition mute lentement d'elle-même.

Inspiration : *Bloom* (Brian Eno & Peter Chilvers), avec une vraie physique
d'ondes et une boucle qui évolue au lieu de se répéter.

Une seule page, sans backend, installable (PWA) et utilisable hors ligne.

## Lancer

```bash
npm install
npm run dev        # serveur local, exposé sur le réseau : pratique pour tester sur téléphone
npm run build      # build statique dans dist/
npm run preview    # sert dist/ (service worker actif)
npm run check      # vérification TypeScript / Svelte
```

Chaque push sur `main` est construit et publié sur GitHub Pages
(`.github/workflows/deploy.yml`). Le chemin de base est relatif (`./`), donc le
site marche aussi dans un sous-dossier. Pour forcer un chemin absolu :
`BASE_PATH=/Etang/ npm run build`.

Paramètres d'URL utiles :

- `?debug` : affiche fps et nombre de graines, expose `window.etang`
  (`etang.config`, `etang.pond`, `etang.water`). Les constantes se modifient à
  chaud dans la console, par ex. `etang.config.seeds.driftAmplitude = 0.06`.
- `?tier=f16` ou `?tier=packed` : force un format de texture de repli.

## Le concept, règle par règle

### Une goutte

- **Image** : un petit flash, puis une onde qui s'étend à vitesse constante et
  s'éteint en ~6 s. L'onde vit dans une vraie simulation de hauteur d'eau,
  donc les ondes interfèrent d'elles-mêmes.
- **Hauteur** : l'écran est découpé en 11 bandes horizontales, une par note.
  En bas le plus grave, en haut le plus aigu, sur deux octaves de la gamme
  pentatonique de l'ambiance. Rien ne peut sonner faux, et toucher la même
  bande rejoue toujours la même note.
- **Repères** : à chaque toucher, les bandes apparaissent faiblement sur l'eau
  puis s'effacent. Celle qu'on vient de toucher s'éclaire un peu plus. Les
  trois bandes « maison » (la tonique de chaque octave : en bas, au milieu, en
  haut) sont légèrement éclairées : une phrase qui finit dessus sonne « finie ».
- **Timbre** : cloche douce. Fondamentale sinus (doublée d'une jumelle
  désaccordée de 3 cents pour un battement lent) et trois partiels
  inharmoniques faibles (×2.76, ×5.40, ×8.93) qui meurent plus vite. Attaque
  de 20 ms, décroissance de 3,2 à 5 s, réverbération généreuse.
- **Vie** : vélocité ±15 % et accordage ±4 cents aléatoires à chaque note,
  panoramique selon la position horizontale.

### Les croisements

La première fois que les fronts de deux ondes se touchent, une étincelle
s'allume au point de contact et une note plus fine joue : la quinte (si elle
est dans la gamme) ou l'octave au-dessus de la plus grave des deux notes.

Calcul analytique, sans lire le GPU : deux fronts de même vitesse `v`, nés en
`t0a ≤ t0b` à une distance `d`, se touchent en `t = (d/v + t0a + t0b) / 2`, sur
le segment entre les centres. Si la première onde avait déjà englobé le centre
de la seconde à sa naissance, ils ne se croisent jamais. Chaque paire ne
déclenche qu'une fois, au plus 4 croisements par seconde.

### La boucle qui mute

Chaque goutte posée devient une **graine** :

| Règle | Défaut |
| --- | --- |
| Retombe toutes les N s, au même endroit, à sa propre phase | N = 8 s |
| Retours alignés sur une grille de 1/8 de boucle (le tap, lui, est immédiat) | 1 s |
| Volume multiplié à chaque passage | × 0,8 |
| S'éteint après 6 passages, ou sous un volume seuil | 6 / 0,12 |
| **Dérive** : pas aléatoire gaussien à chaque retour, uniquement de gauche à droite : la goutte bouge, la note reste (`keepNote`) | σ = 0,035 |
| **Fusion** : deux graines à moins de d fusionnent → onde plus ample, une octave plus bas, volumes additionnés (plafonnés) | d = 0,06 |
| **Engendrement** : à chaque passage, chance de créer une fille à gauche ou à droite (même note, comme un écho), plus faible (×0,6), 3 vies, décalée de 1 à 3 pas de grille | 5 % |
| Au plus 24 graines ; au-delà, les plus faibles s'éteignent | 24 |

(Distances en *unités d'étang* : le petit côté de l'écran vaut 1.)

### Repères de boucle

- **Frise** en haut de l'écran : une ligne = une boucle (8 s), avec une
  graduation par pas de grille. Une barre la parcourt ; chaque goutte en
  boucle y est un point, placé à l'instant où elle retombe, qui s'illumine
  quand elle tombe. La frise n'apparaît que s'il y a des gouttes en boucle.
- **Lueur d'annonce** : 2 s avant chaque retour, un halo monte doucement sous
  l'eau, là où la goutte va tomber.

Pour que la lueur soit au bon endroit, la dérive est tirée juste après chaque
chute (pour la suivante), et non au moment de la chute.

### Sans interaction

Aucune goutte ne tombe d'elle-même : seules les gouttes du joueur (et les
graines qu'elles engendrent) existent. Sans toucher, l'étang finit par se taire.

### Ambiances

| | Gamme | Couleurs | Son |
| --- | --- | --- | --- |
| **Nuit** (défaut) | pentatonique mineure de Ré | bleu nuit, argent | réverbération longue (7 s) |
| **Aube** | pentatonique majeure de Mi | bleu-gris, rose pâle | réverbération moyenne (4,5 s), timbre plus brillant |
| **Brume** | pentatonique suspendue de La (La Si Ré Mi Sol) | vert d'eau, gris | passe-bas fermé, ondes plus larges et floues |

Le changement se fait en fondu de 4 s (couleurs, filtre, réverbération par
fondu enchaîné entre deux convolveurs) sans toucher aux graines en cours. Les
nouvelles notes suivent immédiatement la nouvelle gamme.

## Régler le ressenti

**Toutes** les constantes sont dans [`src/engine/config.ts`](src/engine/config.ts),
groupées et commentées ; les ambiances (gammes, couleurs, réverbération,
filtre) dans [`src/engine/moods.ts`](src/engine/moods.ts). Les plus parlantes :

| Constante | Effet |
| --- | --- |
| `water.waveSpeed` | vitesse des ondes (unités d'étang/s) |
| `water.damping` | durée de vie visuelle des ondes |
| `drop.radius` | largeur de l'impact (plus large = onde plus floue) |
| `surface.rippleNormal`, `crestGain` | relief et lumière des ondes |
| `surface.moonGain`, `glintStrength` | présence et scintillement du reflet de lune |
| `bell.decayMin/Max`, `bell.partials` | longueur et couleur de la cloche |
| `chime.*` | note des croisements |
| `seeds.loopDuration`, `gridDivisions` | tempo de la boucle et finesse de la grille |
| `seeds.lives`, `volumeDecay` | combien de temps une mélodie survit |
| `seeds.driftAmplitude` | vitesse de mutation de la mélodie |
| `seeds.mergeDistance`, `spawnChance` | fréquence des fusions et naissances |
| `crossings.maxPerSecond` | densité des notes harmoniques |
| `pitch.axis` | sens grave → aigu : `'bas-haut'` (défaut), `'gauche-droite'` (comme un piano), `'droite-gauche'`, `'haut-bas'`, `'centre-bords'` (ancien mode) |
| `pitch.octaves` | nombre d'octaves, donc de bandes (5 par octave + 1) |
| `seeds.keepNote` | `false` pour que la dérive fasse muter la mélodie (concept d'origine) |
| `lanes.*` | visibilité et durée des repères de notes |
| `timeline.*` | frise de boucle (`enabled: false` pour la masquer) |
| `omen.*` | lueur d'annonce avant chaque retour (`gain: 0` pour la retirer) |
| `render.maxPixelRatio`, `water.simShortSide` | performances sur mobile |

Si on change `water.waveSpeed` ou la résolution de simulation, vérifier
`crossings.speedFactor` : il cale l'étincelle sur la crête visible (la grille
ralentit un peu la crête, mesuré à ≈ 0,94 × la vitesse théorique).

## Architecture

```
src/
  App.svelte           canvas plein écran, pointeurs, overlay, bouton, panneau
  settings.ts          ambiance et volume mémorisés (localStorage)
  engine/
    config.ts          toutes les constantes de ressenti
    pond.ts            chef d'orchestre : horloge → graines → croisements → audio + eau
    clock.ts           temps commun, dérivé de l'AudioContext
    water.ts           simulation WebGL2 et rendu
    shaders/           GLSL : simulation, normales, rendu, utilitaires
    audio.ts           synthés, réverbération, bus master, vol de voix
    scales.ts          gammes, position → note, note harmonique
    seeds.ts           graines, boucle, dérive, fusion, engendrement
  timeline.ts          dessin de la frise de boucle
    crossings.ts       détection analytique des croisements
    moods.ts           les trois ambiances
public/                manifeste, icônes, service worker
```

### Image

1. **Simulation** (`sim.frag`) : grille de hauteurs (256 cellules sur le petit
   côté, indépendante de l'écran), équation d'onde discrète
   `h[n+1] = (2h[n] − h[n−1] + c²∇²h[n]) · amortissement`, en ping-pong entre deux
   textures, laplacien isotrope à 9 points (anneaux bien ronds), bordure
   absorbante (pas d'écho sur les bords). Une goutte ajoute une bosse à `h[n]`
   et `h[n−1]` : l'eau se relâche et l'anneau naît tout seul.
2. **Normales** (`normals.frag`) : pente + houle de fond très lente, à la
   résolution de la simulation, dans une texture filtrable. L'affichage
   interpole entre les deux derniers pas : fluide à 60, 90 ou 120 Hz.
3. **Rendu** (`render.frag`) : caméra au-dessus du centre ; crêtes lumineuses,
   creux sombres, flancs éclairés, ciel reflété, reflet de lune brisé en
   paillettes, flashs et étincelles, tone mapping doux, tramage anti-banding.

### Son et synchronisation

Le temps de toute l'app est dérivé de `AudioContext.getOutputTimestamp()` :
l'instant audio qui sort *maintenant* des haut-parleurs, interpolé avec
`performance.now()`. Les retours de graines et les croisements sont calculés
250 ms à l'avance et programmés dans l'audio à leur instant exact ; leur image
est mise en file et déclenchée quand l'horloge l'atteint. Image et son restent
alignés, latence de sortie comprise.

Bus master : passe-bas d'ambiance → sec + deux convolveurs (réponse
impulsionnelle procédurale : bruit stéréo à décroissance exponentielle, de
plus en plus sombre) → compresseur doux → saturation tanh (limiteur doux) →
volume. Toutes les enveloppes passent par des rampes ; au-delà de 24 voix, la
plus ancienne est éteinte par une rampe de 60 ms.

## Robustesse

- **iOS / déblocage audio** : l'AudioContext est créé au premier toucher et
  relancé dans `pointerdown`, `pointerup` et `touchend` (selon les navigateurs,
  seuls certains comptent comme geste). Un tampon silencieux est joué dans le
  geste, et `navigator.audioSession.type = 'playback'` (iOS 16.4+) permet
  d'entendre l'étang même interrupteur silencieux activé.
- **Arrière-plan** : le son est suspendu quand l'onglet est masqué et repris
  au retour ; l'horloge ne compte pas le temps passé en arrière-plan, la
  boucle reprend où elle était.
- **WebGL** : formats float32 → float16 → RGBA8 empaqueté selon le GPU ;
  perte de contexte gérée ; redimensionnement et rotation conservent les ondes.
- **PWA** : manifeste + service worker minimal (page en réseau d'abord, fichiers
  versionnés en cache d'abord) ; l'étang fonctionne hors ligne après une visite.

## Décisions de design non spécifiées

Quand un choix n'était pas couvert, j'ai pris l'option la plus lente et la plus douce :

- La goutte **creuse** l'eau, comme une vraie goutte ; les bords **absorbent**
  les ondes plutôt que de les renvoyer.
- Les micro-ridules ne touchent **que** le reflet de lune ; la houle de fond
  est presque imperceptible.
- **Tessiture** : bandes horizontales plutôt que verticales. En portrait, la
  hauteur de l'écran donne des bandes d'environ 75 px, assez larges pour viser
  avec le doigt (en largeur, on tomberait sous 40 px). « Haut = aigu » est
  aussi le sens le plus intuitif. La tonique est en Ré 4 / Mi 4 / La 3 : les
  haut-parleurs de téléphone ne rendent presque rien sous 200 Hz.
- **Contrôle avant mutation** : la dérive, les filles et les fusions gardent
  la bande de la note (une fusion descend seulement d'une octave). La mélodie
  jouée est donc reconnaissable à chaque retour ; elle ne mute que par
  l'extinction progressive, les échos et les fusions.
- **Brume** : l'exemple « Do Ré Mi Sol La avec tonique sur La » est
  exactement la pentatonique mineure de La, donc la même couleur que Nuit.
  J'ai pris la pentatonique *suspendue* (La Si Ré Mi Sol) : sans tierce, ni
  majeure ni mineure — vraiment ambiguë. Pour revenir à l'exemple :
  `intervals: [0, 3, 5, 7, 10]` dans `moods.ts`.
- **Graine** : le tap compte comme premier passage (volume 1) ; les 6 vies
  sont 6 *retours*, chacun à ×0,8 du précédent. La dérive s'applique avant
  le retour, la fusion juste après.
- **Fusion** : au plus 2 niveaux (deux octaves sous la note de position) ; la
  graine fusionnée garde le plus grand nombre de vies des deux.
- **Engendrement** : la fille est décalée de 1 à 3 pas de grille, pour que la
  naissance s'entende comme une nouvelle voix et non comme un doublon.
- **Croisements** : volume = moyenne géométrique des deux ondes, atténué avec
  l'âge de l'onde la plus ancienne ; un croisement hors de l'écran est muet.
- **Vider l'étang** : rien ne coupe net. L'eau est fortement amortie pendant
  2,5 s puis revient à la normale, les notes en cours s'éteignent en 1,5 s.
- **Panneau** : le bouton estompé reste cliquable à sa place. Quand le panneau
  est ouvert, le premier toucher sur l'eau le referme sans faire de goutte.
- **Overlay** « Touche l'eau » : à chaque chargement (le son doit de toute
  façon être débloqué par un geste à chaque visite). Il respire lentement.
- L'ambiance et le volume sont mémorisés d'une visite à l'autre.
