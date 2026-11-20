import {
  getStoredConsent,
  storeConsent,
  updateGoogleConsent,
  type ConsentChoice,
} from "@/lib/consent";

function applyChoice(choice: ConsentChoice, banner: HTMLElement) {
  storeConsent(choice);
  updateGoogleConsent(choice === "accepted");
  banner.hidden = true;
  document.documentElement.style.removeProperty("--cookie-banner-space");
  window.dispatchEvent(new CustomEvent("cookie-consent-change", { detail: choice }));
}

const banner = document.getElementById("cookie-consent");
if (banner) {
  const stored = getStoredConsent();
  if (stored) {
    updateGoogleConsent(stored === "accepted");
    banner.hidden = true;
  } else {
    banner.hidden = false;
    const syncHeight = () => {
      document.documentElement.style.setProperty("--cookie-banner-space", `${banner.offsetHeight + 8}px`);
    };
    syncHeight();
    new ResizeObserver(syncHeight).observe(banner);
  }

  banner.querySelectorAll<HTMLButtonElement>("[data-consent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.consent as ConsentChoice;
      if (choice === "accepted" || choice === "rejected") applyChoice(choice, banner);
    });
  });

  window.addEventListener("cookie-consent-open", () => {
    banner.hidden = false;
    document.documentElement.style.setProperty(
      "--cookie-banner-space",
      `${banner.offsetHeight + 8}px`,
    );
  });
}