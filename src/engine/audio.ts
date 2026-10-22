/**
 * Moteur audio : Web Audio uniquement, synthèse par oscillateurs.
 *
 * Graphe :
 *
 *   voix ─► entrée ─► passe-bas ─┬─► sec ──────────────┐
 *                                ├─► convolveur A ─► wetA ─┤
 *                                └─► convolveur B ─► wetB ─┴─► compresseur ─► drive ─► tanh ─► volume ─► sortie
 *
 * Deux convolveurs permettent un fondu enchaîné quand l'ambiance change de
 * réverbération. Chaque voix a son propre gain de sortie, qui sert uniquement
 * à l'éteindre en douceur quand on la vole.
 *
 * Règle d'or : aucun gain ne change brutalement. Toute modification passe par
 * une rampe ou setTargetAtTime, sinon on entend un clic.
 */
import { config } from './config';
import type { MoodSound } from './moods';
import { midiToFreq } from './scales';

export interface NoteParams {
  /** Hauteur (MIDI, fractionnaire accepté). */
  midi: number;
  /** Instant de départ, en temps audio (secondes). Dans le passé = maintenant. */
  when: number;
  /** Vélocité relative (1 = nominal). */
  velocity: number;
  /** Panoramique, −1 (gauche) à 1 (droite). */
  pan: number;
}

interface Voice {
  out: GainNode;
  oscs: OscillatorNode[];
  nodes: AudioNode[];
  start: number;
  end: number;
  stolen: boolean;
  /** Oscillateurs pas encore terminés ; à 0, on débranche la voix. */
  remaining: number;
}

/** Interface iOS 16.4+ : permet de jouer même interrupteur silencieux activé. */
interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private input: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private dry: GainNode | null = null;
  private convs: [ConvolverNode, ConvolverNode] | null = null;
  private wets: [GainNode, GainNode] | null = null;
  private activeConv = 0;
  private lastReverbSwitch = -Infinity;
  private pendingReverb: number | null = null;
  private reverbSeconds = 0;
  private volume: GainNode | null = null;
  private voices: Voice[] = [];
  private sound: MoodSound;
  private volumeLevel: number = config.audio.defaultVolume;
  private wantRunning = true;

  constructor(sound: MoodSound) {
    this.sound = sound;
  }

  /** Le contexte tourne-t-il (son audible) ? */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Temps audio courant (0 si pas encore de contexte). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * À appeler de façon SYNCHRONE dans les gestionnaires pointerdown ET
   * pointerup : selon les navigateurs (iOS Safari en tête), seul l'un des
   * deux compte comme geste autorisant le son. Idempotent.
   */
  unlock(): void {
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running' && this.wantRunning) {
      void ctx.resume().catch(() => undefined);
      // Vieille astuce iOS : jouer un tampon silencieux dans le geste.
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    }
  }

  /** Onglet en arrière-plan : on met le son en pause. */
  suspend(): void {
    this.wantRunning = false;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** Onglet au premier plan : on reprend (peut nécessiter un nouveau geste sur iOS). */
  resume(): void {
    this.wantRunning = true;
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  /** Volume général 0..1, appliqué en douceur. */
  setVolume(v: number): void {
    this.volumeLevel = Math.min(Math.max(v, 0), 1);
    const ctx = this.ctx;
    if (!ctx || !this.volume) return;
    // Courbe perceptive : le curseur suit mieux l'oreille au carré.
    const g = this.volumeLevel * this.volumeLevel * config.audio.outputGain;
    this.volume.gain.setTargetAtTime(g, ctx.currentTime, config.audio.smoothing);
  }

  /** Change d'ambiance sonore, en fondu. */
  setMood(sound: MoodSound): void {
    this.sound = sound;
    const ctx = this.ctx;
    if (!ctx || !this.filter || !this.dry) return;
    const tau = config.ui.moodFade / 3;
    const t = ctx.currentTime;
    this.filter.frequency.setTargetAtTime(sound.lowpass, t, tau);
    this.dry.gain.setTargetAtTime(sound.dry, t, tau);
    this.requestReverb(sound.reverbSeconds);
    // Le niveau de la réverbération active suit aussi.
    const wets = this.wets;
    if (wets && this.pendingReverb === null) wets[this.activeConv]?.gain.setTargetAtTime(sound.reverbWet, t, tau);
  }

  /** Une goutte : cloche douce. */
  playBell(p: NoteParams): void {
    const ctx = this.ctx;
    if (!ctx || !this.input) return;
    const b = config.bell;
    const a = config.audio;
    const t = Math.max(p.when, ctx.currentTime + 0.005);
    const f0 = midiToFreq(p.midi);
    const vel = p.velocity * (1 + (Math.random() * 2 - 1) * a.velocityJitter);
    const peak = b.gain * Math.max(vel, 0);
    const decay = b.decayMin + Math.random() * (b.decayMax - b.decayMin);
    const detune = (Math.random() * 2 - 1) * a.detuneCents;

    const v = this.newVoice(t, t + b.attack + decay, p.pan);
    if (!v) return;
    // Fondamentale + jumelle désaccordée (battement lent).
    this.partial(v, f0, detune, peak, b.attack, decay);
    this.partial(v, f0, detune + b.chorusCents, peak * b.chorusGain, b.attack, decay * 0.8);
    for (const pt of b.partials) {
      const f = f0 * pt.ratio;
      if (f > 16000) continue;
      this.partial(v, f, detune, peak * pt.gain * this.sound.brightness, b.attack * 0.6, decay * pt.decay);
    }
  }

  /** Un croisement : tintement fin et plus aigu. */
  playChime(p: NoteParams): void {
    const ctx = this.ctx;
    if (!ctx || !this.input) return;
    const c = config.chime;
    const a = config.audio;
    const t = Math.max(p.when, ctx.currentTime + 0.005);
    const f0 = midiToFreq(p.midi);
    const vel = p.velocity * (1 + (Math.random() * 2 - 1) * a.velocityJitter);
    const peak = c.gain * Math.max(vel, 0);
    const detune = (Math.random() * 2 - 1) * a.detuneCents;
    const v = this.newVoice(t, t + c.attack + c.decay, p.pan);
    if (!v) return;
    this.partial(v, f0, detune, peak, c.attack, c.decay);
    if (f0 * c.partialRatio < 16000) {
      this.partial(v, f0 * c.partialRatio, detune, peak * c.partialGain * this.sound.brightness, c.attack, c.decay * 0.4);
    }
  }

  /** Éteint toutes les voix en douceur (« vider l'étang »). */
  releaseAll(fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.voices) this.fadeOut(v, fade);
  }

  // ---------------------------------------------------------------------------

  private build(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const nav = navigator as Navigator & AudioSessionNavigator;
    try {
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* ignoré : API absente ou refusée */
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const a = config.audio;

    this.input = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = this.sound.lowpass;
    this.filter.Q.value = 0.5;
    this.dry = ctx.createGain();
    this.dry.gain.value = this.sound.dry;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = a.compressor.threshold;
    comp.knee.value = a.compressor.knee;
    comp.ratio.value = a.compressor.ratio;
    comp.attack.value = a.compressor.attack;
    comp.release.value = a.compressor.release;

    // Limiteur doux : la courbe tanh couvre ±3 ; le gain d'entrée est donc divisé par 3.
    const drive = ctx.createGain();
    drive.gain.value = a.limiterDrive / 3;
    const shaper = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 3);
    shaper.curve = curve;
    shaper.oversample = '2x';

    this.volume = ctx.createGain();
    this.volume.gain.value = this.volumeLevel * this.volumeLevel * a.outputGain;

    const convA = ctx.createConvolver();
    const convB = ctx.createConvolver();
    const wetA = ctx.createGain();
    const wetB = ctx.createGain();
    wetA.gain.value = this.sound.reverbWet;
    wetB.gain.value = 0;
    convA.buffer = this.impulse(this.sound.reverbSeconds);
    this.reverbSeconds = this.sound.reverbSeconds;
    this.convs = [convA, convB];
    this.wets = [wetA, wetB];

    this.input.connect(this.filter);
    this.filter.connect(this.dry);
    this.filter.connect(convA);
    this.filter.connect(convB);
    convA.connect(wetA);
    convB.connect(wetB);
    this.dry.connect(comp);
    wetA.connect(comp);
    wetB.connect(comp);
    comp.connect(drive);
    drive.connect(shaper);
    shaper.connect(this.volume);
    this.volume.connect(ctx.destination);
  }

  /**
   * Réponse impulsionnelle procédurale : bruit stéréo à décroissance
   * exponentielle (−60 dB à `seconds`), filtré par un passe-bas à un pôle
   * qui se ferme avec le temps — les aigus meurent avant les graves, comme
   * dans une vraie pièce (ou au-dessus de l'eau).
   */
  private impulse(seconds: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const r = config.reverb;
    const rate = ctx.sampleRate;
    const pre = Math.floor(r.preDelay * rate);
    const len = pre + Math.floor(seconds * rate);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const env = Math.exp((-6.9 * t) / seconds);
        const k = Math.exp((-r.damping * t) / seconds) * 0.9 + 0.05;
        y += k * (Math.random() * 2 - 1 - y);
        // Entrée en douceur des 10 premières ms pour ne pas « claquer ».
        const fadeIn = Math.min(1, t / 0.01);
        d[i] = y * env * fadeIn;
      }
    }
    // Normalisation en énergie : changer de durée ne change pas trop le niveau.
    let e = 0;
    for (let ch = 0; ch < 2; ch++) for (const s of buf.getChannelData(ch)) e += s * s;
    const norm = 1 / Math.sqrt(Math.max(e, 1e-9) / (rate * 0.5));
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * norm * 0.35;
    }
    return buf;
  }

  /** Fondu enchaîné vers une réverbération d'une autre durée. */
  private requestReverb(seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.convs || !this.wets) return;
    if (Math.abs(seconds - this.reverbSeconds) < 0.05 && this.pendingReverb === null) return;
    const xf = config.reverb.crossfade;
    const since = ctx.currentTime - this.lastReverbSwitch;
    // On ne remplace jamais le tampon d'un convolveur encore audible : si un
    // fondu est en cours, on attend qu'il se termine.
    if (since < xf * 1.2) {
      if (this.pendingReverb !== null) window.clearTimeout(this.pendingReverb);
      this.pendingReverb = window.setTimeout(() => {
        this.pendingReverb = null;
        this.requestReverb(this.sound.reverbSeconds);
      }, (xf * 1.2 - since) * 1000 + 50);
      return;
    }
    const next = 1 - this.activeConv;
    const conv = this.convs[next];
    const wetNext = this.wets[next];
    const wetPrev = this.wets[this.activeConv];
    if (!conv || !wetNext || !wetPrev) return;
    conv.buffer = this.impulse(seconds);
    const t = ctx.currentTime;
    wetNext.gain.cancelScheduledValues(t);
    wetNext.gain.setValueAtTime(0, t);
    wetNext.gain.linearRampToValueAtTime(this.sound.reverbWet, t + xf);
    wetPrev.gain.cancelScheduledValues(t);
    wetPrev.gain.setValueAtTime(wetPrev.gain.value, t);
    wetPrev.gain.linearRampToValueAtTime(0, t + xf);
    this.activeConv = next;
    this.reverbSeconds = seconds;
    this.lastReverbSwitch = t;
  }

  /** Crée une voix, en volant la plus ancienne si le plafond est atteint. */
  private newVoice(start: number, end: number, pan: number): Voice | null {
    const ctx = this.ctx;
    if (!ctx || !this.input) return null;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    const alive = this.voices.filter((v) => !v.stolen);
    if (alive.length >= config.audio.maxVoices) {
      const oldest = alive.reduce((a, b) => (a.start <= b.start ? a : b));
      this.fadeOut(oldest, config.audio.stealFade);
    }
    const out = ctx.createGain();
    out.gain.value = 1;
    const nodes: AudioNode[] = [out];
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan * config.audio.panWidth));
      out.connect(panner);
      panner.connect(this.input);
      nodes.push(panner);
    } else {
      out.connect(this.input);
    }
    const v: Voice = { out, oscs: [], nodes, start, end: end + 0.1, stolen: false, remaining: 0 };
    this.voices.push(v);
    return v;
  }

  /** Un partiel : oscillateur sinus + enveloppe attaque linéaire / décroissance exponentielle. */
  private partial(v: Voice, freq: number, detune: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx;
    if (!ctx || peak <= 0) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const env = ctx.createGain();
    const t = v.start;
    const floor = 1e-4;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(peak * floor, 1e-7), t + attack + decay);
    env.gain.linearRampToValueAtTime(0, t + attack + decay + 0.05);
    osc.connect(env);
    env.connect(v.out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.08);
    v.oscs.push(osc);
    v.remaining++;
    v.end = Math.max(v.end, t + attack + decay + 0.1);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      if (--v.remaining === 0) for (const n of v.nodes) n.disconnect();
    };
  }

  /** Éteint une voix par une rampe (jamais de coupure sèche). */
  private fadeOut(v: Voice, fade: number): void {
    const ctx = this.ctx;
    if (!ctx || v.stolen) return;
    v.stolen = true;
    const t = ctx.currentTime;
    const g = v.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    for (const o of v.oscs) {
      try {
        o.stop(Math.max(t + fade + 0.02, v.start + 0.001));
      } catch {
        /* déjà arrêté */
      }
    }
    v.end = Math.min(v.end, t + fade + 0.05);
  }
}
