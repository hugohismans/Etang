import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Base path : './' fonctionne partout (y compris un sous-dossier GitHub Pages).
// Pour forcer un chemin absolu : BASE_PATH=/Etang/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [svelte()],
  build: { target: 'es2020' },
});
