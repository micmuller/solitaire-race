import { defineConfig } from 'vite';

export default defineConfig({
  base: '/vnext/pixi/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  }
});
