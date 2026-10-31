import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  server: {
    port: 5173
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
