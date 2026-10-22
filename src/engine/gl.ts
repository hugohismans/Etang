/** Petits utilitaires WebGL2 sans dépendance. */

export interface Program {
  program: WebGLProgram;
  /** Emplacements des uniforms, indexés par nom (`uDrops` pour un tableau `uDrops[0]`). */
  u: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader a échoué');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    gl.deleteShader(sh);
    const numbered = src
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)} ${l}`)
      .join('\n');
    throw new Error(`Erreur de compilation du shader :\n${log}\n${numbered}`);
  }
  return sh;
}

/**
 * Compile un programme. `chunks` sont concaténés après l'en-tête (version,
 * précision, #define), ce qui permet de partager encodage et bruit.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragChunks: string[],
  defines: Record<string, string | number | boolean>,
): Program {
  const header =
    '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
    Object.entries(defines)
      .filter(([, v]) => v !== false)
      .map(([k, v]) => `#define ${k} ${v === true ? '' : v}`)
      .join('\n') +
    '\n';
  const vs = compile(gl, gl.VERTEX_SHADER, header + vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, header + fragChunks.join('\n'));
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram a échoué');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Erreur d'édition de liens : ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(program, info.name);
  }
  return { program, u };
}

export interface TexFormat {
  internal: number;
  format: number;
  type: number;
}

export interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

/** Crée une texture et son framebuffer. Renvoie null si le format n'est pas rendable. */
export function createTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  fmt: TexFormat,
  filter: number,
): Target | null {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (!ok) {
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
    return null;
  }
  return { tex, fbo, w, h };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null): void {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fbo);
}
