// import { Router, type Request, type Response } from "express";
// import multer from "multer";
// import vision from "@google-cloud/vision";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import PDFParser from "pdf2json";
// import path from "node:path";
// import { getMockText } from "../db/mock-fixtures.js";



// const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 10);
// const router = Router();

// // ---- Multer (פשוט, לזיכרון) ----
// const upload = multer({
//     storage: multer.memoryStorage(),
//     limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 2 },
// });

// const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
//     ? path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
//         ? process.env.GOOGLE_APPLICATION_CREDENTIALS
//         : path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
//     : path.resolve(process.cwd(), "secrets", "sa.json");



// // ---- OCR/LLM ----
// const visionClient = new vision.ImageAnnotatorClient({ keyFilename: keyFile }); // דורש GOOGLE_APPLICATION_CREDENTIALS
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// // ---- עזרות ----
// function normalizeRtl(raw: string) {
//     return (raw || "")
//         .replace(/[\u200e\u200f]/g, "")
//         .replace(/[“”״]/g, '"')
//         .replace(/[’׳]/g, "'")
//         .replace(/\t/g, " ")
//         .replace(/[ \u00A0]+/g, " ")
//         .trim();
// }
// function extractFirstJsonObject(s: string): any | null {
//     if (!s) return null;

//     // מסיר גדרות קוד ``` ותג json
//     let cleaned = s
//         .replace(/```json/gi, "")
//         .replace(/```/g, "")
//         .trim();

//     // לפעמים המודל מחזיר פסאודו-מפתחות בגרשיים חכמים
//     cleaned = cleaned.replace(/[“”]/g, '"').replace(/[’]/g, "'");

//     // ניסיון ראשון: parse ישיר
//     try {
//         return JSON.parse(cleaned);
//     } catch { }

//     // חיפוש האובייקט הראשון {...} בטקסט
//     const start = cleaned.indexOf("{");
//     const end = cleaned.lastIndexOf("}");
//     if (start >= 0 && end > start) {
//         const mid = cleaned.slice(start, end + 1);

//         // תיקון קל ל-trailing commas: ,} או ,]
//         const midNoTrailingCommas = mid
//             .replace(/,\s*}/g, "}")
//             .replace(/,\s*]/g, "]");

//         try {
//             return JSON.parse(midNoTrailingCommas);
//         } catch { }
//     }

//     return null;
// }


// async function ocrFromImageBuffer(buf: Buffer) {
//     try {
//         const [result] = await visionClient.documentTextDetection({
//             image: { content: buf },
//             imageContext: { languageHints: ["he", "en"] },
//         });
//         return result.fullTextAnnotation?.text ?? "";
//     } catch {
//         return "";
//     }
// }

// async function extractPdfText(buffer: Buffer): Promise<string> {
//     return new Promise((resolve, reject) => {
//         const pdfParser = new PDFParser();
//         pdfParser.on("pdfParser_dataError", err => reject(err.parserError));
//         pdfParser.on("pdfParser_dataReady", pdfData => {
//             const text = pdfParser.getRawTextContent();
//             resolve(text);
//         });
//         pdfParser.parseBuffer(buffer);
//     });
// }

// async function extractTextBestEffort(file?: Express.Multer.File): Promise<string> {
//     if (!file) return "";
//     const mt = (file.mimetype || "").toLowerCase();

//     try {
//         if (mt.includes("pdf")) {
//             // ✅ שימוש ב-pdf2json
//             const text = (await extractPdfText(file.buffer)).trim();
//             return text; // גם אם ריק – לא מפילים
//         }

//         if (/^image\/(png|jpe?g|webp|tiff|heic|heif)$/.test(mt)) {
//             const text = await ocrFromImageBuffer(file.buffer);
//             return (text || "").trim();
//         }
//     } catch {
//         // לא מפילים כלום
//     }
//     return "";
// }


// async function llmToJson(rawFull: string) {

//     const rawOriginal = rawFull || "";
//     const rawNormalized = normalizeRtl(rawOriginal);

//     const model = genAI.getGenerativeModel({
//         model: GEMINI_MODEL,
//         generationConfig: {
//             temperature: 0,
//             responseMimeType: "application/json",
//             maxOutputTokens: 400,
//         },
//     });

//     const prompt = [
//  "החזר אובייקט JSON יחיד (לא מערך), בלי טקסט נוסף ובלי ```:",
//         `{
//   "supplier_name": string,
//   "business_number": string,
//   "invoice_type": string,
//   "invoice_description": string,
//   "amount": number,
//   "project": string,
//   "bank_details_file": string | null,
//   "supplier_email": string
// }`,
//         'אל תנחש; אם אין ערך החזר "" או null. ודא שסכום הוא number.',
//         "טקסט מקורי מלא (he+en, ייתכן ג׳יבריש):",
//         "```",
//         rawOriginal,
//         "```",
//         "גרסה מנורמלת (סיוע בלבד):",
//         "```",
//         rawNormalized,
//         "```",
//     ].join("\n\n");

//     try {
//         console.log("[llmToJson] sending to model:", GEMINI_MODEL, "rawLen:", rawOriginal.length);

//         const resp = await model.generateContent({
//             contents: [{ role: "user", parts: [{ text: prompt }] }],
//         });

//         const text = resp.response.text() || "";
//         console.log("[llmToJson] got text len:", text.length, "preview:", text.slice(0, 120).replace(/\s+/g, " "));

//     const json = extractFirstJsonObject(text);
//     if (json != null) {
//       const obj = Array.isArray(json) ? (json[0] ?? {}) : json;
//       return obj && typeof obj === "object" ? obj : {};
//     }

//         // ניסיון אחרון — אולי זה כבר JSON נקי
//         try {
//             const parsed = JSON.parse(text);
//       const obj = Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed;
//       return obj && typeof obj === "object" ? obj : {};
//         } catch {
//             console.warn("[llmToJson] parse failed, returning {}");
//             return {};
//         }
//     } catch (e: any) {
//         console.error("[llmToJson] ERROR:", e?.message || e);
//         return {};
//     }

// }


// // ---- Route: תמיד 200 עם אובייקט ----
// router.post("/upload-invoice", upload.fields([{ name: "invoice", maxCount: 1 }, { name: "bank_details", maxCount: 1 }]), async (req, res) => {
//   const t0 = Date.now();
//   const debug = req.query.debug === "1";

//   try {
//     const files = req.files as Record<string, Express.Multer.File[]> | undefined;
//     const inv = files?.invoice?.[0];
//     const bank = files?.bank_details?.[0];

//     const isMock =
//       String(process.env.UPLOAD_MOCK || "").toLowerCase() === "1" ||
//       String(req.query.mock || "") === "1" ||
//       String(req.headers["x-mock-mode"] || "") === "1";

//     const fixtureName =
//       (req.query.fixture as string) ||
//       (req.headers["x-mock-fixture"] as string) ||
//       undefined;

//     let rawFull = "";
//     let ocrMs = 0;
//     let llmMs = 0;
//     let llmUsed = false;

//     // --- OCR / text extraction timing ---
//     const tOcr0 = Date.now();
//     if (isMock) {
//       rawFull = getMockText(fixtureName);
//     } else {
//       rawFull = await extractTextBestEffort(inv);
//     }
//     ocrMs = Date.now() - tOcr0;

//     // --- LLM ---
//     const tLlm0 = Date.now();
//     const llmRaw = await llmToJson(rawFull);
//     llmMs = Date.now() - tLlm0;
//     llmUsed = true;

//     const llm = Array.isArray(llmRaw) ? (llmRaw[0] ?? {}) : llmRaw;

//     const data = {
//       supplier_name: typeof llm?.supplier_name === "string" ? llm.supplier_name : "",
//       business_number: typeof llm?.business_number === "string" ? llm.business_number : "",
//       invoice_type: typeof llm?.invoice_type === "string" ? llm.invoice_type : "",
//       invoice_description: typeof llm?.invoice_description === "string" ? llm.invoice_description : "",
//       amount: typeof llm?.amount === "number" ? llm.amount : Number(llm?.amount) || 0,
//       project: typeof llm?.project === "string" ? llm.project : "",
//       bank_details_file: bank ? (llm?.bank_details_file || "uploaded-bank-file") : (llm?.bank_details_file ?? null),
//       supplier_email: typeof llm?.supplier_email === "string" ? llm.supplier_email : "",
//     };

//     if (debug) {
//       const preview = (rawFull || "").replace(/\s+/g, " ").trim();
//       (data as any)._debug = {
//         ms_total: Date.now() - t0,
//         ocr_ms: ocrMs,
//         llm_ms: llmMs,
//         llm_used: llmUsed ,          // true = באמת קראנו ל-Gemini
//         mode: isMock ? "MOCK" : "REAL",
//         model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
//         raw_len: rawFull.length,
//         raw_preview: preview.slice(0, 500) + (preview.length > 500 ? " ..." : "")
//       };
//     }

//     return res.json(data);
//   } catch (err: any) {
//     return res.json({
//       supplier_name: "",
//       business_number: "",
//       invoice_type: "",
//       invoice_description: "",
//       amount: 0,
//       project: "",
//       bank_details_file: null,
//       supplier_email: "",
//     });
//   }
// });

// router.get("/__llm-ping", async (_req, res) => {
//     try {
//         const model = genAI.getGenerativeModel({
//             model: GEMINI_MODEL,
//             generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 50 },
//         });
//         const prompt = `החזר JSON בלבד: {"ok": true, "ts": ${Date.now()}}`;
//         const r = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
//         const text = r.response.text() || "{}";
//         return res.json({ ok: true, parsed: JSON.parse(text) });
//     } catch (e: any) {
//         return res.status(500).json({ ok: false, error: e?.message || String(e) });
//     }
// });

// export default router;



//מימוש עם קריאת API לג'מיני



// src/routes/quick-invoice.ts
// routes/documents.ts
import { Router } from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import crypto from "crypto";
import fs from "fs/promises";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 2 }, // 10MB כמו בקליינט
    fileFilter: (_req, file, cb) => {
        const ok = /application\/pdf|image\/(png|jpe?g|webp|tiff|heic|heif)/i.test(file.mimetype);
        if (!ok) return cb(new Error("Unsupported file type"));
        cb(null, true);
    },
});
async function saveToUploadsAndGetUrl(file: Express.Multer.File): Promise<string> {
    const ext = (() => {
        const orig = file.originalname || "";
        const dot = orig.lastIndexOf(".");
        return dot >= 0 ? orig.slice(dot) : "";
    })();
    const fname = `${Date.now()}-${crypto.randomUUID()}${ext || ""}`;
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, fname), file.buffer);
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || "";
    return `${base}/uploads/${fname}`;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const BASE_PROMPT = `
תפקיד: לחלץ נתוני הוצאה (Expense) מתוך קבצים מצורפים:
- PART 1 = INVOICE (חובה)
- PART 2 = BANK_DETAILS (אופציונלי)

כללי חילוץ לפרטי בנק:
1) אם קיימים שני הקבצים (INVOICE + BANK_DETAILS) — את שדות הבנק יש לחלץ **אך ורק** מתוך BANK_DETAILS ולהתעלם מ-INVOICE לצורך שדות הבנק.
2) אם קיים רק INVOICE — נסי לחלץ ממנו את שדות הבנק אם מופיעים.
3) אם לא נמצאו פרטי בנק — החזירי בשדות הבנק מחרוזות ריקות "" (לא null).
4) אין להמציא מידע. אם שדה לא ידוע (שאינו משדות הבנק) — החזירי null.
5) יש לכבד עברית/RTL; מותר לבצע OCR/זיהוי טקסט חופשי.

פורמט פלט: החזירי **JSON יחיד ונקי** (application/json) ללא Markdown וללא טקסט נוסף, עם המפתחות הבאים בדיוק (שמות ושדות קבועים):

{
  "supplier_name": string | null,
  "business_number": string | null,
  "invoice_type": string | null,            // דוג': "חשבונית מס" | "חשבונית עסקה" | "דרישת תשלום" | "קבלה" | "חשבונית זיכוי"
  "invoice_description": string | null,     // רק טקסט שקיים במסמך, 5–120 תווים
  "amount": number | null,                  // סכום כולל לתשלום
  "project": string | null,
  "supplier_email": string | null,          // דוא"ל ספק אם קיים, אחרת null

  // --- פרטי בנק: תמיד להחזיר כמחרוזות (גם אם ריקות) ---
  "bank_name": string,                      // קוד/שם בנק אם קיים, אחרת ""
  "bank_branch": string,                    // קוד/מס' סניף אם קיים, אחרת ""
  "bank_account": string,                   // מס' חשבון אם קיים, אחרת ""
  "iban": string,                           // אם קיים, אחרת ""
  "beneficiary": string,                    // שם המוטב/בעל החשבון אם קיים, אחרת ""

  // מקור פרטי הבנק:
  // "uploaded-bank-file" אם נשלח BANK_DETAILS ונעשה בו שימוש,
  // "inline-bank-details" אם נשלפו מה-INVOICE,
  // אחרת null.
  "bank_details_file": "uploaded-bank-file" | "inline-bank-details" | null,

  // שדות משלימים (להשאיר null אם לא בטוח/לא נמצא):
  "id": string | null,
  "budget": string | null,
  "date": string | null,                    // YYYY-MM-DD של תאריך הוצאה/הנפקה (לא due)
  "categories": string[] | null,
  "invoice_file": string | null,
  "status": "draft" | "ready" | null,
  "user_id": string | null
}

הנחיות נוספות:
- לבחור ערך יחיד לכל שדה. אם יש כמה מועמדים — להעדיף את הכי חד-משמעי.
- "status" = "ready" רק אם supplier_name + date + amount זוהו תקינים; אחרת null.
- פורמט מספרים: amount כמספר (לא כמחרוזת).
- אין טקסט חופשי מחוץ ל-JSON. להחזיר אובייקט JSON אחד בלבד.
- לשדה "invoice_type" החזר אחת מהאפשרויות הקבועות בלבד:
  ["חשבונית מס","חשבונית עסקה","דרישת תשלום","קבלה","חשבונית זיכוי"].
- אם מופיעה וריאציה/איות אחר (למשל "חשבונית מס/קבלה", "חשבון עסקה", "חשבונית זקוי"):
  בחרי את ההתאמה הקרובה ביותר מהרשימה למעלה.
`;


// POST /documents/upload-invoice
router.post(
    "/upload-invoice",
    upload.fields([
        { name: "invoice", maxCount: 1 },
        { name: "bank_details", maxCount: 1 },
    ]),
    async (req, res) => {
        const t0 = Date.now();

        try {
            // 1) קבצים מהטופס
            const files = req.files as Record<string, Express.Multer.File[]> | undefined;
            const invoice = files?.invoice?.[0];
            const bank = files?.bank_details?.[0];
            if (!invoice) return res.status(400).json({ error: "Missing file 'invoice'" });

            // 2) מודל Gemini
            const model = genAI.getGenerativeModel({
                model: GEMINI_MODEL, // למשל: "gemini-2.0-flash"
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 900,
                    responseMimeType: "application/json",
                },
            });

            // 3) פרומפט בסיס קצר (אפשר להחליף לשלך)
            const parts: any[] = [
                {

                    text:
                        BASE_PROMPT +
                        "\n\nהקבצים מגיעים כחלקים ברצף: PART 1 = INVOICE, PART 2 = BANK_DETAILS (אם קיים).",
                },
                { text: "PART 1: INVOICE" },
                {
                    inlineData: {
                        data: invoice.buffer.toString("base64"),
                        mimeType: invoice.mimetype || "application/octet-stream",
                    },
                },
            ];
            if (bank) {
                parts.push(
                    { text: "PART 2: BANK_DETAILS" },
                    {
                        inlineData: {
                            data: bank.buffer.toString("base64"),
                            mimeType: bank.mimetype || "application/octet-stream",
                        },
                    });
            }

            // 4) קריאה למודל
            const resp = await model.generateContent({ contents: [{ role: "user", parts }] });
            const text = resp.response.text() || "{}";

            // 5) Parse בטוח + Unwrap (מערך/מפתח "0")
            let parsed: any;
            try { parsed = JSON.parse(text); } catch { parsed = {}; }

            function unwrapLLM(p: any) {
                if (!p) return {};
                if (Array.isArray(p)) return p[0] ?? {};
                const numKey = Object.keys(p).find(k => /^\d+$/.test(k));
                return numKey ? p[numKey] : p;
            }
            const obj = unwrapLLM(parsed);

            // ----------helpers for tolerant mapping----------
            const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
            function hasInlineBank(raw: any): boolean {
                // 1) יש שדות בנק מפורשים שחזרו מהמודל?
                const anyBankField = pickFirst(raw, [
                    "bank_name", "bank", "bank_branch", "branch",
                    "bank_account", "account", "account_number",
                    "iban", "IBAN"
                ]);
                if (anyBankField) return true;

                // 2) חיפוש טקסט חופשי בכל ה-JSON (evidence/תמלול)
                try {
                    const text = JSON.stringify(raw);
                    // מילות מפתח נפוצות בעברית/אנגלית
                    if (/(פרטי\s*בנק|בנק|סניף|מספר\s*חשבון|IBAN|Bank|Branch|Account)/i.test(text)) return true;

                    // דפוסי מספרים רלוונטיים:
                    // IBAN ישראלי (IL + 2 ספרות ביקורת + 19 ספרות)
                    if (/IL\d{2}\d{19}/i.test(text)) return true;

                    // פורמט בנק-סניף-חשבון בסגנון "52-177-200131" (דוגמה שהופיעה אצלך)
                    if (/\b\d{1,2}\s*-\s*\d{1,3}\s*-\s*\d{4,12}\b/.test(text)) return true;
                } catch { }
                return false;
            }
            function cleanFlatText(raw: any): string {
                try {
                    return JSON.stringify(raw)
                        .replace(/\\n/g, " ")
                        .replace(/[\u200e\u200f]/g, "") // סימוני RTL
                        .replace(/\s+/g, " ")
                        .trim();
                } catch { return ""; }
            }

            // ניסיון מושכל: גם עברית רגילה, גם הפוכה
            function extractBankDetails(raw: any) {
                // 1) אם המודל כבר החזיר מפתחות מפורשים
                const direct = {
                    bank_name: getStr(raw, ["bank_name", "bank"], ""),
                    bank_branch: getStr(raw, ["bank_branch", "branch"], ""),
                    bank_account: getStr(raw, ["bank_account", "account", "account_number"], ""),
                    iban: getStr(raw, ["iban", "IBAN"], ""),
                    beneficiary: getStr(raw, ["beneficiary", "account_holder", "holder", "מוטב"], ""),

                };
                const cleanedDirect = Object.fromEntries(
                    Object.entries(direct).filter(([_, v]) => String(v || "").trim() !== "")
                );
                if (Object.keys(cleanedDirect).length) return cleanedDirect;

                // 2) חיפוש גס בכל גוף ה-JSON (כולל evidences)
                let text = cleanFlatText(raw);   // <<< במקום JSON.stringify(raw)
                if (!text) return {};

                const out: any = {};

                // IBAN ישראלי
                const iban = text.match(/\bIL\d{2}\d{19}\b/i);
                if (iban) out.iban = iban[0];

                // עברית: "בנק 52, סניף 177, מס' חשבון 200131" (ללא תלות ברווחים/פסיקים)
                let m = text.match(/בנק\D{0,6}(\d{1,3}).{0,30}סניף\D{0,6}(\d{1,4}).{0,40}(?:מס'?|מספר)?\s*חשבון\D{0,6}([0-9-]{5,})/i);
                if (!m) {
                    // הפוך (RTL ב-PDF): "מס' חשבון 200131 ... סניף 177 ... בנק 52"
                    m = text.match(/חשבון\D{0,6}([0-9-]{5,}).{0,40}סניף\D{0,6}(\d{1,4}).{0,30}בנק\D{0,6}(\d{1,3})/i);
                    if (m) m = ["", m[3], m[2], m[1]] as any; // סדר: בנק, סניף, חשבון
                }
                if (!m) {
                    // אנגלית: "Bank 52 ... Branch 177 ... Account 200131"
                    m = text.match(/Bank\D{0,6}(\d{1,3}).{0,30}Branch\D{0,6}(\d{1,4}).{0,40}Account\D{0,6}([0-9-]{5,})/i);
                }
                if (m) {
                    const bankCode = m[1], branch = m[2], account = (m[3] || "").replace(/\D/g, "");
                    // ולידציה קלה כדי לזרוק התאמות שגויות (כמו 2025/90080 שתפסת בטעות)
                    const okBank = /^\d{1,3}$/.test(bankCode ?? "");
                    const okBranch = /^\d{1,4}$/.test(branch ?? "");
                    const okAcc = /^\d{5,12}$/.test(account ?? "");
                    if (okBank) out.bank_name = bankCode;
                    if (okBranch) out.bank_branch = branch;
                    if (okAcc) out.bank_account = account;
                }

                // מוטב / בעל חשבון
                const beneficiary = text.match(/(?:מוטב|Beneficiary|Account\s*Holder)\s*[:\-]?\s*([^\s,;|]{2,}.*?)(?=\s{2,}|[.,;]|$)/i);
                if (beneficiary && beneficiary[1]) out.beneficiary = beneficiary[1].trim();
                if (!out.bank_account && !out.iban) {
                    const g = guessTriple(text);
                    if (g) {
                        out.bank_name = out.bank_name || String(g.bank);
                        out.bank_branch = out.bank_branch || String(g.branch);
                        out.bank_account = out.bank_account || String(g.account);
                    }
                }
                return out;
            }


            // פול־בק לשלישיית מספרים (ללא מילות מפתח)
            function guessTriple(text: string): { bank: number; branch: number; account: number } | null {
                // לחפש רצף של 3 מספרים בטווח 80 תווים
                const nums: Array<{ n: number, i: number }> = [];
                for (const m of text.matchAll(/\d{1,12}/g)) {
                    nums.push({ n: Number(m[0]), i: m.index ?? 0 });
                }
                for (let i = 0; i + 2 < nums.length; i++) {
                    const a = nums[i], b = nums[i + 1], c = nums[i + 2];
                    if (!a || !b || !c) continue;
                    if ((c.i - a.i) > 80) continue; // רחוק מדי
                    const arr = [a.n, b.n, c.n].sort((x, y) => x - y);
                    const bank = arr[0], branch = arr[1], account = arr[2];
                    if (
                        account !== undefined &&
                        bank !== undefined &&
                        branch !== undefined &&
                        String(account).length >= 5 &&
                        String(bank).length <= 3 &&
                        String(branch).length <= 4
                    ) {
                        return { bank, branch, account };
                    }
                }
                return null;
            }


            // get nested value by path, e.g. "evidence.supplier_name_text"
            function getPath(o: any, path: string): any {
                return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), o);
            }

            function pickFirst(o: any, paths: string[]) {
                for (const p of paths) {
                    const v = p.includes('.') ? getPath(o, p) : o?.[p];
                    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
                }
                return undefined;
            }

            function getStr(o: any, keys: string[], fallback = ""): string {
                const v = pickFirst(o, keys);
                return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : fallback);
            }

            function getNum(o: any, keys: string[], fallback = 0): number {
                const v = pickFirst(o, keys);
                if (typeof v === 'number' && isFinite(v)) return v;
                if (typeof v === 'string') {
                    const n = Number(v.replace(/[₪,\s]/g, '').replace(/(\d+),(\d{2})$/, '$1.$2'));
                    if (isFinite(n)) return n;
                }
                return fallback;
            }

            function normalizeInvoiceType(s?: string): string {
                if (!s) return "";
                const t = s.trim();

                // וריאנטים נפוצים
                if (/חשבונית\s*מס(?:\s*\/?\s*קבלה)?/i.test(t)) return "חשבונית מס";   // כולל "חשבונית מס/קבלה"
                if (/חשבונ(ית)?\s*עסקה|חשבונית\s*עסקה|עסקה/i.test(t)) return "חשבונית עסקה";
                if (/דריש(ת)?\s*תשלום|דרישה\s*לתשלום/i.test(t)) return "דרישת תשלום";
                if (/קבלה/i.test(t)) return "קבלה";
                if (/חשבונית\s*זיכוי|זיכוי\s*חשבונית/i.test(t)) return "חשבונית זיכוי";

                return t;
            }

            function coerceEmail(o: any, keys: string[]): string {
                // 1) נסה מהמפתחות הידועים
                const direct = getStr(o, keys, "");
                if (direct && EMAIL_RE.test(direct)) return direct;

                // 2) נסה evidence נפוץ
                const ev = getStr(o, ["evidence.supplier_email_text", "supplier_email_evidence", "email_evidence"], "");
                if (ev && EMAIL_RE.test(ev)) return ev;

                // 3) נסה לאתר אימייל בכל האובייקט כסריקה גסה
                try {
                    const flat = JSON.stringify(o);
                    const m = flat.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
                    if (m) return m[0];
                } catch { }
                return "";
            }

            function mapToParsedInvoice(raw: any, bankUploaded: boolean) {
                const supplier_name = getStr(raw, [
                    "supplier_name", "supplier", "vendor_name", "supplierName", "name"
                ], "");

                const business_number = getStr(raw, [
                    "business_number", "businessNumber", "vat_id", "VAT", "tax_id", "company_id", "חפ", "עוסק", "מספר עוסק"
                ], "");

                const invoice_type = normalizeInvoiceType(getStr(raw, [
                    "invoice_type", "doc_type", "type"
                ], ""));

                const invoice_description = getStr(raw, [
                    "invoice_description", "service_description", "description", "title", "serviceDescription"
                ], "");

                const amount = getNum(raw, [
                    "amount", "total_amount", "total", "amount_due", "grand_total", "סהכ"
                ], 0);

                const project = getStr(raw, [
                    "project", "budget_project", "job_name", "project_name"
                ], "");

                const supplier_email = coerceEmail(raw, [
                    "supplier_email", "email", "contact_email"
                ]);



                // --------- add below your helpers (after hasInlineBank / pickFirst / getStr ...) ---------


                const bank_details_file =
                    bankUploaded
                        ? "uploaded-bank-file"
                        : (getStr(raw, ["bank_details_file", "bank_file", "bank_attachment"], "") ||
                            (hasInlineBank(raw) ? "inline-bank-details" : undefined));

                return {
                    supplier_name,
                    business_number,
                    invoice_type,
                    invoice_description,
                    amount,
                    project,
                    bank_details_file,
                    supplier_email,
                };
            }
            // ----------end helpers----------

            // 6-7) מיפוי סופי (תמיד נחזיר חלקי אם נמצא משהו)
            const data = mapToParsedInvoice(obj, Boolean(bank));
            const rawBank = extractBankDetails(obj);
            const bankNormalized = {
                bank_name: (rawBank.bank_name ?? "").trim(),
                bank_branch: (rawBank.bank_branch ?? "").trim(),
                bank_account: (rawBank.bank_account ?? "").trim(),
                iban: (rawBank.iban ?? "").trim(),
                beneficiary: (rawBank.beneficiary ?? "").trim(),
            };
            let bank_source: "uploaded" | "inline" | "" = "";
            if (bank) bank_source = "uploaded";
            else if (Object.values(bankNormalized).some(v => v)) bank_source = "inline";

            if (!bank && bank_source === "inline" && !data.bank_details_file) {
                data.bank_details_file = "inline-bank-details";
            }
            // 8) Debug נוח בזמן פיתוח
            const ms = Date.now() - t0;
            const invoiceUrl = await saveToUploadsAndGetUrl(invoice);
            const bankUrl = bank ? await saveToUploadsAndGetUrl(bank) : null;
            const invoiceFileUrls = [invoiceUrl].filter(Boolean) as string[];
            const bankFileUrls = [bankUrl].filter(Boolean) as string[];
            const payload = {
                supplier_name: data.supplier_name || "",
                business_number: data.business_number || "",
                invoice_type: data.invoice_type || "",
                invoice_description: data.invoice_description || "",
                amount: data.amount || 0,
                project: data.project || "",
                supplier_email: data.supplier_email || "",

                bank_name: bankNormalized.bank_name || "",
                bank_branch: bankNormalized.bank_branch || "",
                bank_account: bankNormalized.bank_account || "",
                beneficiary: bankNormalized.beneficiary || "",
                iban: bankNormalized.iban || "",
                invoice_file: invoiceFileUrls,          // ⬅️ יש עמודה כזו
                bank_details_file: bankFileUrls,
                _debug: {
                    ms,
                    model: GEMINI_MODEL,
                    invoice_mime: invoice.mimetype,
                    invoice_size: invoice.size,
                    bank_mime: bank?.mimetype || null,
                    bank_size: bank?.size || null,

                },
            };

            return res.json(payload);
        } catch (e: any) {
            return res.json({
                supplier_name: "",
                business_number: "",
                invoice_type: "",
                invoice_description: "",
                amount: 0,
                project: "",
                bank_details_file: null,
                supplier_email: "",
                _error: e?.message || String(e)
            });
        }

    }
);

export default router;
