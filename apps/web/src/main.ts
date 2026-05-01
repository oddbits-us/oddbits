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
});
