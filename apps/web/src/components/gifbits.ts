/**
 * GifBits — ffmpeg.wasm workshop: crop, trim, export animated WebP, GIF, or PNG sequence zip.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
/** Explicit worker URL — required under Vite so Worker() resolves; default `./worker.js` breaks after bundle. */
import ffmpegWorkerUrl from '@ffmpeg/ffmpeg/worker?url';
/** Must come through Vite (?url). Putting ffmpeg-core in `public/` and passing `/vendor/...` breaks dev: the worker’s dynamic `import(coreURL)` is still analyzed and public files can’t be transformed. */
import ffmpegCoreURL from '@ffmpeg/core?url';
import ffmpegWasmURL from '@ffmpeg/core/wasm?url';
import { fetchFile } from '@ffmpeg/util';
import {
  VERSION,
  buildAnimatedWebpArgs,
  buildGifArgs,
  buildGifFilterComplex,
  buildPngSequenceArgs,
  buildVideoFilterChain,
  clampPlanFps,
  cropRegionPercentages,
  resolveEncodeParams,
  trimDurationSeconds,
  type AnimatedExportFormat,
  type CropRatio,
  type GifBitsEncodePlan,
} from '@oddbits/gifbits';
import { zipSync } from 'fflate';

import { BitElement } from '../bits/BitElement';

const OUT_WEBP = 'out.webp';
const OUT_GIF = 'out.gif';
/** Appended to export basename before the extension (e.g. `clip-gifbits_encode.webp`). */
const DOWNLOAD_FILENAME_SUFFIX = '-gifbits_encode';
const MAX_SEQUENCE_FRAMES = 600;
const MIN_TRIM_GAP_PCT = 0.35;
/** `-1` exec timeout runs forever; cap WebP/GIF/PNG jobs so a bad decode can’t hang the worker indefinitely. */
const WASM_ENCODE_TIMEOUT_MS = 600_000;

export class GifBitsElement extends BitElement {
  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private introError: HTMLElement | null = null;
  private previewAspect: HTMLElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  private cropFrame: HTMLElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private trimRail: HTMLElement | null = null;
  private trimRangeFill: HTMLElement | null = null;
  private trimHandleStart: HTMLButtonElement | null = null;
  private trimHandleEnd: HTMLButtonElement | null = null;
  private trimStartLabel: HTMLElement | null = null;
  private trimEndLabel: HTMLElement | null = null;
  private ratioSelect: HTMLSelectElement | null = null;
  private qualityRange: HTMLInputElement | null = null;
  private qualityLabel: HTMLElement | null = null;
  private maxDimensionInput: HTMLInputElement | null = null;
  private fpsInput: HTMLInputElement | null = null;
  private formatSelect: HTMLSelectElement | null = null;
  private frameEstimate: HTMLElement | null = null;
  private outputPreview: HTMLElement | null = null;
  private outputStage: HTMLElement | null = null;
  private encodeBtn: HTMLButtonElement | null = null;
  private downloadBtn: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;
  /** Cleared on disconnect — file-drop listeners on `#window-gifbits`. */
  private introWindowDropAbort: AbortController | null = null;

  private trimStartPct = 0;
  private trimEndPct = 100;
  private trimDrag: 'start' | 'end' | null = null;
  private outputPreviewUrl: string | null = null;

  private videoFile: File | null = null;
  private previewObjectUrl: string | null = null;
  private durationSec = 0;
  private outputBlob: Blob | null = null;
  private outputName = 'export.webp';
  private encoding = false;
  private encodeAbort = false;
  private exportsDownloaded = false;
  private ffmpeg: FFmpeg | null = null;
  private ffmpegLoading: Promise<void> | null = null;
  private lastLoggedProgress = -1;

  protected renderShell(): string {
    return `
      <div class="gifbits-shell bit-shell">
        <div class="gifbits-intro">
          <div class="gifbits-intro-error" id="gifbits-intro-error" hidden></div>
          <div class="drop-zone" id="gifbits-drop-zone">
            <input type="file" id="gifbits-file-input" accept="video/*">
            <div class="drop-zone-text">
              <strong>Drop a video here</strong> or click to browse
            </div>
          </div>
        </div>

        <div
          id="gifbits-workshop"
          class="window gifbits-dialog-window gifbits-workshop-portal gifbits-workshop bit-workshop"
          role="dialog"
          aria-modal="false"
          aria-labelledby="gifbits-workshop-title"
          hidden
        >
          <div class="window-titlebar gifbits-dialog-drag-handle bit-drag-handle">
            <span id="gifbits-workshop-title">GifBits — Encode</span>
            <div class="window-controls">
              <button type="button" class="window-btn gifbits-workshop-close bit-workshop-close" aria-label="Close">X</button>
            </div>
          </div>
          <div class="window-content gifbits-workshop-body">
            <div class="gifbits-workshop-columns">
              <div class="gifbits-col gifbits-col-preview">
                <div class="gifbits-preview-stack">
                  <div class="gifbits-preview-aspect" id="gifbits-preview-aspect">
                    <video
                      id="gifbits-preview-video"
                      class="gifbits-preview-video"
                      muted
                      playsinline
                      preload="metadata"
                    ></video>
                    <div class="gifbits-crop-frame" id="gifbits-crop-frame" hidden></div>
                  </div>
                  <div class="gifbits-trim-block">
                    <span class="gifbits-trim-heading">Clip range</span>
                    <div class="gifbits-trim-rail" id="gifbits-trim-rail" role="presentation">
                      <div class="gifbits-trim-track-bg" aria-hidden="true"></div>
                      <div class="gifbits-trim-range" id="gifbits-trim-range" aria-hidden="true"></div>
                      <button type="button" class="gifbits-trim-handle" id="gifbits-trim-handle-start" aria-label="Clip start"></button>
                      <button type="button" class="gifbits-trim-handle" id="gifbits-trim-handle-end" aria-label="Clip end"></button>
                    </div>
                    <div class="gifbits-trim-times">
                      <span id="gifbits-trim-start-val">0.00s</span>
                      <span id="gifbits-trim-end-val">0.00s</span>
                    </div>
                  </div>
                  <div class="preview-info" id="gifbits-preview-info"></div>
                </div>
                <div class="logs" id="gifbits-logs"></div>
              </div>
              <div class="gifbits-col gifbits-col-actions">
                <div class="gifbits-output-preview" id="gifbits-output-preview" hidden>
                  <span class="gifbits-output-preview-label">Output preview</span>
                  <div class="gifbits-output-stage" id="gifbits-output-stage"></div>
                </div>
                <div class="controls">
                  <div class="control-group">
                    <label for="gifbits-ratio">Crop ratio</label>
                    <select id="gifbits-ratio">
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </div>
                  <div class="control-group">
                    <label for="gifbits-max-dimension">Max dimension (px)</label>
                    <input type="number" id="gifbits-max-dimension" min="64" max="4096" step="1" value="1080">
                  </div>
                  <div class="control-group">
                    <label for="gifbits-quality">
                      Quality
                      <span class="range-value" id="gifbits-quality-val">72</span>
                    </label>
                    <input type="range" id="gifbits-quality" min="1" max="100" value="72">
                  </div>
                  <div class="control-group">
                    <label for="gifbits-fps">Frame rate (fps)</label>
                    <input type="number" id="gifbits-fps" min="1" max="30" step="1" value="12">
                  </div>
                  <div class="control-group">
                    <label for="gifbits-format">Output</label>
                    <select id="gifbits-format">
                      <option value="webp" selected>Animated WebP</option>
                      <option value="gif">GIF</option>
                      <option value="image-sequence">Image sequence (PNG zip)</option>
                    </select>
                  </div>
                  <p class="gifbits-frame-estimate" id="gifbits-frame-estimate" aria-live="polite"></p>
                </div>
                <div class="gifbits-actions">
                  <button type="button" id="gifbits-encode-btn">Encode</button>
                  <button type="button" id="gifbits-download-btn" class="gifbits-download" disabled>Download</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="gifbits-help"
          class="window gifbits-dialog-window gifbits-help-dialog bit-help-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="gifbits-help-title"
          hidden
        >
          <div class="window-titlebar">
            <span id="gifbits-help-title">GifBits.md</span>
            <div class="window-controls">
              <button type="button" class="window-btn gifbits-help-close bit-help-close" aria-label="Close help">X</button>
            </div>
          </div>
          <div class="window-content gifbits-help-content anime-section">
            <h2 id="gifbits-help-heading">GifBits</h2>
            <div class="docs-section">
              <p>
                <strong>Animated WebP</strong> is the default in the browser — fast and reliable in ffmpeg.wasm.
                You can also export GIF or a PNG zip. GifBits runs
                <a href="https://ffmpegwasm.netlify.app/" target="_blank" rel="noopener noreferrer">ffmpeg</a>
                in WebAssembly in this tab — your file never uploads.
              </p>
            </div>
            <div class="docs-section">
              <h3>In your code</h3>
              <pre><code>npm install @oddbits/gifbits

import { describeRecipe } from '@oddbits/gifbits';

const plan = { cropRatio: '9:16', trimStart: 0, trimEnd: 6,
  quality: 75, maxDimensionPx: 1080, fps: 12, format: 'webp' as const };
console.log(describeRecipe(plan, 'in.mp4', 'out.webp'));</code></pre>
            </div>
            <div class="docs-section">
              <h3>From the CLI</h3>
              <pre><code>npx @oddbits/gifbits recipe --ratio 9:16 --start 0 --end 4 --format webp --fps 12
npx @oddbits/gifbits convert -i clip.mp4 -o out.webp --format webp --start 0 --end 5</code></pre>
            </div>
            <div class="docs-section">
              <h3>Privacy</h3>
              <p class="gifbits-help-privacy">
                No accounts or telemetry — encoding stays on your device (wasm here or ffmpeg on your machine).
              </p>
            </div>
            <div class="docs-section">
              <p>
                Full options and caveats on
                <a href="https://github.com/oddbits-us/oddbits/blob/main/packages/gifbits/README.md" target="_blank" rel="noopener noreferrer">GitHub</a>.
              </p>
            </div>
          </div>
        </div>

        <div
          id="gifbits-confirm-close"
          class="alert-modal-backdrop bit-confirm-backdrop"
          hidden
        >
          <div class="alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="gifbits-confirm-title" aria-describedby="gifbits-confirm-message">
            <div class="alert-modal-icon" aria-hidden="true">⚠️</div>
            <div class="alert-modal-title" id="gifbits-confirm-title">Discard unsaved progress?</div>
            <div class="alert-modal-message" id="gifbits-confirm-message">
              Closing will clear the loaded video and any encoded output in this workshop.
            </div>
            <div class="alert-modal-actions">
              <button type="button" id="gifbits-confirm-cancel" class="bit-confirm-cancel">No! Cancel!</button>
              <button type="button" id="gifbits-confirm-accept" class="btn-secondary bit-confirm-accept">Yes, I'm aware.</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected getHostWindowSelector(): string | null {
    return '#window-gifbits';
  }

  protected getVersion(): string | null {
    return VERSION;
  }

  protected getWorkshopMinSize(): { width: number; height: number } {
    return { width: 560, height: 420 };
  }

  protected getHelpMinSize(): { width: number; height: number } {
    return { width: 360, height: 300 };
  }

  protected isWorkshopDirty(): boolean {
    if (!this.workshop || this.workshop.hidden) return false;
    if (this.encoding) return true;
    if (this.exportsDownloaded) return false;
    if (this.videoFile) return true;
    return false;
  }

  protected onAcceptConfirmClose(): void {
    this.encodeAbort = true;
  }

  protected resetWorkshopState(): void {
    this.revokePreviewUrl();
    this.revokeOutputPreviewUrl();
    this.videoFile = null;
    this.outputBlob = null;
    this.encoding = false;
    this.encodeAbort = false;
    this.exportsDownloaded = false;
    this.trimStartPct = 0;
    this.trimEndPct = 100;
    if (this.previewAspect) {
      this.previewAspect.style.aspectRatio = '';
    }
    if (this.cropFrame) {
      this.cropFrame.hidden = true;
    }
    if (this.previewVideo) {
      this.previewVideo.removeAttribute('src');
    }
    if (this.previewInfo) this.previewInfo.innerHTML = '';
    this.clearLogs();
    this.setDownloadButtonIdle();
    if (this.outputPreview) this.outputPreview.hidden = true;
    void this.cleanupMemfs();
  }

  protected onDisconnect(): void {
    this.introWindowDropAbort?.abort();
    this.introWindowDropAbort = null;
    this.revokePreviewUrl();
    this.revokeOutputPreviewUrl();
    void this.cleanupMemfs();
  }

  private revokePreviewUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  private revokeOutputPreviewUrl(): void {
    if (this.outputPreviewUrl) {
      URL.revokeObjectURL(this.outputPreviewUrl);
      this.outputPreviewUrl = null;
    }
    if (this.outputStage) this.outputStage.innerHTML = '';
    if (this.outputPreview) this.outputPreview.hidden = true;
  }

  protected initializeBitElements(): void {
    this.fileInput = this.querySelector('#gifbits-file-input');
    this.dropZone = this.querySelector('#gifbits-drop-zone');
    this.introError = this.querySelector('#gifbits-intro-error');
    this.previewAspect = this.querySelector('#gifbits-preview-aspect');
    this.previewVideo = this.querySelector('#gifbits-preview-video');
    this.cropFrame = this.querySelector('#gifbits-crop-frame');
    this.previewInfo = this.querySelector('#gifbits-preview-info');
    this.trimRail = this.querySelector('#gifbits-trim-rail');
    this.trimRangeFill = this.querySelector('#gifbits-trim-range');
    this.trimHandleStart = this.querySelector('#gifbits-trim-handle-start');
    this.trimHandleEnd = this.querySelector('#gifbits-trim-handle-end');
    this.trimStartLabel = this.querySelector('#gifbits-trim-start-val');
    this.trimEndLabel = this.querySelector('#gifbits-trim-end-val');
    this.ratioSelect = this.querySelector('#gifbits-ratio');
    this.qualityRange = this.querySelector('#gifbits-quality');
    this.qualityLabel = this.querySelector('#gifbits-quality-val');
    this.maxDimensionInput = this.querySelector('#gifbits-max-dimension');
    this.fpsInput = this.querySelector('#gifbits-fps');
    this.formatSelect = this.querySelector('#gifbits-format');
    this.frameEstimate = this.querySelector('#gifbits-frame-estimate');
    this.outputPreview = this.querySelector('#gifbits-output-preview');
    this.outputStage = this.querySelector('#gifbits-output-stage');
    this.encodeBtn = this.querySelector('#gifbits-encode-btn');
    this.downloadBtn = this.querySelector('#gifbits-download-btn');
    this.logs = this.querySelector('#gifbits-logs');

    this.bindRangeLabel(this.qualityRange, this.qualityLabel, (v) => String(Math.round(v)));
    this.wireTrimRail();
    this.updateFrameEstimate();
  }

  private bindRangeLabel(range: HTMLInputElement | null, label: HTMLElement | null, fmt: (n: number) => string): void {
    if (!range || !label) return;
    const sync = () => {
      const raw = parseFloat(range.value);
      label.textContent = fmt(Number.isFinite(raw) ? raw : 0);
    };
    sync();
    range.addEventListener('input', sync);
    range.addEventListener('change', sync);
  }

  private wireTrimRail(): void {
    const onMove = (e: PointerEvent) => {
      if (!this.trimDrag || !this.previewVideo) return;
      const pct = this.pointerToPct(e.clientX);
      const d = this.durationSec || 1;
      if (this.trimDrag === 'start') {
        this.trimStartPct = Math.max(0, Math.min(pct, this.trimEndPct - MIN_TRIM_GAP_PCT));
        this.previewVideo.currentTime = (this.trimStartPct / 100) * d;
      } else {
        this.trimEndPct = Math.min(100, Math.max(pct, this.trimStartPct + MIN_TRIM_GAP_PCT));
        this.previewVideo.currentTime = (this.trimEndPct / 100) * d;
      }
      this.syncTrimVisual();
      this.updateFrameEstimate();
      this.exportsDownloaded = false;
    };

    const onUp = () => {
      this.trimDrag = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };

    const startDrag =
      (which: 'start' | 'end') =>
      (e: PointerEvent): void => {
        e.preventDefault();
        this.trimDrag = which;
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      };

    this.trimHandleStart?.addEventListener('pointerdown', startDrag('start'));
    this.trimHandleEnd?.addEventListener('pointerdown', startDrag('end'));
  }

  private pointerToPct(clientX: number): number {
    const rail = this.trimRail;
    if (!rail) return 0;
    const r = rail.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
  }

  private syncTrimVisual(): void {
    const d = this.durationSec || 1;
    const s = this.trimStartPct;
    const e = this.trimEndPct;
    if (this.trimRangeFill) {
      this.trimRangeFill.style.left = `${s}%`;
      this.trimRangeFill.style.width = `${Math.max(0, e - s)}%`;
    }
    if (this.trimHandleStart) this.trimHandleStart.style.left = `${s}%`;
    if (this.trimHandleEnd) this.trimHandleEnd.style.left = `${e}%`;
    if (this.trimStartLabel) this.trimStartLabel.textContent = `${((s / 100) * d).toFixed(2)}s`;
    if (this.trimEndLabel) this.trimEndLabel.textContent = `${((e / 100) * d).toFixed(2)}s`;
  }

  private updatePreviewAspectAndCrop(): void {
    const v = this.previewVideo;
    const box = this.previewAspect;
    if (!v || !box || !v.videoWidth) return;
    box.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    this.updateCropOverlay();
  }

  private updateCropOverlay(): void {
    const v = this.previewVideo;
    const frame = this.cropFrame;
    const ratio = (this.ratioSelect?.value ?? '16:9') as CropRatio;
    if (!v || !frame || !v.videoWidth) return;
    frame.hidden = false;
    const V = v.videoWidth / v.videoHeight;
    const { leftPct, topPct, widthPct, heightPct } = cropRegionPercentages(V, ratio);
    frame.style.left = `${leftPct}%`;
    frame.style.top = `${topPct}%`;
    frame.style.width = `${widthPct}%`;
    frame.style.height = `${heightPct}%`;
  }

  private syncTrimToNewVideo(): void {
    this.trimStartPct = 0;
    this.trimEndPct = 100;
    this.syncTrimVisual();
    this.updateFrameEstimate();
  }

  private getPlan(): GifBitsEncodePlan {
    const ratio = (this.ratioSelect?.value ?? '16:9') as CropRatio;
    const d = this.durationSec || 1;
    const start = (this.trimStartPct / 100) * d;
    const end = (this.trimEndPct / 100) * d;
    const quality = Math.min(100, Math.max(1, parseInt(this.qualityRange?.value ?? '72', 10) || 72));
    let maxDimensionPx = parseInt(this.maxDimensionInput?.value ?? '1080', 10);
    if (!Number.isFinite(maxDimensionPx)) maxDimensionPx = 1080;
    maxDimensionPx = Math.min(4096, Math.max(64, Math.round(maxDimensionPx)));
    const fpsRaw = parseInt(this.fpsInput?.value ?? '12', 10);
    const fps = clampPlanFps(Number.isFinite(fpsRaw) ? fpsRaw : 12);
    const rawFormat = (this.formatSelect?.value ?? 'webp') as AnimatedExportFormat;
    const format: AnimatedExportFormat = rawFormat === 'avif' ? 'webp' : rawFormat;
    return {
      cropRatio: ratio,
      trimStart: Math.min(start, end),
      trimEnd: Math.max(start, end),
      quality,
      maxDimensionPx,
      fps,
      format,
    };
  }

  private estimateHeavyWarning(plan: GifBitsEncodePlan, estFrames: number): boolean {
    const m = plan.maxDimensionPx;
    if (estFrames >= 420) return true;
    if (plan.format === 'image-sequence' && estFrames >= 220) return true;
    if (m >= 1920 && estFrames >= 200) return true;
    if (m >= 1440 && estFrames >= 300) return true;
    if (m >= 2160 && estFrames >= 120) return true;
    return false;
  }

  private updateFrameEstimate(): void {
    if (!this.frameEstimate) return;
    const plan = this.getPlan();
    const dur = trimDurationSeconds(plan);
    const fps = clampPlanFps(plan.fps);
    const est = Math.ceil(dur * fps);
    const q = plan.quality;

    let main = `~${est} frames @ ${fps} fps · clip ${dur.toFixed(2)}s · max ${plan.maxDimensionPx}px long side · quality ${q}`;
    if (plan.format === 'image-sequence' && est > MAX_SEQUENCE_FRAMES) {
      main += `. Sequence capped at ${MAX_SEQUENCE_FRAMES} frames — shorten the clip or lower fps.`;
    }

    const heavy = this.estimateHeavyWarning(plan, est);
    this.frameEstimate.classList.toggle('gifbits-frame-estimate--warn', heavy);
    if (heavy) {
      this.frameEstimate.innerHTML = `${this.escapeHtml(main)}<span class="gifbits-frame-warn-msg"> Heavy export — may be slow or fail in the browser.</span>`;
    } else {
      this.frameEstimate.textContent = main;
    }
  }

  protected attachBitListeners(): void {
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.files?.length) this.handleVideoFile(t.files[0]!);
      });
    }

    const hostSel = this.getHostWindowSelector();
    const hostWindow = hostSel ? document.querySelector<HTMLElement>(hostSel) : null;
    const dropRoot = hostWindow ?? this.shell;
    if (dropRoot) {
      this.introWindowDropAbort?.abort();
      this.introWindowDropAbort = new AbortController();
      const { signal } = this.introWindowDropAbort;

      dropRoot.addEventListener(
        'dragover',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropZone?.classList.add('dragover');
        },
        { signal },
      );
      dropRoot.addEventListener(
        'dragleave',
        (e) => {
          if (!dropRoot.contains(e.relatedTarget as Node)) this.dropZone?.classList.remove('dragover');
        },
        { signal },
      );
      dropRoot.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropZone?.classList.remove('dragover');
          const f = e.dataTransfer?.files?.[0];
          if (f) this.handleVideoFile(f);
        },
        { signal },
      );
    }

    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => this.fileInput?.click());
    }

    if (this.previewVideo) {
      this.previewVideo.addEventListener('loadedmetadata', () => {
        this.durationSec = this.previewVideo?.duration ?? 0;
        this.syncTrimToNewVideo();
        this.updatePreviewAspectAndCrop();
        this.updatePreviewInfo();
        this.updateFrameEstimate();
      });
    }

    [this.ratioSelect, this.formatSelect].forEach((el) => {
      el?.addEventListener('change', () => {
        this.exportsDownloaded = false;
        if (el === this.ratioSelect) this.updateCropOverlay();
        this.updateFrameEstimate();
      });
    });

    if (this.maxDimensionInput) {
      const clampDim = () => {
        let v = parseInt(this.maxDimensionInput!.value, 10);
        if (!Number.isFinite(v)) v = 1080;
        v = Math.min(4096, Math.max(64, Math.round(v)));
        this.maxDimensionInput!.value = String(v);
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      };
      this.maxDimensionInput.addEventListener('change', clampDim);
      this.maxDimensionInput.addEventListener('input', () => {
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      });
    }

    if (this.fpsInput) {
      this.fpsInput.addEventListener('input', () => {
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      });
      this.fpsInput.addEventListener('change', () => {
        const v = clampPlanFps(parseInt(this.fpsInput!.value, 10));
        this.fpsInput!.value = String(v);
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      });
    }

    if (this.encodeBtn) {
      this.encodeBtn.addEventListener('click', () => {
        void this.runEncode();
      });
    }

    if (this.qualityRange) {
      this.qualityRange.addEventListener('input', () => {
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      });
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadOutput());
    }
  }

  private updatePreviewInfo(): void {
    if (!this.previewInfo || !this.videoFile) return;
    const mb = (this.videoFile.size / (1024 * 1024)).toFixed(2);
    this.previewInfo.innerHTML = `<span>${this.escapeHtml(this.videoFile.name)}</span> · ${mb} MB · ${this.durationSec.toFixed(2)}s`;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  private hideIntroError(): void {
    if (this.introError) {
      this.introError.hidden = true;
      this.introError.textContent = '';
    }
  }

  private showIntroError(message: string): void {
    if (this.introError) {
      this.introError.textContent = message;
      this.introError.hidden = false;
    }
  }

  private handleVideoFile(file: File): void {
    this.hideIntroError();
    if (!file.type.startsWith('video/')) {
      this.showIntroError('Please drop a video file (MP4, WebM, MOV, etc.).');
      return;
    }

    this.revokePreviewUrl();
    this.revokeOutputPreviewUrl();
    this.videoFile = file;
    this.outputBlob = null;
    this.exportsDownloaded = false;
    this.previewObjectUrl = URL.createObjectURL(file);

    if (this.previewVideo) {
      this.previewVideo.src = this.previewObjectUrl;
      this.previewVideo.load();
    }

    this.setDownloadButtonIdle();
    this.clearLogs();
    this.openWorkshop();
  }

  private clearLogs(): void {
    if (!this.logs) return;
    this.logs.innerHTML = '';
    this.logs.classList.remove('active');
    this.logs.classList.remove('is-error');
  }

  /** Same pattern as ImageBits: `.log-entry` rows, `.logs.active`, `.logs.is-error`. */
  private appendLog(line: string, isError = false): void {
    if (!this.logs) return;
    const parts = line.split(/\r?\n/);
    for (const part of parts) {
      if (part === '') continue;
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = part;
      this.logs.appendChild(entry);
    }
    this.logs.classList.add('active');
    if (isError) this.logs.classList.add('is-error');
    this.logs.scrollTop = this.logs.scrollHeight;
  }

  private async ensureFfmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;
    if (this.ffmpegLoading) return this.ffmpegLoading.then(() => this.ffmpeg!);

    this.ffmpegLoading = (async () => {
      const ff = new FFmpeg();
      ff.on('log', ({ message }) => {
        this.appendLog(message);
      });
      ff.on('progress', ({ progress }) => {
        const p = Math.min(100, Math.max(0, Math.round((progress ?? 0) * 100)));
        if (p === this.lastLoggedProgress) return;
        if (p < 100 && p - this.lastLoggedProgress < 4 && this.lastLoggedProgress >= 0) return;
        this.lastLoggedProgress = p;
        this.appendLog(`Encoding… ~${p}%`);
      });
      this.appendLog(
        `Loading ffmpeg wasm (~32 MB, served by this dev server / same-site build output — not an external CDN).`,
      );
      const t0 = performance.now();
      try {
        await ff.load({
          classWorkerURL: ffmpegWorkerUrl,
          coreURL: ffmpegCoreURL,
          wasmURL: ffmpegWasmURL,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.appendLog(`ffmpeg failed to load: ${msg}`, true);
        throw e;
      }
      this.appendLog(`ffmpeg ready (${Math.round(performance.now() - t0)} ms).`);
      this.ffmpeg = ff;
    })();

    await this.ffmpegLoading;
    return this.ffmpeg!;
  }

  private async cleanupMemfs(): Promise<void> {
    if (!this.ffmpeg) return;
    const names = ['input', OUT_WEBP, OUT_GIF, 'fps.txt'];
    for (let i = 0; i < 400; i++) {
      names.push(`frame_${String(i).padStart(4, '0')}.png`);
    }
    for (const n of names) {
      try {
        await this.ffmpeg.deleteFile(n);
      } catch {
        /* ignore */
      }
    }
  }

  private parseFpsFraction(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    if (t.includes('/')) {
      const [a, b] = t.split('/');
      const num = Number(a);
      const den = Number(b);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
      const v = num / den;
      return Number.isFinite(v) && v > 0 ? v : null;
    }
    const v = Number(t);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  private async detectSourceFps(ffmpeg: FFmpeg): Promise<number | null> {
    try {
      const rc = await ffmpeg.ffprobe(
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=avg_frame_rate,r_frame_rate',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          'input',
          '-o',
          'fps.txt',
        ],
        10_000,
      );
      if (rc !== 0) return null;
      const raw = (await ffmpeg.readFile('fps.txt')) as Uint8Array;
      const text = new TextDecoder().decode(raw);
      const lines = text
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      for (const line of lines) {
        const fps = this.parseFpsFraction(line);
        if (fps) return fps;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async runEncode(): Promise<void> {
    if (!this.videoFile || this.encoding) return;
    const plan = this.getPlan();
    const resolved = resolveEncodeParams(plan.quality);
    const dur = trimDurationSeconds(plan);
    const fps = clampPlanFps(plan.fps);
    const estFrames = Math.ceil(dur * fps);

    if (plan.format === 'image-sequence' && estFrames > MAX_SEQUENCE_FRAMES) {
      this.appendLog(
        `Too many frames (${estFrames}). Shorten the clip or lower fps (max ${MAX_SEQUENCE_FRAMES} frames).`,
        true,
      );
      return;
    }

    this.encoding = true;
    this.encodeAbort = false;
    if (this.encodeBtn) this.encodeBtn.disabled = true;
    this.setDownloadButtonIdle();
    this.revokeOutputPreviewUrl();
    this.outputBlob = null;
    this.clearLogs();

    try {
      const ffmpeg = await this.ensureFfmpeg();
      await this.cleanupMemfs();
      await ffmpeg.writeFile('input', await fetchFile(this.videoFile));

      const sourceFps = await this.detectSourceFps(ffmpeg);
      const sourceCap = sourceFps ? clampPlanFps(sourceFps) : null;
      const requestedFps = clampPlanFps(plan.fps);
      const effectiveFps = sourceCap ? Math.min(requestedFps, sourceCap) : requestedFps;
      if (sourceCap && effectiveFps < requestedFps) {
        this.appendLog(`Capped fps to source rate: ${effectiveFps} fps (requested ${requestedFps}).`);
      }
      const planForEncode: GifBitsEncodePlan = { ...plan, fps: effectiveFps };
      const vf = buildVideoFilterChain(planForEncode, resolved);
      this.lastLoggedProgress = -1;

      let previewFormat: AnimatedExportFormat = plan.format;

      if (plan.format === 'image-sequence') {
        await this.runImageSequenceZip(ffmpeg, planForEncode, vf);
      } else if (plan.format === 'gif') {
        const fc = buildGifFilterComplex(planForEncode, resolved);
        const gifRet = await ffmpeg.exec(buildGifArgs(fc, plan.trimStart, dur, OUT_GIF), WASM_ENCODE_TIMEOUT_MS);
        if (gifRet !== 0) throw new Error(`ffmpeg exited with code ${gifRet} (GIF)`);
        const data = (await ffmpeg.readFile(OUT_GIF)) as Uint8Array;
        if (data.length === 0) throw new Error('ffmpeg produced an empty GIF');
        this.outputBlob = new Blob([data], { type: 'image/gif' });
        this.outputName = this.replaceExt(this.videoFile.name, 'gif');
      } else {
        await this.writeAnimatedWebpOutput(ffmpeg, vf, plan.trimStart, dur, resolved.webpQ);
      }

      if (this.encodeAbort) return;
      if (this.downloadBtn) {
        this.downloadBtn.disabled = false;
        this.syncDownloadButtonLabel();
      }
      this.exportsDownloaded = false;
      this.appendLog('Done.');
      this.showEncodedPreview(previewFormat);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.appendLog(`Error: ${msg}`, true);
    } finally {
      this.encoding = false;
      if (this.encodeBtn) this.encodeBtn.disabled = false;
    }
  }

  private async writeAnimatedWebpOutput(
    ffmpeg: FFmpeg,
    vf: string,
    trimStart: number,
    dur: number,
    webpQ: number,
  ): Promise<void> {
    const webpArgs = buildAnimatedWebpArgs(vf, trimStart, dur, webpQ, OUT_WEBP);
    let ret = 0;
    try {
      ret = await ffmpeg.exec(webpArgs, WASM_ENCODE_TIMEOUT_MS);
    } catch {
      const idx = webpArgs.indexOf('-pix_fmt');
      const fallback =
        idx >= 0 ? [...webpArgs.slice(0, idx), ...webpArgs.slice(idx + 2)] : webpArgs;
      ret = await ffmpeg.exec(fallback, WASM_ENCODE_TIMEOUT_MS);
    }
    if (ret !== 0) {
      throw new Error(`ffmpeg exited with code ${ret} (animated WebP)`);
    }
    const data = (await ffmpeg.readFile(OUT_WEBP)) as Uint8Array;
    if (data.length === 0) {
      throw new Error('ffmpeg produced an empty WebP file');
    }
    this.outputBlob = new Blob([data], { type: 'image/webp' });
    this.outputName = this.replaceExt(this.videoFile!.name, 'webp');
  }

  private async runImageSequenceZip(ffmpeg: FFmpeg, plan: GifBitsEncodePlan, vf: string): Promise<void> {
    const dur = trimDurationSeconds(plan);
    const args = buildPngSequenceArgs(vf, plan.trimStart, dur, 'frame_%04d.png');
    await ffmpeg.exec(args, WASM_ENCODE_TIMEOUT_MS);

    const zipObj: Record<string, Uint8Array> = {};
    for (let i = 1; ; i++) {
      const name = `frame_${String(i).padStart(4, '0')}.png`;
      try {
        const data = (await ffmpeg.readFile(name)) as Uint8Array;
        zipObj[`images/${name}`] = data;
      } catch {
        break;
      }
    }

    if (Object.keys(zipObj).length === 0) throw new Error('No PNG frames produced');

    const zipped = zipSync(zipObj, { level: 6 });
    this.outputBlob = new Blob([zipped], { type: 'application/zip' });
    this.outputName = this.replaceExt(this.videoFile!.name, 'zip');
  }

  private replaceExt(name: string, ext: string): string {
    const base = name.replace(/\.[^/.]+$/, '');
    return `${(base || 'export') + DOWNLOAD_FILENAME_SUFFIX}.${ext}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  }

  private syncDownloadButtonLabel(): void {
    if (!this.downloadBtn) return;
    if (!this.outputBlob) {
      this.downloadBtn.textContent = 'Download';
      return;
    }
    this.downloadBtn.textContent = `Download (${this.formatFileSize(this.outputBlob.size)})`;
  }

  private setDownloadButtonIdle(): void {
    if (!this.downloadBtn) return;
    this.downloadBtn.disabled = true;
    this.downloadBtn.textContent = 'Download';
  }

  private showEncodedPreview(format: AnimatedExportFormat): void {
    if (!this.outputBlob || !this.outputStage || !this.outputPreview) return;
    this.revokeOutputPreviewUrl();
    this.outputPreview.hidden = false;
    if (format === 'image-sequence') {
      this.outputStage.innerHTML =
        '<div class="gifbits-output-zip"><span class="gifbits-output-zip-icon" aria-hidden="true">🗂️</span><span class="gifbits-output-zip-label">PNG sequence (zip)</span></div>';
      return;
    }
    const url = URL.createObjectURL(this.outputBlob);
    this.outputPreviewUrl = url;
    const img = document.createElement('img');
    img.className = 'gifbits-output-thumb';
    img.alt = 'Encoded output preview';
    img.src = url;
    this.outputStage.appendChild(img);
  }

  private downloadOutput(): void {
    if (!this.outputBlob) return;
    const url = URL.createObjectURL(this.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.outputName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.exportsDownloaded = true;
  }
}

customElements.define('odd-gifbits', GifBitsElement);
