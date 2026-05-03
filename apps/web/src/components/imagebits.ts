/**
 * ImageBits Web Component
 *
 * Extends BitElement (apps/web/src/bits/BitElement.ts), which provides the generic
 * surface infrastructure (workshop dialog, help dialog, alert/confirm modal,
 * escape chain, drag, resize, raise-z, portal-to-body, dirty-close confirm).
 *
 * See apps/web/UI_THEME.md for the bit architecture pattern.
 */

import {
  VERSION,
  buildAltTextManifest,
  generateLocalAltTextFromBlob,
  processImage,
} from '@oddbits/imagebits';
import type { AltTextEntry, AltTextManifest, ImageBitsOptions } from '@oddbits/imagebits';
import { zipSync } from 'fflate';
import { BitElement } from '../bits/BitElement';

type AltDraft = {
  text: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  warning?: string;
};

export class ImageBitsElement extends BitElement {
  // ====== bit-specific element refs ======
  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private introError: HTMLElement | null = null;
  private previewImage: HTMLImageElement | null = null;
  private batchFileList: HTMLElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private generateAltMainBtn: HTMLButtonElement | null = null;
  private generateAltCaretBtn: HTMLButtonElement | null = null;
  private generateAltDropdown: HTMLElement | null = null;
  private altModelInput: HTMLInputElement | null = null;
  private altHelpTrigger: HTMLButtonElement | null = null;
  private altHelpPopover: HTMLElement | null = null;
  private customAltActions: HTMLElement | null = null;
  private processButton: HTMLButtonElement | null = null;
  private downloadBtn: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;
  private renameGroup: HTMLElement | null = null;
  private renameToggle: HTMLInputElement | null = null;
  private renameDetails: HTMLElement | null = null;
  private renamePrefix: HTMLInputElement | null = null;
  private renameStart: HTMLInputElement | null = null;
  private formatSelect: HTMLSelectElement | null = null;
  /** Cleared on disconnect — file-drop listeners on `#window-imagebits`. */
  private introWindowDropAbort: AbortController | null = null;

  // ====== bit-specific state ======
  private currentFiles: File[] = [];
  private processedBlob: Blob | null = null;
  /** After batch process: maps zip-safe filenames to blobs. */
  private batchOutputs: { zipName: string; blob: Blob }[] | null = null;
  private batchOutputMeta: Array<{ inputName: string; outputName: string; width: number; height: number }> = [];
  private altManifest: AltTextManifest | null = null;
  private altDrafts: AltDraft[] = [];
  private thumbnailUrls: string[] = [];
  private previewObjectUrl: string | null = null;
  private altAllGenerating = false;
  private altAllStopRequested = false;
  private activeAltAllButton: HTMLButtonElement | null = null;
  private currentAltMode: 'default' | 'custom' = 'default';
  private convertStopRequested = false;
  /** After Download succeeds, close-workshop confirm is skipped until state changes again. */
  private exportsDownloaded = false;

  // ====== BitElement: shell HTML ======
  protected renderShell(): string {
    return `
      <div class="imagebits-shell bit-shell">
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
          class="window imagebits-dialog-window imagebits-workshop-portal imagebits-workshop bit-workshop"
          role="dialog"
          aria-modal="false"
          aria-labelledby="imagebits-workshop-title"
          hidden
        >
          <div class="window-titlebar imagebits-dialog-drag-handle bit-drag-handle">
            <span id="imagebits-workshop-title">ImageBits — Process</span>
            <div class="window-controls">
              <button type="button" class="window-btn imagebits-workshop-close bit-workshop-close" aria-label="Close">X</button>
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
                <div class="logs" id="logs"></div>
              </div>
              <div class="imagebits-col imagebits-col-actions">
                <div class="controls" id="controls">
                  <div class="imagebits-top-controls">
                    <div class="control-group">
                      <label for="max-dimension">Max dimension (px)</label>
                      <input type="number" id="max-dimension" value="1080" min="1">
                    </div>

                    <div class="control-group">
                      <label for="format">Format</label>
                      <select id="format">
                        <option value="original">Original</option>
                        <option value="webp">WebP</option>
                        <option value="avif">AVIF</option>
                        <option value="png">PNG</option>
                        <option value="jpg">JPEG</option>
                      </select>
                    </div>

                    <div class="control-group">
                      <label for="quality">
                        Quality
                        <span class="range-value" id="quality-value">92%</span>
                      </label>
                      <input type="range" id="quality" min="1" max="100" value="92">
                    </div>

                    <div class="imagebits-rename-group" id="imagebits-rename-group" hidden>
                      <div class="control-group imagebits-rename-toggle-row">
                        <label for="imagebits-rename-toggle">Rename</label>
                        <input type="checkbox" id="imagebits-rename-toggle" class="imagebits-rename-toggle">
                      </div>
                      <div class="imagebits-rename-details" id="imagebits-rename-details" hidden>
                        <div class="control-group">
                          <label for="imagebits-rename-prefix">Prefix</label>
                          <input type="text" id="imagebits-rename-prefix" placeholder="e.g. photo" autocomplete="off" spellcheck="false">
                        </div>
                        <div class="control-group">
                          <label for="imagebits-rename-start">Start numbers at</label>
                          <input type="number" id="imagebits-rename-start" min="0" value="1">
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="control-group imagebits-alt-control">
                    <div class="popover-anchor">
                      <label for="generate-alt-main-btn">Alt Text</label>
                      <button type="button" class="help-trigger" id="alt-text-help-trigger" aria-label="Alt text help" aria-expanded="false" aria-controls="alt-text-help-popover">?</button>
                      <div class="popover" id="alt-text-help-popover" role="tooltip" hidden>
                        Local only. First run downloads a caption model; your images stay on this device.
                      </div>
                    </div>
                    <div class="imagebits-alt-custom-actions" id="imagebits-alt-custom-actions" hidden>
                      <label for="alt-model-input" class="imagebits-input-label">Model name or id</label>
                      <input
                        type="text"
                        id="alt-model-input"
                        placeholder="e.g. Xenova/vit-gpt2-image-captioning or Hugging Face model URL"
                        spellcheck="false"
                        autocomplete="off"
                      >
                    </div>
                    <div class="combo-button-group">
                      <button type="button" id="generate-alt-main-btn" class="combo-main-btn">Generate Alt Text (All)</button>
                      <button type="button" id="generate-alt-caret-btn" class="combo-caret-btn" aria-label="More options">▼</button>
                      <ul class="combo-dropdown" id="generate-alt-dropdown" hidden>
                        <li class="combo-item" data-mode="default">Default Model</li>
                        <li class="combo-item" data-mode="custom">Choose Custom Model...</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div class="imagebits-actions">
                  <button type="button" id="process-btn">Convert</button>
                  <button type="button" id="download-btn" class="imagebits-download" disabled>Download</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="imagebits-help"
          class="window imagebits-dialog-window imagebits-help-dialog bit-help-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="imagebits-help-title"
          hidden
        >
          <div class="window-titlebar">
            <span id="imagebits-help-title">ImageBits Help</span>
            <div class="window-controls">
              <button type="button" class="window-btn imagebits-help-close bit-help-close" aria-label="Close help">X</button>
            </div>
          </div>
          <div class="window-content imagebits-help-content">
            <p>One import in browser and Node; the bundler picks the right build.</p>

            <h3>Workshop</h3>
            <p>
              Drop images, set format and quality, then convert. With several files you can edit output names and use <strong>Rename</strong> + <strong>Bulk Convert</strong> for <code>prefix-1</code>, <code>prefix-2</code>, …
            </p>

            <h3>In your code</h3>
            <pre><code>npm install @oddbits/imagebits

import { processImage, processImages } from '@oddbits/imagebits';

const r = await processImage(input, { format: 'webp', maxDimension: 1080 });
// input: File | Blob | Buffer | ArrayBuffer | path | URL</code></pre>

            <h3>From the CLI</h3>
            <pre><code>npx @oddbits/imagebits *.png -f webp -o ./out/
npx @oddbits/imagebits ./photos -r -f webp --rename-prefix beach -o ./out/
npx @oddbits/imagebits ./photos -r --alt-text local --zip ./bundle.zip</code></pre>

            <h3>Privacy</h3>
            <p class="imagebits-help-privacy">
              Processing and zips stay on your device. Outputs are re-encoded, so camera metadata from the originals is not carried into files (details in the README).
              <strong>Alt Text</strong> downloads model weights once (large first run), then runs locally; your images are not uploaded.
            </p>

            <p>
              Full details and docs on 
              <a href="https://github.com/oddbits-us/oddbits/blob/main/packages/imagebits/README.md" target="_blank" rel="noopener noreferrer">GitHub</a>.
            </p>
          </div>
        </div>

        <div
          id="imagebits-confirm-close"
          class="alert-modal-backdrop bit-confirm-backdrop"
          hidden
        >
          <div
            class="alert-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="imagebits-confirm-title"
            aria-describedby="imagebits-confirm-message"
          >
            <div class="alert-modal-icon" aria-hidden="true">⚠️</div>
            <div class="alert-modal-title" id="imagebits-confirm-title">Discard unsaved progress?</div>
            <div class="alert-modal-message" id="imagebits-confirm-message">
              Closing clears this workshop and stops any work in progress.
            </div>
            <div class="alert-modal-actions">
              <button type="button" id="imagebits-confirm-cancel" class="bit-confirm-cancel">No! Cancel!</button>
              <button type="button" id="imagebits-confirm-accept" class="btn-secondary bit-confirm-accept">Yes, I'm aware.</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ====== BitElement: hooks ======

  protected getHostWindowSelector(): string | null {
    return '#window-imagebits';
  }

  protected getWorkshopMinSize(): { width: number; height: number } {
    return { width: 360, height: 200 };
  }

  protected getHelpMinSize(): { width: number; height: number } {
    return { width: 360, height: 220 };
  }

  protected getVersion(): string | null {
    return VERSION;
  }

  protected isWorkshopDirty(): boolean {
    if (!this.workshop || this.workshop.hidden) return false;
    if (this.altAllGenerating) return true;
    if (this.exportsDownloaded) return false;
    if (this.currentFiles.length > 0) return true;
    if (this.batchOutputs && this.batchOutputs.length > 0) return true;
    return false;
  }

  protected onAcceptConfirmClose(): void {
    this.convertStopRequested = true;
    this.altAllStopRequested = true;
  }

  protected handleEscapePopover(): boolean {
    if (this.altHelpPopover && !this.altHelpPopover.hidden) {
      this.hideAltHelpPopover();
      return true;
    }
    return false;
  }

  protected onDocumentMouseDownBit(e: MouseEvent): void {
    const target = e.target as Node | null;
    if (!target) return;
    if (this.altHelpPopover && !this.altHelpPopover.hidden && this.altHelpTrigger) {
      if (!this.altHelpPopover.contains(target) && !this.altHelpTrigger.contains(target)) {
        this.hideAltHelpPopover();
      }
    }
    if (this.generateAltDropdown && !this.generateAltDropdown.hidden && this.generateAltCaretBtn) {
      if (!this.generateAltDropdown.contains(target) && !this.generateAltCaretBtn.contains(target)) {
        this.hideAltDropdown();
      }
    }
  }

  protected onDisconnect(): void {
    this.introWindowDropAbort?.abort();
    this.introWindowDropAbort = null;
    this.revokePreviewUrl();
    this.revokeThumbnailUrls();
  }

  private revokePreviewUrl() {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }
  }

  protected initializeBitElements(): void {
    this.fileInput = this.querySelector('#file-input') as HTMLInputElement;
    this.dropZone = this.querySelector('#drop-zone') as HTMLElement;
    this.introError = this.querySelector('#imagebits-intro-error') as HTMLElement;
    this.previewImage = this.querySelector('#preview-image') as HTMLImageElement;
    this.batchFileList = this.querySelector('#batch-file-list') as HTMLElement;
    this.previewInfo = this.querySelector('#preview-info') as HTMLElement;
    this.generateAltMainBtn = this.querySelector('#generate-alt-main-btn') as HTMLButtonElement;
    this.generateAltCaretBtn = this.querySelector('#generate-alt-caret-btn') as HTMLButtonElement;
    this.generateAltDropdown = this.querySelector('#generate-alt-dropdown') as HTMLElement;
    this.altModelInput = this.querySelector('#alt-model-input') as HTMLInputElement;
    this.altHelpTrigger = this.querySelector('#alt-text-help-trigger') as HTMLButtonElement;
    this.altHelpPopover = this.querySelector('#alt-text-help-popover') as HTMLElement;
    this.customAltActions = this.querySelector('#imagebits-alt-custom-actions') as HTMLElement;
    this.processButton = this.querySelector('#process-btn') as HTMLButtonElement;
    this.downloadBtn = this.querySelector('#download-btn') as HTMLButtonElement;
    this.logs = this.querySelector('#logs') as HTMLElement;
    this.renameGroup = this.querySelector('#imagebits-rename-group') as HTMLElement;
    this.renameToggle = this.querySelector('#imagebits-rename-toggle') as HTMLInputElement;
    this.renameDetails = this.querySelector('#imagebits-rename-details') as HTMLElement;
    this.renamePrefix = this.querySelector('#imagebits-rename-prefix') as HTMLInputElement;
    this.renameStart = this.querySelector('#imagebits-rename-start') as HTMLInputElement;
    this.formatSelect = this.querySelector('#format') as HTMLSelectElement;

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

    // Prefix / start-index rows live inside `#imagebits-rename-details`; keep
    // them collapsed unless the checkbox is checked (also fixes `[hidden]` vs
    // CSS `display` specificity on first paint).
    this.syncRenameDetailsVisibility();
  }

  protected attachBitListeners(): void {
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
          if (!dropRoot.contains(e.relatedTarget as Node)) {
            this.dropZone?.classList.remove('dragover');
          }
        },
        { signal },
      );

      dropRoot.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropZone?.classList.remove('dragover');
          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            this.handleFiles(files);
          }
        },
        { signal },
      );
    }

    if (this.processButton) {
      this.processButton.addEventListener('click', () => {
        void this.runProcessAll();
      });
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        if (this.currentFiles.length > 1 || this.buildManifestFromCurrentDrafts()) {
          this.downloadZip();
        } else {
          this.downloadSingle();
        }
      });
    }

    if (this.generateAltMainBtn) {
      this.generateAltMainBtn.addEventListener('click', () => {
        if (this.currentAltMode === 'default') {
          void this.generateAltTextForAllDefaultModel();
        } else {
          void this.generateAltTextForAllCustomModel();
        }
      });
    }
    if (this.generateAltCaretBtn) {
      this.generateAltCaretBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleAltDropdown();
      });
    }
    if (this.generateAltDropdown) {
      this.generateAltDropdown.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest<HTMLElement>('.combo-item');
        if (!item) return;
        const mode = item.dataset.mode as 'default' | 'custom';
        if (mode) this.setAltMode(mode);
        this.hideAltDropdown();
      });
    }
    if (this.altHelpTrigger) {
      this.altHelpTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleAltHelpPopover();
      });
    }

    if (this.batchFileList) {
      this.batchFileList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement>('.imagebits-batch-generate');
        if (!btn) return;
        const index = Number(btn.dataset.index ?? '-1');
        if (Number.isNaN(index) || index < 0) return;
        void this.generateAltTextForIndex(index);
      });
      this.batchFileList.addEventListener('input', (e) => {
        const target = e.target as HTMLElement;
        const editor = target.closest<HTMLTextAreaElement>('.imagebits-batch-alt-editor');
        if (editor) {
          const index = Number(editor.dataset.index ?? '-1');
          if (!Number.isNaN(index) && index >= 0 && this.altDrafts[index]) {
            this.autoResizeAltEditor(editor);
            this.altDrafts[index].text = editor.value.trim();
            this.altDrafts[index].status = this.altDrafts[index].text ? 'ready' : 'idle';
            this.exportsDownloaded = false;
          }
          return;
        }
        const nameInput = target.closest<HTMLInputElement>('.imagebits-batch-name-input');
        if (nameInput) {
          // Live edits to filenames are read fresh at Download time; we only
          // need to invalidate the "already downloaded" flag so the dirty-close
          // confirm fires again if the user closes after editing.
          this.exportsDownloaded = false;
        }
      });
    }

    if (this.renameToggle) {
      this.renameToggle.addEventListener('change', () => {
        this.syncRenameDetailsVisibility();
      });
    }

    if (this.formatSelect) {
      this.formatSelect.addEventListener('change', () => {
        this.syncBatchListExtensions();
      });
    }
  }

  private syncRenameDetailsVisibility() {
    if (!this.renameDetails || !this.renameToggle) return;
    this.renameDetails.hidden = !this.renameToggle.checked;
  }

  private syncRenameGroupVisibility() {
    if (!this.renameGroup) return;
    const show = this.currentFiles.length > 1;
    this.renameGroup.hidden = !show;
    if (!show && this.renameToggle) {
      this.renameToggle.checked = false;
      this.syncRenameDetailsVisibility();
    }
  }

  /** Returns `.webp` etc. — same logic as `outputFilename` but stem-free. */
  private outputExtForFile(file: File): string {
    const format = this.formatSelect?.value;
    const ext =
      format && format !== 'original'
        ? format
        : file.name.includes('.')
          ? (file.name.split('.').pop() ?? 'bin')
          : 'bin';
    return `.${ext}`;
  }

  private syncBatchListExtensions() {
    if (!this.batchFileList) return;
    const extSpans = this.batchFileList.querySelectorAll<HTMLElement>('.imagebits-batch-ext');
    extSpans.forEach((span) => {
      const idx = Number(span.dataset.index ?? '-1');
      if (Number.isNaN(idx) || idx < 0 || !this.currentFiles[idx]) return;
      span.textContent = this.outputExtForFile(this.currentFiles[idx]);
    });
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
    this.exportsDownloaded = false;
    this.revokeThumbnailUrls();
    this.thumbnailUrls = images.map((f) => URL.createObjectURL(f));
    this.altDrafts = images.map(() => ({ text: '', status: 'idle' }));
    this.processedBlob = null;
    this.batchOutputs = null;
    this.batchOutputMeta = [];
    this.altManifest = null;
    if (this.downloadBtn) this.downloadBtn.disabled = true;
    this.clearLogs();

    this.revokePreviewUrl();
    this.updateWorkshopTitle();

    if (this.previewImage) {
      this.previewImage.hidden = true;
      this.previewImage.removeAttribute('src');
    }
    this.renderBatchFileListPending();

    if (this.previewInfo) {
      this.previewInfo.innerHTML = '';
    }

    this.syncProcessButtonLabel();
    this.syncRenameGroupVisibility();
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
    this.processButton.textContent = n > 1 ? `Bulk Convert Images (${n})` : 'Convert Image';
  }

  private renderBatchFileListPending() {
    if (!this.batchFileList) return;
    this.batchFileList.hidden = false;
    this.batchFileList.innerHTML = this.currentFiles
      .map((f, i) => {
        const draft = this.altDrafts[i] ?? { text: '', status: 'idle' as const };
        const buttonText =
          draft.status === 'generating'
            ? 'Generating…'
            : draft.status === 'ready'
              ? 'Regenerate'
              : draft.status === 'error'
                ? 'Retry'
                : 'Generate Alt Text';
        const buttonExtraClass = draft.status === 'generating' ? ' is-active' : '';
        const stem = this.stemFromFilename(f.name);
        const ext = this.outputExtForFile(f);
        return `<li class="imagebits-batch-item" data-index="${i}">
          <img class="imagebits-batch-thumb" src="${this.thumbnailUrls[i] ?? ''}" alt="Thumbnail for ${this.escapeHtml(f.name)}">
          <div class="imagebits-batch-main">
            <div class="imagebits-batch-row imagebits-batch-row-name">
              <span class="imagebits-batch-name">
                <input class="imagebits-batch-name-input" data-index="${i}" type="text" value="${this.escapeHtml(stem)}" spellcheck="false" autocomplete="off" aria-label="Output filename for ${this.escapeHtml(f.name)}">
                <span class="imagebits-batch-ext" data-index="${i}">${this.escapeHtml(ext)}</span>
              </span>
              <span class="imagebits-batch-convert-status" title=""></span>
            </div>
            <div class="imagebits-batch-row imagebits-batch-row-alt">
              <textarea class="imagebits-batch-alt-editor" data-index="${i}" rows="1" aria-label="Alt text for ${this.escapeHtml(f.name)}">${this.escapeHtml(draft.text)}</textarea>
              <button type="button" class="imagebits-batch-generate${buttonExtraClass}" data-index="${i}" ${draft.status === 'generating' ? 'disabled' : ''} title="${this.escapeHtml(draft.warning ?? '')}">${buttonText}</button>
            </div>
          </div>
        </li>`;
      })
      .join('');
    const editors = this.batchFileList.querySelectorAll<HTMLTextAreaElement>('.imagebits-batch-alt-editor');
    editors.forEach((editor) => this.autoResizeAltEditor(editor));
  }

  private stemFromFilename(name: string): string {
    return name.replace(/\.[^/.]+$/, '');
  }

  private autoResizeAltEditor(editor: HTMLTextAreaElement) {
    editor.style.height = 'auto';
    const minHeight = 30;
    editor.style.height = `${Math.max(editor.scrollHeight, minHeight)}px`;
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
    const status = li?.querySelector('.imagebits-batch-convert-status');
    if (status) {
      status.textContent = ok ? `\u2713 ${text}` : text;
      status.classList.toggle('imagebits-batch-ok', ok);
      status.classList.toggle('imagebits-batch-err', !ok);
    }
  }

  private setBatchRowAltText(index: number, text: string, isError = false) {
    if (!this.altDrafts[index]) return;
    this.altDrafts[index].text = text;
    this.altDrafts[index].status = isError ? 'error' : text ? 'ready' : 'idle';
    this.renderBatchFileListPending();
  }

  // ====== BitElement: workshop reset ======

  protected resetWorkshopState(): void {
    this.exportsDownloaded = false;
    this.altAllGenerating = false;
    this.activeAltAllButton = null;
    if (this.generateAltMainBtn) {
      this.generateAltMainBtn.classList.remove('is-active');
    }
    this.setAltMode('default');
    this.hideAltDropdown();
    this.hideAltHelpPopover();
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
    if (this.downloadBtn) {
      this.downloadBtn.disabled = true;
      this.downloadBtn.textContent = 'Download';
    }
    this.clearLogs();
    this.setProcessing(false);
    this.processedBlob = null;
    this.batchOutputs = null;
    this.batchOutputMeta = [];
    this.altManifest = null;
    this.altDrafts = [];
    this.revokeThumbnailUrls();
    this.currentFiles = [];
    if (this.fileInput) this.fileInput.value = '';
    this.hideIntroError();
    if (this.renameToggle) this.renameToggle.checked = false;
    if (this.renamePrefix) this.renamePrefix.value = '';
    if (this.renameStart) this.renameStart.value = '1';
    this.syncRenameDetailsVisibility();
    this.syncRenameGroupVisibility();
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

  private revokeThumbnailUrls() {
    this.thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
    this.thumbnailUrls = [];
  }

  private async generateAltTextForIndex(index: number) {
    if (!this.currentFiles[index] || !this.altDrafts[index]) return;
    this.exportsDownloaded = false;
    const modelChoice = this.resolveAltModelChoice();
    if (modelChoice === null) return;
    this.altDrafts[index].status = 'generating';
    this.renderBatchFileListPending();
    try {
      const out = await generateLocalAltTextFromBlob(this.currentFiles[index], modelChoice.model ? { model: modelChoice.model } : {});
      this.altDrafts[index] = {
        text: out.altText,
        status: 'ready',
        warning: out.warnings.join(' | ') || undefined,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const uiMessage = this.getAltTextErrorMessage(detail);
      console.error('ImageBits local alt-text generation error:', err);
      this.altDrafts[index] = {
        text: this.altDrafts[index].text,
        status: 'error',
        warning: detail,
      };
      this.writeLog(`<div class="log-entry">✗ Alt text failed for ${this.escapeHtml(this.currentFiles[index].name)}: ${this.escapeHtml(uiMessage)}</div>`, true);
    }
    this.renderBatchFileListPending();
  }

  private getAltTextErrorMessage(detail: string): string {
    if (detail.includes('Model fetch returned HTML')) {
      return 'Model download returned an unexpected page. Check network/CSP settings.';
    }
    if (detail.includes("Can't create a session")) {
      return 'Caption model failed to initialize in this browser runtime.';
    }
    return 'Local alt-text generation failed. Check console for details.';
  }

  private async generateAltTextForAllDefaultModel() {
    await this.runAltTextForAll({}, this.generateAltMainBtn);
  }

  private async generateAltTextForAllCustomModel() {
    const raw = (this.altModelInput?.value ?? '').trim();
    if (!raw) {
      this.writeLog('<div class="log-entry">✗ Enter a model name/id before custom generation.</div>', true);
      return;
    }
    const model = this.normalizeAltModelSpec(raw);
    if (!model) {
      this.writeLog(
        '<div class="log-entry">✗ Invalid model. Use "org/model" or a Hugging Face model URL.</div>',
        true,
      );
      return;
    }
    await this.runAltTextForAll({ model }, this.generateAltMainBtn);
  }

  private async runAltTextForAll(modelChoice: { model?: string }, sourceButton: HTMLButtonElement | null) {
    if (this.currentFiles.length === 0 || !sourceButton) return;
    if (this.altAllGenerating) {
      this.altAllStopRequested = true;
      if (this.activeAltAllButton) this.activeAltAllButton.textContent = 'Stopping...';
      return;
    }
    this.altAllGenerating = true;
    this.altAllStopRequested = false;
    this.exportsDownloaded = false;
    this.activeAltAllButton = sourceButton;
    sourceButton.classList.add('is-active');
    sourceButton.textContent = 'Generating - click again to stop';
    try {
      for (let i = 0; i < this.currentFiles.length; i++) {
        if (this.altAllStopRequested) break;
        await this.generateAltTextForIndexWithModel(i, modelChoice.model);
      }
    } finally {
      this.altAllGenerating = false;
      this.altAllStopRequested = false;
      if (this.generateAltMainBtn) {
        this.generateAltMainBtn.classList.remove('is-active');
        this.generateAltMainBtn.textContent = this.currentAltMode === 'default' ? 'Generate Alt Text (All)' : 'Generate Alt Text (Custom Model)';
      }
      this.activeAltAllButton = null;
    }
  }

  private setAltMode(mode: 'default' | 'custom') {
    this.currentAltMode = mode;
    if (this.generateAltMainBtn) {
      this.generateAltMainBtn.textContent = mode === 'default' ? 'Generate Alt Text (All)' : 'Generate Alt Text (Custom Model)';
    }
    if (this.customAltActions) {
      this.customAltActions.hidden = mode === 'default';
      if (mode === 'custom') {
        this.altModelInput?.focus();
      }
    }
  }

  private toggleAltDropdown() {
    if (!this.generateAltDropdown || !this.generateAltCaretBtn) return;
    if (this.generateAltDropdown.hidden) {
      this.generateAltDropdown.hidden = false;
      this.generateAltCaretBtn.setAttribute('aria-expanded', 'true');
      return;
    }
    this.hideAltDropdown();
  }

  private hideAltDropdown() {
    if (!this.generateAltDropdown || !this.generateAltCaretBtn) return;
    this.generateAltDropdown.hidden = true;
    this.generateAltCaretBtn.setAttribute('aria-expanded', 'false');
  }

  private toggleAltHelpPopover() {
    if (!this.altHelpPopover || !this.altHelpTrigger) return;
    if (this.altHelpPopover.hidden) {
      this.altHelpPopover.hidden = false;
      this.altHelpTrigger.setAttribute('aria-expanded', 'true');
      return;
    }
    this.hideAltHelpPopover();
  }

  private hideAltHelpPopover() {
    if (!this.altHelpPopover || !this.altHelpTrigger) return;
    this.altHelpPopover.hidden = true;
    this.altHelpTrigger.setAttribute('aria-expanded', 'false');
  }

  private async generateAltTextForIndexWithModel(index: number, model?: string) {
    if (!this.currentFiles[index] || !this.altDrafts[index]) return;
    this.altDrafts[index].status = 'generating';
    this.renderBatchFileListPending();
    try {
      const out = await generateLocalAltTextFromBlob(this.currentFiles[index], model ? { model } : {});
      this.altDrafts[index] = {
        text: out.altText,
        status: 'ready',
        warning: out.warnings.join(' | ') || undefined,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const uiMessage = this.getAltTextErrorMessage(detail);
      console.error('ImageBits local alt-text generation error:', err);
      this.altDrafts[index] = {
        text: this.altDrafts[index].text,
        status: 'error',
        warning: detail,
      };
      this.writeLog(`<div class="log-entry">✗ Alt text failed for ${this.escapeHtml(this.currentFiles[index].name)}: ${this.escapeHtml(uiMessage)}</div>`, true);
    }
    this.renderBatchFileListPending();
  }

  private resolveAltModelChoice(): { model?: string } | null {
    const raw = (this.altModelInput?.value ?? '').trim();
    if (!raw) return {};
    const model = this.normalizeAltModelSpec(raw);
    if (model) return { model };
    this.writeLog(
      '<div class="log-entry">✗ Invalid alt model. Use "org/model" or a Hugging Face model URL.</div>',
      true,
    );
    return null;
  }

  private normalizeAltModelSpec(value: string): string | null {
    const repoIdPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
    if (repoIdPattern.test(value)) return value;

    if (!/^https?:\/\//i.test(value)) return null;
    try {
      const url = new URL(value);
      if (!/^(.+\.)?huggingface\.co$/i.test(url.hostname)) return null;
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((p) => decodeURIComponent(p));

      if (segments.length >= 3 && segments[0] === 'models') {
        const candidate = `${segments[1]}/${segments[2]}`;
        return repoIdPattern.test(candidate) ? candidate : null;
      }
      if (segments.length >= 2) {
        const candidate = `${segments[0]}/${segments[1]}`;
        return repoIdPattern.test(candidate) ? candidate : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private buildManifestFromCurrentDrafts(): AltTextManifest | null {
    if (this.batchOutputMeta.length === 0) return null;
    const entries: AltTextEntry[] = [];
    for (let i = 0; i < this.batchOutputMeta.length; i++) {
      const draft = this.altDrafts[i];
      const text = (draft?.text ?? '').trim();
      if (!text) continue;
      const meta = this.batchOutputMeta[i];
      entries.push({
        inputName: meta.inputName,
        outputName: meta.outputName,
        width: meta.width,
        height: meta.height,
        altText: text,
        warnings: draft.warning ? [draft.warning] : undefined,
      });
    }
    if (entries.length === 0) return null;
    return buildAltTextManifest(entries, 'manual-local');
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

  /**
   * Sanitize a user-typed filename stem so it's safe as a zip entry name and
   * a browser download. Strip path separators and zero-bytes, collapse
   * whitespace, and fall back to a stable default if the result is empty.
   */
  private sanitizeStem(raw: string, fallback: string): string {
    const cleaned = raw
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  }

  /**
   * Read the live filename from row `i` of the batch list (the editable
   * input the user can type into) and combine it with the format-derived
   * extension. Falls back to the input filename's stem if the row hasn't
   * been rendered yet (single-file mode).
   */
  private currentOutputName(i: number): string {
    const file = this.currentFiles[i];
    if (!file) return `image-${i + 1}.bin`;
    const ext = this.outputExtForFile(file);
    const input = this.batchFileList?.querySelector<HTMLInputElement>(
      `.imagebits-batch-name-input[data-index="${i}"]`,
    );
    const fallbackStem = this.stemFromFilename(file.name) || `image-${i + 1}`;
    const stemRaw = input ? input.value : fallbackStem;
    const stem = this.sanitizeStem(stemRaw, fallbackStem);
    return `${stem}${ext}`;
  }

  /**
   * Bulk rename: overwrite every row's name input with `${prefix}-${start+i}`.
   * Called at Convert time when the Rename checkbox is on. Wipes any prior
   * per-row edits — that's the documented behavior.
   */
  private applyBulkRenameToInputs(prefix: string, start: number) {
    if (!this.batchFileList) return;
    const inputs = this.batchFileList.querySelectorAll<HTMLInputElement>(
      '.imagebits-batch-name-input',
    );
    inputs.forEach((input) => {
      const idx = Number(input.dataset.index ?? '-1');
      if (Number.isNaN(idx) || idx < 0) return;
      input.value = `${prefix}-${start + idx}`;
    });
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

    this.convertStopRequested = false;
    this.exportsDownloaded = false;
    this.setProcessing(true);
    this.clearLogs();
    this.processedBlob = null;
    this.batchOutputs = null;
    this.batchOutputMeta = [];
    this.altManifest = null;
    if (this.downloadBtn) this.downloadBtn.disabled = true;

    const root = this.workshop;
    if (!root) return;

    const optionsBase = this.getOptionsFromWorkshop();
    const total = this.currentFiles.length;

    // Bulk rename runs BEFORE encoding so the row inputs reflect the final
    // names from the moment Convert is pressed. This intentionally wipes any
    // per-row edits the user made — see `currentOutputName` for the
    // post-convert path where individual edits are honored on Download.
    if (total > 1 && this.renameToggle?.checked) {
      const prefix = this.sanitizeStem((this.renamePrefix?.value ?? '').trim(), 'image');
      const startRaw = parseInt(this.renameStart?.value ?? '1', 10);
      const start = Number.isFinite(startRaw) ? startRaw : 1;
      this.applyBulkRenameToInputs(prefix, start);
    }

    try {
      if (total === 1) {
        const result = await processImage(this.currentFiles[0], optionsBase);
        this.processedBlob = result.blob;
        const outName = this.currentOutputName(0);
        this.batchOutputMeta = [
          {
            inputName: this.currentFiles[0].name,
            outputName: outName,
            width: result.metadata.width,
            height: result.metadata.height,
          },
        ];

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
        this.batchOutputs = [{ zipName: outName, blob: this.processedBlob }];
        this.setBatchRowStatus(0, this.formatBytes(result.metadata.size), true);

        this.writeLog(`<div class="log-entry">✓ Image converted</div>`);

        if (this.downloadBtn) {
          this.downloadBtn.disabled = false;
          this.downloadBtn.textContent = 'Download';
        }
      } else {
        const rawNames = this.currentFiles.map((_, i) => this.currentOutputName(i));
        const zipNames = this.uniquifyZipNames(rawNames);
        const outputs: { zipName: string; blob: Blob }[] = [];
        const metaRows: Array<{ inputName: string; outputName: string; width: number; height: number }> =
          [];
        let totalIn = 0;
        let totalOut = 0;

        for (let i = 0; i < this.currentFiles.length; i++) {
          if (this.convertStopRequested) break;
          this.setProcessing(true, `Converting ${i + 1} / ${total}…`);
          try {
            const result = await processImage(this.currentFiles[i], optionsBase);
            // `zipName` is a snapshot at convert time; the actual download
            // re-reads the row inputs so post-convert edits are honored.
            outputs.push({ zipName: zipNames[i], blob: result.blob });
            totalIn += result.metadata.originalSize ?? 0;
            totalOut += result.metadata.size;
            const rowSize = this.formatBytes(result.metadata.size);
            this.setBatchRowStatus(i, rowSize, true);
            metaRows.push({
              inputName: this.currentFiles[i].name,
              outputName: zipNames[i],
              width: result.metadata.width,
              height: result.metadata.height,
            });
          } catch {
            this.setBatchRowStatus(i, 'Failed', false);
            throw new Error(`Failed on “${this.currentFiles[i].name}”`);
          }
        }

        this.batchOutputs = outputs;
        this.batchOutputMeta = metaRows;

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

        this.writeLog(`<div class="log-entry">✓ Converted ${total} images — ready to download ZIP</div>`);

        if (this.downloadBtn) {
          this.downloadBtn.disabled = false;
          this.downloadBtn.textContent = 'Download ZIP';
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.writeLog(`<div class="log-entry">✗ ${this.escapeHtml(errorMessage)}</div>`, true);
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Compute the final names to use for downloading: the live row inputs (so
   * post-convert edits are honored) routed through `uniquifyZipNames` so two
   * rows with the same value still produce distinct files.
   */
  private resolveDownloadNames(): string[] {
    if (!this.batchOutputs) return [];
    const live = this.batchOutputs.map((snap, i) =>
      this.currentFiles[i] ? this.currentOutputName(i) : snap.zipName,
    );
    return this.uniquifyZipNames(live);
  }

  private downloadSingle() {
    if (!this.batchOutputs?.length || !this.currentFiles.length) return;
    const blob = this.batchOutputs[0].blob;
    const names = this.resolveDownloadNames();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = names[0] ?? this.batchOutputs[0].zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.exportsDownloaded = true;
  }

  private downloadZip() {
    if (!this.batchOutputs || this.batchOutputs.length === 0) return;

    void (async () => {
      const files: Record<string, Uint8Array> = {};
      const names = this.resolveDownloadNames();
      for (let i = 0; i < this.batchOutputs!.length; i++) {
        const { blob } = this.batchOutputs![i];
        const ab = await blob.arrayBuffer();
        files[names[i] ?? this.batchOutputs![i].zipName] = new Uint8Array(ab);
      }
      this.altManifest = this.buildManifestFromCurrentDrafts();
      if (this.altManifest) {
        // Refresh manifest output names against live row values so it lines
        // up with what's actually inside the zip.
        for (let i = 0; i < this.altManifest.images.length; i++) {
          if (names[i]) this.altManifest.images[i].outputName = names[i];
        }
        files['alt-text.json'] = new TextEncoder().encode(`${JSON.stringify(this.altManifest, null, 2)}\n`);
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
      this.exportsDownloaded = true;
    })();
  }

  private setProcessing(active: boolean, message?: string) {
    if (!this.processButton) return;
    this.processButton.disabled = active;
    if (active) {
      this.processButton.textContent = message ?? 'Processing…';
    } else {
      this.syncProcessButtonLabel();
    }
  }

  private writeLog(html: string, isError = false) {
    if (!this.logs) return;
    this.logs.innerHTML = html;
    this.logs.classList.add('active');
    this.logs.classList.toggle('is-error', isError);
  }

  private clearLogs() {
    if (this.logs) {
      this.logs.innerHTML = '';
      this.logs.classList.remove('active');
      this.logs.classList.remove('is-error');
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
