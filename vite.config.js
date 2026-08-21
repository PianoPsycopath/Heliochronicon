import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  server: {
    open: true,
  },

  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'js/core'),
      '@physics': path.resolve(__dirname, 'js/physics'),
      '@rendering': path.resolve(__dirname, 'js/rendering'),
      '@ui': path.resolve(__dirname, 'js/ui'),
      '@main': path.resolve(__dirname, 'js/main'),
      '@shaders': path.resolve(__dirname, 'js/shaders'),
    },
  },
});