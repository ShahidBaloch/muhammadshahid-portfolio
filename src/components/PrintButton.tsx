/** Static button; scripts/site.ts calls window.print() on click. */
export function PrintButton() {
  return (
    <button type="button" className="btn-secondary print:hidden" data-print="">
      Print / save PDF
    </button>
  );
}
