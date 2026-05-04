/**
 * Desktop shell: anime.js entrances, draggable .window stacking, .desktop-icon → #window-*.
 * HTML/CSS conventions for new tools (icons, windows, modals): apps/web/UI_THEME.md
 */
import './styles.css'
import './components/gifbits'
import './components/imagebits'
import { mountDesktopBackgroundFx } from './desktopBackgroundFx'
import anime from 'animejs'
import {
  bakeTranslateIntoPercentAnchor,
  extractRotation,
  setDesktopAnchorFromViewportPx,
} from './desktopWindowAnchor'
import {
  applyLastKnownAnchorsOnly,
  applyWindowState,
  captureDesktopLayout,
  clearDesktopLayout,
  loadDesktopLayout,
  saveDesktopLayout,
  savedStateHasAnchors,
  type SavedDesktopLayout,
} from './desktopLayoutStorage'
import { attachTransformWindowResize, measureDesktopWindowNaturalHeight } from './windowResize'

// Vite injects this from the root package.json at build time; see vite.config.ts.
declare const __ODDBITS_VERSION__: string;

document.addEventListener('DOMContentLoaded', () => {
  // Fill any [data-oddbits-version] slots (e.g. the <sup> in the hero h1).
  document.querySelectorAll<HTMLElement>('[data-oddbits-version]').forEach((el) => {
    el.textContent = `v${__ODDBITS_VERSION__}`;
  });

  // CRT background effect (WebGPU + CSS fallback). Toggle via the .desktop-crt-btn,
  // Alt+Shift+B, ?crt=0|1 URL flag, or window.__oddbitsCrt.
  mountDesktopBackgroundFx();

  // Entrance animations
  anime({
    targets: '.anime-header',
    translateY: [-50, 0],
    opacity: [0, 1],
    duration: 1000,
    easing: 'easeOutElastic(1, .8)'
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        
        anime({
          targets: entry.target.querySelectorAll('.anime-item'),
          translateY: [30, 0],
          opacity: [0, 1],
          delay: anime.stagger(150),
          duration: 800,
          easing: 'easeOutElastic(1, .8)'
        });
        
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.anime-section').forEach(section => {
    // Initial state
    section.querySelectorAll('.anime-item').forEach((item: any) => {
      item.style.opacity = '0';
    });
    observer.observe(section);
  });

  // Draggable Windows
  let highestZIndex = 100;
  const windows = document.querySelectorAll('.window.draggable');
  const desktopIcons = document.querySelectorAll('.desktop-icon');

  type WindowController = {
    el: HTMLElement;
    getOffset: () => { x: number; y: number };
    setOffset: (x: number, y: number) => void;
  };
  const windowControllers: WindowController[] = [];

  let saveLayoutTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSaveDesktopLayout() {
    if (saveLayoutTimer) clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(() => {
      saveLayoutTimer = null;
      saveDesktopLayout(captureDesktopLayout());
    }, 350);
  }

  const savedLayout: SavedDesktopLayout | null = loadDesktopLayout();
  const useSavedLayout =
    savedLayout != null &&
    Object.values(savedLayout.windows).some((st) => savedStateHasAnchors(st));

  function positionWindowNearIcon(windowEl: HTMLElement) {
    const icon = document.querySelector(`.desktop-icon[data-target="${windowEl.id}"]`) as HTMLElement | null;
    if (!icon) return;

    if (windowEl.style.bottom || windowEl.style.right) {
      const anchoredRect = windowEl.getBoundingClientRect();
      setDesktopAnchorFromViewportPx(
        Math.round(anchoredRect.left),
        Math.round(anchoredRect.top),
        windowEl
      );
      /** Width/height must be measured after bottom/right are cleared — otherwise `width: auto` spans the row between anchors and the rect is falsely huge. */
      void windowEl.offsetHeight;
      const afterAnchor = windowEl.getBoundingClientRect();
      if (!windowEl.style.width) windowEl.style.width = `${Math.round(afterAnchor.width)}px`;
      if (!windowEl.style.height) windowEl.style.height = `${Math.round(afterAnchor.height)}px`;
    }

    const iconRect = icon.getBoundingClientRect();
    const windowRect = windowEl.getBoundingClientRect();
    const pad = 10;
    const nextLeft = iconRect.right + 18;
    const nextTop = iconRect.top - 4;

    const clampedLeft = Math.max(pad, Math.min(nextLeft, window.innerWidth - windowRect.width - pad));
    const clampedTop = Math.max(pad, Math.min(nextTop, window.innerHeight - windowRect.height - pad));

    setDesktopAnchorFromViewportPx(Math.round(clampedLeft), Math.round(clampedTop), windowEl);
  }

  function spreadWindowsOnLoad(controllers: WindowController[]) {
    if (controllers.length === 0) return;

    const iw = window.innerWidth;
    const ih = window.innerHeight;
    /** Same idea as CSS vmin/vmax: scale margins off the shorter/longer viewport edge. */
    const vmin = Math.min(iw, ih);
    const vmax = Math.max(iw, ih);
    const isLandscape = iw >= ih;
    /**
     * Landscape: more top/bottom breathing room, tighter side padding so packing uses horizontal space
     * (also shrinks heightSpace → comfort split favors extra columns). Portrait: opposite tilt.
     */
    let padX: number;
    let padY: number;
    if (isLandscape) {
      const t = Math.min(Math.max(iw / ih - 1, 0) / 1.25, 1);
      padX = Math.max(8, Math.round(vmin * (0.013 - 0.005 * t)));
      padY = Math.max(
        10,
        Math.round(vmin * (0.02 + 0.022 * t) + vmax * 0.007 * t)
      );
    } else {
      const t = Math.min(Math.max(ih / iw - 1, 0) / 1.25, 1);
      padX = Math.max(10, Math.round(vmin * (0.02 + 0.012 * t)));
      padY = Math.max(8, Math.round(vmin * (0.022 - 0.008 * t)));
    }
    /** Minimum gap between window frames when packing (non-overlap). */
    const margin = Math.max(6, Math.round(vmin * 0.01));

    const badgeStrip = document.querySelector('.site-badge-strip') as HTMLElement | null;
    const badgeH = badgeStrip?.getBoundingClientRect().height ?? 44;
    const bottomReserve = badgeH + Math.max(6, Math.round(ih * 0.008));

    const iconGutter = 18;
    const iconRight = [...desktopIcons].reduce((max, icon) => {
      const r = (icon as HTMLElement).getBoundingClientRect();
      return Math.max(max, r.right);
    }, 0);
    let leftBound = iconRight > 0 ? iconRight + iconGutter : padX;
    const rightBound = iw - padX;
    const topBound = padY;
    const bottomBound = ih - padY - bottomReserve;
    if (rightBound - leftBound < 120) leftBound = padX;

    const visible = controllers.filter((c) => c.el.style.display !== 'none');
    if (visible.length === 0) return;

    /**
     * Preference order → placement order. Column-major fill, then rebalance tall→short columns
     * (move bottom of overloaded column to top of next). Horizontal slack widens inter-column gaps
     * on large viewports; small screens stay centered.
     */
    const PREFERRED_SPREAD_ORDER = [
      'window-oddbits',
      'window-docs',
      'window-imagebits',
      'window-gifbits',
      'window-comingsoon',
      'window-about',
    ] as const;
    const spreadRank = new Map<string, number>(
      PREFERRED_SPREAD_ORDER.map((id, i) => [id, i] as [string, number])
    );
    const ordered = [...visible].sort((a, b) => {
      const ra = spreadRank.get(a.el.id) ?? 1000;
      const rb = spreadRank.get(b.el.id) ?? 1000;
      if (ra !== rb) return ra - rb;
      return a.el.id.localeCompare(b.el.id);
    });

    const preferenceIndex = new Map<WindowController, number>(
      ordered.map((c, i) => [c, i])
    );

    const widthSpace = Math.max(1, rightBound - leftBound);
    const heightSpace = Math.max(1, bottomBound - topBound);
    const columnGap = Math.max(margin, Math.round(iw * 0.015));
    const minStackGap = margin;
    /** Prefer more columns when vertical slack per band would fall below this (if width allows). */
    const minComfortGutter = Math.max(minStackGap, Math.round(ih * 0.012));
    /** Extra vertical space above first / below last band vs between-window bands (layoutColumn only). */
    const GUTTER_OUTER_WEIGHT = 1.35;
    const GUTTER_INNER_WEIGHT = 1;

    const rectHeight = (c: WindowController) => c.el.getBoundingClientRect().height;
    const rectWidth = (c: WindowController) => c.el.getBoundingClientRect().width;

    function colMaxWidth(col: WindowController[]): number {
      return col.length === 0 ? 0 : Math.max(...col.map((c) => rectWidth(c)));
    }

    function totalGridWidth(columnList: WindowController[][]): number {
      if (columnList.length === 0) return 0;
      let w = 0;
      for (let i = 0; i < columnList.length; i++) {
        w += colMaxWidth(columnList[i]!);
        if (i < columnList.length - 1) w += columnGap;
      }
      return w;
    }

    /** Uniform freeY/(n+1) — matches pre-weighted layout so comfort split aligns with packing. */
    function uniformVerticalGutter(curCol: WindowController[], addItem: WindowController): number {
      const n = curCol.length + 1;
      const heights = [...curCol.map(rectHeight), rectHeight(addItem)];
      const totalH = heights.reduce((s, h) => s + h, 0);
      const reservedBetween = n > 1 ? (n - 1) * minStackGap : 0;
      const freeY = Math.max(0, heightSpace - totalH - reservedBetween);
      return freeY / (n + 1);
    }

    function comfortFitsHorizontally(
      finishedCols: WindowController[][],
      curCol: WindowController[],
      item: WindowController
    ): boolean {
      return totalGridWidth([...finishedCols, curCol, [item]]) <= widthSpace;
    }

    function splitIntoColumnsVerticalFill(items: WindowController[]): WindowController[][] {
      const cols: WindowController[][] = [];
      let cur: WindowController[] = [];

      for (const item of items) {
        const h = rectHeight(item);

        if (cur.length === 0) {
          cur.push(item);
          continue;
        }

        let sumExisting = cur.reduce((s, w) => s + rectHeight(w), 0);
        let newCount = cur.length + 1;
        let gapNeed = (newCount - 1) * minStackGap;

        if (sumExisting + h + gapNeed > heightSpace) {
          cols.push(cur);
          cur = [item];
          continue;
        }

        const vGutter = uniformVerticalGutter(cur, item);
        const tight =
          vGutter < minComfortGutter && cur.length > 0 && comfortFitsHorizontally(cols, cur, item);

        if (tight) {
          cols.push(cur);
          cur = [item];
        } else {
          cur.push(item);
        }
      }

      if (cur.length) cols.push(cur);
      return cols;
    }

    /** Column-major flatten order must stay equal to `ordered`; only move last(i) → front(i+1). */
    function columnFitsInHeightSpace(col: WindowController[]): boolean {
      if (col.length === 0) return true;
      const th = col.reduce((s, c) => s + rectHeight(c), 0);
      const gaps = col.length > 1 ? (col.length - 1) * minStackGap : 0;
      return th + gaps <= heightSpace;
    }

    /**
     * If a column is much taller than the next, move the bottom window to the top of the next column
     * (when heights allow). Fixes e.g. [2,3,1] → [2,2,2]. Requires imbalance ≥2 to avoid 3↔2 oscillation.
     */
    function rebalanceColumnsAdjacent(cols: WindowController[][]): void {
      for (let round = 0; round < 50; round++) {
        let changed = false;
        for (let i = 0; i < cols.length - 1; i++) {
          const left = cols[i]!;
          const right = cols[i + 1]!;
          if (left.length <= 1) continue;
          if (left.length <= right.length + 1) continue;

          const moved = left[left.length - 1]!;
          left.pop();
          right.unshift(moved);
          if (columnFitsInHeightSpace(left) && columnFitsInHeightSpace(right)) {
            changed = true;
          } else {
            right.shift();
            left.push(moved);
          }
        }
        if (!changed) break;
      }
    }

    const columns = splitIntoColumnsVerticalFill(ordered);
    rebalanceColumnsAdjacent(columns);

    const targets: { controller: WindowController; left: number; top: number }[] = [];

    /** Distribute freeY with heavier top/bottom bands for optical breathing room. */
    function splitFreeYWeighted(n: number, freeY: number): number[] {
      if (n <= 0) return [];
      const weights: number[] =
        n === 1
          ? [GUTTER_OUTER_WEIGHT, GUTTER_OUTER_WEIGHT]
          : [
              GUTTER_OUTER_WEIGHT,
              ...Array(n - 1).fill(GUTTER_INNER_WEIGHT),
              GUTTER_OUTER_WEIGHT,
            ];
      const sumW = weights.reduce((a, b) => a + b, 0);
      return weights.map((w) => (freeY * w) / sumW);
    }

    /** Single column: min gaps + weighted surplus vertical bands. */
    const layoutColumn = (columnItems: WindowController[], x: number, columnWidth: number) => {
      if (columnItems.length === 0) return;
      const n = columnItems.length;
      const heights = columnItems.map((c) => c.el.getBoundingClientRect().height);
      const totalH = heights.reduce((sum, h) => sum + h, 0);
      const reservedBetween = n > 1 ? (n - 1) * minStackGap : 0;
      const freeY = Math.max(0, heightSpace - totalH - reservedBetween);
      const slots = splitFreeYWeighted(n, freeY);
      let y = topBound + (slots[0] ?? 0);

      columnItems.forEach((controller, idx) => {
        const rect = controller.el.getBoundingClientRect();
        const maxY = bottomBound - rect.height;
        const nextTop = Math.max(topBound, Math.min(y, maxY));
        const centeredInColumn = x + Math.max(0, (columnWidth - rect.width) / 2);
        const nextLeft = Math.max(leftBound, Math.min(centeredInColumn, rightBound - rect.width));
        targets.push({ controller, left: Math.round(nextLeft), top: Math.round(nextTop) });
        const gapAfter =
          idx < n - 1
            ? minStackGap + (slots[idx + 1] ?? 0)
            : (slots[idx + 1] ?? 0);
        y = nextTop + rect.height + gapAfter;
      });
    };

    const colWidths = columns.map((col) =>
      col.length === 0 ? 0 : Math.max(...col.map((c) => c.el.getBoundingClientRect().width))
    );
    const nCols = columns.length;
    const totalInnerW =
      colWidths.reduce((a, w) => a + w, 0) + (nCols > 1 ? (nCols - 1) * columnGap : 0);
    const slack = Math.max(0, widthSpace - totalInnerW);
    /**
     * Roomy viewports: split slack evenly across left pad, each inter-column gap, and right pad
     * (nCols+1 bands) so columns are not pinned to edges with huge internal voids. Tight viewports:
     * symmetric center bunching.
     */
    const spreadHorizontal =
      nCols > 1 &&
      slack >= Math.max(16, vmin * 0.035) &&
      widthSpace >= vmin * 1.12;

    let sidePad: number;
    let gapBetween: number;
    if (spreadHorizontal && nCols > 0) {
      const perBand = slack / (nCols + 1);
      sidePad = perBand;
      gapBetween = columnGap + perBand;
    } else {
      sidePad = Math.max(0, (widthSpace - totalInnerW) / 2);
      gapBetween = columnGap;
    }

    let xCol = leftBound + sidePad;
    for (let j = 0; j < nCols; j++) {
      const w = colWidths[j] ?? 0;
      const col = columns[j];
      if (col && col.length > 0) {
        layoutColumn(col, xCol, w);
        xCol += w + (j < nCols - 1 ? gapBetween : 0);
      }
    }

    targets.forEach(({ controller, left, top }, i) => {
      const rect = controller.el.getBoundingClientRect();
      const current = controller.getOffset();
      const targetX = current.x + (left - rect.left);
      const targetY = current.y + (top - rect.top);

      anime({
        targets: current,
        x: targetX,
        y: targetY,
        duration: 680,
        delay: (preferenceIndex.get(controller) ?? i) * 24,
        easing: 'easeOutQuint',
        update: () => {
          controller.setOffset(current.x, current.y);
        },
        complete: () => {
          bakeTranslateIntoPercentAnchor(controller.el);
          controller.setOffset(0, 0);
          scheduleSaveDesktopLayout();
        },
      });
    });
  }

  function clampWindowTranslate(el: HTMLElement, x: number, y: number): { x: number; y: number } {
    const pad = 8;
    const rotation = extractRotation(el.style.transform);
    let nx = x;
    let ny = y;
    for (let i = 0; i < 5; i++) {
      el.style.transform = `translate3d(${nx}px, ${ny}px, 0) ${rotation}`;
      const titlebar = el.querySelector<HTMLElement>('.window-titlebar');
      const rect = titlebar?.getBoundingClientRect() ?? el.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (rect.left < pad) dx += pad - rect.left;
      if (rect.top < pad) dy += pad - rect.top;
      if (rect.right > window.innerWidth - pad) dx -= rect.right - (window.innerWidth - pad);
      if (rect.bottom > window.innerHeight - pad) dy -= rect.bottom - (window.innerHeight - pad);
      if (dx === 0 && dy === 0) break;
      nx += dx;
      ny += dy;
    }
    return { x: nx, y: ny };
  }

  windows.forEach((win) => {
    const windowEl = win as HTMLElement;
    const titlebar = windowEl.querySelector('.window-titlebar') as HTMLElement;
    
    if (!titlebar) return;

    const savedWin = savedLayout?.windows[windowEl.id];
    if (useSavedLayout && savedWin && savedStateHasAnchors(savedWin)) {
      applyWindowState(windowEl, savedWin);
    } else {
      positionWindowNearIcon(windowEl);
    }

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    function applyDragTransform(xPos: number, yPos: number) {
      const rotation = extractRotation(windowEl.style.transform);
      windowEl.style.transform = `translate3d(${xPos}px, ${yPos}px, 0) ${rotation}`;
    }

    attachTransformWindowResize(windowEl, {
      getOffset: () => ({ x: xOffset, y: yOffset }),
      applyTransform: (x, y) => {
        xOffset = x;
        yOffset = y;
        applyDragTransform(xOffset, yOffset);
      },
      getMinHeight: () => measureDesktopWindowNaturalHeight(windowEl),
      afterResize: () => {
        const clamped = clampWindowTranslate(windowEl, xOffset, yOffset);
        xOffset = clamped.x;
        yOffset = clamped.y;
        applyDragTransform(xOffset, yOffset);
        bakeTranslateIntoPercentAnchor(windowEl);
        const clamped2 = clampWindowTranslate(windowEl, 0, 0);
        xOffset = clamped2.x;
        yOffset = clamped2.y;
        applyDragTransform(xOffset, yOffset);
        scheduleSaveDesktopLayout();
      },
    });

    windowControllers.push({
      el: windowEl,
      getOffset: () => ({ x: xOffset, y: yOffset }),
      setOffset: (x, y) => {
        const clamped = clampWindowTranslate(windowEl, x, y);
        xOffset = clamped.x;
        yOffset = clamped.y;
        applyDragTransform(xOffset, yOffset);
      },
    });

    // Bring to front on click
    windowEl.addEventListener('mousedown', () => {
      highestZIndex++;
      windowEl.style.zIndex = highestZIndex.toString();
      scheduleSaveDesktopLayout();
    });

    titlebar.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e: MouseEvent) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === titlebar || titlebar.contains(e.target as Node)) {
        isDragging = true;
      }
    }

    function drag(e: MouseEvent) {
      if (isDragging) {
        e.preventDefault();
        
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        const clamped = clampWindowTranslate(windowEl, currentX, currentY);
        xOffset = clamped.x;
        yOffset = clamped.y;

        applyDragTransform(xOffset, yOffset);
      }
    }

    function dragEnd() {
      if (!isDragging) return;
      const clamped = clampWindowTranslate(windowEl, xOffset, yOffset);
      xOffset = clamped.x;
      yOffset = clamped.y;
      applyDragTransform(xOffset, yOffset);
      bakeTranslateIntoPercentAnchor(windowEl);
      xOffset = 0;
      yOffset = 0;
      isDragging = false;
      scheduleSaveDesktopLayout();
    }

    window.addEventListener('resize', () => {
      bakeTranslateIntoPercentAnchor(windowEl);
      const clamped = clampWindowTranslate(windowEl, 0, 0);
      xOffset = clamped.x;
      yOffset = clamped.y;
      applyDragTransform(xOffset, yOffset);
      scheduleSaveDesktopLayout();
    });

    // Close button functionality
    const closeBtn = titlebar.querySelector('.window-btn:last-child');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        windowEl.style.display = 'none';
        saveDesktopLayout(captureDesktopLayout());
      });
    }
  });

  if (useSavedLayout && savedLayout) {
    let mz = 100;
    for (const st of Object.values(savedLayout.windows)) {
      const z = parseInt(st.zIndex, 10);
      if (!Number.isNaN(z)) mz = Math.max(mz, z);
    }
    highestZIndex = mz;
    windowControllers.forEach((ctrl) => {
      bakeTranslateIntoPercentAnchor(ctrl.el);
      const c = clampWindowTranslate(ctrl.el, 0, 0);
      ctrl.setOffset(c.x, c.y);
    });
    scheduleSaveDesktopLayout();
  } else {
    spreadWindowsOnLoad(windowControllers);
  }

  const autoLayoutBtn = document.querySelector('.desktop-autolayout-btn');
  if (autoLayoutBtn) {
    autoLayoutBtn.addEventListener('click', () => {
      clearDesktopLayout();
      if (saveLayoutTimer) {
        clearTimeout(saveLayoutTimer);
        saveLayoutTimer = null;
      }
      windowControllers.forEach((ctrl) => {
        ctrl.el.style.display = 'flex';
        ctrl.el.style.width = '';
        ctrl.el.style.height = '';
        ctrl.el.style.maxWidth = '';
        positionWindowNearIcon(ctrl.el);
        bakeTranslateIntoPercentAnchor(ctrl.el);
        const c = clampWindowTranslate(ctrl.el, 0, 0);
        ctrl.setOffset(c.x, c.y);
      });
      spreadWindowsOnLoad(windowControllers);
    });
  }

  window.addEventListener('beforeunload', () => {
    saveDesktopLayout(captureDesktopLayout());
  });

  // Desktop Icons functionality
  desktopIcons.forEach(icon => {
    icon.addEventListener('click', () => {
      const targetId = icon.getAttribute('data-target');
      if (!targetId) return;
      const targetWindow = document.getElementById(targetId);
      if (!targetWindow || !(targetWindow instanceof HTMLElement)) return;

      const latest = loadDesktopLayout();
      const st = latest?.windows[targetId];
      if (st) {
        applyLastKnownAnchorsOnly(targetWindow, st);
      }

      targetWindow.style.display = 'flex';
      highestZIndex++;
      targetWindow.style.zIndex = highestZIndex.toString();

      const ctrl = windowControllers.find((c) => c.el.id === targetId);
      if (ctrl) {
        bakeTranslateIntoPercentAnchor(ctrl.el);
        const c = clampWindowTranslate(ctrl.el, 0, 0);
        ctrl.setOffset(c.x, c.y);
      }

      scheduleSaveDesktopLayout();
    });
  });
});
