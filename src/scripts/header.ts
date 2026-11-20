/** Scroll state + close mobile menu on in-panel navigation (no Preact). */
const header = document.querySelector<HTMLElement>("[data-site-header]");
if (header) {
  const syncScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  syncScroll();
  window.addEventListener("scroll", syncScroll, { passive: true });
}

document.querySelectorAll(".mobile-nav-details a[href]").forEach((link) => {
  link.addEventListener("click", () => {
    const details = link.closest<HTMLDetailsElement>(".mobile-nav-details");
    if (details) details.open = false;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll<HTMLDetailsElement>(".mobile-nav-details[open], .nav-topics-details[open]").forEach((el) => {
    el.open = false;
  });
});

document.addEventListener("click", (event) => {
  const target = event.target as Node | null;
  document.querySelectorAll<HTMLDetailsElement>(".nav-topics-details[open], .mobile-nav-details[open]").forEach((el) => {
    if (target && !el.contains(target)) el.open = false;
  });
});