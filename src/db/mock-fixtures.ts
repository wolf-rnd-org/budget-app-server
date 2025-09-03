// mock-fixtures.ts
// מאגר טקסטי דמו לבדיקה – אפשר להרחיב לפי הצורך

export const MOCKS: Record<string, string> = {
  en_simple: `
Tax Invoice
Supplier: ACME Ltd.
Company ID / VAT: 512345678
Invoice No: 2024-0917
Total: 1,234.56
Email: billing@acme.com
Project: Wolf R&D - Budget App
`,

  he_invoice: `
חשבונית מס
שם עסק: אהבה קטנה בע"מ
ח.פ: 515555555
מס' חשבונית: 100234
סה"כ: 3,280.00
דוא"ל: finance@ahava-ktana.co.il
פרויקט: ניהול תקציבים
`,

  mixed_he_en: `
Tax Invoice חשבונית
Business Name: "Studio R&L" שם עסק
VAT / ח"פ: 514444444
INV-00987
Total / סה"כ: 2,450.75
Supplier email: accounts@studio-rl.com
Project: Budget Pilot פיילוט
`,

  noisy_scan: `
...INV .... 000123   VAT 513333333
Total: 980.00     Supplier: FooBar Ltd
email:   pay@foobar.io
חשבונית מס / Invoice
`,

  complex_demo: `
חשבונית מס  #2025-0098
ספק: חברת "BlueSky Digital" בע"מ
ח.פ: 514332211
תאריך: 01/09/2025
סה"כ לתשלום: 4,875.90 ₪ (כולל מע"מ)
פרויקט: BudgetApp Pilot – שלב ב'

נא לשלם בהעברה בנקאית:
בנק הפועלים 12, סניף 123, חשבון 456789
קובץ פרטי חשבון מצורף במייל.

Contact: billing@bluesky.io
טלפון שירות: 03-7771234
`,
};
