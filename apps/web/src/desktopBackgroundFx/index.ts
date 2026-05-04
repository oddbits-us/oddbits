/**
 * Desktop background CRT effect — public entry point.
 *
 * Wires together: WebGPU feature detection, URL/localStorage/console/keyboard/
 * button toggles, canvas lifecycle, fallback CSS class. Call `mountDesktopBackgroundFx()`
 * once after DOMContentLoaded; idempotent if invoked twice.
 *
 * Console API (exposed as `window.__oddbitsCrt`):
 *   .enable() / .disable() / .toggle()
 *   .params           — current snapshot
 *   .setParams(patch) — deep-merge + apply live (CRT wallpaper only when CRT on)
 *   .reset()          — back to DEFAULT_CRT_PARAMS
 *   .snapshot()       — JSON-friendly current params
 *   .status           — { available, enabled, mode: 'webgpu' | 'fallback' | 'off' }
 */

import {
  cloneCrtParams,
  DEFAULT_CRT_PARAMS,
  mergeCrtParams,
  type CrtParams,
  type CrtParamsPatch,
} from './params';
import { createCrtPipeline, type CrtPipeline } from './webgpuPipeline';

const STORAGE_KEY = 'oddbits.crt.enabled';
const URL_PARAM = 'crt';

interface ControllerState {
  enabled: boolean;
  /** 'off' = user disabled; 'webgpu' = pipeline running; 'fallback' = CSS overlay; 'pending' = booting */
  mode: 'off' | 'webgpu' | 'fallback' | 'pending';
}

interface OddbitsCrtController {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  reset: () => void;
  setParams: (patch: CrtParamsPatch) => void;
  readonly params: CrtParams;
  readonly status: { available: boolean; enabled: boolean; mode: ControllerState['mode'] };
  snapshot: () => CrtParams;
}

declare global {
  interface Window {
    __oddbitsCrt?: OddbitsCrtController;
  }
}

let mounted = false;

export function mountDesktopBackgroundFx(): void {
  if (mounted) return;
  mounted = true;

  const webgpuAvailable = typeof (navigator as any).gpu !== 'undefined';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let params: CrtParams = cloneCrtParams(DEFAULT_CRT_PARAMS);
  if (reducedMotion) params.motion = false;

  const state: ControllerState = {
    enabled: resolveInitialEnabled(),
    mode: 'pending',
  };

  let canvas: HTMLCanvasElement | null = null;
  let pipeline: CrtPipeline | null = null;
  let pipelinePending: Promise<void> | null = null;

  const button = document.querySelector<HTMLButtonElement>('.desktop-crt-btn');

  function syncBody(): void {
    document.body.classList.toggle('crt-on', state.mode === 'webgpu');
    document.body.classList.toggle('crt-fallback', state.mode === 'fallback');
  }

  function syncButton(): void {
    if (!button) return;
    button.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
    button.dataset.crtMode = state.mode;
    button.textContent = state.enabled ? 'CRT on' : 'CRT off';
    button.title = state.enabled
      ? `CRT effect on (${state.mode}). Click to disable.`
      : 'CRT effect off. Click to enable.';
  }

  function ensureCanvas(): HTMLCanvasElement {
    if (canvas) return canvas;
    const c = document.createElement('canvas');
    c.className = 'desktop-bg-canvas';
    c.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(c, document.body.firstChild);
    canvas = c;
    return c;
  }

  function removeCanvas(): void {
    if (!canvas) return;
    canvas.remove();
    canvas = null;
  }

  function sizeCanvas(c: HTMLCanvasElement): void {
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }

  let resizeRaf: number | null = null;
  function onResize(): void {
    if (resizeRaf != null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      if (canvas) sizeCanvas(canvas);
      pipeline?.resize();
    });
  }

  async function bootWebGpu(): Promise<void> {
    const c = ensureCanvas();
    sizeCanvas(c);
    try {
      pipeline = await createCrtPipeline({ canvas: c, params });
      state.mode = 'webgpu';
      syncBody();
      syncButton();
      window.addEventListener('resize', onResize);
    } catch (err) {
      console.warn('[oddbits/crt] WebGPU boot failed, falling back to CSS:', err);
      removeCanvas();
      state.mode = 'fallback';
      syncBody();
      syncButton();
    } finally {
      pipelinePending = null;
    }
  }

  function teardown(): void {
    if (pipeline) {
      pipeline.dispose();
      pipeline = null;
    }
    if (resizeRaf != null) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = null;
    }
    window.removeEventListener('resize', onResize);
    removeCanvas();
  }

  function applyState(): void {
    if (!state.enabled) {
      teardown();
      state.mode = 'off';
      syncBody();
      syncButton();
      return;
    }
    if (!webgpuAvailable) {
      teardown();
      state.mode = 'fallback';
      syncBody();
      syncButton();
      return;
    }
    // Already running and enabled — nothing to do.
    if (state.mode === 'webgpu' && pipeline) return;
    teardown();
    state.mode = 'pending';
    syncBody();
    syncButton();
    pipelinePending = bootWebGpu();
  }

  function persist(enabled: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* private mode / disabled storage — ignore */
    }
  }

  function setEnabled(next: boolean): void {
    if (state.enabled === next) return;
    state.enabled = next;
    persist(next);
    applyState();
  }

  function resolveInitialEnabled(): boolean {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(URL_PARAM);
    if (raw != null) {
      const v = raw.toLowerCase();
      const on = v === '1' || v === 'on' || v === 'true' || v === 'yes';
      const off = v === '0' || v === 'off' || v === 'false' || v === 'no';
      if (on || off) {
        const enabled = on;
        try {
          localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch {
          /* ignore */
        }
        return enabled;
      }
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '0') return false;
      if (stored === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  }

  // Wire button.
  if (button) {
    button.addEventListener('click', () => {
      setEnabled(!state.enabled);
    });
  }

  // Wire keyboard shortcut: Alt+Shift+B.
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
      e.preventDefault();
      setEnabled(!state.enabled);
    }
  });

  // Expose console controller.
  const controller: OddbitsCrtController = {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle: () => setEnabled(!state.enabled),
    reset: () => {
      params = cloneCrtParams(DEFAULT_CRT_PARAMS);
      if (reducedMotion) params.motion = false;
      pipeline?.setParams(params);
    },
    setParams: (patch: CrtParamsPatch) => {
      params = mergeCrtParams(params, patch);
      if (reducedMotion) params.motion = false;
      pipeline?.setParams(params);
    },
    get params() {
      return cloneCrtParams(params);
    },
    get status() {
      return { available: webgpuAvailable, enabled: state.enabled, mode: state.mode };
    },
    snapshot: () => cloneCrtParams(params),
  };
  window.__oddbitsCrt = controller;

  applyState();

  // Fire-and-forget: keep the linter quiet about unused promise tracking.
  void pipelinePending;
}
