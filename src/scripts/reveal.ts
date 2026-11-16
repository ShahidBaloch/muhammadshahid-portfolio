// Light fade-in for <Reveal> blocks. Content is never hidden for long: anything already on screen
// stays visible, and blocks below start fading in ~200px before they scroll into view, so fast
// scrolling never shows empty sections.
const nodes = document.querySelectorAll<HTMLElement>(".reveal");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduced || !("IntersectionObserver" in window)) {
  nodes.forEach((n) => n.classList.add("is-visible"));
} else {
  const fold = window.innerHeight;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0, rootMargin: "0px 0px 200px 0px" },
  );
  nodes.forEach((n) => {
    if (n.getBoundingClientRect().top < fold) {
      n.classList.add("is-visible");
      return;
    }
    n.classList.add("reveal-pending");
    observer.observe(n);
  });
}
