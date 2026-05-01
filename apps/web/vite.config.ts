import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const workspaceRoot = resolve(__dirname, '../..');

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
    watch: {
      ignored: ['!**/node_modules/@oddbits/**'],
    },
  },
  optimizeDeps: {
    exclude: ['@oddbits/core', '@oddbits/imagebits'],
  },
});

