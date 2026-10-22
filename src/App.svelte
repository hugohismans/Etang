<script lang="ts">
  import { onMount } from 'svelte';
  import { Water } from './engine/water';
  import { Clock } from './engine/clock';
  import { config } from './engine/config';
  import { moods } from './engine/moods';

  let canvas: HTMLCanvasElement;
  let unsupported = $state(false);
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  // ?tier=packed ou ?tier=f16 : force un format de texture pour tester les replis.
  const tierParam = params.get('tier');
  const forceTier = tierParam === 'packed' || tierParam === 'f16' ? tierParam : undefined;
  let fps = $state(0);

  let water: Water | null = null;

  onMount(() => {
    const w = new Water(canvas, moods.nuit.palette, { forceTier });
    water = w;
    const clock = new Clock();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    resize();
    unsupported = !w.ready;
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Certains navigateurs mobiles ne déclenchent pas ResizeObserver à la rotation.
    window.addEventListener('orientationchange', resize);

    let raf = 0;
    let frames = 0;
    let fpsT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      w.frame(clock.now());
      if (debug) {
        frames++;
        const n = performance.now();
        if (n - fpsT > 1000) {
          fps = Math.round((frames * 1000) / (n - fpsT));
          frames = 0;
          fpsT = n;
        }
      }
    };
    raf = requestAnimationFrame(loop);

    if (debug) Object.assign(window, { etang: { config, water: w, clock } });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('orientationchange', resize);
      w.destroy();
      water = null;
    };
  });

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    if (!water) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    water.drop(x, y);
    water.flash(x, y);
  }
</script>

<canvas
  bind:this={canvas}
  onpointerdown={onPointerDown}
  oncontextmenu={(e) => e.preventDefault()}
></canvas>

{#if unsupported}
  <p class="message">Cet appareil ne permet pas d'afficher l'étang (WebGL2 indisponible).</p>
{/if}

{#if debug}
  <div class="debug">{fps} fps</div>
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
  .debug {
    position: absolute;
    top: max(8px, env(safe-area-inset-top));
    left: 8px;
    font: 11px ui-monospace, monospace;
    opacity: 0.5;
    pointer-events: none;
  }
</style>
