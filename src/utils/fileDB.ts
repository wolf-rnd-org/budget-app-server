import fs from "fs/promises";
import path from "path";

const dbDir = path.join(process.cwd(), "src", "db");

export async function readJson<T>(file: string): Promise<T> {
  const p = path.join(dbDir, file);
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}
