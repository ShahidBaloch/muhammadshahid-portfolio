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

let adsterraLoaded = false;

// Adsterra units on blog posts. Each slot is filled only when it scrolls near the viewport,
// after the page has loaded, so ads never block rendering or hurt Core Web Vitals.
function fillAdsterraSlot(el: HTMLElement) {
  const banner = el.dataset.adsterraBanner;
  const native = el.dataset.adsterraNative;
  if (banner) {
    if (el.offsetParent === null) return; // hidden at this screen size
    const w = el.dataset.w ?? "0";
    const h = el.dataset.h ?? "0";
    const frame = document.createElement("iframe");
    frame.width = w;
    frame.height = h;
    frame.title = "Advertisement";
    frame.style.border = "0";
    frame.setAttribute("scrolling", "no");
    frame.srcdoc = `<!doctype html><html><body style="margin:0"><script>atOptions={'key':'${banner}','format':'iframe','height':${h},'width':${w},'params':{}};<\/script><script src="https://bauval.org/22/${banner}"><\/script></body></html>`;
    el.appendChild(frame);
  } else if (native) {
    const box = document.createElement("div");
    box.id = `container-${native}`;
    el.appendChild(box);
    const s = document.createElement("script");
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    s.src = `https://bauval.org/21/${native}`;
    el.appendChild(s);
  }
}

function loadAdsterra() {
  if (adsterraLoaded) return;
  const slots = document.querySelectorAll<HTMLElement>("[data-adsterra-banner],[data-adsterra-native]");
  if (slots.length === 0) return;
  adsterraLoaded = true;
  const start = () => {
    if (!("IntersectionObserver" in window)) {
      slots.forEach(fillAdsterraSlot);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          fillAdsterraSlot(e.target as HTMLElement);
        }
      },
      { rootMargin: "300px" },
    );
    slots.forEach((el) => io.observe(el));
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

function sync() {
  if (getStoredConsent() !== "accepted") return;
  loadAnalytics();
  loadAdSense();
  loadAdsterra();
}

sync();
window.addEventListener("cookie-consent-change", sync);
