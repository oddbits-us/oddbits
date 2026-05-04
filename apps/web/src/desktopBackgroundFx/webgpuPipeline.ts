/**
 * WebGPU pipeline for the CRT background effect.
 *
 * Owns: adapter/device, swap-chain config, wallpaper video texture upload, sampler,
 * uniform buffer, bind group, render pipeline, RAF loop, glitch scheduling.
 *
 * Public surface is intentionally tiny — `mountDesktopBackgroundFx` is the
 * only caller. WebGPU types are not yet in the default DOM lib, so we keep the
 * inner GPU plumbing typed loosely (`any`) and only export strongly-typed
 * params on the boundary.
 */

import crtWgsl from './crt.wgsl?raw';
import {
  clampBackgroundPlaybackRate,
  cloneCrtParams,
  DEFAULT_BACKGROUND_PARAMS,
  DEFAULT_CRT_PARAMS,
  type CrtParams,
} from './params';

const UNIFORM_FLOAT_COUNT = 32; // 8 × vec4f, see crt.wgsl
const UNIFORM_BYTE_SIZE = UNIFORM_FLOAT_COUNT * 4;

/**
 * Reset the shader clock this often. Grain uses `time * largeFactor` in the WGSL
 * hash; after many minutes float32 precision degrades and can show vertical
 * banding / noisy streaks. Resetting the shader clock avoids toggling CRT off/on.
 */
const CRT_SHADER_TIME_RESET_MS = 15_000;

interface ActiveGlitch {
  startMs: number;
  durationMs: number;
  seed: number;
  bandHeightPx: number;
  maxOffsetPx: number;
}

export interface CrtPipeline {
  /** Render a single frame on demand (used after param/resize changes when motion=false). */
  renderOnce: () => void;
  /** Apply new params (deep-merged upstream); restarts/stops the loop as needed. */
  setParams: (params: CrtParams) => void;
  /** Notify the pipeline that the canvas CSS size or DPR changed. */
  resize: () => void;
  /** Cancel RAF, drop bind group, free GPU resources. Safe to call multiple times. */
  dispose: () => void;
}

export interface CreateCrtPipelineOptions {
  canvas: HTMLCanvasElement;
  params: CrtParams;
}

/**
 * Build everything the GPU needs and return a minimal driver. Throws if the
 * adapter/device cannot be acquired — caller is expected to fall back to CSS.
 */
export async function createCrtPipeline(opts: CreateCrtPipelineOptions): Promise<CrtPipeline> {
  const { canvas } = opts;
  const initialParams = cloneCrtParams(opts.params);
  const bgInit = initialParams.background ?? DEFAULT_BACKGROUND_PARAMS;
  const video = await loadBackgroundVideo(bgInit.videoUrl);
  video.playbackRate = clampBackgroundPlaybackRate(bgInit.playbackRate);

  const gpu = (navigator as any).gpu;
  if (!gpu) throw new Error('WebGPU not available');

  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  if (!device) throw new Error('No WebGPU device');

  const context = canvas.getContext('webgpu') as any;
  if (!context) throw new Error('No WebGPU canvas context');
  const format: string =
    typeof gpu.getPreferredCanvasFormat === 'function'
      ? gpu.getPreferredCanvasFormat()
      : 'bgra8unorm';

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  const texW = video.videoWidth;
  const texH = video.videoHeight;

  // GPUTextureUsage flags (spec values, used as numerics so we don't need
  // @webgpu/types just to reference the enum):
  //   COPY_DST = 0x02, TEXTURE_BINDING = 0x04, RENDER_ATTACHMENT = 0x10.
  // RENDER_ATTACHMENT is required by `copyExternalImageToTexture` even though
  // we only sample from this texture (Dawn validation, see
  // https://www.w3.org/TR/webgpu/#dom-gpuqueue-copyexternalimagetotexture).
  const TEXTURE_USAGE_SAMPLED = 0x04 | 0x02 | 0x10;
  const texture = device.createTexture({
    size: { width: texW, height: texH },
    format: 'rgba8unorm',
    usage: TEXTURE_USAGE_SAMPLED,
  });

  function uploadVideoFrame(): void {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    device.queue.copyExternalImageToTexture(
      { source: video, flipY: false },
      { texture },
      { width: texW, height: texH },
    );
  }

  uploadVideoFrame();

  // Nearest-neighbor sampling ≈ CSS `image-rendering: pixelated` — keeps wallpaper
  // pixels crisp when the video texture is scaled up to the canvas (linear would blur).
  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const shaderModule = device.createShaderModule({ code: crtWgsl });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // GPUBufferUsage flags (spec values): COPY_DST = 0x08, UNIFORM = 0x40.
  const BUFFER_USAGE_UNIFORM_DST = 0x40 | 0x08;
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_BYTE_SIZE,
    usage: BUFFER_USAGE_UNIFORM_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: UNIFORM_BYTE_SIZE,
        },
      },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  const uniformsArray = new Float32Array(UNIFORM_FLOAT_COUNT);
  let params = initialParams;
  let disposed = false;
  let rafId: number | null = null;
  let shaderClockStartMs = performance.now();
  let nextGlitchAtMs = shaderClockStartMs + sampleNextGlitchDelay(params);
  let activeGlitch: ActiveGlitch | null = null;
  const imageSize = { w: texW, h: texH };
  let lastVideoUploadMs = 0;

  function maybeUploadVideo(nowMs: number): void {
    const bg = params.background ?? DEFAULT_BACKGROUND_PARAMS;
    const maxFps = bg.maxTextureFps;
    if (maxFps > 0) {
      const capped = Math.min(Math.max(maxFps, 1), 240);
      const minIntervalMs = 1000 / capped;
      if (nowMs - lastVideoUploadMs < minIntervalMs) return;
    }
    lastVideoUploadMs = nowMs;
    uploadVideoFrame();
  }

  function syncVideoPlayback(): void {
    const bg = params.background ?? DEFAULT_BACKGROUND_PARAMS;
    video.playbackRate = clampBackgroundPlaybackRate(bg.playbackRate);
    const shouldPlay =
      params.motion && (typeof document === 'undefined' || document.visibilityState === 'visible');
    if (shouldPlay) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  let loopHoldTimeoutId: number | null = null;

  function clearLoopHoldTimeout(): void {
    if (loopHoldTimeoutId != null) {
      clearTimeout(loopHoldTimeoutId);
      loopHoldTimeoutId = null;
    }
  }

  function loopHoldSecondsFromParams(): number {
    const bg = params.background ?? DEFAULT_BACKGROUND_PARAMS;
    const s = bg.loopHoldSeconds;
    if (typeof s !== 'number' || !Number.isFinite(s)) return 0;
    return Math.max(0, s);
  }

  /** Native `video.loop` when hold is 0; otherwise `ended` + delayed restart. */
  function configureVideoLoopMode(): void {
    const holdSec = loopHoldSecondsFromParams();
    video.loop = holdSec <= 0;
    if (holdSec <= 0) clearLoopHoldTimeout();
  }

  function onVideoEnded(): void {
    if (disposed) return;
    const holdSec = loopHoldSecondsFromParams();
    if (holdSec <= 0) return;

    clearLoopHoldTimeout();
    loopHoldTimeoutId = window.setTimeout(() => {
      loopHoldTimeoutId = null;
      if (disposed) return;
      video.currentTime = 0;
      syncVideoPlayback();
    }, holdSec * 1000);
  }

  video.addEventListener('ended', onVideoEnded);

  function writeUniforms(nowMs: number): void {
    if (nowMs - shaderClockStartMs >= CRT_SHADER_TIME_RESET_MS) {
      shaderClockStartMs = nowMs;
    }

    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.width;
    const h = canvas.height;
    const tSec = (nowMs - shaderClockStartMs) / 1000;

    if (params.motion && params.glitch.eventsPerSecond > 0) {
      if (!activeGlitch && nowMs >= nextGlitchAtMs) {
        activeGlitch = {
          startMs: nowMs,
          durationMs: Math.max(8, params.glitch.durationMs),
          seed: Math.random() * 1000,
          bandHeightPx: Math.max(1, params.glitch.bandHeightPx),
          maxOffsetPx: params.glitch.maxOffsetPx,
        };
      }
    } else {
      activeGlitch = null;
    }

    let glitchAmount = 0;
    let glitchSeed = 0;
    let glitchBand = Math.max(1, params.glitch.bandHeightPx);
    let glitchMax = params.glitch.maxOffsetPx;
    if (activeGlitch) {
      const t = (nowMs - activeGlitch.startMs) / activeGlitch.durationMs;
      if (t >= 1) {
        activeGlitch = null;
        nextGlitchAtMs = nowMs + sampleNextGlitchDelay(params);
      } else {
        glitchAmount = Math.pow(1 - t, 0.5);
        glitchSeed = activeGlitch.seed;
        glitchBand = activeGlitch.bandHeightPx;
        glitchMax = activeGlitch.maxOffsetPx;
      }
    }

    // resolution: vec4 — xy=canvas px, zw=image px
    uniformsArray[0] = w;
    uniformsArray[1] = h;
    uniformsArray[2] = imageSize.w;
    uniformsArray[3] = imageSize.h;
    // timeMaster: vec4 — x=time(s), y=master, z=motion(0/1), w=dpr
    uniformsArray[4] = tSec;
    uniformsArray[5] = params.master;
    uniformsArray[6] = params.motion ? 1 : 0;
    uniformsArray[7] = dpr;
    // vignette: vec4 — x=strength, y=softness
    uniformsArray[8] = params.vignette.strength;
    uniformsArray[9] = params.vignette.softness;
    uniformsArray[10] = 0;
    uniformsArray[11] = 0;
    // scanlines: vec4 — x=density, y=opacity, z=sharpness
    uniformsArray[12] = params.scanlines.density;
    uniformsArray[13] = params.scanlines.opacity;
    uniformsArray[14] = params.scanlines.sharpness;
    uniformsArray[15] = 0;
    // chroma: vec4 — x=offsetPx, y=angle, z=glitchBoost
    uniformsArray[16] = params.chroma.offsetPx;
    uniformsArray[17] = params.chroma.angle;
    uniformsArray[18] = params.chroma.glitchBoost;
    uniformsArray[19] = 0;
    // glitch: vec4 — x=amount, y=bandHeightPx, z=maxOffsetPx, w=seed
    uniformsArray[20] = glitchAmount;
    uniformsArray[21] = glitchBand;
    uniformsArray[22] = glitchMax;
    uniformsArray[23] = glitchSeed;
    // noise: vec4 — x=amount
    uniformsArray[24] = params.noise.amount;
    uniformsArray[25] = 0;
    uniformsArray[26] = 0;
    uniformsArray[27] = 0;
    // lens: vec4 — x=barrel, y=edgeChroma, z=edgeBlurPx
    const lens = params.lens ?? DEFAULT_CRT_PARAMS.lens;
    uniformsArray[28] = lens.barrel;
    uniformsArray[29] = lens.edgeChroma;
    uniformsArray[30] = lens.edgeBlurPx;
    uniformsArray[31] = 0;

    device.queue.writeBuffer(uniformBuffer, 0, uniformsArray.buffer, 0, UNIFORM_BYTE_SIZE);
  }

  function renderFrame(nowMs: number): void {
    if (disposed) return;
    maybeUploadVideo(nowMs);
    writeUniforms(nowMs);

    const view = context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function loopTick(nowMs: number): void {
    if (disposed) return;
    renderFrame(nowMs);
    if (shouldAnimate()) {
      rafId = requestAnimationFrame(loopTick);
    } else {
      rafId = null;
    }
  }

  function shouldAnimate(): boolean {
    if (!params.motion) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    return true;
  }

  function ensureLoop(): void {
    if (disposed) return;
    if (rafId != null) return;
    if (shouldAnimate()) {
      rafId = requestAnimationFrame(loopTick);
    } else {
      renderFrame(performance.now());
    }
  }

  function onVisibilityChange(): void {
    syncVideoPlayback();
    if (document.visibilityState === 'visible') {
      ensureLoop();
    } else if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  configureVideoLoopMode();
  syncVideoPlayback();
  ensureLoop();

  return {
    renderOnce: () => renderFrame(performance.now()),
    setParams: (next: CrtParams) => {
      params = cloneCrtParams(next);
      configureVideoLoopMode();
      syncVideoPlayback();
      activeGlitch = null;
      nextGlitchAtMs = performance.now() + sampleNextGlitchDelay(params);
      ensureLoop();
      // If motion just turned off, draw one final frame so changes are visible.
      if (!params.motion) renderFrame(performance.now());
    },
    resize: () => {
      // The caller resizes canvas.width/height; we just need a redraw with new uniforms.
      ensureLoop();
      if (!params.motion) renderFrame(performance.now());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearLoopHoldTimeout();
      video.removeEventListener('ended', onVideoEnded);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      try {
        texture.destroy?.();
      } catch {
        /* swallow */
      }
      try {
        uniformBuffer.destroy?.();
      } catch {
        /* swallow */
      }
      try {
        device.destroy?.();
      } catch {
        /* swallow */
      }
    },
  };
}

/**
 * Sample an exponential-distributed gap (in ms) until the next glitch event
 * given the current per-second rate. Falls back to a long delay when disabled.
 */
function sampleNextGlitchDelay(params: CrtParams): number {
  const rate = Math.max(0, params.glitch.eventsPerSecond);
  if (rate <= 0) return 1e9;
  const u = Math.max(1e-6, Math.random());
  const seconds = -Math.log(u) / rate;
  return seconds * 1000;
}

/** Hidden looping `<video>` suitable for WebGPU texture upload. */
async function loadBackgroundVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = false;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const onMeta = (): void => {
      cleanup();
      resolve();
    };
    const onErr = (): void => {
      cleanup();
      reject(new Error(`Video failed to load: ${url}`));
    };
    function cleanup(): void {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    }
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.load();
  });

  if (video.videoWidth < 1 || video.videoHeight < 1) {
    throw new Error('Video has no drawable dimensions');
  }

  await new Promise<void>((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    const ok = (): void => {
      video.removeEventListener('canplay', ok);
      resolve();
    };
    video.addEventListener('canplay', ok, { once: true });
  });

  return video;
}
