// Recopie l'état existant dans une grille de taille différente
// (redimensionnement, rotation) pour ne pas effacer les ondes en cours.
uniform sampler2D uSrc;
uniform ivec2 uSrcSize;
in vec2 vUv;
out vec4 outState;
void main() {
  ivec2 p = clamp(ivec2(vUv * vec2(uSrcSize)), ivec2(0), uSrcSize - 1);
  outState = texelFetch(uSrc, p, 0);
}
