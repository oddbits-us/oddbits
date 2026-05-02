/**
 * ImageBits Web Component
 * Vanilla TypeScript Web Component for image processing
 *
 * UI: borderless shell inside the parent `.window` (styles `odd-imagebits`); workshop is a separate
 * `.window` (fixed, z-index 400). See apps/web/UI_THEME.md.
 */

import { processImage } from '@oddbits/imagebits';
import { attachFixedWindowResize } from '../windowResize';
import type { ImageBitsOptions } from '@oddbits/imagebits';
import { zipSync } from 'fflate';

export class ImageBitsElement extends HTMLElement {
  /** Stacking order above desktop `.window` instances (those use ~100+). */
  private static dialogZ = 400;

  private titlebarMousedown: ((e: MouseEvent) => void) | undefined;
  private helpTitlebarMousedown: ((e: MouseEvent) => void) | undefined;

  private fileInput: HTMLInputElement | null = null;
  private shell: HTMLElement | null = null;
  private dropZone: HTMLElement | null = null;
  private introError: HTMLElement | null = null;
  private workshop: HTMLElement | null = null;
  private helpDialog: HTMLElement | null = null;
  private helpLaunchers: HTMLElement[] = [];
  private previewImage: HTMLImageElement | null = null;
  private batchFileList: HTMLElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private processButton: HTMLButtonElement | null = null;
  private downloadBtn: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private error: HTMLElement | null = null;
  private currentFiles: File[] = [];
  private processedBlob: Blob | null = null;
  /** After batch process: maps zip-safe filenames to blobs. */
  private batchOutputs: { zipName: string; blob: Blob }[] | null = null;
  private previewObjectUrl: string | null = null;
  private onEscapeBound = (e: KeyboardEvent) => this.onEscape(e);
  private onResizeBound = () => this.clampDialogToViewport();
  private onHelpResizeBound = () => this.clampHelpToViewport();
  private raiseDialogZBound = () => this.raiseDialogZ();
  private openHelpBound = () => this.openHelpDialog();
  private onHelpLauncherMouseDownBound = (e: MouseEvent) => e.stopPropagation();

  private dialogDrag: {
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null = null;
  private helpDialogDrag: {
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null = null;

  connectedCallback() {
    this.innerHTML = `
      <div class="imagebits-shell">
        <div class="imagebits-intro">
          <div class="imagebits-intro-error" id="imagebits-intro-error" hidden></div>

          <div class="drop-zone" id="drop-zone">
            <input type="file" id="file-input" accept="image/*" multiple>
            <div class="drop-zone-text">
              <strong>Drop images here</strong> or click to browse
            </div>
          </div>
        </div>

        <div
          id="imagebits-workshop"
          class="window imagebits-dialog-window imagebits-workshop-portal imagebits-workshop"
          role="dialog"
          aria-modal="false"
          aria-labelledby="imagebits-workshop-title"
          hidden
        >
          <div class="window-titlebar imagebits-dialog-drag-handle">
            <span id="imagebits-workshop-title">ImageBits — Process</span>
            <div class="window-controls">
              <button type="button" class="window-btn imagebits-workshop-close" aria-label="Close">X</button>
            </div>
          </div>
          <div class="window-content imagebits-workshop-body">
            <div class="imagebits-workshop-columns">
              <div class="imagebits-col imagebits-col-preview">
                <div class="preview-stage">
                  <img class="preview-image" id="preview-image" alt="Preview">
                  <ul class="imagebits-batch-list" id="batch-file-list" hidden></ul>
                </div>
                <div class="preview-info" id="preview-info"></div>
              </div>
              <div class="imagebits-col imagebits-col-actions">
                <div class="controls" id="controls">
                  <div class="control-group">
                    <label>Max Dimension (px)</label>
                    <input type="number" id="max-dimension" placeholder="e.g. 800" min="1">
                    <small>Maximum width or height in pixels</small>
                  </div>

                  <div class="control-group">
                    <label>Format</label>
                    <select id="format">
                      <option value="original">Original</option>
                      <option value="webp">WebP</option>
                      <option value="avif">AVIF</option>
                      <option value="png">PNG</option>
                      <option value="jpg">JPEG</option>
                    </select>
                  </div>

                  <div class="control-group">
                    <label>
                      Quality
                      <span class="range-value" id="quality-value">92%</span>
                    </label>
                    <input type="range" id="quality" min="1" max="100" value="92">
                  </div>
                </div>

                <div class="imagebits-actions">
                  <button type="button" id="process-btn">Convert</button>
                  <button type="button" id="download-btn" class="imagebits-download" hidden>Download</button>
                  <button type="button" class="imagebits-change-file">Different images…</button>
                </div>

                <div class="loading" id="loading">Processing…</div>
                <div class="error" id="error"></div>
                <div class="logs" id="logs"></div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="imagebits-help"
          class="window imagebits-dialog-window imagebits-help-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="imagebits-help-title"
          hidden
        >
          <div class="window-titlebar">
            <span id="imagebits-help-title">ImageBits Help</span>
            <div class="window-controls">
              <button type="button" class="window-btn imagebits-help-close" aria-label="Close help">X</button>
            </div>
          </div>
          <div class="window-content imagebits-help-content">
            <h3>Basic Usage</h3>
            <pre><code>import { processImage } from '@oddbits/imagebits';

const result = await processImage(file, {
  format: 'webp',
  maxDimension: 800,
  quality: 0.92
});

result.download('optimized.webp');</code></pre>
            <p>Tips: drag and drop one or many images, tweak output options, then convert and download.</p>
          </div>
        </div>
      </div>
    `;

    this.initializeElements();
    this.attachEventListeners();
    document.addEventListener('keydown', this.onEscapeBound);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onEscapeBound);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('resize', this.onHelpResizeBound);
    this.detachHelpLauncher();
    this.teardownDialogDrag();
    this.teardownHelpDialogDrag();
    this.revokePreviewUrl();
    if (this.workshop && document.body.contains(this.workshop)) {
      this.workshop.remove();
    }
    if (this.helpDialog && document.body.contains(this.helpDialog)) {
      this.helpDialog.remove();
    }
  }

  private onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (this.helpDialog && !this.helpDialog.hidden) {
      this.closeHelpDialog();
      return;
    }
    if (!this.workshop || this.workshop.hidden) return;
    this.closeWorkshop();
  }

  private raiseDialogZ() {
    if (!this.workshop || this.workshop.hidden) return;
    ImageBitsElement.dialogZ += 1;
    this.workshop.style.zIndex = String(ImageBitsElement.dialogZ);
  }

  private revokePreviewUrl() {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  private initializeElements() {
    this.shell = this.querySelector('.imagebits-shell');
    this.fileInput = this.querySelector('#file-input') as HTMLInputElement;
    this.dropZone = this.querySelector('#drop-zone') as HTMLElement;
    this.introError = this.querySelector('#imagebits-intro-error') as HTMLElement;
    this.workshop = this.querySelector('#imagebits-workshop') as HTMLElement;
    this.helpDialog = this.querySelector('#imagebits-help') as HTMLElement;
    this.previewImage = this.querySelector('#preview-image') as HTMLImageElement;
    this.batchFileList = this.querySelector('#batch-file-list') as HTMLElement;
    this.previewInfo = this.querySelector('#preview-info') as HTMLElement;
    this.processButton = this.querySelector('#process-btn') as HTMLButtonElement;
    this.downloadBtn = this.querySelector('#download-btn') as HTMLButtonElement;
    this.logs = this.querySelector('#logs') as HTMLElement;
    this.loading = this.querySelector('#loading') as HTMLElement;
    this.error = this.querySelector('#error') as HTMLElement;

    const qualitySlider = this.querySelector('#quality') as HTMLInputElement;
    const qualityValue = this.querySelector('#quality-value') as HTMLElement;
    if (qualitySlider && qualityValue) {
      const updateQualityLabel = () => {
        const raw = parseInt(qualitySlider.value || '0', 10);
        const clamped = Math.min(100, Math.max(0, isNaN(raw) ? 0 : raw));
        qualityValue.textContent = `${clamped}%`;
      };
      updateQualityLabel();
      qualitySlider.addEventListener('input', updateQualityLabel);
      qualitySlider.addEventListener('change', updateQualityLabel);
    }
  }

  private attachEventListeners() {
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          this.handleFiles(target.files);
        }
      });
    }

    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => {
        this.fileInput?.click();
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
        if (!shell.contains(e.relatedTarget as Node)) {
          this.dropZone?.classList.remove('dragover');
        }
      });

      shell.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone?.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFiles(files);
        }
      });
    }

    if (this.processButton) {
      this.processButton.addEventListener('click', () => {
        void this.runProcessAll();
      });
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        if (this.currentFiles.length > 1) {
          this.downloadZip();
        } else {
          this.downloadSingle();
        }
      });
    }

    const changeBtn = this.querySelector('.imagebits-change-file');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        this.closeWorkshop();
        this.fileInput?.click();
      });
    }

    const closeBtn = this.querySelector('.imagebits-workshop-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeWorkshop());
    }

    const helpCloseBtn = this.querySelector('.imagebits-help-close');
    if (helpCloseBtn) {
      helpCloseBtn.addEventListener('click', () => this.closeHelpDialog());
    }

    this.attachHelpLauncher();
  }

  private attachHelpLauncher() {
    this.detachHelpLauncher();
    const hostWindow = this.closest('#window-imagebits');
    const launchers = hostWindow
      ? [...hostWindow.querySelectorAll<HTMLElement>('.imagebits-help-launch')]
      : [];
    if (launchers.length === 0) return;
    launchers.forEach((launcher) => {
      launcher.addEventListener('mousedown', this.onHelpLauncherMouseDownBound);
      launcher.addEventListener('click', this.openHelpBound);
    });
    this.helpLaunchers = launchers;
  }

  private detachHelpLauncher() {
    if (this.helpLaunchers.length === 0) return;
    this.helpLaunchers.forEach((launcher) => {
      launcher.removeEventListener('mousedown', this.onHelpLauncherMouseDownBound);
      launcher.removeEventListener('click', this.openHelpBound);
    });
    this.helpLaunchers = [];
  }

  private hideIntroError() {
    if (this.introError) {
      this.introError.hidden = true;
      this.introError.textContent = '';
    }
  }

  private showIntroError(message: string) {
    if (this.introError) {
      this.introError.textContent = message;
      this.introError.hidden = false;
    }
  }

  private collectImageFiles(fileList: FileList | File[]): File[] {
    return [...fileList].filter((f) => f.type.startsWith('image/'));
  }

  private handleFiles(fileList: FileList | File[]) {
    this.hideIntroError();
    const images = this.collectImageFiles(fileList);
    if (images.length === 0) {
      this.showIntroError('No image files found. Drop PNG, JPEG, WebP, or AVIF files.');
      return;
    }

    this.currentFiles = images;
    this.hideError();
    this.processedBlob = null;
    this.batchOutputs = null;
    if (this.downloadBtn) this.downloadBtn.hidden = true;
    this.clearLogs();

    this.revokePreviewUrl();
    this.updateWorkshopTitle();

    if (images.length === 1) {
      const file = images[0];
      const url = URL.createObjectURL(file);
      this.previewObjectUrl = url;
      if (this.previewImage) {
        this.previewImage.hidden = false;
        this.previewImage.src = url;
      }
      if (this.batchFileList) {
        this.batchFileList.hidden = true;
        this.batchFileList.innerHTML = '';
      }
    } else {
      if (this.previewImage) {
        this.previewImage.hidden = true;
        this.previewImage.removeAttribute('src');
      }
      this.renderBatchFileListPending();
    }

    if (this.previewInfo) {
      this.previewInfo.innerHTML = '';
    }

    this.syncProcessButtonLabel();
    this.openWorkshop();
  }

  private updateWorkshopTitle() {
    const title = this.workshop?.querySelector('#imagebits-workshop-title');
    if (!title) return;
    const n = this.currentFiles.length;
    title.textContent =
      n > 1 ? `ImageBits — ${n} images (client-side)` : 'ImageBits — Process';
  }

  private syncProcessButtonLabel() {
    if (!this.processButton) return;
    const n = this.currentFiles.length;
    this.processButton.textContent = n > 1 ? `Convert all (${n})` : 'Convert';
  }

  private renderBatchFileListPending() {
    if (!this.batchFileList) return;
    this.batchFileList.hidden = false;
    this.batchFileList.innerHTML = this.currentFiles
      .map(
        (f, i) =>
          `<li class="imagebits-batch-item" data-index="${i}"><span class="imagebits-batch-name">${this.escapeHtml(f.name)}</span><span class="imagebits-batch-status">Pending</span></li>`
      )
      .join('');
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private setBatchRowStatus(index: number, text: string, ok: boolean) {
    const li = this.batchFileList?.querySelector(`[data-index="${index}"]`);
    const status = li?.querySelector('.imagebits-batch-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('imagebits-batch-ok', ok);
      status.classList.toggle('imagebits-batch-err', !ok);
    }
  }

  private clampDialogToViewport() {
    const el = this.workshop;
    if (!el || el.hidden) return;
    const pad = 8;
    const bar =
      el.querySelector<HTMLElement>('.imagebits-dialog-drag-handle')?.getBoundingClientRect() ??
      el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (bar.left < pad) dx += pad - bar.left;
    if (bar.top < pad) dy += pad - bar.top;
    if (bar.right > window.innerWidth - pad) dx -= bar.right - (window.innerWidth - pad);
    if (bar.bottom > window.innerHeight - pad) dy -= bar.bottom - (window.innerHeight - pad);
    if (dx !== 0 || dy !== 0) {
      const rect = el.getBoundingClientRect();
      el.style.left = `${rect.left + dx}px`;
      el.style.top = `${rect.top + dy}px`;
    }
  }

  private setupDialogDrag() {
    this.teardownDialogDrag();
    const workshop = this.workshop;
    const titlebar = workshop?.querySelector<HTMLElement>('.imagebits-dialog-drag-handle');
    if (!workshop || !titlebar) return;

    let dragStartX = 0;
    let dragStartY = 0;
    let origLeft = 0;
    let origTop = 0;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      workshop.style.left = `${origLeft + dx}px`;
      workshop.style.top = `${origTop + dy}px`;
      this.clampDialogToViewport();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.dialogDrag = null;
    };

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-btn')) return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const r = workshop.getBoundingClientRect();
      origLeft = r.left;
      origTop = r.top;
      ImageBitsElement.dialogZ += 1;
      workshop.style.zIndex = String(ImageBitsElement.dialogZ);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      this.dialogDrag = { move: onMove, up: onUp };
      e.preventDefault();
    };

    this.titlebarMousedown = onDown;
    titlebar.addEventListener('mousedown', onDown);
  }

  private teardownDialogDrag() {
    const titlebar = this.workshop?.querySelector<HTMLElement>('.imagebits-dialog-drag-handle');
    if (titlebar && this.titlebarMousedown) {
      titlebar.removeEventListener('mousedown', this.titlebarMousedown);
    }
    this.titlebarMousedown = undefined;
    if (this.dialogDrag) {
      document.removeEventListener('mousemove', this.dialogDrag.move);
      document.removeEventListener('mouseup', this.dialogDrag.up);
      this.dialogDrag = null;
    }
  }

  private setupHelpDialogDrag() {
    this.teardownHelpDialogDrag();
    const help = this.helpDialog;
    const titlebar = help?.querySelector<HTMLElement>('.window-titlebar');
    if (!help || !titlebar) return;

    let dragStartX = 0;
    let dragStartY = 0;
    let origLeft = 0;
    let origTop = 0;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      help.style.left = `${origLeft + dx}px`;
      help.style.top = `${origTop + dy}px`;
      this.clampHelpToViewport();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.helpDialogDrag = null;
    };

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-btn')) return;
      if ((e.target as HTMLElement).closest('.window-resize-handle')) return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = help.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      ImageBitsElement.dialogZ += 1;
      help.style.zIndex = String(ImageBitsElement.dialogZ);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      this.helpDialogDrag = { move: onMove, up: onUp };
      e.preventDefault();
    };

    this.helpTitlebarMousedown = onDown;
    titlebar.addEventListener('mousedown', onDown);
  }

  private teardownHelpDialogDrag() {
    const titlebar = this.helpDialog?.querySelector<HTMLElement>('.window-titlebar');
    if (titlebar && this.helpTitlebarMousedown) {
      titlebar.removeEventListener('mousedown', this.helpTitlebarMousedown);
    }
    this.helpTitlebarMousedown = undefined;
    if (this.helpDialogDrag) {
      document.removeEventListener('mousemove', this.helpDialogDrag.move);
      document.removeEventListener('mouseup', this.helpDialogDrag.up);
      this.helpDialogDrag = null;
    }
  }

  private openWorkshop() {
    if (!this.workshop) return;
    /* Portal to body so position:fixed is viewport-relative; parent tool window uses transform. */
    if (this.workshop.parentElement !== document.body) {
      document.body.appendChild(this.workshop);
    }
    this.workshop.hidden = false;
    this.workshop.style.position = 'fixed';
    ImageBitsElement.dialogZ += 1;
    this.workshop.style.zIndex = String(ImageBitsElement.dialogZ);
    void this.workshop.offsetHeight;
    const rect = this.workshop.getBoundingClientRect();
    const left = Math.max(8, (window.innerWidth - rect.width) / 2);
    const top = Math.max(8, (window.innerHeight - rect.height) / 2);
    this.workshop.style.left = `${left}px`;
    this.workshop.style.top = `${top}px`;
    this.clampDialogToViewport();
    this.setupDialogDrag();
    attachFixedWindowResize(this.workshop, {
      clamp: () => this.clampDialogToViewport(),
      minWidth: 360,
      minHeight: 200,
    });
    this.workshop.addEventListener('mousedown', this.raiseDialogZBound);
    window.addEventListener('resize', this.onResizeBound);
  }

  private closeWorkshop() {
    if (!this.workshop) return;
    window.removeEventListener('resize', this.onResizeBound);
    this.workshop.removeEventListener('mousedown', this.raiseDialogZBound);
    this.teardownDialogDrag();
    this.workshop.hidden = true;
    this.workshop.style.position = '';
    this.workshop.style.left = '';
    this.workshop.style.top = '';
    this.workshop.style.zIndex = '';
    const shell = this.querySelector('.imagebits-shell');
    if (shell && this.workshop.parentElement === document.body) {
      shell.appendChild(this.workshop);
    }
    this.revokePreviewUrl();
    if (this.previewImage) {
      this.previewImage.removeAttribute('src');
      this.previewImage.hidden = false;
    }
    if (this.batchFileList) {
      this.batchFileList.hidden = true;
      this.batchFileList.innerHTML = '';
    }
    if (this.previewInfo) this.previewInfo.innerHTML = '';
    if (this.downloadBtn) this.downloadBtn.hidden = true;
    this.hideError();
    this.clearLogs();
    this.hideLoading();
    this.processedBlob = null;
    this.batchOutputs = null;
    this.currentFiles = [];
    if (this.fileInput) this.fileInput.value = '';
    this.hideIntroError();
  }

  private clampHelpToViewport() {
    const el = this.helpDialog;
    if (!el || el.hidden) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let nextLeft = rect.left;
    let nextTop = rect.top;
    if (rect.left < pad) nextLeft = pad;
    if (rect.top < pad) nextTop = pad;
    if (rect.right > window.innerWidth - pad) {
      nextLeft = Math.max(pad, window.innerWidth - pad - rect.width);
    }
    if (rect.bottom > window.innerHeight - pad) {
      nextTop = Math.max(pad, window.innerHeight - pad - rect.height);
    }
    el.style.left = `${nextLeft}px`;
    el.style.top = `${nextTop}px`;
  }

  private openHelpDialog() {
    if (!this.helpDialog) return;
    if (this.helpDialog.parentElement !== document.body) {
      document.body.appendChild(this.helpDialog);
    }
    this.helpDialog.hidden = false;
    this.helpDialog.style.position = 'fixed';
    ImageBitsElement.dialogZ += 1;
    this.helpDialog.style.zIndex = String(ImageBitsElement.dialogZ);
    void this.helpDialog.offsetHeight;
    const rect = this.helpDialog.getBoundingClientRect();
    const left = Math.max(8, (window.innerWidth - rect.width) / 2);
    const top = Math.max(8, (window.innerHeight - rect.height) / 2);
    this.helpDialog.style.left = `${left}px`;
    this.helpDialog.style.top = `${top}px`;
    this.clampHelpToViewport();
    this.setupHelpDialogDrag();
    attachFixedWindowResize(this.helpDialog, {
      clamp: () => this.clampHelpToViewport(),
      minWidth: 360,
      minHeight: 220,
    });
    this.helpDialog.addEventListener('mousedown', this.raiseDialogZBound);
    window.addEventListener('resize', this.onHelpResizeBound);
  }

  private closeHelpDialog() {
    if (!this.helpDialog) return;
    window.removeEventListener('resize', this.onHelpResizeBound);
    this.helpDialog.removeEventListener('mousedown', this.raiseDialogZBound);
    this.teardownHelpDialogDrag();
    this.helpDialog.hidden = true;
    this.helpDialog.style.position = '';
    this.helpDialog.style.left = '';
    this.helpDialog.style.top = '';
    this.helpDialog.style.zIndex = '';
    const shell = this.querySelector('.imagebits-shell');
    if (shell && this.helpDialog.parentElement === document.body) {
      shell.appendChild(this.helpDialog);
    }
  }

  private getOptionsFromWorkshop(): ImageBitsOptions {
    const options: ImageBitsOptions = {};
    const root = this.workshop;
    if (!root) return options;

    const maxDimensionInput = root.querySelector('#max-dimension') as HTMLInputElement;
    const maxDimension = maxDimensionInput?.value ? parseInt(maxDimensionInput.value, 10) : undefined;
    if (maxDimension) {
      options.maxDimension = maxDimension;
    }

    const formatSelect = root.querySelector('#format') as HTMLSelectElement;
    const format = formatSelect?.value;
    if (format && format !== 'original') {
      options.format = format as NonNullable<ImageBitsOptions['format']>;
    }

    const qualityInput = root.querySelector('#quality') as HTMLInputElement;
    const quality = qualityInput?.value ? parseInt(qualityInput.value, 10) / 100 : undefined;
    if (quality) {
      options.quality = quality;
    }

    return options;
  }

  private outputFilename(file: File, formatSelect: HTMLSelectElement | null): string {
    const format = formatSelect?.value;
    const stem = file.name.replace(/\.[^/.]+$/, '');
    const ext =
      format && format !== 'original'
        ? format
        : file.name.includes('.')
          ? (file.name.split('.').pop() ?? 'bin')
          : 'bin';
    return `${stem}.${ext}`;
  }

  private uniquifyZipNames(names: string[]): string[] {
    const counts = new Map<string, number>();
    return names.map((original) => {
      const n = counts.get(original) ?? 0;
      counts.set(original, n + 1);
      if (n === 0) return original;
      const dot = original.lastIndexOf('.');
      const stem = dot > 0 ? original.slice(0, dot) : original;
      const ext = dot > 0 ? original.slice(dot) : '';
      return `${stem}_${n}${ext}`;
    });
  }

  private async runProcessAll() {
    if (this.currentFiles.length === 0) return;

    this.showLoading();
    this.hideError();
    this.processedBlob = null;
    this.batchOutputs = null;
    if (this.downloadBtn) this.downloadBtn.hidden = true;

    const root = this.workshop;
    if (!root) return;

    const formatSelect = root.querySelector('#format') as HTMLSelectElement;
    const optionsBase = this.getOptionsFromWorkshop();
    const total = this.currentFiles.length;

    try {
      if (total === 1) {
        this.setLoadingMessage('Processing…');
        const result = await processImage(this.currentFiles[0], optionsBase);
        this.processedBlob = result.blob;

        if (this.previewImage && this.processedBlob) {
          this.revokePreviewUrl();
          const outUrl = URL.createObjectURL(this.processedBlob);
          this.previewObjectUrl = outUrl;
          this.previewImage.src = outUrl;
        }

        if (this.previewInfo && result.metadata) {
          const metadata = result.metadata;
          const originalSize = metadata.originalSize
            ? this.formatBytes(metadata.originalSize)
            : 'N/A';
          const newSize = this.formatBytes(metadata.size);
          const savings = metadata.originalSize
            ? `${((1 - metadata.size / metadata.originalSize) * 100).toFixed(1)}%`
            : 'N/A';

          this.previewInfo.innerHTML = `
          <div><strong>Dimensions:</strong> ${metadata.width} × ${metadata.height}</div>
          <div><strong>Format:</strong> ${metadata.format}</div>
          <div><strong>Original Size:</strong> ${originalSize}</div>
          <div><strong>New Size:</strong> ${newSize}</div>
          <div><strong>Savings:</strong> ${savings}</div>
        `;
        }

        const outName = this.outputFilename(this.currentFiles[0], formatSelect);
        this.batchOutputs = [{ zipName: outName, blob: this.processedBlob }];

        if (this.logs) {
          this.logs.innerHTML = `<div class="log-entry">✓ Image converted</div>`;
          this.logs.classList.add('active');
        }

        if (this.downloadBtn) {
          this.downloadBtn.hidden = false;
          this.downloadBtn.textContent = 'Download';
        }
      } else {
        const rawNames = this.currentFiles.map((f) => this.outputFilename(f, formatSelect));
        const zipNames = this.uniquifyZipNames(rawNames);
        const outputs: { zipName: string; blob: Blob }[] = [];
        let totalIn = 0;
        let totalOut = 0;

        for (let i = 0; i < this.currentFiles.length; i++) {
          this.setLoadingMessage(`Converting ${i + 1} / ${total}…`);
          try {
            const result = await processImage(this.currentFiles[i], optionsBase);
            outputs.push({ zipName: zipNames[i], blob: result.blob });
            totalIn += result.metadata.originalSize ?? 0;
            totalOut += result.metadata.size;
            const rowSize = this.formatBytes(result.metadata.size);
            this.setBatchRowStatus(i, rowSize, true);
          } catch {
            this.setBatchRowStatus(i, 'Failed', false);
            throw new Error(`Failed on “${this.currentFiles[i].name}”`);
          }
        }

        this.batchOutputs = outputs;

        if (this.previewInfo) {
          const saved =
            totalIn > 0 ? `${((1 - totalOut / totalIn) * 100).toFixed(1)}%` : 'N/A';
          this.previewInfo.innerHTML = `
          <div><strong>Files:</strong> ${total}</div>
          <div><strong>Total in:</strong> ${this.formatBytes(totalIn)}</div>
          <div><strong>Total out:</strong> ${this.formatBytes(totalOut)}</div>
          <div><strong>Savings (approx.):</strong> ${saved}</div>
        `;
        }

        if (this.logs) {
          this.logs.innerHTML = `<div class="log-entry">✓ Converted ${total} images — ready to download ZIP</div>`;
          this.logs.classList.add('active');
        }

        if (this.downloadBtn) {
          this.downloadBtn.hidden = false;
          this.downloadBtn.textContent = 'Download ZIP';
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.showError(errorMessage);
    } finally {
      this.hideLoading();
    }
  }

  private setLoadingMessage(text: string) {
    if (this.loading) {
      this.loading.textContent = text;
    }
  }

  private downloadSingle() {
    if (!this.batchOutputs?.length || !this.currentFiles.length) return;
    const blob = this.batchOutputs[0].blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.batchOutputs[0].zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private downloadZip() {
    if (!this.batchOutputs || this.batchOutputs.length === 0) return;

    void (async () => {
      const files: Record<string, Uint8Array> = {};
      for (const { zipName, blob } of this.batchOutputs!) {
        const ab = await blob.arrayBuffer();
        files[zipName] = new Uint8Array(ab);
      }
      const zipped = zipSync(files, { level: 6 });
      const zipBlob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `imagebits-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })();
  }

  private showLoading() {
    this.loading?.classList.add('active');
    this.setLoadingMessage('Processing…');
    if (this.processButton) {
      this.processButton.disabled = true;
    }
  }

  private hideLoading() {
    this.loading?.classList.remove('active');
    this.setLoadingMessage('Processing…');
    if (this.processButton) {
      this.processButton.disabled = false;
    }
  }

  private showError(message: string) {
    if (this.error) {
      this.error.textContent = message;
      this.error.classList.add('active');
    }
  }

  private hideError() {
    this.error?.classList.remove('active');
  }

  private clearLogs() {
    if (this.logs) {
      this.logs.innerHTML = '';
      this.logs.classList.remove('active');
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

customElements.define('odd-imagebits', ImageBitsElement);
