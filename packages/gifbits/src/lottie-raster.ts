/**
 * Build a minimal Bodymovin/Lottie JSON that swaps full-frame PNG assets each tick.
 * Intended for Webflow/Lottie hosts that accept raster image sequences (large vs vector Lottie).
 */

export type RasterLottieFrame = {
  /** Relative path inside the zip, e.g. images/frame_0001.png */
  relativePath: string;
  width: number;
  height: number;
};

/**
 * @param frames One entry per frame in order (dimensions must match within export).
 * @param fps Playback frames per second.
 */
export function buildRasterLottieJson(frames: RasterLottieFrame[], fps: number): Record<string, unknown> {
  if (frames.length === 0) {
    throw new Error('buildRasterLottieJson: at least one frame required');
  }
  const { width: w, height: h } = frames[0]!;
  for (const f of frames) {
    if (f.width !== w || f.height !== h) {
      throw new Error('buildRasterLottieJson: all frames must share the same dimensions');
    }
  }

  const fr = Math.min(120, Math.max(1, fps));
  const frameCount = frames.length;
  const op = frameCount;

  const assets = frames.map((f, i) => {
    const slash = f.relativePath.lastIndexOf('/');
    const u = slash >= 0 ? `${f.relativePath.slice(0, slash + 1)}` : '';
    const p = slash >= 0 ? f.relativePath.slice(slash + 1) : f.relativePath;
    return {
      id: `asset_${i}`,
      w,
      h,
      u,
      p,
      e: 0,
    };
  });

  const layers = frames.map((_, frameIndex) => {
    const ind = frameIndex + 1;
    const cx = w / 2;
    const cy = h / 2;
    return {
      ddd: 0,
      ind,
      ty: 2,
      nm: `frame_${frameIndex}`,
      refId: `asset_${frameIndex}`,
      sr: 1,
      ks: {
        o: { a: 0, k: 100, ix: 11 },
        r: { a: 0, k: 0, ix: 10 },
        p: { a: 0, k: [cx, cy, 0], ix: 2 },
        a: { a: 0, k: [cx, cy, 0], ix: 1 },
        s: { a: 0, k: [100, 100, 100], ix: 6 },
      },
      ao: 0,
      ip: frameIndex,
      op: frameIndex + 1,
      st: 0,
      bm: 0,
    };
  });

  return {
    v: '5.7.4',
    fr,
    ip: 0,
    op,
    w,
    h,
    nm: 'GifBits raster export',
    ddd: 0,
    assets,
    layers,
  };
}
