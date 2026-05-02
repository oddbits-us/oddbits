import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(__dirname, '../..');

// Inject the monorepo's root package version so the desktop hero can
// display it without a runtime fetch. Mirrors the `[data-bit-version]`
// pattern bits use, but for the site as a whole.
const rootPkg = JSON.parse(
  readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    __ODDBITS_VERSION__: JSON.stringify(rootPkg.version),
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

