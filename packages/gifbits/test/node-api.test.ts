/**
 * Tests for pure helpers (no ffmpeg binary required).
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  argvToShell,
  buildCenterCropFilter,
  buildVideoFilterChain,
  describeRecipe,
  resolveEncodeParams,
  trimDurationSeconds,
} from '../src/ffmpeg-plan';
import { buildRasterLottieJson } from '../src/lottie-raster';
import type { GifBitsEncodePlan } from '../src/types';
import { VERSION } from '../src/version';

describe('VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(VERSION, pkg.version);
  });
});

describe('resolveEncodeParams', () => {
  it('clamps quality and scales outputs', () => {
    const lowQ = resolveEncodeParams(1);
    const highQ = resolveEncodeParams(100);
    assert.equal(lowQ.shortSide, 320);
    assert.equal(highQ.shortSide, 1120);
    assert.ok(highQ.gifColors >= 128);
    assert.ok(lowQ.avifCrf > highQ.avifCrf);
  });
});

describe('buildCenterCropFilter', () => {
  it('includes crop and center offsets', () => {
    const f = buildCenterCropFilter('1:1');
    assert.ok(f.includes('crop='));
    assert.ok(f.includes('(iw-w)/2'));
  });
});

describe('buildVideoFilterChain', () => {
  it('joins crop, scale, and fps', () => {
    const plan: GifBitsEncodePlan = {
      cropRatio: '16:9',
      trimStart: 0,
      trimEnd: 5,
      quality: 50,
      fps: 12,
      format: 'webp',
    };
    const r = resolveEncodeParams(plan.quality);
    const vf = buildVideoFilterChain(plan, r);
    assert.ok(vf.includes('fps=12'));
    assert.ok(vf.includes('scale='));
  });
});

describe('trimDurationSeconds', () => {
  it('computes span', () => {
    assert.equal(
      trimDurationSeconds({
        cropRatio: '1:1',
        trimStart: 2,
        trimEnd: 8,
        quality: 50,
        fps: 12,
        format: 'gif',
      }),
      6,
    );
  });
});

describe('describeRecipe', () => {
  it('prints ffmpeg for webp', () => {
    const plan: GifBitsEncodePlan = {
      cropRatio: '9:16',
      trimStart: 1,
      trimEnd: 4,
      quality: 80,
      fps: 12,
      format: 'webp',
    };
    const line = describeRecipe(plan, 'clip.mp4', 'out.webp');
    assert.ok(line.startsWith('ffmpeg '));
    assert.ok(line.includes('clip.mp4'));
    assert.ok(line.includes('libwebp'));
  });

  it('prints ffmpeg for avif', () => {
    const plan: GifBitsEncodePlan = {
      cropRatio: '16:9',
      trimStart: 0,
      trimEnd: 2,
      quality: 72,
      fps: 12,
      format: 'avif',
    };
    const line = describeRecipe(plan, 'clip.mp4', 'out.avif');
    assert.ok(line.includes('libaom-av1'));
    assert.ok(line.includes('still-picture'));
  });
});

describe('argvToShell', () => {
  it('replaces virtual input filename', () => {
    const s = argvToShell(['-i', 'input', '-ss', '0', '-t', '3'], './my video.mp4');
    assert.ok(s.includes('./my video.mp4'));
    assert.ok(!s.endsWith(' input'));
  });
});

describe('buildRasterLottieJson', () => {
  it('builds valid-looking structure', () => {
    const j = buildRasterLottieJson(
      [
        { relativePath: 'images/a.png', width: 100, height: 200 },
        { relativePath: 'images/b.png', width: 100, height: 200 },
      ],
      12,
    ) as { fr: number; op: number; layers: unknown[]; assets: unknown[] };
    assert.equal(j.fr, 12);
    assert.equal(j.op, 2);
    assert.equal(j.layers.length, 2);
    assert.equal(j.assets.length, 2);
  });

  it('throws on dimension mismatch', () => {
    assert.throws(() =>
      buildRasterLottieJson(
        [
          { relativePath: 'images/a.png', width: 100, height: 200 },
          { relativePath: 'images/b.png', width: 101, height: 200 },
        ],
        12,
      ),
    );
  });
});
