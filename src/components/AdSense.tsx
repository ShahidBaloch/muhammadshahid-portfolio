import Script from "next/script";

const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/** Loads AdSense only when NEXT_PUBLIC_ADSENSE_CLIENT_ID is set (after approval). */
export function AdSense() {
  if (!clientId) {
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
