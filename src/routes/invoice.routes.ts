// import { Router, type Request, type Response } from "express";
// import multer from "multer";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import vision from "@google-cloud/vision";
// import { z } from "zod";



// const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 10);

// // ---- storage & filter ----
// const upload = multer({
//     storage: multer.memoryStorage(),
//     limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 2, parts: 3 },
//     fileFilter: (_req, file, cb) => {
//         const ok = [
//             "application/pdf",
//             "image/png",
//             "image/jpeg",
//             "image/jpg",
//             "image/webp",
//             "image/tiff",
//             "image/heic",
//             "image/heif",
//         ].includes(file.mimetype);
//         if (!ok) return cb(new Error("Unsupported file type"));
//         cb(null, true);
//     },
// });

// const router = Router();

// // ---- OCR clients ----
// const visionClient = new vision.ImageAnnotatorClient(); // משתמש ב-GOOGLE_APPLICATION_CREDENTIALS
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// // ---- ParsedInvoiceData schema (לפי ההגדרה שלך) ----
// const ParsedSchema = z.object({
//     supplier_name: z.string().optional().default(""),
//     business_number: z.string().optional().default(""),
//     invoice_type: z.string().optional().default(""),
//     invoice_description: z.string().optional().default(""),
//     amount: z.number().optional().default(0),
//     project: z.string().optional().default(""),
//     bank_details_file: z.string().optional().nullable().default(null),
//     supplier_email: z.string().email().optional().default(""),
// });
// type ParsedInvoiceData = z.infer<typeof ParsedSchema>;

// // ---- helpers ----
// function normalizeRtl(raw: string) {
//     return raw
//         .replace(/[\u200e\u200f]/g, "") // strip bidi marks
//         .replace(/[“”״]/g, '"')
//         .replace(/[’׳]/g, "'")
//         .replace(/\t/g, " ")
//         .replace(/[ \u00A0]+/g, " ")
//         .trim();
// }

// async function ocrFromImageBuffer(buf: Buffer) {
//     const [result] = await visionClient.documentTextDetection({
//         image: { content: buf },
//         imageContext: {
//             // אפשר לתת רמזי שפה (רשות)
//             languageHints: ["iw", "en"],
//         },
//     });

//     return result.fullTextAnnotation?.text ?? "";
// }

// async function extractText(file: Express.Multer.File): Promise<string> {
//     const mt = (file.mimetype || "").toLowerCase();

//     if (mt.includes("pdf")) {
//         // PDF processing skipped - will be handled by Vision API or return empty for fallback
//         return "";
//     }

//     if (/image\/(png|jpe?g|webp|tiff|heic|heif)/.test(mt)) {
//         const text = await ocrFromImageBuffer(file.buffer);
//         return text.trim();
//     }

//     return "";
// }

// // ---- regex “קלים” ----
// function quickExtract(raw: string): Partial<ParsedInvoiceData> {
//     const t = normalizeRtl(raw);
//     const out: Partial<ParsedInvoiceData> = {};

//     const email = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
//     if (email) out.supplier_email = email;

//     const biz =
//         t.match(/\b(\d{8,9})\b(?=.*(?:ח\.פ|ח״פ|עוסק|VAT|Tax\s?ID|Company\s?ID))/i)?.[1] ||
//         t.match(/\b(?:VAT|Tax\s?ID|ח\.פ)\D{0,5}(\d{8,9})\b/i)?.[1];
//     if (biz) out.business_number = biz;

//     const invNum =
//         t.match(/(?:Invoice|חשבונית)[^\d]{0,12}(\d{3,12})/i)?.[1] ||
//         t.match(/\bINV[-\s]?(\d{3,12})\b/i)?.[1];
//     if (invNum) out.invoice_description = `Invoice #${invNum}`;

//     const invType =
//         (/(חשבונית מס|Tax Invoice)/i.test(t) && "חשבונית מס") ||
//         (/(חשבונית עסקה|Invoice)/i.test(t) && "חשבונית עסקה") ||
//         "";
//     if (invType) out.invoice_type = invType;

//     const amt = t.match(/(?:Total|סה"?כ|סך הכל)[^\d\-]{0,12}(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/i)?.[1];
//     if (amt) {
//         const n = Number(amt.replace(/[,\s]/g, ""));
//         if (!Number.isNaN(n)) out.amount = n;
//     }

//     // ספק/שם (best-effort)
//     const supplier =
//         t.match(/(?:Supplier|ספק)\s*[:\-]\s*(.+)/i)?.[1]?.split("\n")[0] ||
//         t.match(/(?:Business Name|שם\s*עסק)\s*[:\-]\s*(.+)/i)?.[1]?.split("\n")[0];
//     if (supplier) out.supplier_name = supplier.trim();

//     return out;
// }

// // ---- LLM להשלמות (טקסט בלבד) ----
// async function llmFill(raw: string, base: Partial<ParsedInvoiceData>): Promise<Partial<ParsedInvoiceData>> {
//     const interesting = raw
//         .split(/\n{2,}/)
//         .filter(p => /(invoice|חשבונית|total|סה"?כ|tax|vat|email|@|ח\.פ|עוסק|supplier|project|bank)/i.test(p))
//         .join("\n\n")
//         .slice(0, 8000);

//     const model = genAI.getGenerativeModel({
//         model: GEMINI_MODEL,
//         generationConfig: {
//             temperature: 0,
//             responseMimeType: "application/json",
//             maxOutputTokens: 400,
//         },
//     });

//     const prompt = [
//         "החזר JSON בלבד בהתאם לסכמה (ללא טקסט נוסף):",
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
//         'אל תנחש. אם ערך לא קיים החזר "" או null. ודא שסכום הוא מספר.',
//         "טקסט המסמך (he+en):",
//         "```",
//         interesting,
//         "```",
//     ].join("\n");

//     const resp = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
//     try {
//         return JSON.parse(resp.response.text());
//     } catch {
//         return {};
//     }
// }

// // ---- Route ----
// router.post(
//     "/upload-invoice",
//     upload.fields([
//         { name: "invoice", maxCount: 1 },
//         { name: "bank_details", maxCount: 1 },
//     ]),
//     async (req: Request, res: Response) => {
//         const t0 = Date.now();
//         try {
//             const files = req.files as Record<string, Express.Multer.File[]> | undefined;
//             const inv = files?.invoice?.[0];
//             if (!inv) return res.status(400).json({ error: "Missing invoice file" });

//             const bank = files?.bank_details?.[0];

//             // 1) OCR/טקסט
//             let raw = await extractText(inv);
//             if (!raw) {
//                 // כאן אפשר לחבר בעתיד Vision-async ל-PDF סרוק (GCS). כרגע נחזיר 422:
//                 return res.status(422).json({ error: "scanned-pdf-not-supported-yet", hint: "Upload image or text-PDF" });
//             }
//             raw = normalizeRtl(raw);

//             // 2) Regex “קלים”
//             const base = quickExtract(raw);

//             // 3) LLM אם חסר משהו מרכזי
//             const needs =
//                 !base.supplier_email || !base.business_number || !base.invoice_type || !(base.amount && base.amount !== 0);

//             let merged: Partial<ParsedInvoiceData> = { ...base };
//             if (needs) {
//                 const llm = await llmFill(raw, base);
//                 merged = { ...merged, ...Object.fromEntries(Object.entries(llm).filter(([, v]) => v !== "" && v != null)) };
//             }

//             // 4) אם הועלה קובץ בנק – סמני זאת
//             if (bank && (merged.bank_details_file == null || merged.bank_details_file === "")) {
//                 merged.bank_details_file = "uploaded-bank-file";
//             }

//             // 5) ולידציה סופית והחזרה (בדיוק המבנה שהקליינט שלך מצפה אליו)
//             const data = ParsedSchema.parse(merged);
//             const totalMs = Date.now() - t0;
//             // לא מכניסים מטא לתגובה כי ה-UI שלך מצפה לאובייקט הישיר:
//             return res.json(data);
//         } catch (err: any) {
//             console.error("upload-invoice error:", err);
//             return res.status(500).json({ error: err?.message || "AI extraction failed" });
//         }
//     }
// );

// export default router;




import { Router, type Request, type Response } from "express";
import multer from "multer";
import vision from "@google-cloud/vision";
import { GoogleGenerativeAI } from "@google/generative-ai";
import PDFParser from "pdf2json";
import path from "node:path";



const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 10);
const router = Router();

// ---- Multer (פשוט, לזיכרון) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 2 },
});

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : path.resolve(process.cwd(), "secrets", "sa.json");

  
  
// ---- OCR/LLM ----
const visionClient = new vision.ImageAnnotatorClient({ keyFilename: keyFile }); // דורש GOOGLE_APPLICATION_CREDENTIALS
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// ---- עזרות ----
function normalizeRtl(raw: string) {
  return (raw || "")
    .replace(/[\u200e\u200f]/g, "")
    .replace(/[“”״]/g, '"')
    .replace(/[’׳]/g, "'")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .trim();
}

async function ocrFromImageBuffer(buf: Buffer) {
  try {
    const [result] = await visionClient.documentTextDetection({
      image: { content: buf },
      imageContext: { languageHints: ["he", "en"] },
    });
    return result.fullTextAnnotation?.text ?? "";
  } catch {
    return "";
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", err => reject(err.parserError));
    pdfParser.on("pdfParser_dataReady", pdfData => {
      const text = pdfParser.getRawTextContent();
      resolve(text);
    });
    pdfParser.parseBuffer(buffer);
  });
}

async function extractTextBestEffort(file?: Express.Multer.File): Promise<string> {
  if (!file) return "";
  const mt = (file.mimetype || "").toLowerCase();

  try {
    if (mt.includes("pdf")) {
      // ✅ שימוש ב-pdf2json
      const text = (await extractPdfText(file.buffer)).trim();
      return text; // גם אם ריק – לא מפילים
    }

    if (/^image\/(png|jpe?g|webp|tiff|heic|heif)$/.test(mt)) {
      const text = await ocrFromImageBuffer(file.buffer);
      return (text || "").trim();
    }
  } catch {
    // לא מפילים כלום
  }
  return "";
}


function quickExtract(raw: string) {
  const t = normalizeRtl(raw);
  const out: any = {};

  const email = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) out.supplier_email = email;

  const biz =
    t.match(/\b(\d{8,9})\b(?=.*(?:ח\.פ|ח״פ|עוסק|VAT|Tax\s?ID|Company\s?ID))/i)?.[1] ||
    t.match(/\b(?:VAT|Tax\s?ID|ח\.פ)\D{0,5}(\d{8,9})\b/i)?.[1];
  if (biz) out.business_number = biz;

  const invNum =
    t.match(/(?:Invoice|חשבונית)[^\d]{0,12}(\d{3,12})/i)?.[1] ||
    t.match(/\bINV[-\s]?(\d{3,12})\b/i)?.[1];
  if (invNum) out.invoice_description = `Invoice #${invNum}`;

  const invType =
    (/(חשבונית מס|Tax Invoice)/i.test(t) && "חשבונית מס") ||
    (/(חשבונית עסקה|Invoice)/i.test(t) && "חשבונית עסקה") ||
    "";
  if (invType) out.invoice_type = invType;

  const amt = t.match(/(?:Total|סה"?כ|סך הכל)[^\d\-]{0,12}(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/i)?.[1];
  if (amt) {
    const n = Number(amt.replace(/[,\s]/g, ""));
    if (!Number.isNaN(n)) out.amount = n;
  }

  const supplier =
    t.match(/(?:Supplier|ספק)\s*[:\-]\s*(.+)/i)?.[1]?.split("\n")[0] ||
    t.match(/(?:Business Name|שם\s*עסק)\s*[:\-]\s*(.+)/i)?.[1]?.split("\n")[0];
  if (supplier) out.supplier_name = supplier.trim();

  return out;
}
async function llmToJson(rawFull: string) {
  const rawOriginal = rawFull || "";
  const rawNormalized = normalizeRtl(rawOriginal);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 400,
    },
  });

  const prompt = [
    "החזר JSON בלבד לפי המפתח הבא (בלי טקסט נוסף):",
`{
  "supplier_name": string,
  "business_number": string,
  "invoice_type": string,
  "invoice_description": string,
  "amount": number,
  "project": string,
  "bank_details_file": string | null,
  "supplier_email": string
}`,
    'אל תנחש; אם אין ערך החזר "" או null. ודא שסכום הוא number.',
    "טקסט מקורי מלא (he+en, ייתכן ג׳יבריש):",
    "```",
    rawOriginal,
    "```",
    "גרסה מנורמלת (סיוע בלבד):",
    "```",
    rawNormalized,
    "```",
  ].join("\n");

  try {
    const resp = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    return JSON.parse(resp.response.text() || "{}") ?? {};
  } catch {
    return {};
  }
}


function coerceParsed(p: any) {
  // מבטיחים שהמבנה קבוע ותמיד חוקי לקליינט
  return {
    supplier_name: typeof p?.supplier_name === "string" ? p.supplier_name : "",
    business_number: typeof p?.business_number === "string" ? p.business_number : "",
    invoice_type: typeof p?.invoice_type === "string" ? p.invoice_type : "",
    invoice_description: typeof p?.invoice_description === "string" ? p.invoice_description : "",
    amount: typeof p?.amount === "number" ? p.amount : Number(p?.amount) || 0,
    project: typeof p?.project === "string" ? p.project : "",
    bank_details_file:
      p?.bank_details_file == null || p?.bank_details_file === "" ? null : String(p.bank_details_file),
    supplier_email: typeof p?.supplier_email === "string" ? p.supplier_email : "",
  };
}

// ---- Route: תמיד 200 עם אובייקט ----
router.post(
  "/upload-invoice",
  upload.fields([{ name: "invoice", maxCount: 1 }, { name: "bank_details", maxCount: 1 }]),
  async (req: Request, res: Response) => {
    const t0 = Date.now();
    const debug = req.query.debug === "1";
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const inv = files?.invoice?.[0];
      const bank = files?.bank_details?.[0];

      // 1) חילוץ טקסט מלא (בלי סינון/חוקים)
      const rawFull = await extractTextBestEffort(inv);
      console.log("[upload-invoice] mime/size:", inv?.mimetype, inv?.size, "rawLen:", rawFull.length);

      // 2) JSON ע״י LLM בלבד
      const llm = await llmToJson(rawFull);

      // 3) בנייה זהירה עם ברירות מחדל
      const data = {
        supplier_name: typeof llm?.supplier_name === "string" ? llm.supplier_name : "",
        business_number: typeof llm?.business_number === "string" ? llm.business_number : "",
        invoice_type: typeof llm?.invoice_type === "string" ? llm.invoice_type : "",
        invoice_description: typeof llm?.invoice_description === "string" ? llm.invoice_description : "",
        amount: typeof llm?.amount === "number" ? llm.amount : Number(llm?.amount) || 0,
        project: typeof llm?.project === "string" ? llm.project : "",
        bank_details_file: bank ? (llm?.bank_details_file || "uploaded-bank-file") : (llm?.bank_details_file ?? null),
        supplier_email: typeof llm?.supplier_email === "string" ? llm.supplier_email : "",
      };

      // 4) דיבוג אופציונלי ללקוח
      if (debug) {
        const preview = (rawFull || "").replace(/\s+/g, " ").trim();
        (data as any)._debug = {
          ms: Date.now() - t0,
          raw_len: rawFull.length,
          raw_preview: preview.slice(0, 500) + (preview.length > 500 ? " ..." : ""),
        };
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[upload-invoice] error:", err?.message || err);
      return res.json({
        supplier_name: "",
        business_number: "",
        invoice_type: "",
        invoice_description: "",
        amount: 0,
        project: "",
        bank_details_file: null,
        supplier_email: "",
      });
    }
  }
);



export default router;
