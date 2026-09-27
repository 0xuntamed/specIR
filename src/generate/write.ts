import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MARKER } from "./names";

// A slot region: begin line, body, end line (same id).
const REGION = /^([ \t]*\/\/ @appspec:slot (\S+) begin\r?\n)([\s\S]*?)(^[ \t]*\/\/ @appspec:slot \2 end)$/gm;

// Generated files carry the marker in their first lines (line 2 for package.json).
const isGenerated = (text: string) => text.split("\n", 3).some((line) => line.includes(MARKER));

function regionBodies(text: string): Map<string, string> {
  return new Map([...text.matchAll(REGION)].map((m) => [m[2]!, m[3]!]));
}

export type WriteResult = { written: string[]; unchanged: string[] };

// Writes generated files into outDir. Never touches a file without the
// generated marker (it's user-owned), and carries slot region bodies over from
// the existing file, so regenerating never loses slot code.
export function writeFiles(outDir: string, files: Map<string, string>): WriteResult {
  const userOwned = [...files.keys()].filter((path) => {
    const target = join(outDir, path);
    return existsSync(target) && !isGenerated(readFileSync(target, "utf8"));
  });
  if (userOwned.length > 0) {
    throw new Error(`refusing to overwrite files without the ${MARKER} marker:\n  ${userOwned.join("\n  ")}`);
  }

  const result: WriteResult = { written: [], unchanged: [] };
  for (const [path, content] of files) {
    const target = join(outDir, path);
    let next = content;
    if (existsSync(target)) {
      const current = readFileSync(target, "utf8");
      const bodies = regionBodies(current);
      next = content.replace(REGION, (_match, begin: string, id: string, body: string, end: string) => begin + (bodies.get(id) ?? body) + end);
      if (next === current) {
        result.unchanged.push(path);
        continue;
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
    result.written.push(path);
  }
  return result;
}
