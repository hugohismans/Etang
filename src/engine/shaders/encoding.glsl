// Encodage des textures selon les capacités du GPU.
// - textures flottantes : stockage direct ;
// - repli RGBA8 (SIM_PACKED / NORMAL_PACKED) : chaque valeur sur 16 bits répartis
//   sur deux canaux 8 bits, dans une plage fixe.

#define STATE_RANGE 4.0
#define NORMAL_RANGE 8.0

vec2 pack16(float v, float range) {
  float x = clamp(v / range * 0.5 + 0.5, 0.0, 1.0) * 65535.0;
  float hi = floor(x / 256.0);
  float lo = x - hi * 256.0;
  return vec2(hi, lo) / 255.0;
}
float unpack16(vec2 c, float range) {
  vec2 b = floor(c * 255.0 + 0.5);
  float x = (b.x * 256.0 + b.y) / 65535.0;
  return (x * 2.0 - 1.0) * range;
}

// État de la simulation : x = hauteur au pas n, y = hauteur au pas n-1.
vec4 encodeState(vec2 s) {
#ifdef SIM_PACKED
  return vec4(pack16(s.x, STATE_RANGE), pack16(s.y, STATE_RANGE));
#else
  return vec4(s, 0.0, 1.0);
#endif
}
vec2 decodeState(vec4 c) {
#ifdef SIM_PACKED
  return vec2(unpack16(c.xy, STATE_RANGE), unpack16(c.zw, STATE_RANGE));
#else
  return c.xy;
#endif
}

// Carte de normales (filtrée linéairement au rendu) : xy = pente, z = hauteur.
// En repli 8 bits, on stocke sign(v)·√|v| : la précision est concentrée près
// de zéro, là où l'eau calme rendrait sinon des aplats en escalier.
vec4 encodeNormal(vec3 n) {
#ifdef NORMAL_PACKED
  vec3 c = sign(n) * sqrt(min(abs(n) / NORMAL_RANGE, 1.0));
  return vec4(c * 0.5 + 0.5, 1.0);
#else
  return vec4(n, 1.0);
#endif
}
vec3 decodeNormal(vec4 c) {
#ifdef NORMAL_PACKED
  vec3 v = c.xyz * 2.0 - 1.0;
  return sign(v) * v * v * NORMAL_RANGE;
#else
  return c.xyz;
#endif
}
