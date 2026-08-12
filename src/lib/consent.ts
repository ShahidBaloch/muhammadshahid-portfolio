export const CONSENT_STORAGE_KEY = "cookie-consent";

export type ConsentChoice = "accepted" | "rejected";

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(CONSENT_STORAGE_KEY);
  if (value === "accepted" || value === "rejected") return value;
  return null;
}

export function storeConsent(choice: ConsentChoice): void {
  localStorage.setItem(CONSENT_STORAGE_KEY, choice);
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === "accepted";
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function updateGoogleConsent(granted: boolean): void {
  if (typeof window === "undefined" || !window.gtag) return;

  const status = granted ? "granted" : "denied";
  window.gtag("consent", "update", {
    analytics_storage: status,
    ad_storage: status,
    ad_user_data: status,
    ad_personalization: status,
  });
}
