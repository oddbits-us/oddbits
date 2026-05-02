/**
 * Desktop shell: parallax, anime.js entrances, draggable .window stacking, .desktop-icon → #window-*.
 * HTML/CSS conventions for new tools (icons, windows, modals): apps/web/UI_THEME.md
 */
import './styles.css'
import './components/imagebits'
import anime from 'animejs'
import { attachTransformWindowResize } from './windowResize'

document.addEventListener('DOMContentLoaded', () => {
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

  function clampWindowTranslate(el: HTMLElement, x: number, y: number): { x: number; y: number } {
    const pad = 8;
    const rotationMatch = el.style.transform.match(/rotate\([^)]+\)/);
    const rotation = rotationMatch ? rotationMatch[0] : '';
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

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    function applyDragTransform(xPos: number, yPos: number) {
      const rotationMatch = windowEl.style.transform.match(/rotate\([^)]+\)/);
      const rotation = rotationMatch ? rotationMatch[0] : '';
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
      const clamped = clampWindowTranslate(windowEl, xOffset, yOffset);
      xOffset = clamped.x;
      yOffset = clamped.y;
      applyDragTransform(xOffset, yOffset);
      isDragging = false;
    }

    window.addEventListener('resize', () => {
      const clamped = clampWindowTranslate(windowEl, xOffset, yOffset);
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

  // Desktop Icons functionality
  const desktopIcons = document.querySelectorAll('.desktop-icon');
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
