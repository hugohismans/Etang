import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app introuvable');

export default mount(App, { target });

// Service worker (hors ligne) : uniquement en production, pour ne pas gêner le rechargement à chaud.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}
