"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getStoredConsent } from "@/lib/consent";

const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/** Loads AdSense only after cookie consent and when NEXT_PUBLIC_ADSENSE_CLIENT_ID is set. */
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

  if (!clientId || !allowed) {
    return null;
  }

  return (
    <Script
      id="adsense-loader"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
