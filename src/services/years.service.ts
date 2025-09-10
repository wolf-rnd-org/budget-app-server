import { base } from "../utils/airtableConfig.js";

export async function getCurrentYearRecId(): Promise<string> {
  const settings = await base("settings").select({ maxRecords: 1 }).firstPage();
  if (!settings.length) throw new Error("Settings table is empty");

  const row = settings[0];
  if (!row) throw new Error("Settings row is undefined");
  const link =
    (row.get("current_year") as string[] | undefined) ??
    (row.get("year") as string[] | undefined) ??
    (row.get("currentYear") as string[] | undefined);

  if (!link?.length) throw new Error("current_year link is missing on settings");
  if (typeof link[0] !== "string") throw new Error("current_year value is not a string");
  return link[0] as string;
}