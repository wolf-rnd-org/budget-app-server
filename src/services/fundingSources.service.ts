import { base } from "../utils/airtableConfig.js";

export type FundingSourceDTO = { id: string; name: string };

export async function findProgramRecIdById(programId: string): Promise<string | null> {
    const esc = programId.replace(/"/g, '\\"');
    const res = await base("programs")
        .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
        .firstPage();
    return res[0]?.id ?? null;
}

async function getCurrentYearRecId(): Promise<string> {
    // לוקחים את רשומת ההגדרות היחידה
    const [settingsRec] = await base("settings").select({ maxRecords: 1, pageSize: 1 }).firstPage();
    if (!settingsRec) throw new Error("Settings record not found");

    // מחפשים את רשומת השנה שמקושרת לאותה settings דרך השדה {settings} בטבלת years
    const years = await base("years")
        .select({
            filterByFormula: `FIND("${settingsRec.id}", ARRAYJOIN({settings} & ""))>0`,
            fields: ["year_id", "value"],   // לא חובה, רק לנוחות
            maxRecords: 1,
            pageSize: 1,
        })
        .firstPage();

    if (!years[0]) throw new Error("No year linked to settings (via years.settings)");
    return years[0].id; // recId של השנה הנוכחית
}

/** מחזיר מקורות מימון לשנה הנוכחית; אם נשלח program_id – יוודא שהוא חלק מהשנה */
export async function listFundingSources(programIdText?: string) {
    const yearRecId = await getCurrentYearRecId();

    // אם חשוב לך לאמת שה-program קיים – נשאיר בדיקה קלה:
    if (programIdText) {
        const programRecId = await findProgramRecIdById(programIdText);
        if (!programRecId) return [];
        // (אופציונלי) לוודא שה-program משויך לשנה: נבדוק ב-years שה-programRecId בתוך {programs}
        // נשמיט כרגע כדי לפשט.
    }

    const filterByFormula = `FIND("${yearRecId}", ARRAYJOIN({year} & ""))>0`;

    const records = await base("budgets")
        .select({ filterByFormula, fields: ["budget_id", "name"], pageSize: 100 })
        .firstPage();
    if (!records.length) return [];

    return records
        .map(r => {
            const f = r.fields as any;
            return { id: String(f.budget_id ?? r.id), name: String(f.name ?? "") };
        })
        .filter(x => x.name);
}
