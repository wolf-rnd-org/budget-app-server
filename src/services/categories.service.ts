// services/categories.service.ts
import { base } from "../utils/airtableConfig.js";

export async function resolveCategoryLinksByNames(programRecId: string, names: string[]) {
  if (!programRecId || !names?.length) return [];
  const esc = (s: string) => s.replace(/"/g, '\\"');

  // אם יש לך שדה Program בקבוצת הקטגוריות (Link), נסננן לפיו:
  const filter = `FIND("${programRecId}", ARRAYJOIN({program_id}))`;
  const recs = await base("categories")
    .select({ filterByFormula: filter, pageSize: 100 })
    .all();

  const byName = new Map(
    recs.map(r => [String(r.get("Name") || "").trim(), r.id])
  );

  const out: string[] = [];
  for (const n of names) {
    const recId = byName.get(String(n || "").trim());
    if (recId) out.push(recId);
  }
  return out;
}
