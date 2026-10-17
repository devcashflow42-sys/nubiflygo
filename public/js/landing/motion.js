'use strict';
/* Estado del scroll: una sola lectura por cuadro; las revelaciones se ejecutan una vez. */
(function () {
  var nav = document.querySelector('header.nav');
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  var sections = links.map(function (link) {
    return { link: link, target: document.getElementById(link.getAttribute('href').slice(1)) };
  }).filter(function (entry) { return entry.target; });
  var queued = false;

  function updateScrollState() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;
    if (nav) nav.classList.toggle('is-scrolled', y > 12);
    var current = null;
    var offset = (nav ? nav.getBoundingClientRect().height : 0) + 110;
    sections.forEach(function (entry) {
      if (entry.target.getBoundingClientRect().top <= offset) current = entry;
    });
    sections.forEach(function (entry) {
      if (entry === current) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    });
  }
  function queueScrollState() {
    if (!queued) { queued = true; window.requestAnimationFrame(updateScrollState); }
  }
  window.addEventListener('scroll', queueScrollState, { passive: true });
  window.addEventListener('resize', queueScrollState, { passive: true });
  window.addEventListener('load', queueScrollState, { once: true });
  updateScrollState();

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var selector = '#features .sec-head, #features .card, #api .api-copy, #api .console, ' +
    '#why .sec-head, #why .why-item, #reviews .sec-head, #pricing .sec-head, ' +
    '#pricing .plan, #faq .sec-head, #faq .faq-wrap, #cta .cta-band';
  var elements = Array.prototype.slice.call(document.querySelectorAll(selector));
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('is-reveal-pending');
      entry.target.classList.add('is-reveal-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0.08 });

  elements.forEach(function (element, index) {
    var rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight * .92) return;
    element.style.setProperty('--reveal-delay', ((index % 4) * 35) + 'ms');
    element.classList.add('is-reveal-pending');
    observer.observe(element);
  });
})();
