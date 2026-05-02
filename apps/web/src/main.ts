import './styles.css'
import './components/imagebits'
import anime from 'animejs'

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

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, windowEl);
      }
    }

    function dragEnd() {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    }

    function setTranslate(xPos: number, yPos: number, el: HTMLElement) {
      // Preserve existing transform (like rotation) if any
      const currentTransform = el.style.transform;
      const rotationMatch = currentTransform.match(/rotate\([^)]+\)/);
      const rotation = rotationMatch ? rotationMatch[0] : '';
      
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0) ${rotation}`;
    }

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
