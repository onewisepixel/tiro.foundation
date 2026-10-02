import type { MemoryRecord } from "@/data/memories";

export function countByDemo(records: MemoryRecord[]): { total: number; demo: number } {
  const total = records.length;
  const demo = records.filter((record) => record.recordKind === "demo").length;
  return { total, demo };
}

export function formatRecordCountLabel(records: MemoryRecord[]): string {
  const { total, demo } = countByDemo(records);

  if (total === 0) {
    return "0 Records";
  }
  if (demo === 0) {
    return `${total} Record${total === 1 ? "" : "s"}`;
  }
  if (demo === total) {
    return `${total} Demonstration Record${total === 1 ? "" : "s"}`;
  }
  return `${total} Record${total === 1 ? "" : "s"} · ${demo} Demonstration Record${demo === 1 ? "" : "s"}`;
}

// Shared across any surface that lists linked memory records (node index,
// node detail pages). Keep this the single source of that notice text.
export function getConnectionsNotice(records: MemoryRecord[]): string | null {
  const { total, demo } = countByDemo(records);

  if (total === 0 || demo === 0) {
    return null;
  }
  if (demo === total) {
    return "These connections reference demonstration records — illustrative content; not collected archival testimony.";
  }
  return "Some connections below reference demonstration records; others reference other record categories. Demonstration links are labeled individually.";
}
