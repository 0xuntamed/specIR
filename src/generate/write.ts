import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MARKER } from "./names";
import { isStub, REGION, regionsOf } from "./regions";

// Generated files carry the marker in their first lines (line 2 for package.json).
const isGenerated = (text: string) => text.split("\n", 3).some((line) => line.includes(MARKER));

// Slot regions holding more than their stub, i.e. code someone wrote.
const writtenRegions = (text: string) => [...regionsOf(text)].filter(([id, body]) => !isStub(id, body)).map(([id]) => id);

// What the last run generated. Only these paths are ever deleted: the marker
// alone isn't proof, since `cp .env.example .env` copies it into a user file.
const MANIFEST = ".appspec/manifest.json";

function readManifest(outDir: string): string[] {
  const path = join(outDir, MANIFEST);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf8")) as { files: string[] }).files;
}

function manifestJson(files: Iterable<string>): string {
  return `${JSON.stringify({ "//": `${MARKER} — the files the last \`appspec generate\` wrote`, files: [...files] }, null, 2)}\n`;
}

export type WriteResult = {
  written: string[];
  unchanged: string[];
  deleted: string[]; // generated files the spec no longer produces
  orphaned: string[]; // same, but kept because their slot regions hold code
};

// Writes generated files into outDir, following the ownership rules:
// - a file without the generated marker is user-owned and never touched;
// - slot region bodies are carried over from the existing file;
// - files the last run generated that the spec no longer produces are deleted,
//   unless their slot regions hold code (kept, reported as orphaned) or their
//   marker was removed (the user took them over).
// Everything is checked before anything is written.
export function writeFiles(outDir: string, files: Map<string, string>): WriteResult {
  const current = new Map<string, string>();
  for (const path of new Set([...files.keys(), ...readManifest(outDir)])) {
    const target = join(outDir, path);
    if (existsSync(target)) current.set(path, readFileSync(target, "utf8"));
  }

  const userOwned = [...files.keys()].filter((path) => current.has(path) && !isGenerated(current.get(path)!));
  if (userOwned.length > 0) {
    throw new Error(`refusing to overwrite files without the ${MARKER} marker:\n  ${userOwned.join("\n  ")}`);
  }

  const next = new Map<string, string>();
  const dropped: string[] = [];
  for (const [path, content] of files) {
    const existing = current.get(path);
    if (existing === undefined) {
      next.set(path, content);
      continue;
    }
    const bodies = regionsOf(existing);
    const kept = new Set(regionsOf(content).keys());
    for (const id of writtenRegions(existing)) if (!kept.has(id)) dropped.push(`${path} (${id})`);
    next.set(path, content.replace(REGION, (_m, begin: string, id: string, body: string, end: string) => begin + (bodies.get(id) ?? body) + end));
  }
  if (dropped.length > 0) {
    throw new Error(`refusing to drop slot regions that hold code:\n  ${dropped.join("\n  ")}`);
  }

  const result: WriteResult = { written: [], unchanged: [], deleted: [], orphaned: [] };
  for (const [path, content] of next) {
    if (current.get(path) === content) {
      result.unchanged.push(path);
      continue;
    }
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    result.written.push(path);
  }

  for (const [path, text] of current) {
    if (files.has(path) || !isGenerated(text)) continue;
    if (writtenRegions(text).length > 0) {
      result.orphaned.push(path);
      continue;
    }
    rmSync(join(outDir, path));
    result.deleted.push(path);
    // Remove directories the deletion left empty.
    for (let dir = dirname(join(outDir, path)); dir !== outDir && readdirSync(dir).length === 0; dir = dirname(dir)) rmdirSync(dir);
  }

  // Orphans stay in the manifest so a later run reports them until they're resolved.
  mkdirSync(join(outDir, ".appspec"), { recursive: true });
  writeFileSync(join(outDir, MANIFEST), manifestJson([...files.keys(), ...result.orphaned].sort()));
  return result;
}
