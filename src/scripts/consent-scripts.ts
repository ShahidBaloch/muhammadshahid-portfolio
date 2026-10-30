// Loads Google Analytics and AdSense only after the visitor accepts cookies, and again whenever
// the choice changes (CookieConsent fires "cookie-consent-change"). Replaces the Analytics and
// AdSense components, which did the same with next/script.
import { ADSENSE_CLIENT_ID } from "@/lib/adsense";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { getStoredConsent } from "@/lib/consent";

let gaLoaded = false;
let adsLoaded = false;

function addScript(attrs: Record<string, string>, inline?: string) {
  const s = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  if (inline) s.text = inline;
  document.body.appendChild(s);
}

function loadAnalytics() {
  if (gaLoaded || !GA_MEASUREMENT_ID) return;
  gaLoaded = true;
  addScript({ src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`, async: "" });
  addScript(
    { id: "ga4-init" },
    `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });`,
  );
}

function loadAdSense() {
  if (adsLoaded || !ADSENSE_CLIENT_ID) return;
  adsLoaded = true;
  // "lazyOnload": after the page has loaded and the browser is idle.
  const add = () =>
    addScript({
      id: "adsense-loader",
      async: "",
      crossorigin: "anonymous",
      src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`,
    });
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(add) : setTimeout(add, 1));
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

function sync() {
  if (getStoredConsent() !== "accepted") return;
  loadAnalytics();
  loadAdSense();
}

sync();
window.addEventListener("cookie-consent-change", sync);
