/**
 * ImageBits Web Component
 * Vanilla TypeScript Web Component for image processing
 */

import { processImage, imageBits } from '@oddbits/imagebits';
import type { ImageBitsOptions } from '@oddbits/imagebits';

export class ImageBitsElement extends HTMLElement {
  private fileInput: HTMLInputElement | null = null;
  private dropZone: HTMLElement | null = null;
  private preview: HTMLElement | null = null;
  private previewImage: HTMLImageElement | null = null;
  private previewInfo: HTMLElement | null = null;
  private processButton: HTMLButtonElement | null = null;
  private logs: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private error: HTMLElement | null = null;
  private currentFile: File | null = null;
  private processedBlob: Blob | null = null;

  connectedCallback() {
    this.innerHTML = `
      <div class="tool-header">
        <div>
          <div class="tool-title">🖼️ ImageBits</div>
          <div class="tool-description">${imageBits.description}</div>
        </div>
      </div>

      <div class="drop-zone" id="drop-zone">
        <input type="file" id="file-input" accept="image/*" multiple>
        <div class="drop-zone-text">
          <strong>Drop images here</strong> or click to browse
        </div>
      </div>

      <div class="controls" id="controls" style="display: none;">
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

        <button id="process-btn">Process Image</button>
      </div>

      <div class="loading" id="loading">Processing...</div>
      <div class="error" id="error"></div>

      <div class="preview" id="preview">
        <img class="preview-image" id="preview-image" alt="Preview">
        <div class="preview-info" id="preview-info"></div>
        <button id="download-btn">Download</button>
      </div>

      <div class="logs" id="logs"></div>
    `;

    this.initializeElements();
    this.attachEventListeners();
  }

  private initializeElements() {
    this.fileInput = this.querySelector('#file-input') as HTMLInputElement;
    this.dropZone = this.querySelector('#drop-zone') as HTMLElement;
    this.preview = this.querySelector('#preview') as HTMLElement;
    this.previewImage = this.querySelector('#preview-image') as HTMLImageElement;
    this.previewInfo = this.querySelector('#preview-info') as HTMLElement;
    this.processButton = this.querySelector('#process-btn') as HTMLButtonElement;
    this.logs = this.querySelector('#logs') as HTMLElement;
    this.loading = this.querySelector('#loading') as HTMLElement;
    this.error = this.querySelector('#error') as HTMLElement;

    // Quality slider value display
    const qualitySlider = this.querySelector('#quality') as HTMLInputElement;
    const qualityValue = this.querySelector('#quality-value') as HTMLElement;
    if (qualitySlider && qualityValue) {
      const updateQualityLabel = () => {
        const raw = parseInt(qualitySlider.value || '0', 10);
        const clamped = Math.min(100, Math.max(0, isNaN(raw) ? 0 : raw));
        qualityValue.textContent = `${clamped}%`;
      };

      // Set initial label
      updateQualityLabel();

      // Update on slider change
      qualitySlider.addEventListener('input', updateQualityLabel);
      qualitySlider.addEventListener('change', updateQualityLabel);
    }
  }

  private attachEventListeners() {
    // File input
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          this.handleFile(target.files[0]);
        }
      });
    }

    // Drop zone
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

    // Process button
    if (this.processButton) {
      this.processButton.addEventListener('click', () => {
        this.processImage();
      });
    }

    // Download button
    const downloadBtn = this.querySelector('#download-btn') as HTMLButtonElement;
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadImage();
      });
    }
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      this.showError('Please select an image file');
      return;
    }

    this.currentFile = file;
    this.hideError();
    this.hidePreview();

    // Show controls
    const controls = this.querySelector('#controls') as HTMLElement;
    if (controls) {
      controls.style.display = 'grid';
    }

    // Show preview of original
    if (this.previewImage) {
      const url = URL.createObjectURL(file);
      this.previewImage.src = url;
      this.preview?.classList.add('active');
    }
  }

  private async processImage() {
    if (!this.currentFile) return;

    const controls = this.querySelector('#controls') as HTMLElement;
    if (controls) {
      controls.style.display = 'none';
    }

    this.showLoading();
    this.hideError();
    this.hidePreview();
    this.clearLogs();

    try {
      const options: ImageBitsOptions = {};

      // Max dimension
      const maxDimensionInput = this.querySelector('#max-dimension') as HTMLInputElement;
      const maxDimension = maxDimensionInput?.value ? parseInt(maxDimensionInput.value) : undefined;
      if (maxDimension) {
        options.maxDimension = maxDimension;
      }

      // Format
      const formatSelect = this.querySelector('#format') as HTMLSelectElement;
      const format = formatSelect?.value;
      if (format && format !== 'original') {
        options.format = format as any;
      }

      // Quality
      const qualityInput = this.querySelector('#quality') as HTMLInputElement;
      const quality = qualityInput?.value ? parseInt(qualityInput.value) / 100 : undefined;
      if (quality) {
        options.quality = quality;
      }

      // Process
      const result = await processImage(this.currentFile, options);
      this.processedBlob = result.blob;

      // Show preview
      if (this.previewImage && this.processedBlob) {
        const url = URL.createObjectURL(this.processedBlob);
        this.previewImage.src = url;
        this.preview?.classList.add('active');
      }

      // Show metadata
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

      // Logs not available in simple API, but we can show success message
      if (this.logs) {
        this.logs.innerHTML = `<div class="log-entry">✓ Image processed successfully</div>`;
        this.logs.classList.add('active');
      }
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
    
    // Determine filename
    const formatSelect = this.querySelector('#format') as HTMLSelectElement;
    const format = formatSelect?.value;
    const originalName = this.currentFile.name.replace(/\.[^/.]+$/, '');
    const extension = format && format !== 'original' ? format : this.currentFile.name.split('.').pop();
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

  private hidePreview() {
    this.preview?.classList.remove('active');
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
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Register the custom element
customElements.define('odd-imagebits', ImageBitsElement);

