// Starts at 2025 (when structured annual programs/budgets became a real
// workflow here) and extends through the current year automatically, so
// the range grows each January with no code change. Descending — newest
// (the default) shown first in the picker.
export const FIRST_SELECTABLE_FISCAL_YEAR = 2025;

export function getSelectableFiscalYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= FIRST_SELECTABLE_FISCAL_YEAR; y--) years.push(y);
  return years;
}
