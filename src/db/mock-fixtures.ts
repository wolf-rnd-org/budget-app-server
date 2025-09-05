// src/mocks/mock-fixtures.ts
export const MOCKS: Record<string, string> = {
  full: `...`,
  noisy: `...`,
  mini: `...`,
  allCases: `
חשבונית מס / TAX INVOICE ★★★
שם ספק: אהבה קטנה בע"מ / Ahava Ktana LTD
Business Name?? AHAVA-KTANA ✨ (duplicate!)
ח״פ: 515123456 , VAT ID: 0515123456 , ח.פ 515123456 (שלוש גרסאות שונות)
Invoice No: INV-2024/1783, וגם "חשבונית #1783" וגם 20241783 סתם
סה"כ לתשלום: 3,215.50₪ , Total=3215.50 , סך הכל: 3215,5 , USD $3,215.50
--
Project: BudgetApp Phase 1 (פרויקט א') --- אבל גם Project=Wolf R&D?
תיאור: Development + QA --- אבל מופיע גם "שירותי פיתוח • בדיקות" בשורה אחרת
---
Supplier Email: billing@ahavaktana.co.il
עוד מייל? BILLING (at) AHAVAKTANA . CO . IL
אולי בכלל info@ahavaktana.co.il???
---
Bank details attached: YES!! ראה קובץ מצורף בשם bank.pdf
(אבל גם כתוב: "אין לצרף פרטי בנק")
--
שורות ג'יבריש:
@@@### asdlkj123 -- אבגדהוז 😅😁 ♥♦♣♠
---- תווים מוזרים ---- { } [ ] ( ) <>
┌───────────────┐
│  Hash: #abc123 │
└───────────────┘
חוזר שוב: Invoice Invoice Invoice חשבונית מס חשבונית עסקה 
  `,
};
export function getMockText(name?: string): string {
  if (name && MOCKS[name]) return MOCKS[name];
  return MOCKS.allCases || ""; 
}

export function listMockNames(): string[] {
  return Object.keys(MOCKS);
}
