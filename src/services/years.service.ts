// src/services/years.service.ts
import { base } from "../utils/airtableConfig.js";

/** ערך השנה הנוכחית מטבלת settings (למשל "פו") */
export async function getCurrentYearLabel(): Promise<string | null> {
  const [row] = await base("settings")
    .select({ filterByFormula: `{key} = "current_year"`, maxRecords: 1, pageSize: 1 })
    .firstPage();
  const value = (row?.get("value") ?? "").toString().trim();
  return value || null;
}

/** recId של רשומת השנה (years) לפי value */
export async function getCurrentYearRecId(): Promise<string | null> {
  const label = await getCurrentYearLabel();
  if (!label) return null;
  const [yearRow] = await base("years")
    .select({
      filterByFormula: `{value} = "${label.replace(/"/g, '\\"')}"`,
      fields: ["value"], maxRecords: 1, pageSize: 1,
    })
    .firstPage();
  return yearRow?.id ?? null;
}

/** אוסף recId-ים של budgets המקושרים לשנה הנוכחית */
export async function getCurrentYearBudgetRecIds(): Promise<string[]> {
  const yearId = await getCurrentYearRecId();
  if (!yearId) return [];
  const [row] = await base("years")
    .select({ filterByFormula: `RECORD_ID() = "${yearId}"`, fields: ["budgets"], pageSize: 1, maxRecords: 1 })
    .firstPage();

  const links = row?.get("budgets");
  return Array.isArray(links) ? (links as string[]).filter(Boolean) : [];
}
