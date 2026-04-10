// Copy buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
  const originalSvg = btn.cloneNode(true);
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.textContent = '';
      const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkSvg.setAttribute('width', '14');
      checkSvg.setAttribute('height', '14');
      checkSvg.setAttribute('viewBox', '0 0 24 24');
      checkSvg.setAttribute('fill', 'none');
      checkSvg.setAttribute('stroke', 'currentColor');
      checkSvg.setAttribute('stroke-width', '2');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', '20,6 9,17 4,12');
      checkSvg.appendChild(polyline);
      btn.appendChild(checkSvg);
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = '';
        Array.from(originalSvg.childNodes).forEach(n => btn.appendChild(n.cloneNode(true)));
      }, 2000);
    } catch {}
  });
});

// Mobile nav toggle
const toggle = document.querySelector('.nav-mobile-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}

// Scroll-based nav background
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    nav.style.borderBottomColor = 'rgba(255,255,255,0.08)';
  } else {
    nav.style.borderBottomColor = 'rgba(255,255,255,0.04)';
  }
}, { passive: true });

// Reveal on scroll
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.feature-card, .install-step, .ide-card, .contribute-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

const style = document.createElement('style');
style.textContent = '.revealed { opacity: 1 !important; transform: translateY(0) !important; }';
document.head.appendChild(style);

// Stagger animation for grid items
document.querySelectorAll('.features-grid, .ides-grid, .contribute-grid').forEach(grid => {
  const items = grid.children;
  Array.from(items).forEach((item, i) => {
    item.style.transitionDelay = `${i * 0.08}s`;
  });
});
