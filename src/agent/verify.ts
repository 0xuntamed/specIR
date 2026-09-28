import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Verifier } from "./fill";

// Typechecks a generated project (api/ or web/) with its own TypeScript,
// installing its dependencies on first use. For api/ this also compiles the
// contract check, so a slot can't break the client/backend agreement.
export function tscVerifier(outDir: string): Verifier {
  return async (project) => {
    const dir = join(outDir, project);
    if (!existsSync(join(dir, "node_modules"))) execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "ignore" });
    const tsc = join(dir, "node_modules", "typescript", "bin", "tsc");
    try {
      execFileSync(process.execPath, [tsc, "--noEmit", "-p", "."], { cwd: dir, encoding: "utf8", stdio: "pipe" });
      return [];
    } catch (err) {
      const output = String((err as { stdout?: string }).stdout || err);
      return output.split("\n").filter((line) => line.trim() !== "");
    }
  };
}
