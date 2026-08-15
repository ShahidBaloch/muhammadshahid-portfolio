"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>
      Print / save PDF
    </button>
  );
}
