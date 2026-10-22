# Étang

Un instrument génératif contemplatif. Un étang vu du dessus, de nuit : chaque
toucher fait tomber une goutte, une onde lumineuse s'étend, une note se joue.
Les ondes qui se croisent répondent en harmonie, et chaque goutte revient en
boucle en dérivant un peu, si bien que la composition mute lentement d'elle-même.

Inspiration : *Bloom* (Brian Eno & Peter Chilvers), avec une vraie physique
d'ondes et une boucle qui évolue au lieu de se répéter.

> État : **étape 1** — surface d'eau WebGL2 et ondes au toucher (pas encore de son).

## Lancer

```bash
npm install
npm run dev        # serveur local (accessible sur le réseau, pratique pour tester sur téléphone)
npm run build      # build statique dans dist/
npm run check      # vérification TypeScript / Svelte
```

Paramètres d'URL utiles :

- `?debug` : affiche les fps et expose `window.etang` (`etang.config`, `etang.water`).
  Les constantes se modifient à chaud dans la console, par ex.
  `etang.config.water.waveSpeed = 0.08`.
- `?tier=f16` ou `?tier=packed` : force le format de texture de repli
  (pour vérifier le rendu sur un GPU sans textures flottantes).

## Comment l'eau fonctionne

1. **Simulation** (`src/engine/shaders/sim.frag`) : une grille de hauteurs
   (256 cellules sur le petit côté, le grand suit le ratio) évolue selon
   l'équation d'onde discrète `h[n+1] = (2h[n] − h[n−1] + c²∇²h[n]) · amortissement`,
   en ping-pong entre deux textures. Le laplacien isotrope à 9 points donne
   des anneaux ronds. L'interférence entre ondes est gratuite.
2. **Gouttes** : une bosse en cosinus (creuse par défaut) est ajoutée à `h[n]`
   et `h[n−1]` ; l'eau se relâche et l'anneau naît tout seul.
3. **Bords** : une bordure absorbante évite les échos sur les bords de l'écran.
4. **Normales** (`normals.frag`) : pente de la simulation + houle de fond
   (deux couches de bruit simplex qui glissent lentement), calculées à la
   résolution de la simulation dans une texture filtrable. L'affichage
   interpole entre les deux derniers pas : la simulation tourne à pas fixe,
   l'écran peut tourner à 60/90/120 Hz sans à-coups.
5. **Rendu** (`render.frag`) : caméra au-dessus du centre. Crêtes lumineuses,
   creux assombris, flancs éclairés par la lune, reflet du ciel selon la
   pente, reflet de lune brisé en paillettes par des micro-ridules, flash à
   l'impact, vignette, tone mapping doux et tramage anti-banding.

Le pas de temps est dérivé de la vitesse voulue : `pas/s = vitesse × cellules / √c²`.
Changer la résolution ne change donc ni la vitesse ni la durée de vie des ondes.

## Régler le ressenti

Tout est dans [`src/engine/config.ts`](src/engine/config.ts), commenté.
Les plus parlants :

| Constante | Effet |
| --- | --- |
| `water.waveSpeed` | vitesse du front (unités d'étang/s ; petit côté de l'écran = 1) |
| `water.damping` | part d'amplitude restante après 1 s — durée de vie des ondes |
| `water.simShortSide` | finesse de la simulation (coût GPU au carré) |
| `drop.radius` / `drop.amplitude` | largeur et force de l'impact (plus large = onde plus floue) |
| `surface.rippleNormal` | relief visible des ondes |
| `surface.crestGain` / `troughDarken` | lumière des crêtes, ombre des creux |
| `surface.swellStrength` | présence de la houle de fond |
| `surface.moonGain` / `glintStrength` | intensité et scintillement du reflet de lune |
| `render.maxPixelRatio` | résolution d'affichage (performance sur mobile) |

## Robustesse

- Formats de texture : float32 → float16 → RGBA8 « empaqueté » (16 bits sur
  deux canaux pour l'état, racine carrée pour les normales) selon le GPU.
- Perte de contexte WebGL : le contexte est restauré et l'étang repart au calme.
- Redimensionnement / rotation : la grille est réallouée et les ondes en
  cours sont recopiées dans la nouvelle grille.

## Décisions de design non spécifiées

Quand un choix n'était pas couvert, j'ai pris l'option la plus lente et la plus douce :

- La goutte **creuse** l'eau (amplitude négative), comme une vraie goutte.
- Les bords **absorbent** les ondes plutôt que de les renvoyer (pas d'écho).
- Les micro-ridules ne touchent **que** le reflet de lune, pour ne pas texturer toute l'eau.
- La houle de fond est volontairement presque imperceptible.
