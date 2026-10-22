// Rendu de la surface vue du dessus, de nuit.
//
// La normale vient de la carte calculée par normals.frag. La caméra est
// placée au-dessus du centre, à hauteur uCamHeight : la direction de vue
// varie donc d'un pixel à l'autre, et le reflet de la lune se forme à un
// endroit précis de l'écran (là où la réflexion du regard pointe vers la
// lune). Les micro-ridules brisent ce reflet en scintillements.

uniform sampler2D uNormals;
uniform vec2 uPond;          // taille de l'écran en unités d'étang
uniform float uTime;

uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uCrest;
uniform vec3 uMoon;
uniform vec3 uFlashColor;

uniform float uCrestGain;
uniform float uTroughDarken;
uniform float uSlopeGain;
uniform float uSkyGain;
uniform float uGlintScale;
uniform float uGlintSpeed;
uniform float uGlintStrength;
uniform float uCamHeight;
uniform vec3 uMoonDir;
uniform float uMoonShininess;
uniform float uMoonGain;
uniform float uMoonGlowShininess;
uniform float uMoonGlowGain;

uniform float uVignette;
uniform float uExposure;
uniform float uDither;

uniform int uFlashCount;
uniform vec4 uFlashes[MAX_FLASHES];   // xy = position (unités d'étang), z = âge (s), w = intensité
uniform vec4 uFlashShape;             // x = rayon, y = croissance, z = décroissance, w = attaque

in vec2 vUv;
out vec4 outColor;

vec2 glint(vec2 w) {
  // Gradient numérique d'un bruit de valeur animé (2 couches décalées dans le temps).
  vec2 p = w * uGlintScale;
  float t = uTime * uGlintSpeed;
  float e = 0.35;
  vec2 o1 = vec2(t, -t * 0.7);
  vec2 o2 = vec2(-t * 0.8, t * 0.5) + 31.7;
  float n0 = vnoise(p + o1) + vnoise(p * 1.7 + o2);
  float nx = vnoise(p + vec2(e, 0.0) + o1) + vnoise((p + vec2(e, 0.0)) * 1.7 + o2);
  float ny = vnoise(p + vec2(0.0, e) + o1) + vnoise((p + vec2(0.0, e)) * 1.7 + o2);
  return vec2(nx - n0, ny - n0) / e;
}

void main() {
  vec3 nh = decodeNormal(texture(uNormals, vUv));
  vec2 wp = (vUv - 0.5) * uPond;     // position en unités d'étang, centre = 0
  float h = nh.z;

  vec3 N = normalize(vec3(-nh.xy, 1.0));
  vec3 V = normalize(vec3(-wp, uCamHeight));
  vec3 R = reflect(-V, N);
  vec3 L = normalize(uMoonDir);
  // Normale « fine » réservée au reflet de lune : les micro-ridules le
  // brisent en paillettes sans texturer le reste de l'eau.
  vec3 Ng = normalize(vec3(-(nh.xy + glint(wp) * uGlintStrength), 1.0));
  vec3 Rg = reflect(-V, Ng);

  vec3 col = uDeep;

  // Ciel reflété : plus la normale s'incline, plus on voit le ciel bas,
  // légèrement plus clair. Mesuré par rapport à une eau plate.
  vec3 Rflat = vec3(wp, uCamHeight) / length(vec3(wp, uCamHeight));
  float tilt = (Rflat.z - R.z);
  col += uSky * max(tilt, 0.0) * uSkyGain;

  // Éclairage de pente, signé : un flanc s'éclaire, l'autre s'assombrit.
  float slope = dot(N, L) - dot(vec3(0.0, 0.0, 1.0), L);
  col += uCrest * slope * uSlopeGain;
  col = max(col, uDeep * 0.45); // l'ombre d'un flanc ne doit jamais trouer l'eau en noir pur

  // Crêtes lumineuses, creux sombres.
  col += uCrest * max(h, 0.0) * uCrestGain;
  col *= 1.0 - clamp(-h * uTroughDarken, 0.0, 0.8);

  // Lune : reflet net + halo faible.
  float rg = max(dot(Rg, L), 0.0);
  float rl = max(dot(R, L), 0.0);
  col += uMoon * (pow(rg, uMoonShininess) * uMoonGain + pow(rl, uMoonGlowShininess) * uMoonGlowGain);

  // Flashs d'impact.
  for (int i = 0; i < MAX_FLASHES; i++) {
    if (i >= uFlashCount) break;
    vec4 f = uFlashes[i];
    float age = f.z;
    float env = (1.0 - exp(-age / uFlashShape.w)) * exp(-age / uFlashShape.z);
    float r = uFlashShape.x + uFlashShape.y * age;
    float d = length(wp - f.xy) / r;
    col += uFlashColor * f.w * env * exp(-d * d);
  }

  // Vignette douce (le centre de l'étang est légèrement plus présent).
  vec2 q = (vUv - 0.5) * 2.0;
  col *= 1.0 - uVignette * smoothstep(0.4, 1.6, dot(q, q));

  // Tone mapping doux puis sRGB.
  col = 1.0 - exp(-col * uExposure);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));

  // Tramage : supprime les bandes visibles dans les dégradés très sombres.
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * uDither / 255.0;

  outColor = vec4(col, 1.0);
}
