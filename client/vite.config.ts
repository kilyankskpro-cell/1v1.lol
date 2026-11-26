import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    // Le client parle au serveur de jeu via la même origine (proxy WebSocket).
    proxy: {
      '/socket.io': { target: process.env.GAME_SERVER_URL ?? 'http://localhost:3001', ws: true },
    },
  },
});
