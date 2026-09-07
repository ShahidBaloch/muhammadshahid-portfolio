"use client";

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`cursor-pointer bg-transparent p-0 text-left font-[inherit] text-inherit ${className ?? ""}`}
      onClick={() => window.dispatchEvent(new Event("cookie-consent-open"))}
    >
      Cookie settings
    </button>
  );
}
