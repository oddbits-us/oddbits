/**
 * ImageBits Web Component
 * Vanilla TypeScript Web Component for image processing
 */

import { imageBits } from '@oddbits/imagebits';
import type { ImageBitsOptions } from '@oddbits/imagebits';
import type { BitInput } from '@oddbits/core';

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

      <div class="controls" id="controls" style="display: none;">
        <div class="control-group">
          <label>Resize</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <input type="number" id="width" placeholder="Width" min="1">
            <input type="number" id="height" placeholder="Height" min="1">
          </div>
          <select id="fit">
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
            <option value="fill">Fill</option>
            <option value="inside">Inside</option>
            <option value="outside">Outside</option>
          </select>
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
      qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = `${qualitySlider.value}%`;
      });
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

      // Resize options
      const widthInput = this.querySelector('#width') as HTMLInputElement;
      const heightInput = this.querySelector('#height') as HTMLInputElement;
      const fitSelect = this.querySelector('#fit') as HTMLSelectElement;

      const width = widthInput?.value ? parseInt(widthInput.value) : undefined;
      const height = heightInput?.value ? parseInt(heightInput.value) : undefined;

      if (width || height) {
        options.resize = {
          width,
          height,
          fit: (fitSelect?.value as any) || 'contain',
        };
      }

      // Format conversion
      const formatSelect = this.querySelector('#format') as HTMLSelectElement;
      const format = formatSelect?.value;
      if (format && format !== 'original') {
        options.convert = {
          format: format as any,
        };
      }

      // Quality
      const qualityInput = this.querySelector('#quality') as HTMLInputElement;
      const quality = qualityInput?.value ? parseInt(qualityInput.value) / 100 : undefined;
      if (quality) {
        if (options.convert) {
          options.convert.quality = quality;
        } else {
          options.optimize = { quality };
        }
      }

      // Process
      const input: BitInput = {
        type: 'file',
        data: this.currentFile,
      };

      const output = await imageBits.process(input, options);
      this.processedBlob = output.data as Blob;

      // Show preview
      if (this.previewImage && this.processedBlob) {
        const url = URL.createObjectURL(this.processedBlob);
        this.previewImage.src = url;
        this.preview?.classList.add('active');
      }

      // Show metadata
      if (this.previewInfo && output.metadata) {
        const metadata = output.metadata as any;
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

      // Show logs
      if (this.logs && output.logs) {
        this.logs.innerHTML = output.logs
          .map(log => `<div class="log-entry">${this.escapeHtml(log)}</div>`)
          .join('');
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

