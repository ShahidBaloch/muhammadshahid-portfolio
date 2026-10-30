// Fade-in on scroll for <Reveal> blocks (same thresholds and classes as the old React version).
const nodes = document.querySelectorAll<HTMLElement>(".reveal");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (reduced || !("IntersectionObserver" in window)) {
  nodes.forEach((n) => n.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        entry.target.classList.remove("reveal-pending");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  nodes.forEach((n) => {
    n.classList.add("reveal-pending");
    observer.observe(n);
  });
}
