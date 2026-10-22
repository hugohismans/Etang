/**
 * Surface de l'étang : simulation de hauteur d'eau sur GPU et rendu.
 *
 * Pipeline par image :
 *   1. N pas de simulation (ping-pong entre deux textures d'état), les gouttes
 *      en attente étant injectées au premier pas ;
 *   2. passage « normales » à la résolution de la simulation (pente + houle) ;
 *   3. rendu plein écran, qui éclaire la surface à partir de cette carte.
 *
 * Coordonnées publiques : x, y dans [0, 1], origine en haut à gauche
 * (comme les événements pointeur). Les distances physiques sont exprimées en
 * « unités d'étang » : le petit côté de l'écran vaut 1.
 */
import { config, MAX_DROPS_PER_STEP, MAX_FLASHES } from './config';
import { createProgram, createTarget, deleteTarget, type Program, type Target, type TexFormat } from './gl';
import type { Palette } from './moods';

import vertSrc from './shaders/fullscreen.vert?raw';
import encodingSrc from './shaders/encoding.glsl?raw';
import noiseSrc from './shaders/noise.glsl?raw';
import simSrc from './shaders/sim.frag?raw';
import normalsSrc from './shaders/normals.frag?raw';
import renderSrc from './shaders/render.frag?raw';
import clearSrc from './shaders/clear.frag?raw';
import copySrc from './shaders/copy.frag?raw';

interface PendingDrop {
  x: number;
  y: number;
  /** Multiplie l'amplitude configurée. */
  strength: number;
  /** Multiplie le rayon configuré. */
  size: number;
}

interface Flash {
  /** Position en unités d'étang (centre = 0, y vers le haut). */
  px: number;
  py: number;
  born: number;
  intensity: number;
}

export type Tier = 'f32' | 'f16' | 'packed';

interface Formats {
  tier: Tier;
  state: TexFormat;
  normal: TexFormat;
}

export class Water {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  formats: Formats | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private progSim: Program | null = null;
  private progNormals: Program | null = null;
  private progRender: Program | null = null;
  private progClear: Program | null = null;
  private progCopy: Program | null = null;

  private state: [Target, Target] | null = null;
  private normals: Target | null = null;

  private cssW = 1;
  private cssH = 1;
  private simW = 0;
  private simH = 0;
  private simShort = 1;

  private lastTime: number | null = null;
  private acc = 0;
  private time = 0;
  private pending: PendingDrop[] = [];
  private flashes: Flash[] = [];
  private palette: Palette;
  private lost = false;

  private readonly dropBuf = new Float32Array(MAX_DROPS_PER_STEP * 4);
  private readonly flashBuf = new Float32Array(MAX_FLASHES * 4);

  /** Appelé quand le contexte est perdu puis restauré (pour information). */
  onContextChange: ((lost: boolean) => void) | null = null;

  /** Force un format de texture (test du mode de repli). */
  private readonly forceTier: Tier | null;

  constructor(canvas: HTMLCanvasElement, palette: Palette, options: { forceTier?: Tier } = {}) {
    this.canvas = canvas;
    this.palette = palette;
    this.forceTier = options.forceTier ?? null;
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    this.initGL();
  }

  /** WebGL2 disponible et initialisé ? */
  get ready(): boolean {
    return this.gl !== null && !this.lost && this.state !== null;
  }

  /** Taille de l'écran en unités d'étang (le petit côté vaut 1). */
  get pondSize(): { w: number; h: number } {
    const s = Math.min(this.cssW, this.cssH);
    return { w: this.cssW / s, h: this.cssH / s };
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  /** Programme une goutte. x, y dans [0, 1], origine en haut à gauche. */
  drop(x: number, y: number, strength = 1, size = 1): void {
    this.pending.push({ x, y, strength, size });
  }

  /** Allume un flash lumineux. Même repère que `drop`. */
  flash(x: number, y: number, intensity = 1): void {
    const { w, h } = this.pondSize;
    this.flashes.push({ px: (x - 0.5) * w, py: (0.5 - y) * h, born: this.time, intensity });
    if (this.flashes.length > MAX_FLASHES) this.flashes.shift();
  }

  /** Vide l'étang : toutes les ondes disparaissent. */
  calm(): void {
    const gl = this.gl;
    if (!gl || !this.state || !this.progClear) return;
    gl.useProgram(this.progClear.program);
    for (const t of this.state) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** À appeler quand la taille CSS du canvas change. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    const ratio = Math.min(dpr, config.render.maxPixelRatio);
    const w = Math.max(1, Math.round(this.cssW * ratio));
    const h = Math.max(1, Math.round(this.cssH * ratio));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.allocateSim();
  }

  /**
   * Avance la simulation jusqu'au temps `t` (secondes) et dessine.
   * La simulation tourne à pas fixe ; l'affichage interpole entre les deux
   * derniers pas pour rester fluide quelle que soit la fréquence d'écran.
   */
  frame(t: number): void {
    const gl = this.gl;
    if (!gl || this.lost || !this.state || !this.normals || !this.formats) return;
    if (this.lastTime === null) this.lastTime = t;
    const dt = Math.min(Math.max(t - this.lastTime, 0), config.render.maxFrameDt);
    this.lastTime = t;
    this.time += dt;

    const wc = config.water;
    const c2 = Math.min(Math.max(wc.courant2, 0.01), 0.74);
    // Le front avance de √c² cellule par pas (vitesse de phase aux grandes longueurs d'onde).
    const stepsPerSecond = (wc.waveSpeed * this.simShort) / Math.sqrt(c2);
    const dampPerStep = Math.pow(Math.min(Math.max(wc.damping, 0), 1), 1 / stepsPerSecond);

    this.acc += dt * stepsPerSecond;
    let steps = Math.floor(this.acc);
    // Une goutte en attente force un pas, rattrapé ensuite (acc devient négatif).
    if (steps === 0 && this.pending.length > 0) steps = 1;
    if (steps > wc.maxStepsPerFrame) {
      steps = wc.maxStepsPerFrame;
      this.acc = steps + (this.acc % 1);
    }
    this.acc -= steps;

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    for (let i = 0; i < steps; i++) this.simStep(c2, dampPerStep);

    const alpha = Math.min(Math.max(this.acc, 0), 1);
    this.normalsPass(alpha);
    this.renderPass();
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    this.freeAll();
    this.gl = null;
  }

  // ---------------------------------------------------------------------------

  private handleLost = (e: Event): void => {
    // preventDefault indique au navigateur qu'on sait restaurer le contexte.
    e.preventDefault();
    this.lost = true;
    this.state = null;
    this.normals = null;
    this.onContextChange?.(true);
  };

  private handleRestored = (): void => {
    this.lost = false;
    this.initGL();
    this.simW = 0;
    this.allocateSim();
    this.onContextChange?.(false);
  };

  private initGL(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    });
    if (!gl) {
      this.gl = null;
      return;
    }
    this.gl = gl;
    this.formats = this.detectFormats(gl);
    const defines = {
      MAX_DROPS: MAX_DROPS_PER_STEP,
      MAX_FLASHES,
      SIM_PACKED: this.formats.tier === 'packed',
      NORMAL_PACKED: this.formats.tier === 'packed',
    };
    this.vao = gl.createVertexArray();
    this.progSim = createProgram(gl, vertSrc, [encodingSrc, simSrc], defines);
    this.progNormals = createProgram(gl, vertSrc, [encodingSrc, noiseSrc, normalsSrc], defines);
    this.progRender = createProgram(gl, vertSrc, [encodingSrc, noiseSrc, renderSrc], defines);
    this.progClear = createProgram(gl, vertSrc, [encodingSrc, clearSrc], defines);
    this.progCopy = createProgram(gl, vertSrc, [encodingSrc, copySrc], defines);
  }

  /** Choisit le meilleur format de texture que le GPU sait utiliser comme cible de rendu. */
  private detectFormats(gl: WebGL2RenderingContext): Formats {
    const f32: TexFormat = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    const f16: TexFormat = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    const u8: TexFormat = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    const hasFloat = gl.getExtension('EXT_color_buffer_float') !== null;
    const hasHalf = hasFloat || gl.getExtension('EXT_color_buffer_half_float') !== null;
    const works = (fmt: TexFormat, filter: number): boolean => {
      const t = createTarget(gl, 4, 4, fmt, filter);
      deleteTarget(gl, t);
      return t !== null;
    };
    if (this.forceTier === 'packed') return { tier: 'packed', state: u8, normal: u8 };
    if (this.forceTier !== 'f16' && hasFloat && works(f32, gl.NEAREST) && works(f16, gl.LINEAR)) {
      return { tier: 'f32', state: f32, normal: f16 };
    }
    if (hasHalf && works(f16, gl.NEAREST)) {
      return { tier: 'f16', state: f16, normal: f16 };
    }
    return { tier: 'packed', state: u8, normal: u8 };
  }

  /** (Ré)alloue la grille de simulation si sa taille doit changer, en conservant les ondes. */
  private allocateSim(): void {
    const gl = this.gl;
    if (!gl || this.lost || !this.formats) return;
    const wc = config.water;
    const aspect = this.cssW / this.cssH;
    const longRatio = aspect >= 1 ? aspect : 1 / aspect;
    // Si le grand côté dépasse le plafond, on réduit les deux côtés pour garder des cellules carrées.
    const shortCells = Math.max(16, Math.round(Math.min(wc.simShortSide, wc.simMaxLongSide / longRatio)));
    const longCells = Math.round(shortCells * longRatio);
    const w = aspect >= 1 ? longCells : shortCells;
    const h = aspect >= 1 ? shortCells : longCells;
    if (w === this.simW && h === this.simH && this.state) return;

    const a = createTarget(gl, w, h, this.formats.state, gl.NEAREST);
    const b = createTarget(gl, w, h, this.formats.state, gl.NEAREST);
    const n = createTarget(gl, w, h, this.formats.normal, gl.LINEAR);
    if (!a || !b || !n) {
      deleteTarget(gl, a);
      deleteTarget(gl, b);
      deleteTarget(gl, n);
      return;
    }
    const old = this.state;
    this.state = [a, b];
    deleteTarget(gl, this.normals);
    this.normals = n;
    this.simW = w;
    this.simH = h;
    this.simShort = shortCells;

    gl.bindVertexArray(this.vao);
    this.calm();
    if (old && this.progCopy) {
      // Recopie l'ancien état (les deux textures, pour garder h[n] et h[n−1]).
      gl.useProgram(this.progCopy.program);
      gl.uniform1i(this.progCopy.u.uSrc ?? null, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < 2; i++) {
        const src = old[i];
        const dst = this.state[i];
        if (!src || !dst) continue;
        gl.uniform2i(this.progCopy.u.uSrcSize ?? null, src.w, src.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      deleteTarget(gl, old[0]);
      deleteTarget(gl, old[1]);
    }
  }

  private simStep(c2: number, damp: number): void {
    const gl = this.gl;
    const p = this.progSim;
    const st = this.state;
    if (!gl || !p || !st) return;
    const [src, dst] = st;
    const u = p.u;

    const count = Math.min(this.pending.length, MAX_DROPS_PER_STEP);
    const drops = this.pending.splice(0, count);
    drops.forEach((d, i) => {
      this.dropBuf[i * 4] = d.x * this.simW;
      this.dropBuf[i * 4 + 1] = (1 - d.y) * this.simH;
      this.dropBuf[i * 4 + 2] = Math.max(1.5, config.drop.radius * d.size * this.simShort);
      this.dropBuf[i * 4 + 3] = config.drop.amplitude * d.strength;
    });

    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(u.uState ?? null, 0);
    gl.uniform2i(u.uSize ?? null, this.simW, this.simH);
    gl.uniform1f(u.uC2 ?? null, c2);
    gl.uniform1f(u.uDamping ?? null, damp);
    gl.uniform1f(u.uSpongeCells ?? null, config.water.spongeWidth * this.simShort);
    gl.uniform1f(u.uSpongeDamping ?? null, config.water.spongeDamping);
    gl.uniform1i(u.uDropCount ?? null, count);
    gl.uniform4fv(u.uDrops ?? null, this.dropBuf);

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.state = [dst, src];
  }

  private normalsPass(alpha: number): void {
    const gl = this.gl;
    const p = this.progNormals;
    if (!gl || !p || !this.state || !this.normals) return;
    const u = p.u;
    const s = config.surface;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[0].tex);
    gl.uniform1i(u.uState ?? null, 0);
    gl.uniform2i(u.uSize ?? null, this.simW, this.simH);
    gl.uniform1f(u.uAlpha ?? null, alpha);
    // Le bruit tourne dans une fenêtre de temps bornée pour garder la précision float.
    gl.uniform1f(u.uTime ?? null, this.time % 10000);
    gl.uniform1f(u.uPondPerCell ?? null, 1 / this.simShort);
    gl.uniform1f(u.uRippleNormal ?? null, s.rippleNormal);
    gl.uniform1f(u.uSwellScale ?? null, s.swellScale);
    gl.uniform1f(u.uSwellSpeed ?? null, s.swellSpeed);
    gl.uniform1f(u.uSwellStrength ?? null, s.swellStrength);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.normals.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private renderPass(): void {
    const gl = this.gl;
    const p = this.progRender;
    if (!gl || !p || !this.normals) return;
    const u = p.u;
    const s = config.surface;
    const f = config.flash;
    const pal = this.palette;
    const { w, h } = this.pondSize;

    this.flashes = this.flashes.filter((fl) => this.time - fl.born < f.lifetime);
    this.flashes.forEach((fl, i) => {
      this.flashBuf[i * 4] = fl.px;
      this.flashBuf[i * 4 + 1] = fl.py;
      this.flashBuf[i * 4 + 2] = this.time - fl.born;
      this.flashBuf[i * 4 + 3] = fl.intensity * f.intensity;
    });

    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.normals.tex);
    gl.uniform1i(u.uNormals ?? null, 0);
    gl.uniform2f(u.uPond ?? null, w, h);
    gl.uniform1f(u.uTime ?? null, this.time % 10000);
    gl.uniform3fv(u.uDeep ?? null, pal.deep);
    gl.uniform3fv(u.uSky ?? null, pal.sky);
    gl.uniform3fv(u.uCrest ?? null, pal.crest);
    gl.uniform3fv(u.uMoon ?? null, pal.moon);
    gl.uniform3fv(u.uFlashColor ?? null, pal.flash);
    gl.uniform1f(u.uCrestGain ?? null, s.crestGain);
    gl.uniform1f(u.uTroughDarken ?? null, s.troughDarken);
    gl.uniform1f(u.uSlopeGain ?? null, s.slopeGain);
    gl.uniform1f(u.uSkyGain ?? null, s.skyGain);
    gl.uniform1f(u.uGlintScale ?? null, s.glintScale);
    gl.uniform1f(u.uGlintSpeed ?? null, s.glintSpeed);
    gl.uniform1f(u.uGlintStrength ?? null, s.glintStrength);
    gl.uniform1f(u.uCamHeight ?? null, s.cameraHeight);
    gl.uniform3fv(u.uMoonDir ?? null, s.moonDirection);
    gl.uniform1f(u.uMoonShininess ?? null, s.moonShininess);
    gl.uniform1f(u.uMoonGain ?? null, s.moonGain);
    gl.uniform1f(u.uMoonGlowShininess ?? null, s.moonGlowShininess);
    gl.uniform1f(u.uMoonGlowGain ?? null, s.moonGlowGain);
    gl.uniform1f(u.uVignette ?? null, config.render.vignette);
    gl.uniform1f(u.uExposure ?? null, config.render.exposure);
    gl.uniform1f(u.uDither ?? null, config.render.dither);
    gl.uniform1i(u.uFlashCount ?? null, this.flashes.length);
    gl.uniform4fv(u.uFlashes ?? null, this.flashBuf);
    gl.uniform4f(u.uFlashShape ?? null, f.radius, f.growth, f.decay, f.attack);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private freeAll(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.state) {
      deleteTarget(gl, this.state[0]);
      deleteTarget(gl, this.state[1]);
    }
    deleteTarget(gl, this.normals);
    for (const p of [this.progSim, this.progNormals, this.progRender, this.progClear, this.progCopy]) {
      if (p) gl.deleteProgram(p.program);
    }
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.state = null;
    this.normals = null;
  }
}
