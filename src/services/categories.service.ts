// services/categories.service.ts
import { base } from "../utils/airtableConfig.js";


// NEW: שליפה לפי פרויקט (program)
async function findProgramRecIdById(programId: string) {
  const page = await base("programs").select({
    pageSize: 1,
    maxRecords: 1,

    filterByFormula: `{program_id} = "${programId}"`
  }).firstPage();
  return page[0]?.id ?? null;
}

export async function getCategoriesForProgram(programKey: string) {
  const pid = String(programKey || "").trim();
  if (!pid) return [];

  // תומך גם ב-recId וגם ב-id לוגי
  const programRecId = /^rec[0-9A-Za-z]{14}$/i.test(pid)
    ? pid
    : await findProgramRecIdById(pid);

  if (!programRecId) return [];

  const recs = await base("categories").select({
    pageSize: 100,
    // סינון מדויק לשדה Link {programs_id}
    filterByFormula: `FIND("," & "${programRecId}" & ",", "," & ARRAYJOIN({programs_id}, ",") & ",")`,
    fields: ["category_id", "name"],
    sort: [{ field: "name", direction: "asc" }],
  }).all();

  return recs.map(r => ({
    recId: r.id,
    category_id: String(r.get("category_id") ?? ""),
    name: String(r.get("name") ?? ""),
  }));
}

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
    const nm = String(r.get("name") ?? "").trim();
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
