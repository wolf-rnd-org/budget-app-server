// services/categories.service.ts
import { base } from "../utils/airtableConfig.js";


// Convert program_id (autonumber) to Airtable record ID
async function findProgramRecIdById(programId: string): Promise<string | null> {
  const pid = String(programId || "").trim();
  console.log('Looking for program with program_id:', pid);

  if (!pid) return null;

  // If it's already a record ID format, return as-is
  if (/^rec[0-9A-Za-z]{14}$/i.test(pid)) {
    console.log('Already a record ID:', pid);
    return pid;
  }

  try {
    // Escape quotes in the program ID for the formula
    const escapedPid = pid.replace(/"/g, '\\"');
    const formula = `{program_id} = "${escapedPid}"`;
    console.log('Using formula to find program:', formula);

    const records = await base("programs").select({
      pageSize: 1,
      maxRecords: 1,
      filterByFormula: formula
    }).firstPage();

    const recordId = records[0]?.id ?? null;
    console.log('Found program record ID:', recordId);
    return recordId;
  } catch (error) {
    console.error('Error finding program record ID:', error);
    return null;
  }
}

export async function getCategoriesForProgram(programKey: string) {
  console.log('getCategoriesForProgram called with programKey:', programKey);

  const pid = String(programKey || "").trim();
  if (!pid) return [];

  try {
    // Get the program record by program_id (autonumber) and fetch its linked categories
    const escapedPid = pid.replace(/"/g, '\\"');
    const formula = `{program_id} = "${escapedPid}"`;

    const programRecords = await base("programs").select({
      pageSize: 1,
      maxRecords: 1,
      filterByFormula: formula,
      fields: ["program_id", "categories"] // Assuming categories is a linked field to categories table
    }).firstPage();

    if (programRecords.length === 0) {
      console.log('No program found for program_id:', pid);
      return [];
    }

    const program = programRecords[0];
    const linkedCategories = program.get("categories");
    console.log('Found linked categories:', linkedCategories);

    if (!linkedCategories || !Array.isArray(linkedCategories)) {
      console.log('No categories linked to this program');
      return [];
    }

    // Get the category details for all linked categories
    const categoryRecordIds = linkedCategories.map(cat =>
      typeof cat === 'string' ? cat : cat.id
    );

    if (categoryRecordIds.length === 0) {
      return [];
    }

    // Fetch category details
    const categoryFormula = `OR(${categoryRecordIds.map(id => `RECORD_ID() = "${id}"`).join(',')})`;
    console.log('Fetching categories with formula:', categoryFormula);

    const categoryRecords = await base("categories").select({
      pageSize: 100,
      filterByFormula: categoryFormula,
      fields: ["category_id", "name"],
      sort: [{ field: "name", direction: "asc" }],
    }).all();

    console.log('Found category records:', categoryRecords.length);

    return categoryRecords.map(r => ({
      recId: r.id,
      category_id: String(r.get("category_id") ?? ""),
      name: String(r.get("name") ?? ""),
    }));

  } catch (error) {
    console.error('Error in getCategoriesForProgram:', error);
    return [];
  }
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
    const autoId = r.get("category_id");
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
