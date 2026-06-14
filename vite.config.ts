import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@pcg': resolve(__dirname, 'src/pcg'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@input': resolve(__dirname, 'src/input'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@player': resolve(__dirname, 'src/player'),
      '@save': resolve(__dirname, 'src/save'),
      '@performance': resolve(__dirname, 'src/performance'),
      '@game-types': resolve(__dirname, 'src/types'),
    },
  },
  server: {
    port: 5173,
    open: true,
    host: true,
  },
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/gui', 'simplex-noise'],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});