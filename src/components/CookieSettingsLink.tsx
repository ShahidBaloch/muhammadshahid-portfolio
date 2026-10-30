/** Static button; scripts/site.ts reopens the cookie banner on click. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`cursor-pointer bg-transparent p-0 text-left font-[inherit] text-inherit ${className ?? ""}`}
      data-cookie-settings=""
    >
      Cookie settings
    </button>
  );
}
