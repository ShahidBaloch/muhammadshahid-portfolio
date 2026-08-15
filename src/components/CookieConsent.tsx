"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") applyChoice("rejected");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  function applyChoice(choice: ConsentChoice) {
    storeConsent(choice);
    updateGoogleConsent(choice === "accepted");
    setVisible(false);
    window.dispatchEvent(new CustomEvent("cookie-consent-change", { detail: choice }));
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-line bg-mist/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
    >
      <div className="container-narrow flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl text-sm text-ink-soft">
          <p id="cookie-consent-title" className="font-semibold text-ink">
            Cookies &amp; analytics
          </p>
          <p className="mt-1">
            This site uses cookies for analytics if you accept. See the{" "}
            <Link href="/privacy" className="font-semibold text-teal link-underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <button type="button" className="btn-secondary w-full !py-2.5 !text-sm sm:w-auto" onClick={() => applyChoice("rejected")}>
            Reject
          </button>
          <button type="button" className="btn-primary w-full !py-2.5 !text-sm sm:w-auto" onClick={() => applyChoice("accepted")}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
