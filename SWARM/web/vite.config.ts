import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Development: Vite serves the frontend and forwards API and WebSocket traffic to the coordinator.
const coordinator = process.env.SWARM_COORDINATOR ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': coordinator,
      '/ws': { target: coordinator.replace('http', 'ws'), ws: true }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
