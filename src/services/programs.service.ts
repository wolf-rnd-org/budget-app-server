import { readJson } from "../utils/fileDB.js";
import { z } from "zod";

const ProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Program = z.infer<typeof ProgramSchema>;

async function loadAll(): Promise<Program[]> {
  const raw = await readJson<unknown>("getprogrambyuserid.json");
  if (!Array.isArray(raw)) throw new Error("getprogrambyuserid.json must be an array");
  return raw.map((x) => ProgramSchema.parse(x));
}

export async function listAll(): Promise<Program[]> {
  return loadAll();
}

export async function getById(id: string): Promise<Program | null> {
  const all = await loadAll();
  return all.find(p => p.id === id) ?? null;
}

// במוק: מחזיר את כולן בלי קשר ל-userId (כדי להתאים לקליינט)
export async function listByUserId(_userId: string | number): Promise<Program[]> {
  return loadAll();
}
