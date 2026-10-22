<script lang="ts">
  import { onMount } from 'svelte';
  import { Pond } from './engine/pond';
  import { config } from './engine/config';
  import { moods, moodIds, type MoodId } from './engine/moods';
  import { loadSettings, saveSettings } from './settings';

  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  // ?tier=packed ou ?tier=f16 : force un format de texture pour tester les replis.
  const tierParam = params.get('tier');
  const forceTier = tierParam === 'packed' || tierParam === 'f16' ? tierParam : undefined;

  const initial = loadSettings();

  let canvas: HTMLCanvasElement;
  let pond: Pond | null = null;

  let unsupported = $state(false);
  let started = $state(false);
  let panelOpen = $state(false);
  let aboutOpen = $state(false);
  let buttonVisible = $state(true);
  let mood = $state<MoodId>(initial.mood);
  let volume = $state(initial.volume);
  let fps = $state(0);
  let seedCount = $state(0);

  let fadeTimer = 0;

  /** Toute interaction fait réapparaître le bouton, qui s'estompe ensuite. */
  function poke() {
    buttonVisible = true;
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      if (!panelOpen) buttonVisible = false;
    }, config.ui.buttonFadeDelay * 1000);
  }

  /** Couleur linéaire → CSS sRGB (approximation gamma 2.2). */
  function css(c: [number, number, number]): string {
    return `rgb(${c.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',')})`;
  }

  function applyBackground(id: MoodId) {
    const bg = moods[id].background;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }

  onMount(() => {
    const p = new Pond(canvas, mood, { forceTier });
    pond = p;
    p.setVolume(volume);
    applyBackground(mood);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      p.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    resize();
    unsupported = !p.ready;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Certains navigateurs mobiles ne déclenchent pas ResizeObserver à la rotation.
    window.addEventListener('orientationchange', resize);

    // Le son ne peut démarrer que dans un geste : pointerup / touchend comptent
    // comme gestes sur iOS et Chrome Android, pas toujours pointerdown.
    const unlock = () => {
      if (started) p.unlockAudio();
    };
    window.addEventListener('pointerup', unlock);
    window.addEventListener('touchend', unlock);

    const onVisibility = () => p.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    let raf = 0;
    let frames = 0;
    let fpsT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      p.frame();
      if (debug) {
        frames++;
        const n = performance.now();
        if (n - fpsT > 1000) {
          fps = Math.round((frames * 1000) / (n - fpsT));
          seedCount = p.seeds.count;
          frames = 0;
          fpsT = n;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    poke();

    if (debug) Object.assign(window, { etang: { config, pond: p, water: p.water } });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('orientationchange', resize);
      window.removeEventListener('pointerup', unlock);
      window.removeEventListener('touchend', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(fadeTimer);
      p.destroy();
      pond = null;
    };
  });

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    poke();
    if (!pond) return;
    if (panelOpen) {
      // Le premier toucher hors du panneau le referme, sans faire de goutte.
      panelOpen = false;
      aboutOpen = false;
      return;
    }
    const r = canvas.getBoundingClientRect();
    pond.tap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    started = true;
  }

  function togglePanel() {
    poke();
    panelOpen = !panelOpen;
    if (!panelOpen) aboutOpen = false;
  }

  function chooseMood(id: MoodId) {
    poke();
    mood = id;
    pond?.setMood(id);
    applyBackground(id);
    saveSettings({ mood, volume });
  }

  function onVolume() {
    poke();
    pond?.setVolume(volume);
    saveSettings({ mood, volume });
  }

  function clearPond() {
    poke();
    pond?.clear();
  }
</script>

<canvas
  bind:this={canvas}
  onpointerdown={onPointerDown}
  oncontextmenu={(e) => e.preventDefault()}
  style:--fade="{config.ui.fade}s"
></canvas>

{#if unsupported}
  <p class="message">Cet appareil ne permet pas d'afficher l'étang (WebGL2 indisponible).</p>
{/if}

<div class="hint" class:gone={started} style:--fade="{config.ui.fade}s" aria-hidden={started}>
  Touche l'eau
</div>

<button
  class="menu"
  class:hidden={!buttonVisible && !panelOpen}
  style:--fade="{config.ui.fade}s"
  onclick={togglePanel}
  aria-label="Réglages"
  aria-expanded={panelOpen}
>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.7" />
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35" />
  </svg>
</button>

{#if panelOpen}
  <div class="panel" role="dialog" aria-label="Réglages">
    {#if aboutOpen}
      <div class="about">
        <h2>Étang</h2>
        <p>
          Chaque toucher fait tomber une goutte. Elle chante une note — grave au centre, aiguë vers les bords — puis
          revient toutes les huit secondes, un peu plus loin, un peu plus faible, jusqu'à s'éteindre.
        </p>
        <p>
          Quand deux ondes se rencontrent, elles répondent en harmonie. Les gouttes proches fusionnent, d'autres en
          engendrent de nouvelles. Si tu ne fais rien, une pluie fine continue pour toi.
        </p>
        <p class="small">Inspiré de <em>Bloom</em> (Brian Eno &amp; Peter Chilvers).</p>
        <button class="link" onclick={() => (aboutOpen = false)}>Retour</button>
      </div>
    {:else}
      <div class="moods" role="radiogroup" aria-label="Ambiance">
        {#each moodIds as id (id)}
          <button
            class="mood"
            class:active={mood === id}
            role="radio"
            aria-checked={mood === id}
            onclick={() => chooseMood(id)}
          >
            <span
              class="dot"
              style:background={`radial-gradient(circle at 50% 50%, ${css(moods[id].palette.crest)} 0, ${moods[id].background} 75%)`}
            ></span>
            {moods[id].name}
          </button>
        {/each}
      </div>
      <label class="volume">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.01" bind:value={volume} oninput={onVolume} />
      </label>
      <div class="actions">
        <button class="link" onclick={clearPond}>Vider l'étang</button>
        <button class="link" onclick={() => (aboutOpen = true)}>À propos</button>
      </div>
    {/if}
  </div>
{/if}

{#if debug}
  <div class="debug">{fps} fps · {seedCount} graines</div>
{/if}

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: default;
  }

  .message {
    position: absolute;
    inset: auto 0 45% 0;
    margin: 0;
    padding: 0 24px;
    text-align: center;
    font-weight: 300;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  .hint {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    text-align: center;
    font-weight: 300;
    font-size: 15px;
    letter-spacing: 0.32em;
    text-transform: lowercase;
    color: rgba(220, 230, 245, 0.62);
    pointer-events: none;
    animation:
      appear 3.5s ease-out both,
      breathe 7s ease-in-out 3.5s infinite;
    transition: opacity var(--fade) ease;
  }
  .hint.gone {
    opacity: 0;
    animation: none;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  .menu {
    position: absolute;
    right: max(14px, env(safe-area-inset-right));
    bottom: max(14px, env(safe-area-inset-bottom));
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(215, 225, 240, 0.7);
    cursor: pointer;
    transition: opacity var(--fade) ease;
    -webkit-tap-highlight-color: transparent;
  }
  /* Estompé mais toujours cliquable : on retrouve le bouton là où on l'a vu. */
  .menu.hidden {
    opacity: 0;
  }
  .menu:focus-visible {
    outline: 1px solid rgba(215, 225, 240, 0.5);
  }

  .panel {
    position: absolute;
    right: max(14px, env(safe-area-inset-right));
    bottom: calc(max(14px, env(safe-area-inset-bottom)) + 54px);
    width: min(280px, calc(100vw - 28px));
    box-sizing: border-box;
    padding: 18px 18px 14px;
    border-radius: 16px;
    background: rgba(12, 16, 26, 0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(225, 232, 245, 0.85);
    font-size: 14px;
    font-weight: 300;
    animation: rise 0.6s ease-out both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .moods {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }
  .mood {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0 6px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
    opacity: 0.6;
    transition:
      opacity 0.6s ease,
      border-color 0.6s ease;
  }
  .mood.active {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .volume {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    font-size: 12px;
    letter-spacing: 0.06em;
    opacity: 0.85;
  }
  .volume input {
    flex: 1;
    accent-color: rgba(200, 212, 235, 0.8);
  }

  .actions {
    display: flex;
    justify-content: space-between;
  }
  .link {
    padding: 6px 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    letter-spacing: 0.04em;
    opacity: 0.75;
    cursor: pointer;
  }
  .link:hover {
    opacity: 1;
  }

  .about h2 {
    margin: 0 0 10px;
    font-weight: 300;
    font-size: 16px;
    letter-spacing: 0.2em;
  }
  .about p {
    margin: 0 0 10px;
    line-height: 1.5;
    font-size: 13px;
    opacity: 0.85;
  }
  .about .small {
    font-size: 12px;
    opacity: 0.6;
  }

  .debug {
    position: absolute;
    top: max(8px, env(safe-area-inset-top));
    left: 8px;
    font: 11px ui-monospace, monospace;
    opacity: 0.5;
    pointer-events: none;
  }
</style>
