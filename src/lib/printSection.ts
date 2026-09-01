// Prints a single element (identified by DOM id) in isolation — hides
// everything else on the page for the duration of the print job. Pairs
// with the .printing-section/.print-target/.no-print rules in globals.css.
export function printSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;

  document.body.classList.add("printing-section");
  el.classList.add("print-target");

  function cleanup() {
    document.body.classList.remove("printing-section");
    el?.classList.remove("print-target");
    window.removeEventListener("afterprint", cleanup);
  }
  window.addEventListener("afterprint", cleanup);

  window.print();
}
