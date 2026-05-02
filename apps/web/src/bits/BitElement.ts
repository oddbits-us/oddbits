/**
 * BitElement — base class for Oddbits "bit" web components.
 *
 * Provides the generic surface infrastructure documented in apps/web/UI_THEME.md:
 *   - Static dialog z-index counter (shared across all bits)
 *   - Workshop dialog open / close / drag / resize / viewport-clamp / portal-to-body
 *   - Help dialog open / close / drag / resize
 *   - Alert/confirm modal portal + dirty-state close confirm
 *   - Escape key priority chain (alert → bit popover → help → workshop)
 *   - Document mousedown handler (bit popover/dropdown auto-dismiss)
 *   - Help launcher attachment (`?` and `How To` buttons inside the host desktop window)
 *   - Cleanup of all portaled elements + listeners on disconnect
 *
 * Subclasses MUST implement (abstract):
 *   - renderShell() ........... HTML for the entire bit (shell + workshop + help + confirm)
 *   - isWorkshopDirty() ....... true if workshop has unsaved work
 *   - resetWorkshopState() .... bit-specific cleanup, called inside closeWorkshop()
 *   - attachBitListeners() .... bit-specific event wiring
 *
 * Subclasses MAY override (optional hooks):
 *   - initializeBitElements()   query bit-specific element refs
 *   - onAcceptConfirmClose()    set abort flags before workshop closes
 *   - handleEscapePopover()     return true to claim Escape (bit popover dismissal)
 *   - onDocumentMouseDownBit()  dismiss bit popovers/dropdowns on outside click
 *   - onDisconnect()            revoke object URLs + bit-specific cleanup
 *   - getHostWindowSelector()   e.g. '#window-imagebits' for help-launcher discovery
 *   - getWorkshopMinSize() / getHelpMinSize()
 *
 * Required CSS classes / IDs in renderShell() output:
 *   - `.bit-shell` ............. root container the workshop returns to on close
 *   - `.bit-workshop` .......... workshop dialog (combine with `.window`)
 *   - `.bit-workshop-close` .... workshop X button
 *   - `.bit-drag-handle` ....... workshop titlebar (drag region)
 *   - `.bit-help-dialog` ....... help dialog (optional; combine with `.window`)
 *   - `.bit-help-close` ........ help dialog X button (optional)
 *   - `.bit-confirm-backdrop` .. alert/confirm modal backdrop (optional)
 *   - `.bit-confirm-cancel` .... cancel button inside the alert modal (optional)
 *   - `.bit-confirm-accept` .... accept button inside the alert modal (optional)
 *
 * Required CSS class on host desktop window (in apps/web/index.html):
 *   - `.bit-help-launch` ....... buttons that open the help dialog (optional)
 */

import { attachFixedWindowResize } from '../windowResize';

type DragState = { move: (e: MouseEvent) => void; up: () => void } | null;

export abstract class BitElement extends HTMLElement {
  /** Shared stacking order above desktop `.window` instances (those use ~100+). */
  protected static dialogZ = 400;

  // Generic refs (queried after renderShell())
  protected shell: HTMLElement | null = null;
  protected workshop: HTMLElement | null = null;
  protected helpDialog: HTMLElement | null = null;
  protected confirmBackdrop: HTMLElement | null = null;
  protected confirmCancelBtn: HTMLButtonElement | null = null;
  protected confirmAcceptBtn: HTMLButtonElement | null = null;

  // Drag state
  private workshopDrag: DragState = null;
  private workshopMousedown: ((e: MouseEvent) => void) | undefined;
  private helpDrag: DragState = null;
  private helpMousedown: ((e: MouseEvent) => void) | undefined;
  private helpLaunchers: HTMLElement[] = [];

  // Bound handlers (so add/removeEventListener match)
  private onEscapeBound = (e: KeyboardEvent) => this.handleEscape(e);
  private onDocumentMouseDownBound = (e: MouseEvent) => this.handleDocumentMouseDown(e);
  private onWorkshopResizeBound = () => this.clampWorkshopToViewport();
  private onHelpResizeBound = () => this.clampHelpToViewport();
  private onWorkshopMouseDownBound = () => this.raiseWorkshopZ();
  private onHelpMouseDownBound = () => this.raiseHelpZ();
  private onHelpLauncherMouseDownBound = (e: MouseEvent) => e.stopPropagation();
  private openHelpBound = () => this.openHelpDialog();

  // ====== abstract / overridable hooks ======

  /** Return the entire shell HTML. Called once in connectedCallback. */
  protected abstract renderShell(): string;

  /** Return true if the workshop has unsaved work that should prompt a confirm. */
  protected abstract isWorkshopDirty(): boolean;

  /** Bit-specific cleanup. Called from closeWorkshop() AFTER the generic teardown. */
  protected abstract resetWorkshopState(): void;

  /** Bit-specific event wiring. Called after generic listeners are attached. */
  protected abstract attachBitListeners(): void;

  /** Optional: query bit-specific refs. Called after generic refs are queried. */
  protected initializeBitElements(): void {}

  /** Optional: set abort flags before closeWorkshop() runs (e.g., stop running loops). */
  protected onAcceptConfirmClose(): void {}

  /** Optional: subclass returns true to claim Escape (e.g., dismiss its own popover). */
  protected handleEscapePopover(): boolean {
    return false;
  }

  /** Optional: dismiss bit popovers/dropdowns when user clicks outside them. */
  protected onDocumentMouseDownBit(_e: MouseEvent): void {}

  /** Optional: revoke object URLs and bit-specific cleanup on disconnect. */
  protected onDisconnect(): void {}

  /** Optional: selector for the host desktop window. Used to find `.bit-help-launch` buttons. */
  protected getHostWindowSelector(): string | null {
    return null;
  }

  /** Optional: minimum workshop dimensions during resize. */
  protected getWorkshopMinSize(): { width: number; height: number } {
    return { width: 360, height: 200 };
  }

  /** Optional: minimum help dialog dimensions during resize. */
  protected getHelpMinSize(): { width: number; height: number } {
    return { width: 360, height: 220 };
  }

  /**
   * Optional: bit version (typically the underlying npm package's `VERSION` export).
   * If provided, `BitElement` writes it into any `[data-bit-version]` placeholder
   * inside the host desktop window's titlebar.
   */
  protected getVersion(): string | null {
    return null;
  }

  // ====== lifecycle ======

  connectedCallback() {
    this.innerHTML = this.renderShell();
    this.initializeGenericElements();
    this.initializeBitElements();
    this.attachGenericListeners();
    this.attachBitListeners();
    this.inheritHostWindowStyling();
    if (this.confirmBackdrop) {
      document.body.appendChild(this.confirmBackdrop);
    }
    document.addEventListener('keydown', this.onEscapeBound);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onEscapeBound);
    document.removeEventListener('mousedown', this.onDocumentMouseDownBound);
    window.removeEventListener('resize', this.onWorkshopResizeBound);
    window.removeEventListener('resize', this.onHelpResizeBound);
    this.detachHelpLauncher();
    this.teardownWorkshopDrag();
    this.teardownHelpDrag();
    this.onDisconnect();
    if (this.workshop && document.body.contains(this.workshop)) {
      this.workshop.remove();
    }
    if (this.helpDialog && document.body.contains(this.helpDialog)) {
      this.helpDialog.remove();
    }
    if (this.confirmBackdrop && document.body.contains(this.confirmBackdrop)) {
      this.confirmBackdrop.remove();
    }
  }

  // ====== generic element discovery + listeners ======

  private initializeGenericElements() {
    this.shell = this.querySelector<HTMLElement>('.bit-shell');
    this.workshop = this.querySelector<HTMLElement>('.bit-workshop');
    this.helpDialog = this.querySelector<HTMLElement>('.bit-help-dialog');
    this.confirmBackdrop = this.querySelector<HTMLElement>('.bit-confirm-backdrop');
    this.confirmCancelBtn = this.querySelector<HTMLButtonElement>('.bit-confirm-cancel');
    this.confirmAcceptBtn = this.querySelector<HTMLButtonElement>('.bit-confirm-accept');
  }

  private attachGenericListeners() {
    const closeBtn = this.querySelector('.bit-workshop-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.requestCloseWorkshop());
    }
    const helpCloseBtn = this.querySelector('.bit-help-close');
    if (helpCloseBtn) {
      helpCloseBtn.addEventListener('click', () => this.closeHelpDialog());
    }
    if (this.confirmCancelBtn) {
      this.confirmCancelBtn.addEventListener('click', () => this.dismissConfirmClose());
    }
    if (this.confirmAcceptBtn) {
      this.confirmAcceptBtn.addEventListener('click', () => this.acceptConfirmClose());
    }
    if (this.confirmBackdrop) {
      this.confirmBackdrop.addEventListener('mousedown', (e) => {
        if (e.target === this.confirmBackdrop) {
          this.dismissConfirmClose();
        }
      });
    }
    document.addEventListener('mousedown', this.onDocumentMouseDownBound);
    this.attachHelpLauncher();
  }

  // ====== escape + document-mousedown chain ======

  private handleEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (this.confirmBackdrop && !this.confirmBackdrop.hidden) {
      this.dismissConfirmClose();
      return;
    }
    if (this.handleEscapePopover()) return;
    if (this.helpDialog && !this.helpDialog.hidden) {
      this.closeHelpDialog();
      return;
    }
    if (!this.workshop || this.workshop.hidden) return;
    this.requestCloseWorkshop();
  }

  private handleDocumentMouseDown(e: MouseEvent) {
    this.onDocumentMouseDownBit(e);
  }

  // ====== workshop dialog ======

  protected openWorkshop() {
    if (!this.workshop) return;
    /* Portal to body so position:fixed is viewport-relative; parent tool window uses transform. */
    if (this.workshop.parentElement !== document.body) {
      document.body.appendChild(this.workshop);
    }
    this.workshop.hidden = false;
    this.workshop.style.position = 'fixed';
    BitElement.dialogZ += 1;
    this.workshop.style.zIndex = String(BitElement.dialogZ);
    void this.workshop.offsetHeight;
    const rect = this.workshop.getBoundingClientRect();
    const left = Math.max(8, (window.innerWidth - rect.width) / 2);
    const top = Math.max(8, (window.innerHeight - rect.height) / 2);
    this.workshop.style.left = `${left}px`;
    this.workshop.style.top = `${top}px`;
    this.clampWorkshopToViewport();
    this.setupWorkshopDrag();
    const min = this.getWorkshopMinSize();
    attachFixedWindowResize(this.workshop, {
      clamp: () => this.clampWorkshopToViewport(),
      minWidth: min.width,
      minHeight: min.height,
    });
    this.workshop.addEventListener('mousedown', this.onWorkshopMouseDownBound);
    window.addEventListener('resize', this.onWorkshopResizeBound);
  }

  protected closeWorkshop() {
    if (!this.workshop) return;
    window.removeEventListener('resize', this.onWorkshopResizeBound);
    this.workshop.removeEventListener('mousedown', this.onWorkshopMouseDownBound);
    this.teardownWorkshopDrag();
    this.workshop.hidden = true;
    this.workshop.style.position = '';
    this.workshop.style.left = '';
    this.workshop.style.top = '';
    this.workshop.style.zIndex = '';
    if (this.shell && this.workshop.parentElement === document.body) {
      this.shell.appendChild(this.workshop);
    }
    this.resetWorkshopState();
  }

  private clampWorkshopToViewport() {
    const el = this.workshop;
    if (!el || el.hidden) return;
    const pad = 8;
    const dragHandle = el.querySelector<HTMLElement>('.bit-drag-handle');
    const bar = (dragHandle ?? el).getBoundingClientRect();
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

  private raiseWorkshopZ() {
    if (!this.workshop || this.workshop.hidden) return;
    BitElement.dialogZ += 1;
    this.workshop.style.zIndex = String(BitElement.dialogZ);
  }

  private setupWorkshopDrag() {
    this.teardownWorkshopDrag();
    const workshop = this.workshop;
    const titlebar = workshop?.querySelector<HTMLElement>('.bit-drag-handle');
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
      this.clampWorkshopToViewport();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.workshopDrag = null;
    };

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-btn')) return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const r = workshop.getBoundingClientRect();
      origLeft = r.left;
      origTop = r.top;
      BitElement.dialogZ += 1;
      workshop.style.zIndex = String(BitElement.dialogZ);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      this.workshopDrag = { move: onMove, up: onUp };
      e.preventDefault();
    };

    this.workshopMousedown = onDown;
    titlebar.addEventListener('mousedown', onDown);
  }

  private teardownWorkshopDrag() {
    const titlebar = this.workshop?.querySelector<HTMLElement>('.bit-drag-handle');
    if (titlebar && this.workshopMousedown) {
      titlebar.removeEventListener('mousedown', this.workshopMousedown);
    }
    this.workshopMousedown = undefined;
    if (this.workshopDrag) {
      document.removeEventListener('mousemove', this.workshopDrag.move);
      document.removeEventListener('mouseup', this.workshopDrag.up);
      this.workshopDrag = null;
    }
  }

  // ====== help dialog ======

  protected openHelpDialog() {
    if (!this.helpDialog) return;
    if (this.helpDialog.parentElement !== document.body) {
      document.body.appendChild(this.helpDialog);
    }
    this.helpDialog.hidden = false;
    this.helpDialog.style.position = 'fixed';
    BitElement.dialogZ += 1;
    this.helpDialog.style.zIndex = String(BitElement.dialogZ);
    void this.helpDialog.offsetHeight;
    const rect = this.helpDialog.getBoundingClientRect();
    const left = Math.max(8, (window.innerWidth - rect.width) / 2);
    const top = Math.max(8, (window.innerHeight - rect.height) / 2);
    this.helpDialog.style.left = `${left}px`;
    this.helpDialog.style.top = `${top}px`;
    this.clampHelpToViewport();
    this.setupHelpDrag();
    const min = this.getHelpMinSize();
    attachFixedWindowResize(this.helpDialog, {
      clamp: () => this.clampHelpToViewport(),
      minWidth: min.width,
      minHeight: min.height,
    });
    this.helpDialog.addEventListener('mousedown', this.onHelpMouseDownBound);
    window.addEventListener('resize', this.onHelpResizeBound);
  }

  protected closeHelpDialog() {
    if (!this.helpDialog) return;
    window.removeEventListener('resize', this.onHelpResizeBound);
    this.helpDialog.removeEventListener('mousedown', this.onHelpMouseDownBound);
    this.teardownHelpDrag();
    this.helpDialog.hidden = true;
    this.helpDialog.style.position = '';
    this.helpDialog.style.left = '';
    this.helpDialog.style.top = '';
    this.helpDialog.style.zIndex = '';
    if (this.shell && this.helpDialog.parentElement === document.body) {
      this.shell.appendChild(this.helpDialog);
    }
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

  private raiseHelpZ() {
    if (!this.helpDialog || this.helpDialog.hidden) return;
    BitElement.dialogZ += 1;
    this.helpDialog.style.zIndex = String(BitElement.dialogZ);
  }

  private setupHelpDrag() {
    this.teardownHelpDrag();
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
      this.helpDrag = null;
    };

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.window-btn')) return;
      if ((e.target as HTMLElement).closest('.window-resize-handle')) return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = help.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      BitElement.dialogZ += 1;
      help.style.zIndex = String(BitElement.dialogZ);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      this.helpDrag = { move: onMove, up: onUp };
      e.preventDefault();
    };

    this.helpMousedown = onDown;
    titlebar.addEventListener('mousedown', onDown);
  }

  private teardownHelpDrag() {
    const titlebar = this.helpDialog?.querySelector<HTMLElement>('.window-titlebar');
    if (titlebar && this.helpMousedown) {
      titlebar.removeEventListener('mousedown', this.helpMousedown);
    }
    this.helpMousedown = undefined;
    if (this.helpDrag) {
      document.removeEventListener('mousemove', this.helpDrag.move);
      document.removeEventListener('mouseup', this.helpDrag.up);
      this.helpDrag = null;
    }
  }

  // ====== help launchers (in host desktop window) ======

  private attachHelpLauncher() {
    this.detachHelpLauncher();
    const hostSelector = this.getHostWindowSelector();
    const hostWindow = hostSelector ? this.closest(hostSelector) : null;
    const launchers = hostWindow
      ? [...hostWindow.querySelectorAll<HTMLElement>('.bit-help-launch')]
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

  // ====== host window styling inheritance (.pop-* tint + titlebar icon) ======

  /**
   * Inherits the host desktop window's `.pop-*` tint and titlebar icon onto the
   * workshop + help dialog so related dialogs visually belong to their bit, and
   * fills in any `[data-bit-version]` placeholder in the host titlebar with
   * `getVersion()`. Auto-runs once in `connectedCallback`. Override
   * `getHostWindowSelector()` to point at the host `.window`.
   */
  private inheritHostWindowStyling() {
    const hostSelector = this.getHostWindowSelector();
    if (!hostSelector) return;
    const hostWindow = this.closest<HTMLElement>(hostSelector);
    if (!hostWindow) return;

    // Inherit .pop-* tint
    const popClass = [...hostWindow.classList].find((c) => /^pop-[a-z0-9-]+$/i.test(c));
    if (popClass) {
      this.workshop?.classList.add(popClass);
      this.helpDialog?.classList.add(popClass);
    }

    // Inherit titlebar icon
    const hostIcon = hostWindow.querySelector<HTMLElement>(
      '.window-titlebar .window-title-icon',
    );
    if (hostIcon) {
      this.injectTitleIcon(this.workshop, hostIcon);
      this.injectTitleIcon(this.helpDialog, hostIcon);
    }

    // Fill version placeholder(s) in the host titlebar
    const version = this.getVersion();
    if (version) {
      const slots = hostWindow.querySelectorAll<HTMLElement>(
        '.window-titlebar [data-bit-version]',
      );
      slots.forEach((slot) => {
        slot.textContent = version;
      });
    }
  }

  private injectTitleIcon(dialog: HTMLElement | null, hostIcon: HTMLElement) {
    if (!dialog) return;
    const titlebar = dialog.querySelector<HTMLElement>('.window-titlebar');
    if (!titlebar) return;
    if (titlebar.querySelector('.window-title-icon')) return;
    const titleText = titlebar.querySelector<HTMLElement>(':scope > span');
    if (!titleText) return;
    titleText.classList.add('window-title-text');
    const iconClone = hostIcon.cloneNode(true) as HTMLElement;
    titleText.insertBefore(iconClone, titleText.firstChild);
  }

  // ====== confirm modal (dirty-state close confirm) ======

  protected requestCloseWorkshop() {
    if (!this.workshop || this.workshop.hidden) return;
    if (this.isWorkshopDirty()) {
      this.openConfirmClose();
      return;
    }
    this.closeWorkshop();
  }

  protected openConfirmClose() {
    if (!this.confirmBackdrop) return;
    this.confirmBackdrop.hidden = false;
    if (this.confirmCancelBtn) {
      requestAnimationFrame(() => this.confirmCancelBtn?.focus());
    }
  }

  protected dismissConfirmClose() {
    if (!this.confirmBackdrop) return;
    this.confirmBackdrop.hidden = true;
  }

  protected acceptConfirmClose() {
    this.dismissConfirmClose();
    this.onAcceptConfirmClose();
    this.closeWorkshop();
  }
}
