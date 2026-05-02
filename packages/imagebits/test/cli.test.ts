/**
 * CLI smoke tests — exercise the built `dist/cli.js` with real fixtures.
 *
 * Verifies that the four invocation modes the README advertises actually
 * work: single, bulk, recursive directory, and zip bundle.
 */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import sharp from 'sharp';

const CLI = path.resolve(__dirname, '..', 'dist', 'cli.js');

let tmpDir: string;
let srcDir: string;

function run(args: string[]) {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return res;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagebits-cli-'));
  srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(path.join(srcDir, 'nested'), { recursive: true });
  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 80, b: 120 } },
  })
    .png()
    .toFile(path.join(srcDir, 'a.png'));
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 180, b: 120 } },
  })
    .png()
    .toFile(path.join(srcDir, 'nested', 'b.png'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI', () => {
  it('--version prints the package version', () => {
    const res = run(['--version']);
    assert.equal(res.status, 0);
    assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/);
  });

  it('--help shows usage', () => {
    const res = run(['--help']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage:/);
    assert.match(res.stdout, /--zip/);
    assert.match(res.stdout, /--recursive/);
  });

  it('processes a single file', () => {
    const out = path.join(tmpDir, 'a.webp');
    const res = run([path.join(srcDir, 'a.png'), '-o', out, '-f', 'webp', '-m', '400', '--quiet']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(out));
    assert.ok(fs.statSync(out).size > 0);
  });

  it('processes multiple positional inputs into an output dir', () => {
    const outDir = path.join(tmpDir, 'out');
    const res = run([
      path.join(srcDir, 'a.png'),
      path.join(srcDir, 'nested', 'b.png'),
      '-o',
      outDir,
      '-f',
      'webp',
      '-m',
      '300',
      '--quiet',
    ]);
    assert.equal(res.status, 0, res.stderr);
    // Both inputs share the srcDir as common root, so b.png keeps its `nested/` subdir.
    assert.ok(fs.existsSync(path.join(outDir, 'a.webp')));
    assert.ok(fs.existsSync(path.join(outDir, 'nested', 'b.webp')));
  });

  it('walks a directory recursively and preserves layout', () => {
    const outDir = path.join(tmpDir, 'out');
    const res = run([srcDir, '-r', '-f', 'avif', '-m', '200', '-o', outDir, '--quiet']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(outDir, 'a.avif')));
    assert.ok(fs.existsSync(path.join(outDir, 'nested', 'b.avif')));
  });

  it('errors when no images are found', () => {
    const empty = path.join(tmpDir, 'empty');
    fs.mkdirSync(empty);
    const res = run([empty, '-r', '-f', 'webp', '--quiet']);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /No image files found/);
  });

  it('errors on unsupported file extensions passed explicitly', () => {
    const txt = path.join(tmpDir, 'note.txt');
    fs.writeFileSync(txt, 'hi');
    const res = run([txt, '-f', 'webp', '--quiet']);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /Unsupported input/);
  });

  it('--zip bundles outputs into a single archive', () => {
    const zipPath = path.join(tmpDir, 'bundle.zip');
    const res = run([srcDir, '-r', '-f', 'webp', '-m', '200', '--zip', zipPath, '--quiet']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(zipPath));
    assert.ok(fs.statSync(zipPath).size > 0);
    // PK\x03\x04 — local file header magic.
    const head = fs.readFileSync(zipPath).subarray(0, 4);
    assert.deepEqual([head[0], head[1], head[2], head[3]], [0x50, 0x4b, 0x03, 0x04]);
  });
});
