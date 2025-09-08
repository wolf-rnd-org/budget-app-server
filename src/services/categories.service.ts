// services/categories.service.ts
import { base } from "../utils/airtableConfig.js";

export async function resolveCategoryLinksByNames(programRecId: string, names: string[]) {
  if (!programRecId || !names?.length) return [];
  const esc = (s: string) => s.replace(/"/g, '\\"');

  // אם יש לך שדה Program בקבוצת הקטגוריות (Link), נסננן לפיו:
  const all = await base("categories").select({ pageSize: 100 }).all();
  const recs = all.filter(r => {
    const fields = r.fields as Record<string, any>;
    return Object.values(fields).some(v => Array.isArray(v) && v.some(it => typeof it === "string" && it === programRecId));
  });

  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const r of recs) {
    const nm = String(r.get("Name") ?? "").trim();
    if (nm) byName.set(nm, r.id);
    const autoId = r.get("ID");
    if (autoId != null) byId.set(String(autoId), r.id);
  }

  const out: string[] = [];
  for (const n of names) {
    const token = String(n ?? "").trim();
    if (/^rec[0-9A-Za-z]{14}$/i.test(token)) {
      if (recs.some(r => r.id === token)) out.push(token);
      continue;
    }
    const viaAuto = byId.get(token);
    if (viaAuto) { out.push(viaAuto); continue; }
    const viaName = byName.get(token);
    if (viaName) { out.push(viaName); continue; }
  }
  return out;
}
