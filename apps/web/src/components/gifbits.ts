/**
 * GifBits — ffmpeg.wasm workshop: crop, trim, export animated AVIF, WebP, GIF, or PNG sequence zip.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  VERSION,
  buildAnimatedAvifArgs,
  buildAnimatedWebpArgs,
  buildGifArgs,
  buildGifFilterComplex,
  buildPngSequenceArgs,
  buildVideoFilterChain,
  clampPlanFps,
  resolveEncodeParams,
  trimDurationSeconds,
  type AnimatedExportFormat,
  type CropRatio,
  type GifBitsEncodePlan,
} from '@oddbits/gifbits';
import { zipSync } from 'fflate';

import { BitElement } from '../bits/BitElement';

const OUT_AVIF = 'out.avif';
const OUT_WEBP = 'out.webp';
const OUT_GIF = 'out.gif';
const MAX_SEQUENCE_FRAMES = 600;

export class GifBitsElement extends BitElement {
  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private introError: HTMLElement | null = null;
  private previewVideo: HTMLVideoElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private ratioSelect: HTMLSelectElement | null = null;
  private trimStartRange: HTMLInputElement | null = null;
  private trimEndRange: HTMLInputElement | null = null;
  private trimStartLabel: HTMLElement | null = null;
  private trimEndLabel: HTMLElement | null = null;
  private qualityRange: HTMLInputElement | null = null;
  private qualityLabel: HTMLElement | null = null;
  private fpsInput: HTMLInputElement | null = null;
  private formatSelect: HTMLSelectElement | null = null;
  private frameEstimate: HTMLElement | null = null;
  private encodeBtn: HTMLButtonElement | null = null;
  private downloadBtn: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;

  private videoFile: File | null = null;
  private previewObjectUrl: string | null = null;
  private durationSec = 0;
  private outputBlob: Blob | null = null;
  private outputName = 'export.avif';
  private encoding = false;
  private encodeAbort = false;
  private exportsDownloaded = false;
  private ffmpeg: FFmpeg | null = null;
  private ffmpegLoading: Promise<void> | null = null;

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
          class="window gifbits-dialog-window gifbits-workshop bit-workshop"
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
                <div class="gifbits-preview-stage">
                  <video id="gifbits-preview-video" class="gifbits-preview-video" controls playsinline></video>
                </div>
                <div class="preview-info" id="gifbits-preview-info"></div>
                <div class="logs" id="gifbits-logs"></div>
              </div>
              <div class="gifbits-col gifbits-col-actions">
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
                    <label for="gifbits-trim-start">
                      Clip start (s)
                      <span class="range-value" id="gifbits-trim-start-val">0.0</span>
                    </label>
                    <input type="range" id="gifbits-trim-start" min="0" max="100" step="0.05" value="0">
                  </div>
                  <div class="control-group">
                    <label for="gifbits-trim-end">
                      Clip end (s)
                      <span class="range-value" id="gifbits-trim-end-val">0.0</span>
                    </label>
                    <input type="range" id="gifbits-trim-end" min="0" max="100" step="0.05" value="100">
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
                    <input type="number" id="gifbits-fps" min="1" max="60" step="1" value="12">
                  </div>
                  <div class="control-group">
                    <label for="gifbits-format">Output</label>
                    <select id="gifbits-format">
                      <option value="avif" selected>Animated AVIF</option>
                      <option value="webp">Animated WebP</option>
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
                Default export is <strong>animated AVIF</strong> (AV1 in an AVIF container). GifBits runs <a href="https://ffmpegwasm.netlify.app/" target="_blank" rel="noopener noreferrer">ffmpeg</a>
                in your browser via WebAssembly (same engines as the CLI recipes). Your video never leaves your device.
              </p>
            </div>
            <div class="docs-section">
              <h3>Workshop</h3>
              <ul>
                <li><strong>Crop ratio</strong> — center-crops to 16:9, 1:1, or 9:16 before scaling.</li>
                <li><strong>Clip start / end</strong> — sliders span the full clip; end must stay after start.</li>
                <li><strong>Frame rate</strong> — output fps after crop/scale (default 12; lower for smaller files, higher for smoother motion).</li>
                <li><strong>Quality</strong> — resolution and encoder strength (not the same as fps).</li>
                <li><strong>Image sequence</strong> — PNG frames in a zip (<code>images/frame_0001.png</code>, …). Large clips hit a frame cap; shorten the video or lower fps.</li>
              </ul>
            </div>
            <div class="docs-section">
              <h3>Output formats</h3>
              <ul>
                <li><strong>Animated AVIF</strong> — modern, efficient; needs a current browser; requires ffmpeg with <code>libaom-av1</code>.</li>
                <li><strong>Animated WebP</strong> — broad support; often smaller than GIF; transparency.</li>
                <li><strong>GIF</strong> — universal fallbacks; larger files; palette.</li>
                <li><strong>Image sequence</strong> — numbered PNGs in a zip for compositing or your own tooling.</li>
              </ul>
            </div>
            <div class="docs-section">
              <h3>CLI (desktop ffmpeg)</h3>
              <p>Print a command without running anything (defaults match the workshop: <code>--format avif</code>, <code>--fps 12</code>):</p>
              <pre><code>npx @oddbits/gifbits recipe --ratio 9:16 --start 0 --end 5 --format avif --quality 75 --fps 12</code></pre>
              <p>If <code>ffmpeg</code> is on your <code>PATH</code>, <code>gifbits convert</code> runs AVIF, WebP, or GIF. PNG zip exports are workshop-only; <code>recipe --format image-sequence</code> prints the ffmpeg line for a frame sequence.</p>
            </div>
            <div class="docs-section">
              <h3>Privacy</h3>
              <p class="gifbits-help-privacy">
                No accounts, no upload, no telemetry. Encoding happens in this tab (wasm) or in your own ffmpeg process when you use the CLI.
              </p>
            </div>
            <div class="docs-section">
              <p>
                Full flags, caveats, and source:
                <a href="https://github.com/oddbits-us/oddbits/blob/main/packages/gifbits/README.md" target="_blank" rel="noopener noreferrer">packages/gifbits/README.md</a>
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
    return { width: 380, height: 260 };
  }

  protected getHelpMinSize(): { width: number; height: number } {
    return { width: 400, height: 280 };
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
    this.videoFile = null;
    this.outputBlob = null;
    this.encoding = false;
    this.encodeAbort = false;
    this.exportsDownloaded = false;
    if (this.previewVideo) {
      this.previewVideo.removeAttribute('src');
      this.previewVideo.hidden = true;
    }
    if (this.previewInfo) this.previewInfo.innerHTML = '';
    if (this.logs) this.logs.textContent = '';
    if (this.downloadBtn) this.downloadBtn.disabled = true;
    void this.cleanupMemfs();
  }

  protected onDisconnect(): void {
    this.revokePreviewUrl();
    void this.cleanupMemfs();
  }

  private revokePreviewUrl(): void {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  protected initializeBitElements(): void {
    this.fileInput = this.querySelector('#gifbits-file-input');
    this.dropZone = this.querySelector('#gifbits-drop-zone');
    this.introError = this.querySelector('#gifbits-intro-error');
    this.previewVideo = this.querySelector('#gifbits-preview-video');
    this.previewInfo = this.querySelector('#gifbits-preview-info');
    this.ratioSelect = this.querySelector('#gifbits-ratio');
    this.trimStartRange = this.querySelector('#gifbits-trim-start');
    this.trimEndRange = this.querySelector('#gifbits-trim-end');
    this.trimStartLabel = this.querySelector('#gifbits-trim-start-val');
    this.trimEndLabel = this.querySelector('#gifbits-trim-end-val');
    this.qualityRange = this.querySelector('#gifbits-quality');
    this.qualityLabel = this.querySelector('#gifbits-quality-val');
    this.fpsInput = this.querySelector('#gifbits-fps');
    this.formatSelect = this.querySelector('#gifbits-format');
    this.frameEstimate = this.querySelector('#gifbits-frame-estimate');
    this.encodeBtn = this.querySelector('#gifbits-encode-btn');
    this.downloadBtn = this.querySelector('#gifbits-download-btn');
    this.logs = this.querySelector('#gifbits-logs');

    this.bindRangeLabel(this.qualityRange, this.qualityLabel, (v) => String(Math.round(v)));
    this.wireTrimSliders();
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

  private wireTrimSliders(): void {
    const syncLabels = () => {
      if (!this.trimStartRange || !this.trimEndRange || !this.trimStartLabel || !this.trimEndLabel) return;
      const d = this.durationSec || 1;
      const start = (parseFloat(this.trimStartRange.value) / 100) * d;
      const end = (parseFloat(this.trimEndRange.value) / 100) * d;
      this.trimStartLabel.textContent = start.toFixed(2);
      this.trimEndLabel.textContent = end.toFixed(2);
    };

    const clampOrder = () => {
      if (!this.trimStartRange || !this.trimEndRange) return;
      let s = parseFloat(this.trimStartRange.value);
      let e = parseFloat(this.trimEndRange.value);
      if (s > e) {
        const t = s;
        s = e;
        e = t;
        this.trimStartRange.value = String(s);
        this.trimEndRange.value = String(e);
      }
      syncLabels();
      this.updateFrameEstimate();
      this.exportsDownloaded = false;
    };

    if (this.trimStartRange) {
      this.trimStartRange.addEventListener('input', () => {
        syncLabels();
        this.updateFrameEstimate();
        this.exportsDownloaded = false;
      });
      this.trimStartRange.addEventListener('change', clampOrder);
    }
    if (this.trimEndRange) {
      this.trimEndRange.addEventListener('input', () => {
        syncLabels();
        this.updateFrameEstimate();
        this.exportsDownloaded = false;
      });
      this.trimEndRange.addEventListener('change', clampOrder);
    }
  }

  private getPlan(): GifBitsEncodePlan {
    const ratio = (this.ratioSelect?.value ?? '16:9') as CropRatio;
    const d = this.durationSec || 1;
    const start = ((parseFloat(this.trimStartRange?.value ?? '0') || 0) / 100) * d;
    const end = ((parseFloat(this.trimEndRange?.value ?? '100') || 100) / 100) * d;
    const quality = Math.min(100, Math.max(1, parseInt(this.qualityRange?.value ?? '72', 10) || 72));
    const fpsRaw = parseInt(this.fpsInput?.value ?? '12', 10);
    const fps = clampPlanFps(Number.isFinite(fpsRaw) ? fpsRaw : 12);
    const format = (this.formatSelect?.value ?? 'avif') as AnimatedExportFormat;
    return {
      cropRatio: ratio,
      trimStart: Math.min(start, end),
      trimEnd: Math.max(start, end),
      quality,
      fps,
      format,
    };
  }

  private updateFrameEstimate(): void {
    if (!this.frameEstimate) return;
    const plan = this.getPlan();
    const resolved = resolveEncodeParams(plan.quality);
    const dur = trimDurationSeconds(plan);
    const fps = clampPlanFps(plan.fps);
    const est = Math.ceil(dur * fps);
    let msg = `About ${est} frames @ ${fps} fps (~${dur.toFixed(1)}s), short side up to ${resolved.shortSide}px.`;
    if (plan.format === 'image-sequence' && est > MAX_SEQUENCE_FRAMES) {
      msg += ` Image sequence is capped at ${MAX_SEQUENCE_FRAMES} frames — shorten the clip or lower fps.`;
    }
    this.frameEstimate.textContent = msg;
  }

  protected attachBitListeners(): void {
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.files?.length) this.handleVideoFile(t.files[0]!);
      });
    }

    const shell = this.shell;
    if (shell) {
      shell.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone?.classList.add('dragover');
      });
      shell.addEventListener('dragleave', (e) => {
        if (!shell.contains(e.relatedTarget as Node)) this.dropZone?.classList.remove('dragover');
      });
      shell.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone?.classList.remove('dragover');
        const f = e.dataTransfer?.files?.[0];
        if (f) this.handleVideoFile(f);
      });
    }

    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => this.fileInput?.click());
    }

    if (this.previewVideo) {
      this.previewVideo.addEventListener('loadedmetadata', () => {
        this.durationSec = this.previewVideo?.duration ?? 0;
        this.syncTrimRangesToDuration();
        this.updatePreviewInfo();
        this.updateFrameEstimate();
      });
    }

    [this.ratioSelect, this.formatSelect].forEach((el) => {
      el?.addEventListener('change', () => {
        this.exportsDownloaded = false;
        this.updateFrameEstimate();
      });
    });

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

  private syncTrimRangesToDuration(): void {
    const d = this.durationSec;
    if (!this.trimStartRange || !this.trimEndRange) return;
    this.trimStartRange.max = '100';
    this.trimEndRange.max = '100';
    this.trimStartRange.value = '0';
    this.trimEndRange.value = '100';
    if (this.trimStartLabel) this.trimStartLabel.textContent = '0.00';
    if (this.trimEndLabel) this.trimEndLabel.textContent = d.toFixed(2);
    this.updateFrameEstimate();
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
    this.videoFile = file;
    this.outputBlob = null;
    this.exportsDownloaded = false;
    this.previewObjectUrl = URL.createObjectURL(file);

    if (this.previewVideo) {
      this.previewVideo.hidden = false;
      this.previewVideo.src = this.previewObjectUrl;
      this.previewVideo.load();
    }

    if (this.downloadBtn) this.downloadBtn.disabled = true;
    if (this.logs) this.logs.textContent = '';
    this.openWorkshop();
  }

  private appendLog(line: string): void {
    if (!this.logs) return;
    this.logs.textContent += `${line}\n`;
    this.logs.scrollTop = this.logs.scrollHeight;
  }

  private async ensureFfmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;
    if (this.ffmpegLoading) return this.ffmpegLoading.then(() => this.ffmpeg!);

    this.ffmpegLoading = (async () => {
      const ff = new FFmpeg();
      ff.on('log', ({ message }) => this.appendLog(message));
      const base = `${import.meta.env.BASE_URL}vendor/ffmpeg`;
      await ff.load({
        coreURL: `${base}/ffmpeg-core.js`,
        wasmURL: `${base}/ffmpeg-core.wasm`,
      });
      this.ffmpeg = ff;
    })();

    await this.ffmpegLoading;
    return this.ffmpeg!;
  }

  private async cleanupMemfs(): Promise<void> {
    if (!this.ffmpeg) return;
    const names = ['input', OUT_AVIF, OUT_WEBP, OUT_GIF];
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

  private async runEncode(): Promise<void> {
    if (!this.videoFile || this.encoding) return;
    const plan = this.getPlan();
    const resolved = resolveEncodeParams(plan.quality);
    const dur = trimDurationSeconds(plan);
    const fps = clampPlanFps(plan.fps);
    const estFrames = Math.ceil(dur * fps);

    if (plan.format === 'image-sequence' && estFrames > MAX_SEQUENCE_FRAMES) {
      this.appendLog(`Too many frames (${estFrames}). Shorten the clip or lower fps (max ${MAX_SEQUENCE_FRAMES} frames).`);
      return;
    }

    this.encoding = true;
    this.encodeAbort = false;
    if (this.encodeBtn) this.encodeBtn.disabled = true;
    if (this.downloadBtn) this.downloadBtn.disabled = true;
    this.outputBlob = null;
    if (this.logs) this.logs.textContent = '';

    try {
      const ffmpeg = await this.ensureFfmpeg();
      await this.cleanupMemfs();
      await ffmpeg.writeFile('input', await fetchFile(this.videoFile));

      const vf = buildVideoFilterChain(plan, resolved);

      if (plan.format === 'image-sequence') {
        await this.runImageSequenceZip(ffmpeg, plan, vf);
      } else if (plan.format === 'gif') {
        const fc = buildGifFilterComplex(plan, resolved);
        await ffmpeg.exec(buildGifArgs(fc, plan.trimStart, dur, OUT_GIF));
        const data = (await ffmpeg.readFile(OUT_GIF)) as Uint8Array;
        this.outputBlob = new Blob([data], { type: 'image/gif' });
        this.outputName = this.replaceExt(this.videoFile.name, 'gif');
      } else if (plan.format === 'avif') {
        await ffmpeg.exec(buildAnimatedAvifArgs(vf, plan.trimStart, dur, resolved.avifCrf, OUT_AVIF));
        const data = (await ffmpeg.readFile(OUT_AVIF)) as Uint8Array;
        this.outputBlob = new Blob([data], { type: 'image/avif' });
        this.outputName = this.replaceExt(this.videoFile.name, 'avif');
      } else {
        const webpArgs = buildAnimatedWebpArgs(vf, plan.trimStart, dur, resolved.webpQ, OUT_WEBP);
        try {
          await ffmpeg.exec(webpArgs);
        } catch {
          const idx = webpArgs.indexOf('-pix_fmt');
          const fallback =
            idx >= 0 ? [...webpArgs.slice(0, idx), ...webpArgs.slice(idx + 2)] : webpArgs;
          await ffmpeg.exec(fallback);
        }
        const data = (await ffmpeg.readFile(OUT_WEBP)) as Uint8Array;
        this.outputBlob = new Blob([data], { type: 'image/webp' });
        this.outputName = this.replaceExt(this.videoFile.name, 'webp');
      }

      if (this.encodeAbort) return;
      if (this.downloadBtn) this.downloadBtn.disabled = false;
      this.exportsDownloaded = false;
      this.appendLog('Done.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.appendLog(`Error: ${msg}`);
    } finally {
      this.encoding = false;
      if (this.encodeBtn) this.encodeBtn.disabled = false;
    }
  }

  private async runImageSequenceZip(ffmpeg: FFmpeg, plan: GifBitsEncodePlan, vf: string): Promise<void> {
    const dur = trimDurationSeconds(plan);
    const args = buildPngSequenceArgs(vf, plan.trimStart, dur, 'frame_%04d.png');
    await ffmpeg.exec(args);

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
    return `${base || 'export'}.${ext}`;
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
