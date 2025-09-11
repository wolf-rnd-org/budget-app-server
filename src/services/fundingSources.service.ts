// src/services/fundingSources.service.ts
import { base } from "../utils/airtableConfig.js";
import { getCurrentYearBudgetRecIds } from "./years.service.js";

export type FundingSourceDTO = { id: string; name: string; code?: string };

/** מקורות מימון (budgets) לשנה הנוכחית — מזהה הוא recId ללינק */
export async function listFundingSources(): Promise<FundingSourceDTO[]> {
  const recIds = await getCurrentYearBudgetRecIds();
  if (recIds.length === 0) return [];

  // נמנע מפורמולה ארוכה: מנות של ~40 וריצת Promise.all
  const chunks: string[][] = [];
  for (let i = 0; i < recIds.length; i += 40) chunks.push(recIds.slice(i, i + 40));

  const parts = await Promise.all(
    chunks.map(chunk => {
      const formula = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(",")})`;
      return base("budgets").select({
        filterByFormula: formula,
        fields: ["name", "funding_source_id"], // מספיק ל-DTO
        pageSize: 100,
      }).all();
    })
  );

  // מיון דטרמיניסטי + דה-דופ
  const seen = new Set<string>();
  return parts.flat()
    .sort((a, b) => String(a.get("name") ?? "").localeCompare(String(b.get("name") ?? "")))
    .map(r => {
      if (seen.has(r.id)) return null;
      seen.add(r.id);
      return {
        id: r.id, // ← recId לשדה הלינק
        name: String(r.get("name") ?? "").trim(),
        code: String(r.get("funding_source_id") ?? "").trim() || undefined, // לא חובה, לטקסט/UI
      } as FundingSourceDTO;
    })
    .filter(Boolean) as FundingSourceDTO[];
}
