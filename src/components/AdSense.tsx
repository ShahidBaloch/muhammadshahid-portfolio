"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { ADSENSE_CLIENT_ID } from "@/lib/adsense";
import { getStoredConsent } from "@/lib/consent";

export function AdSense() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    function sync() {
      setAllowed(getStoredConsent() === "accepted");
    }

    sync();
    window.addEventListener("cookie-consent-change", sync);
    return () => window.removeEventListener("cookie-consent-change", sync);
  }, []);

  if (!ADSENSE_CLIENT_ID || !allowed) {
    return null;
  }

  return (
    <Script
      id="adsense-loader"
      strategy="lazyOnload"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      crossOrigin="anonymous"
    />
  );
}
