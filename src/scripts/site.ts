// Small site-wide behaviors that used to be React click handlers.
document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  if (target?.closest("[data-print]")) window.print();
  if (target?.closest("[data-cookie-settings]")) window.dispatchEvent(new Event("cookie-consent-open"));
});
