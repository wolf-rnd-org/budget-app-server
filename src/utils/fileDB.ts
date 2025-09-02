import fs from "fs/promises";
import path from "path";

const candidateDirs = [
  path.join(process.cwd(), "src", "db"),   // dev
  path.join(process.cwd(), "dist", "db"),  // build
  path.join(process.cwd(), "db"),          // fallback
];

async function resolvePath(file: string): Promise<string> {
  for (const dir of candidateDirs) {
    const p = path.join(dir, file);
    try {
      const s = await fs.stat(p);
      if (s.isFile()) return p;
    } catch (_) {}
  }
  const err = new Error(`DB file "${file}" not found in: ${candidateDirs.join(" | ")}`);
  (err as any).status = 500;
  throw err;
}

export async function readJson<T>(file: string): Promise<T> {
  const p = await resolvePath(file);
  const raw = await fs.readFile(p, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    const err = new Error(`DB file "${file}" is empty at: ${p}`);
    (err as any).status = 500;
    throw err;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (e: any) {
    e.message = `Failed parsing JSON in "${file}" (${p}): ${e.message}`;
    e.status = 500;
    throw e;
  }
}
