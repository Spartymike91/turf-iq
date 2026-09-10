export interface AppliedAtAreaRow {
  applied_at: string;
  area: string | null;
}

export interface GroupedApplications<T> {
  key: string;
  appliedAt: string;
  area: string;
  rows: T[];
}

/**
 * Groups pest_applications-backed rows by the (applied_at, area) pair that
 * identifies one "+ Log Application" tank-mix submission — every line in
 * one submission shares both fields exactly (set once in
 * LogApplicationForm's handleSubmit), so grouping on this pair reliably
 * reconstructs "what was applied together" without a separate batch id.
 * Preserves the input array's order (callers already fetch sorted by
 * applied_at desc), so groups come out newest-first for free. Shared by
 * every pest_applications-backed tab (Weed/Insects/Disease Risk/Growth
 * Regulators/Wetting Agents) — mirrors the (application_date, zone)
 * grouping already used for Fertility's own table.
 */
export function groupByAppliedAtAndArea<T extends AppliedAtAreaRow>(rows: T[]): GroupedApplications<T>[] {
  const groups: GroupedApplications<T>[] = [];
  const indexByKey = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.applied_at}|${row.area ?? ""}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({ key, appliedAt: row.applied_at, area: row.area || "—", rows: [] });
    }
    groups[idx].rows.push(row);
  }
  return groups;
}
