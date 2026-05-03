/**
 * Desktop shell: parallax, anime.js entrances, draggable .window stacking, .desktop-icon → #window-*.
 * HTML/CSS conventions for new tools (icons, windows, modals): apps/web/UI_THEME.md
 */
import './styles.css'
import './components/gifbits'
import './components/imagebits'
import anime from 'animejs'
import {
  bakeTranslateIntoPercentAnchor,
  extractRotation,
  setDesktopAnchorFromViewportPx,
} from './desktopWindowAnchor'
import { attachTransformWindowResize } from './windowResize'

// Vite injects this from the root package.json at build time; see vite.config.ts.
declare const __ODDBITS_VERSION__: string;

document.addEventListener('DOMContentLoaded', () => {
  // Fill any [data-oddbits-version] slots (e.g. the <sup> in the hero h1).
  document.querySelectorAll<HTMLElement>('[data-oddbits-version]').forEach((el) => {
    el.textContent = `v${__ODDBITS_VERSION__}`;
  });

  // Parallax scroll effect
  const bgDistant = document.querySelector('.bg-layer.distant') as HTMLElement;
  const bgGrid = document.querySelector('.bg-layer.grid') as HTMLElement;
  
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    
    if (bgDistant) {
      bgDistant.style.transform = `translateY(${scrollY * 0.2}px)`;
    }
    
    if (bgGrid) {
      // Perspective is 500px, rotateX 60deg, scale 2 in CSS
      bgGrid.style.transform = `perspective(500px) rotateX(60deg) scale(2) translateY(${scrollY * 0.5}px)`;
      bgGrid.style.backgroundPosition = `center ${scrollY * 1.5}px`;
    }
  });

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
      if (!windowEl.style.width) windowEl.style.width = `${Math.round(anchoredRect.width)}px`;
      if (!windowEl.style.height) windowEl.style.height = `${Math.round(anchoredRect.height)}px`;
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
    const padX = Math.max(10, Math.round(iw * 0.02));
    const padY = Math.max(10, Math.round(ih * 0.02));
    /** Minimum gap between window frames when packing (non-overlap). */
    const margin = Math.max(6, Math.round(Math.min(iw, ih) * 0.01));

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
     * Preference order → placement order. Layout is column-major: fill top→bottom, then next column
     * left→right (read order). Vertical surplus is split evenly (margins + gaps), not row top-aligned.
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

    const rectHeight = (c: WindowController) => c.el.getBoundingClientRect().height;

    function splitIntoColumnsVerticalFill(items: WindowController[]): WindowController[][] {
      const cols: WindowController[][] = [];
      let cur: WindowController[] = [];
      for (const item of items) {
        const h = rectHeight(item);
        const sumExisting = cur.reduce((s, w) => s + rectHeight(w), 0);
        const newCount = cur.length + 1;
        const gapNeed = (newCount - 1) * minStackGap;
        if (cur.length > 0 && sumExisting + h + gapNeed > heightSpace) {
          cols.push(cur);
          cur = [];
        }
        cur.push(item);
      }
      if (cur.length) cols.push(cur);
      return cols;
    }

    const columns = splitIntoColumnsVerticalFill(ordered);

    const targets: { controller: WindowController; left: number; top: number }[] = [];

    /** Single column: equal vertical bands + minimum gaps between windows (no shared row baseline). */
    const layoutColumn = (columnItems: WindowController[], x: number, columnWidth: number) => {
      if (columnItems.length === 0) return;
      const n = columnItems.length;
      const heights = columnItems.map((c) => c.el.getBoundingClientRect().height);
      const totalH = heights.reduce((sum, h) => sum + h, 0);
      const reservedBetween = n > 1 ? (n - 1) * minStackGap : 0;
      const freeY = Math.max(0, heightSpace - totalH - reservedBetween);
      const verticalGutter = freeY / (n + 1);
      let y = topBound + verticalGutter;

      columnItems.forEach((controller, idx) => {
        const rect = controller.el.getBoundingClientRect();
        const maxY = bottomBound - rect.height;
        const nextTop = Math.max(topBound, Math.min(y, maxY));
        const centeredInColumn = x + Math.max(0, (columnWidth - rect.width) / 2);
        const nextLeft = Math.max(leftBound, Math.min(centeredInColumn, rightBound - rect.width));
        targets.push({ controller, left: Math.round(nextLeft), top: Math.round(nextTop) });
        const gapAfter = idx < n - 1 ? minStackGap + verticalGutter : verticalGutter;
        y = nextTop + rect.height + gapAfter;
      });
    };

    const colWidths = columns.map((col) =>
      col.length === 0 ? 0 : Math.max(...col.map((c) => c.el.getBoundingClientRect().width))
    );
    const nCols = columns.length;
    const totalInnerW =
      colWidths.reduce((a, w) => a + w, 0) + (nCols > 1 ? (nCols - 1) * columnGap : 0);
    const sidePad = Math.max(0, (widthSpace - totalInnerW) / 2);
    let xCol = leftBound + sidePad;
    for (let j = 0; j < nCols; j++) {
      const w = colWidths[j] ?? 0;
      const col = columns[j];
      if (col && col.length > 0) {
        layoutColumn(col, xCol, w);
        xCol += w + columnGap;
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

    positionWindowNearIcon(windowEl);

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
    }

    window.addEventListener('resize', () => {
      bakeTranslateIntoPercentAnchor(windowEl);
      const clamped = clampWindowTranslate(windowEl, 0, 0);
      xOffset = clamped.x;
      yOffset = clamped.y;
      applyDragTransform(xOffset, yOffset);
    });

    // Close button functionality
    const closeBtn = titlebar.querySelector('.window-btn:last-child');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        windowEl.style.display = 'none';
      });
    }
  });

  spreadWindowsOnLoad(windowControllers);

  // Desktop Icons functionality
  desktopIcons.forEach(icon => {
    icon.addEventListener('click', () => {
      const targetId = icon.getAttribute('data-target');
      if (targetId) {
        const targetWindow = document.getElementById(targetId);
        if (targetWindow) {
          targetWindow.style.display = 'flex';
          highestZIndex++;
          targetWindow.style.zIndex = highestZIndex.toString();
        }
      }
    });
  });
});
