/**
 * Copy @ffmpeg/core single-thread assets into public/ for same-origin loading (no CDN fetch).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..');
const coreDir = path.join(webRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const outDir = path.join(webRoot, 'public', 'vendor', 'ffmpeg');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

function main() {
  if (!fs.existsSync(coreDir)) {
    console.warn('[vendor-ffmpeg-core] skip: @ffmpeg/core not installed yet');
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const src = path.join(coreDir, f);
    const dest = path.join(outDir, f);
    fs.copyFileSync(src, dest);
  }
  console.log('[vendor-ffmpeg-core] copied to', path.relative(webRoot, outDir));
}

main();
