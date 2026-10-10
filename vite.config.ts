import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Prefixo de publicação (ex.: BASE_PATH=/workspace/ atrás do Traefik com Strip Path).
const raw = process.env.BASE_PATH || '/';
const base = `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

export default defineConfig({
  root: 'client',
  base,
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
