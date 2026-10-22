// Construit, à la résolution de la simulation, une carte filtrable :
//   xy = pente totale (ondes + houle de fond), z = hauteur.
// Le rendu plein écran n'a alors besoin que d'une seule lecture filtrée.
//
// uAlpha interpole entre h[n−1] et h[n] : la simulation tourne à pas fixe
// alors que l'écran peut tourner à 60, 90 ou 120 Hz ; sans cette
// interpolation, le front avancerait par à-coups.

uniform sampler2D uState;
uniform ivec2 uSize;
uniform float uAlpha;
uniform float uTime;
uniform float uPondPerCell;  // taille d'une cellule en unités d'étang
uniform float uRippleNormal;
uniform float uSwellScale;
uniform float uSwellSpeed;
uniform float uSwellStrength;

in vec2 vUv;
out vec4 outNormal;

float H(ivec2 p) {
  p = clamp(p, ivec2(0), uSize - 1);
  vec2 s = decodeState(texelFetch(uState, p, 0));
  return mix(s.y, s.x, uAlpha);
}

// Houle : deux couches de bruit qui glissent dans des directions différentes,
// leur somme évolue lentement au lieu de simplement défiler.
float swell(vec2 w) {
  vec2 a = w * uSwellScale + uTime * uSwellSpeed * vec2(1.0, 0.6) * uSwellScale;
  vec2 b = w * uSwellScale * 2.3 + uTime * uSwellSpeed * vec2(-0.7, 1.0) * uSwellScale * 2.3;
  return snoise(a) + 0.45 * snoise(b + 17.0);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float h = H(p);
  // Différences centrées, en hauteur par cellule.
  vec2 g = vec2(H(p + ivec2(1, 0)) - H(p - ivec2(1, 0)),
                H(p + ivec2(0, 1)) - H(p - ivec2(0, 1))) * 0.5;
  g *= uRippleNormal;

  vec2 w = (vec2(p) + 0.5) * uPondPerCell;
  float e = uPondPerCell * 2.0;
  float s0 = swell(w);
  g += vec2(swell(w + vec2(e, 0.0)) - s0, swell(w + vec2(0.0, e)) - s0) / e * uSwellStrength;

  outNormal = encodeNormal(vec3(g, h));
}
