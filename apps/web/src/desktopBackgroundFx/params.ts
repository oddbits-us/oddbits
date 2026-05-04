/**
 * CRT background effect — tunable parameters.
 *
 * Single source of truth for the WGSL fragment shader's knobs. Values are
 * deliberately conservative; the goal is "subtle CRT mood", not "demo of every
 * effect at max". Every field is hot-swappable at runtime via the
 * `__oddbitsCrt.setParams(partial)` console controller.
 */

export interface VignetteParams {
  /** 0..1 — overall darkening at the corners. */
  strength: number;
  /** 0..1 — how soft the falloff is (lower = harder edge). */
  softness: number;
}

export interface ScanlineParams {
  /** Lines per CSS pixel — higher = denser stripes. ~0.5 ≈ 1 line every 2px. */
  density: number;
  /** 0..1 — how dark the dark stripe is. */
  opacity: number;
  /** 1..8 — exponent applied to the sine; higher = thinner sharp lines. */
  sharpness: number;
}

export interface ChromaParams {
  /** RGB split distance, in CSS pixels at the screen center. */
  offsetPx: number;
  /** Direction of split, in radians (0 = horizontal). */
  angle: number;
  /**
   * While a glitch event is active, `offsetPx` is scaled toward this multiple of
   * the base value (smoothly by glitch envelope). 1 = no boost; 4 ≈ 4× fringing at peak glitch.
   */
  glitchBoost: number;
}

export interface GlitchParams {
  /** Average glitch events per second. 0 = disabled. */
  eventsPerSecond: number;
  /** Vertical band size, in CSS pixels. */
  bandHeightPx: number;
  /** Maximum horizontal UV nudge, in CSS pixels. */
  maxOffsetPx: number;
  /** How long a single glitch lasts, in milliseconds. */
  durationMs: number;
}

export interface NoiseParams {
  /** 0..1 — amplitude of per-pixel film grain. */
  amount: number;
}

/** Looping wallpaper decoded into the WebGPU CRT shader (`copyExternalImageToTexture`). */
export interface BackgroundParams {
  /** Resolved URL for the video (same-origin static asset). */
  videoUrl: string;
  /** `HTMLMediaElement.playbackRate` — tempo of the source clip. */
  playbackRate: number;
  /**
   * Upper bound on texture uploads per second from the decoded video (0 = no cap:
   * upload every render frame while the video advances). The CRT shader still
   * runs every RAF for scanlines, grain, and glitch.
   */
  maxTextureFps: number;
  /**
   * After each play-through, wait this many seconds before seeking to the start
   * and playing again. `0` uses the browser’s seamless native loop (`video.loop`).
   */
  loopHoldSeconds: number;
}

export const DEFAULT_BACKGROUND_PARAMS: BackgroundParams = {
  videoUrl: '/oddbits-background-video.webm',
  playbackRate: 0.7,
  maxTextureFps: 30,
  loopHoldSeconds: 0,
};

/** `HTMLMediaElement.playbackRate` clamp for the CRT wallpaper `<video>` (`0.0625`..`4`). */
export function clampBackgroundPlaybackRate(r: number): number {
  if (!Number.isFinite(r)) return 1;
  return Math.min(4, Math.max(0.0625, r));
}

/** Curved-glass + edge-heavy CRT traits (barrel warp, extra fringing and softness at corners). */
export interface LensParams {
  /**
   * Barrel distortion strength — simulates a curved faceplate. 0 = flat;
   * try 0.04–0.14 (subtle to obvious).
   */
  barrel: number;
  /**
   * Extra chroma multiplier toward screen corners (additive on top of base + glitch boost).
   * 0 = uniform chroma; ~1–2 = visibly stronger fringing at edges.
   */
  edgeChroma: number;
  /**
   * How much a cheap box-blur grows toward corners, in CSS px at the corners (0 = off).
   * Typical 0.8–2.5.
   */
  edgeBlurPx: number;
}

export interface CrtParams {
  /** 0..1 master multiplier applied to all effects. 0 = bypass. */
  master: number;
  background: BackgroundParams;
  vignette: VignetteParams;
  scanlines: ScanlineParams;
  chroma: ChromaParams;
  glitch: GlitchParams;
  noise: NoiseParams;
  lens: LensParams;
  /**
   * When false, the shader renders a single static frame (no animation, no
   * glitch). Auto-coerced to false when `prefers-reduced-motion: reduce` is set.
   */
  motion: boolean;
}

export const DEFAULT_CRT_PARAMS: CrtParams = {
  master: 1.0,
  background: { ...DEFAULT_BACKGROUND_PARAMS },
  vignette: {
    strength: 0.55,
    softness: 0.55,
  },
  scanlines: {
    density: 0.5,
    opacity: 0.18,
    sharpness: 2.2,
  },
  chroma: {
    offsetPx: 2,
    angle: 0,
    glitchBoost: 4,
  },
  glitch: {
    eventsPerSecond: 0.3,
    bandHeightPx: 36,
    maxOffsetPx: 10,
    durationMs: 80,
  },
  noise: {
    amount: 0.077,
  },
  lens: {
    barrel: 0.05,
    edgeChroma: 3,
    edgeBlurPx: 3,
  },
  motion: true,
};

/**
 * Deep-clone with defaults merged in for every nested group.
 * Callers sometimes hold partially-filled objects; missing `lens` (etc.) used to
 * become `{}` and produced NaNs in the uniform buffer → WebGPU validation errors.
 */
export function cloneCrtParams(p: CrtParams): CrtParams {
  const d = DEFAULT_CRT_PARAMS;
  return {
    master: p.master ?? d.master,
    background: { ...d.background, ...p.background },
    vignette: { ...d.vignette, ...p.vignette },
    scanlines: { ...d.scanlines, ...p.scanlines },
    chroma: { ...d.chroma, ...p.chroma },
    glitch: { ...d.glitch, ...p.glitch },
    noise: { ...d.noise, ...p.noise },
    lens: { ...d.lens, ...p.lens },
    motion: p.motion ?? d.motion,
  };
}

/**
 * Recursive partial merge for `setParams(partial)`. Only known nested objects
 * are merged; unknown keys are ignored. Numbers are clamped where it's cheap to
 * reason about ranges.
 */
export type CrtParamsPatch = {
  master?: number;
  background?: Partial<BackgroundParams>;
  vignette?: Partial<VignetteParams>;
  scanlines?: Partial<ScanlineParams>;
  chroma?: Partial<ChromaParams>;
  glitch?: Partial<GlitchParams>;
  noise?: Partial<NoiseParams>;
  lens?: Partial<LensParams>;
  motion?: boolean;
};

export function mergeCrtParams(base: CrtParams, patch: CrtParamsPatch): CrtParams {
  const next = cloneCrtParams(base);
  if (typeof patch.master === 'number') next.master = clamp01(patch.master);
  if (patch.background) Object.assign(next.background, patch.background);
  if (patch.vignette) Object.assign(next.vignette, patch.vignette);
  if (patch.scanlines) Object.assign(next.scanlines, patch.scanlines);
  if (patch.chroma) Object.assign(next.chroma, patch.chroma);
  if (patch.glitch) Object.assign(next.glitch, patch.glitch);
  if (patch.noise) Object.assign(next.noise, patch.noise);
  if (patch.lens) Object.assign(next.lens, patch.lens);
  if (typeof patch.motion === 'boolean') next.motion = patch.motion;
  return next;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
