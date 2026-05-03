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
  clampPlanFps,
  buildScaleToMaxDimension,
  buildVideoFilterChain,
  cropRegionPercentages,
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
  it('maps quality to encoder knobs only', () => {
    const lowQ = resolveEncodeParams(1);
    const highQ = resolveEncodeParams(100);
    assert.ok(highQ.gifColors >= 128);
    assert.ok(lowQ.avifCrf > highQ.avifCrf);
    assert.ok(lowQ.webpQ < highQ.webpQ);
  });
});

describe('cropRegionPercentages', () => {
  it('full frame when video aspect matches crop', () => {
    const r = cropRegionPercentages(16 / 9, '16:9');
    assert.ok(Math.abs(r.widthPct - 100) < 0.01);
    assert.ok(Math.abs(r.leftPct) < 0.01);
  });

  it('letterboxes overlay for tall video vs wide crop', () => {
    const r = cropRegionPercentages(9 / 16, '16:9');
    assert.ok(r.heightPct < 100);
    assert.ok(r.widthPct >= 99);
  });
});

describe('buildCenterCropFilter', () => {
  it('includes crop and center offsets', () => {
    const f = buildCenterCropFilter('1:1');
    assert.ok(f.includes('crop='));
    assert.ok(f.includes('x=(iw-ow)/2'));
    assert.ok(f.includes('y=(ih-oh)/2'));
  });

  it('escapes commas in min() so -vf does not split the filter chain', () => {
    const f = buildCenterCropFilter('16:9');
    assert.ok(f.includes('\\,'), 'expected \\, so min(iw\\,ih*ar) is one filter argument');
    assert.ok(f.includes('min(iw\\,'), 'min() comma must be escaped for vf graph parsing');
    assert.ok(!f.includes('min(iw,'), 'bare comma in min(iw, ...) would break -vf parsing');
  });
});

describe('buildVideoFilterChain', () => {
  it('joins crop, scale, and fps', () => {
    const plan: GifBitsEncodePlan = {
      cropRatio: '16:9',
      trimStart: 0,
      trimEnd: 5,
      quality: 50,
      maxDimensionPx: 1080,
      fps: 12,
      format: 'webp',
    };
    const r = resolveEncodeParams(plan.quality);
    const vf = buildVideoFilterChain(plan, r);
    assert.ok(vf.includes('fps=12'));
    assert.ok(vf.includes('force_original_aspect_ratio=decrease'));
  });
});

describe('buildScaleToMaxDimension', () => {
  it('uses min(iw, max) / min(ih, max) so max dimension never upscales', () => {
    const s = buildScaleToMaxDimension(360);
    assert.ok(s.includes('min(iw\\,360)'));
    assert.ok(s.includes('min(ih\\,360)'));
  });
});

describe('clampPlanFps', () => {
  it('caps fps at 30', () => {
    assert.equal(clampPlanFps(120), 30);
    assert.equal(clampPlanFps(30.4), 30);
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
        maxDimensionPx: 1080,
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
      maxDimensionPx: 1080,
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
      maxDimensionPx: 1080,
      fps: 12,
      format: 'avif',
    };
    const line = describeRecipe(plan, 'clip.mp4', 'out.avif');
    assert.ok(line.includes('libaom-av1'));
    assert.ok(line.includes('out.avif'));
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
