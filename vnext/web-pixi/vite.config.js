import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'visible-bot-strategy-dev',
    apply: 'serve',
    transform(code, id) {
      if (!id.endsWith('/bot/strategy.js')) return null;
      return code.replace('module.exports =', 'export default');
    }
  }],
  base: '/vnext/pixi/',
  server: { fs: { allow: ['..'] } },
  build: {
    commonjsOptions: { include: [/node_modules/, /bot\/strategy\.js$/] },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022'
  }
});
