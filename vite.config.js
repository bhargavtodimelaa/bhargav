import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2019',
    // Keep fast-load behavior; small chunks allow the browser to start
    // painting the UI before the player code finishes downloading.
    chunkSizeWarningLimit: 900,
  },
});
