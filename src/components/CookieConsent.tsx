"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getStoredConsent,
  storeConsent,
  updateGoogleConsent,
  type ConsentChoice,
} from "@/lib/consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      setVisible(true);
      return;
    }
    updateGoogleConsent(stored === "accepted");
  }, []);

  function applyChoice(choice: ConsentChoice) {
    storeConsent(choice);
    updateGoogleConsent(choice === "accepted");
    setVisible(false);
    window.dispatchEvent(new CustomEvent("cookie-consent-change", { detail: choice }));
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-line bg-mist/95 p-4 shadow-[0_-8px_32px_-12px_rgba(5,29,31,0.25)] backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-live="polite"
    >
      <div className="container-narrow flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl text-sm text-ink-soft">
          <p id="cookie-consent-title" className="font-semibold text-ink">
            Cookies &amp; analytics
          </p>
          <p className="mt-1">
            This site uses cookies for analytics and, if enabled later, advertising. See the{" "}
            <Link href="/privacy" className="font-semibold text-teal link-underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <button type="button" className="btn-secondary !py-2.5 !text-sm" onClick={() => applyChoice("rejected")}>
            Reject
          </button>
          <button type="button" className="btn-primary !py-2.5 !text-sm" onClick={() => applyChoice("accepted")}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
