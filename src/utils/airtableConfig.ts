import Airtable from "airtable";

// אם חסרים ENV נקבל שגיאה ברורה בזמן ריצה
if (!process.env.AIRTABLE_TOKEN) {
  throw new Error("Missing AIRTABLE_TOKEN in environment");
}
if (!process.env.AIRTABLE_BASE_ID) {
  throw new Error("Missing AIRTABLE_BASE_ID in environment");
}

export const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
  .base(process.env.AIRTABLE_BASE_ID);
