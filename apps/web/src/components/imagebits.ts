/**
 * ImageBits Web Component
 * Vanilla TypeScript Web Component for image processing
 *
 * UI: compact shell matches .window chrome (styles.css `odd-imagebits`); workshop uses `.window`
 * as a fixed dialog (z-index 400). Same patterns apply to other bits — see apps/web/UI_THEME.md.
 */

import { processImage, imageBits } from '@oddbits/imagebits';
import type { ImageBitsOptions } from '@oddbits/imagebits';

export class ImageBitsElement extends HTMLElement {
  /** Stacking order above desktop `.window` instances (those use ~100+). */
  private static dialogZ = 400;

  private titlebarMousedown: ((e: MouseEvent) => void) | undefined;

  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private workshop: HTMLElement | null = null;
  private previewImage: HTMLImageElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private processButton: HTMLButtonElement | null = null;
  private downloadBtn: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private error: HTMLElement | null = null;
  private currentFile: File | null = null;
  private processedBlob: Blob | null = null;
  private previewObjectUrl: string | null = null;
  private onEscapeBound = (e: KeyboardEvent) => this.onEscape(e);
  private onResizeBound = () => this.clampDialogToViewport();
  private raiseDialogZBound = () => this.raiseDialogZ();

  private dialogDrag: {
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null = null;

  connectedCallback() {
    this.innerHTML = `
      <div class="imagebits-shell">
        <div class="imagebits-intro">
          <div class="tool-header">
            <div>
              <div class="tool-title">ImageBits</div>
              <div class="tool-description">${imageBits.description}</div>
            </div>
          </div>

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
                  <button type="button" id="process-btn">Process Image</button>
                  <button type="button" id="download-btn" class="imagebits-download" hidden>Download</button>
                  <button type="button" class="imagebits-change-file">Different image…</button>
                </div>

                <div class="loading" id="loading">Processing…</div>
                <div class="error" id="error"></div>
                <div class="logs" id="logs"></div>
              </div>
            </div>
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
    this.teardownDialogDrag();
    this.revokePreviewUrl();
    if (this.workshop && document.body.contains(this.workshop)) {
      this.workshop.remove();
    }
  }

  private onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
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
    this.fileInput = this.querySelector('#file-input') as HTMLInputElement;
    this.dropZone = this.querySelector('#drop-zone') as HTMLElement;
    this.workshop = this.querySelector('#imagebits-workshop') as HTMLElement;
    this.previewImage = this.querySelector('#preview-image') as HTMLImageElement;
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
          this.handleFile(target.files[0]);
        }
      });
    }

    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => {
        this.fileInput?.click();
      });

      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone?.classList.add('dragover');
      });

      this.dropZone.addEventListener('dragleave', () => {
        this.dropZone?.classList.remove('dragover');
      });

      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone?.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFile(files[0]);
        }
      });
    }

    if (this.processButton) {
      this.processButton.addEventListener('click', () => {
        this.runProcessImage();
      });
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        this.downloadImage();
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
    if (this.previewImage) this.previewImage.removeAttribute('src');
    if (this.previewInfo) this.previewInfo.innerHTML = '';
    if (this.downloadBtn) this.downloadBtn.hidden = true;
    this.hideError();
    this.clearLogs();
    this.hideLoading();
    this.processedBlob = null;
    this.currentFile = null;
    if (this.fileInput) this.fileInput.value = '';
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      this.showError('Please select an image file');
      return;
    }

    this.currentFile = file;
    this.hideError();
    this.processedBlob = null;
    if (this.downloadBtn) this.downloadBtn.hidden = true;
    this.clearLogs();

    this.revokePreviewUrl();
    const url = URL.createObjectURL(file);
    this.previewObjectUrl = url;

    if (this.previewImage) {
      this.previewImage.src = url;
    }
    if (this.previewInfo) {
      this.previewInfo.innerHTML = '';
    }

    this.openWorkshop();
  }

  private async runProcessImage() {
    if (!this.currentFile) return;

    this.showLoading();
    this.hideError();

    try {
      const options: ImageBitsOptions = {};

      const root = this.workshop;
      if (!root) return;

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

      const result = await processImage(this.currentFile, options);
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

      if (this.logs) {
        this.logs.innerHTML = `<div class="log-entry">✓ Image processed successfully</div>`;
        this.logs.classList.add('active');
      }

      if (this.downloadBtn) this.downloadBtn.hidden = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.showError(errorMessage);
    } finally {
      this.hideLoading();
    }
  }

  private downloadImage() {
    if (!this.processedBlob || !this.currentFile) return;

    const url = URL.createObjectURL(this.processedBlob);
    const a = document.createElement('a');
    a.href = url;

    const formatSelect = this.workshop?.querySelector('#format') as HTMLSelectElement;
    const format = formatSelect?.value;
    const originalName = this.currentFile.name.replace(/\.[^/.]+$/, '');
    const extension =
      format && format !== 'original' ? format : this.currentFile.name.split('.').pop();
    a.download = `${originalName}_processed.${extension}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private showLoading() {
    this.loading?.classList.add('active');
    if (this.processButton) {
      this.processButton.disabled = true;
    }
  }

  private hideLoading() {
    this.loading?.classList.remove('active');
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
