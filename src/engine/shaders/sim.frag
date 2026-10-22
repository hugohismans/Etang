// Un pas de l'équation d'onde discrète (schéma « saute-mouton ») :
//
//   h[n+1] = (2·h[n] − h[n−1] + c²·∇²h[n]) · amortissement
//
// ∇² est le laplacien isotrope à 9 points, qui donne des anneaux bien ronds
// (le laplacien à 5 points produit des fronts légèrement carrés en diagonale).
// Stabilité : c² < 0.75 pour ce stencil.
//
// Les gouttes sont injectées dans le même passage : on ajoute la bosse à
// h[n] ET à h[n−1], ce qui crée un déplacement sans vitesse initiale. L'eau
// se relâche ensuite d'elle-même et l'anneau naît naturellement.

uniform sampler2D uState;
uniform ivec2 uSize;
uniform float uC2;
uniform float uDamping;       // facteur par pas
uniform float uSpongeCells;   // largeur de la bordure absorbante, en cellules
uniform float uSpongeDamping; // facteur supplémentaire tout au bord

uniform int uDropCount;
uniform vec4 uDrops[MAX_DROPS]; // xy = position (cellules), z = rayon (cellules), w = amplitude

in vec2 vUv;
out vec4 outState;

vec2 load(ivec2 p) {
  // Bord réfléchissant (Neumann) ; la bordure absorbante empêche l'écho visible.
  p = clamp(p, ivec2(0), uSize - 1);
  return decodeState(texelFetch(uState, p, 0));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = load(p);

  float edges = load(p + ivec2(1, 0)).x + load(p + ivec2(-1, 0)).x
              + load(p + ivec2(0, 1)).x + load(p + ivec2(0, -1)).x;
  float diags = load(p + ivec2(1, 1)).x + load(p + ivec2(-1, 1)).x
              + load(p + ivec2(1, -1)).x + load(p + ivec2(-1, -1)).x;
  float lap = (4.0 * edges + diags - 20.0 * c.x) / 6.0;

  float h = 2.0 * c.x - c.y + uC2 * lap;
  float prev = c.x;

  // Bordure absorbante : amortissement qui croît en douceur vers les bords.
  vec2 fp = vec2(p) + 0.5;
  vec2 sz = vec2(uSize);
  float edge = min(min(fp.x, sz.x - fp.x), min(fp.y, sz.y - fp.y));
  float s = 1.0 - smoothstep(0.0, uSpongeCells, edge);
  float damp = uDamping * mix(1.0, uSpongeDamping, s * s);
  h *= damp;
  prev = mix(prev, prev * damp, s); // amortit aussi la mémoire dans la bordure

  // Injection des gouttes : bosse en cloche (cosinus surélevé, support compact).
  for (int i = 0; i < MAX_DROPS; i++) {
    if (i >= uDropCount) break;
    vec4 d = uDrops[i];
    float r = length(fp - d.xy) / d.z;
    if (r < 1.0) {
      float bump = 0.5 + 0.5 * cos(3.14159265 * r);
      bump *= d.w;
      h += bump;
      prev += bump;
    }
  }

  outState = encodeState(vec2(h, prev));
}
