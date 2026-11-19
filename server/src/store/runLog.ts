import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DIR, "runs.jsonl");

export async function logRun(entry: Record<string, unknown>): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  await appendFile(FILE, line + "\n");
}