/* Shared behaviors for project pages: nav scroll state, reveal-on-scroll,
   placeholder-link guard, footer year. Identity layer — same on every page. */
(function(){
  const nav = document.getElementById('nav');
  if (nav){
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 24);
    addEventListener('scroll', onScroll, {passive:true}); onScroll();
  }

  const io = new IntersectionObserver((entries)=>{
    for (const e of entries){ if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }
  }, {threshold:.14, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  document.querySelectorAll('[data-placeholder]').forEach(a=>{
    a.addEventListener('click', ev=>{ ev.preventDefault(); a.textContent = 'Link coming soon'; });
  });

  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
