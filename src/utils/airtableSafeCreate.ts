// utils/airtableSafeCreate.ts
import { base } from "../utils/airtableConfig.js";

const URL_RE = /^https?:\/\//i;

// הופך מחרוזת/מחרוזות ל-attachments בפורמט [{url}]
function normalizeAttachment(val: any) {
  if (!val) return undefined;
  const toItem = (x: any) => {
    if (!x) return null;
    if (typeof x === "string" && URL_RE.test(x.trim())) return { url: x.trim() };
    if (typeof x === "object" && typeof x.url === "string" && URL_RE.test(x.url.trim()))
      return { url: x.url.trim(), filename: x.filename };
    return null;
  };
  const arr = Array.isArray(val) ? val.map(toItem).filter(Boolean) : [toItem(val)].filter(Boolean);
  return arr.length ? arr : undefined;
}

// מסיר ריקים/null/מערכים ריקים
function cleanFalsy(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v)) {
      const arr = v.filter(x => String(x ?? "").trim() !== "");
      if (!arr.length) continue;
      out[k] = arr;
    } else out[k] = v;
  }
  return out;
}

// חילוץ שם שדה מהודעת שגיאה של Airtable
function fieldFromMsg(msg: string): string | null {
  let m = msg.match(/Unknown field name:\s*"([^"]+)"/);
  if (m?.[1]) return m[1];
  m = msg.match(/for field ([^:\s]+)/i);
  if (m?.[1]) return m[1];
  return null;
}

// נסיר ערכים לא חוקיים לשדות Select (כולל ערך ריק)
function stripLikelySelect(fields: Record<string, any>, key: string) {
  if (!(key in fields)) return;
  const v = fields[key];
  if (typeof v === "string" && v.trim() === "") { delete fields[key]; return; }
  if (Array.isArray(v)) {
    const arr = v.filter(x => String(x ?? "").trim() !== "");
    if (arr.length) fields[key] = arr; else delete fields[key];
  }
}

/**
 * יוצר רשומה ומנסה "לרפא" 422 טיפוסיים:
 * - UNKNOWN_FIELD_NAME → מסיר את השדה
 * - INVALID_ATTACHMENT_OBJECT → מסיר השדה
 * - INVALID_MULTIPLE_CHOICE_OPTIONS → מסיר status/categories/invoice_type
 */
export async function airtableSafeCreate(table: string, initialFields: Record<string, any>) {
  const fields: Record<string, any> = { ...initialFields };

  // attachments
  if ("invoice_file" in fields) {
    const nf = normalizeAttachment(fields.invoice_file);
    if (nf) fields.invoice_file = nf; else delete fields.invoice_file;
  }
  if ("bank_details_file" in fields) {
    const bf = normalizeAttachment(fields.bank_details_file);
    if (bf) fields.bank_details_file = bf; else delete fields.bank_details_file;
  }

  Object.assign(fields, cleanFalsy(fields));

  const MAX_TRIES = 4;
  for (let i = 0; i < MAX_TRIES; i++) {
    try {
      const recs = await base(table).create([{ fields }]);
      return recs[0]; // ✅ הצלחה
    } catch (e: any) {
      const msg = String(e?.message || e);

      if (/UNKNOWN_FIELD_NAME/i.test(msg)) {
        const f = fieldFromMsg(msg);
        if (f && f in fields) { delete fields[f]; continue; }
      }
      if (/INVALID_ATTACHMENT_OBJECT/i.test(msg)) {
        const f = fieldFromMsg(msg) || "invoice_file";
        if (f in fields) { delete fields[f]; continue; }
      }
      if (/INVALID_MULTIPLE_CHOICE_OPTIONS/i.test(msg)) {
        for (const f of ["status", "categories", "invoice_type"]) {
          stripLikelySelect(fields, f);
          if (typeof fields[f] === "string" && !fields[f]) delete fields[f];
        }
        continue;
      }

      throw e; // לא הצלחנו לרפא
    }
  }
  throw new Error("Could not create record after retries");
}
