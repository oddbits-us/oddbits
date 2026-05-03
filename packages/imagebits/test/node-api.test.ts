/**
 * Smoke tests for the public Node API.
 *
 * Uses Node's built-in `node:test` runner (no vitest dep). Run with:
 *   node --test --import tsx test/node-api.test.ts
 *
 * The `test` script in package.json wires this up.
 */

import { strict as assert } from 'node:assert';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import sharp from 'sharp';

import { processImage, processImages, VERSION } from '../src/index';

let tmpDir: string;
let pngPathA: string;
let pngPathB: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imagebits-test-'));
  pngPathA = path.join(tmpDir, 'a.png');
  pngPathB = path.join(tmpDir, 'b.png');
  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 80, b: 120 } },
  })
    .png()
    .toFile(pngPathA);
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 180, b: 120 } },
  })
    .png()
    .toFile(pngPathB);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    );
    assert.equal(VERSION, pkg.version);
  });
});

describe('processImage (Node)', () => {
  it('accepts a file path', async () => {
    const r = await processImage(pngPathA, { maxDimension: 400, format: 'webp' });
    assert.equal(r.metadata.width, 400);
    assert.equal(r.metadata.format, 'webp');
    assert.ok(r.blob.size > 0);
    assert.ok(r.metadata.size > 0);
  });

  it('accepts a Buffer', async () => {
    const buf = fs.readFileSync(pngPathA);
    const r = await processImage(buf, { maxDimension: 300, format: 'avif' });
    assert.equal(r.metadata.format, 'avif');
    assert.equal(r.metadata.width, 300);
  });

  it('accepts a Blob', async () => {
    const buf = fs.readFileSync(pngPathA);
    const blob = new Blob([buf], { type: 'image/png' });
    const r = await processImage(blob, { maxDimension: 200, format: 'jpg', quality: 0.8 });
    assert.equal(r.metadata.format, 'jpg');
    assert.equal(r.metadata.width, 200);
  });

  it('accepts an ArrayBuffer', async () => {
    const buf = fs.readFileSync(pngPathA);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await processImage(ab as ArrayBuffer, { maxDimension: 150, format: 'png' });
    assert.equal(r.metadata.format, 'png');
    assert.equal(r.metadata.width, 150);
  });

  it('keeps original format when format omitted/original', async () => {
    const r = await processImage(pngPathA, { maxDimension: 400 });
    assert.equal(r.metadata.format, 'png');
  });

  it('respects withoutEnlargement (does not upscale)', async () => {
    const r = await processImage(pngPathA, { maxDimension: 5000 });
    assert.equal(r.metadata.width, 1200);
    assert.equal(r.metadata.height, 800);
  });

  it('toArrayBuffer returns matching bytes', async () => {
    const r = await processImage(pngPathA, { maxDimension: 200, format: 'webp' });
    const ab = await r.toArrayBuffer();
    assert.equal(ab.byteLength, r.metadata.size);
  });

  it('toDataURL returns a data: URI', async () => {
    const r = await processImage(pngPathA, { maxDimension: 100, format: 'webp' });
    const url = await r.toDataURL();
    assert.match(url, /^data:image\/webp;base64,/);
  });

  it('download() throws a helpful Node error', async () => {
    const r = await processImage(pngPathA, { maxDimension: 100, format: 'webp' });
    assert.throws(() => r.download(), /browser environments/);
  });

  it('throws on missing file', async () => {
    await assert.rejects(
      () => processImage('/no/such/file.png'),
      /Input not found/,
    );
  });
});

describe('Privacy / metadata stripping (Node)', () => {
  it('strips EXIF (incl. fake GPS + camera) from outputs', async () => {
    // Camera make/model and GPS coords are exactly the tags users would NOT
    // want leaked when posting photos to the web — the entire reason this
    // tool re-encodes from raw pixels.
    const inPath = path.join(tmpDir, 'with-exif.jpg');
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .withExif({
        IFD0: { Make: 'TestCamera', Model: 'OddbitsTestRig' },
        GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      })
      .jpeg()
      .toFile(inPath);

    const srcMeta = await sharp(inPath).metadata();
    assert.ok(srcMeta.exif, 'fixture must actually contain EXIF or the test is meaningless');

    // Re-encode to a different format so we know we're not just passing
    // bytes through — the metadata strip happens in the encode step.
    const r = await processImage(inPath, { format: 'webp' });
    const outBuf = Buffer.from(await r.toArrayBuffer());
    const outMeta = await sharp(outBuf).metadata();

    assert.equal(outMeta.exif, undefined, 'output must not contain EXIF');
    assert.equal(outMeta.iptc, undefined, 'output must not contain IPTC');
    assert.equal(outMeta.xmp, undefined, 'output must not contain XMP');
  });

  it('output orientation tag is absent (auto-orient applied + stripped)', async () => {
    // We can't easily forge a fixture with non-1 EXIF orientation through
    // sharp itself (it normalizes orientation when baking rotations). The
    // observable invariant we DO care about is that nothing post-processing
    // carries an orientation tag — the pixels speak for themselves.
    const r = await processImage(pngPathA, { format: 'webp' });
    const outBuf = Buffer.from(await r.toArrayBuffer());
    const outMeta = await sharp(outBuf).metadata();
    assert.equal(outMeta.orientation, undefined);
  });
});

describe('processImages (Node)', () => {
  it('processes a batch sequentially', async () => {
    const results = await processImages([pngPathA, pngPathB], {
      maxDimension: 200,
      format: 'webp',
    });
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.metadata.format, 'webp');
      assert.ok(r.blob.size > 0);
    }
  });

  it('processes a batch with concurrency and preserves order', async () => {
    const inputs = Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? pngPathA : pngPathB));
    const results = await processImages(inputs, {
      maxDimension: 200,
      format: 'webp',
      concurrency: 4,
    });
    assert.equal(results.length, 6);
    // a.png is 3:2, b.png is 4:3 — distinguishable by aspect.
    for (let i = 0; i < inputs.length; i++) {
      const r = results[i]!;
      const expectedHeight = inputs[i] === pngPathA ? Math.round(200 * (800 / 1200)) : Math.round(200 * (600 / 800));
      assert.equal(r.metadata.height, expectedHeight);
    }
  });

  it('handles empty input list', async () => {
    const results = await processImages([], { format: 'webp' });
    assert.equal(results.length, 0);
  });
});
