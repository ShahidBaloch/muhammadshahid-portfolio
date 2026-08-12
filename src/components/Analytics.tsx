"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getStoredConsent } from "@/lib/consent";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    function sync() {
      setAllowed(getStoredConsent() === "accepted");
    }

    sync();
    window.addEventListener("cookie-consent-change", sync);
    return () => window.removeEventListener("cookie-consent-change", sync);
  }, []);

  if (!gaId || !allowed) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
