import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { backendSlots } from "../generate/backend-node/slots";
import { isStub, REGION, regionsOf } from "../generate/regions";
import type { Slot, Spec } from "../ir/types";

// The one place in AppSpec that calls an LLM. Generation stays deterministic;
// this fills slot regions afterwards, one slot at a time, and only keeps code
// that passes the same checks a person's code would.

export type Project = "api" | "web";

export type SlotTarget = { slot: Slot; project: Project; file: string };

// What the model must return: the two region bodies, nothing else.
export const Proposal = z.object({
  imports: z.string().describe("Module-level code for the imports region: import declarations and helpers. Empty if none."),
  body: z.string().describe("Statements for the slot function body, indented two spaces."),
  summary: z.string().describe("One sentence on what the implementation does."),
});
export type Proposal = z.infer<typeof Proposal>;

export type ModelReply = {
  proposal: Proposal | null;
  content: Anthropic.Beta.BetaContentBlockParam[]; // echoed back verbatim on retries
  stopReason: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

export type Model = (request: { project: Project; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<ModelReply>;

// Returns problems (e.g. tsc errors); an empty list means the project is fine.
export type Verifier = (project: Project) => Promise<string[]>;

export type SlotResult = { id: string; status: "filled" | "failed" | "skipped"; attempts: number; detail: string };

export function slotTargets(spec: Spec): SlotTarget[] {
  const backend = backendSlots(spec).map(({ slot }) => ({ slot, project: "api" as const, file: `api/src/slots/${slot.id}.ts` }));
  const pages = spec.pages
    .filter((p) => p.layout === "custom" && p.slot !== undefined)
    .map((p) => ({ slot: spec.slots.find((s) => s.id === p.slot)!, project: "web" as const, file: `web/src/slots/${p.slot}.tsx` }));
  return [...backend, ...pages];
}

// Bare specifiers must be Node built-ins (node: prefix) or declared dependencies.
function importProblems(code: string, packages: Set<string>): string[] {
  const specifiers = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)].map((m) => m[1]!);
  return specifiers
    .filter((s) => !s.startsWith(".") && !s.startsWith("node:"))
    .filter((s) => !packages.has(s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]!))
    .map((s) => `"${s}" is not a dependency in package.json; use Node built-ins (node: prefix), declared packages, or project modules`);
}

function proposalProblems(proposal: Proposal, packages: Set<string>): string[] {
  const problems: string[] = [];
  if (/@appspec:slot/.test(proposal.imports + proposal.body)) problems.push("code must not contain @appspec:slot markers");
  if (proposal.body.trim() === "") problems.push("the body is empty");
  return [...problems, ...importProblems(`${proposal.imports}\n${proposal.body}`, packages)];
}

const asRegion = (code: string) => {
  const text = code.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  return text === "" ? "" : `${text}\n`;
};

export function spliceProposal(file: string, id: string, proposal: Proposal): string {
  const bodies = new Map([
    [`${id}:imports`, asRegion(proposal.imports)],
    [id, asRegion(proposal.body)],
  ]);
  return file.replace(REGION, (match, begin: string, regionId: string, _body: string, end: string) =>
    bodies.has(regionId) ? begin + bodies.get(regionId)! + end : match,
  );
}

const isUntouched = (file: string) => [...regionsOf(file)].every(([id, body]) => isStub(id, body));

function packagesOf(outDir: string, project: Project): Set<string> {
  const pkg = JSON.parse(readFileSync(join(outDir, project, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  return new Set(Object.keys(pkg.dependencies ?? {}));
}

// Signatures of the other slots in the same project, so a slot can call them.
function siblingSlots(outDir: string, target: SlotTarget, targets: SlotTarget[]): string {
  const lines = targets
    .filter((t) => t.project === target.project && t.slot.id !== target.slot.id)
    .map((t) => {
      const text = readFileSync(join(outDir, t.file), "utf8");
      const signature = text.split("\n").find((l) => l.startsWith("export async function") || l.startsWith("export function")) ?? "";
      const state = isUntouched(text) ? "not implemented yet" : "implemented";
      return `- ${t.file} (${state}): ${signature.replace(/\s*\{$/, "")}`;
    });
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

function brief(outDir: string, target: SlotTarget, targets: SlotTarget[]): string {
  const lang = target.project === "api" ? "ts" : "tsx";
  return [
    `Implement slot \`${target.slot.id}\`.`,
    "",
    "Intent:",
    target.slot.intent,
    "",
    `The slot file (${target.file}), with its contract and current stub:`,
    "```" + lang,
    readFileSync(join(outDir, target.file), "utf8").trimEnd(),
    "```",
    "",
    "Other slots in this project, which you may call:",
    siblingSlots(outDir, target, targets),
  ].join("\n");
}

export type FillOptions = {
  outDir: string;
  spec: Spec;
  model: Model;
  verify: Verifier;
  only?: string[]; // slot ids; default: every untouched slot
  maxAttempts?: number;
  onProgress?: (message: string) => void;
};

export async function fill(options: FillOptions): Promise<SlotResult[]> {
  const { outDir, spec, model, verify, maxAttempts = 3, onProgress = () => {} } = options;
  const targets = slotTargets(spec);
  const unknown = (options.only ?? []).filter((id) => !targets.some((t) => t.slot.id === id));
  if (unknown.length > 0) throw new Error(`no fillable slot named ${unknown.join(", ")}`);

  const results: SlotResult[] = [];
  const chosen = targets.filter((t) => !options.only || options.only.includes(t.slot.id));
  const baselineChecked = new Set<Project>();

  for (const target of chosen) {
    const path = join(outDir, target.file);
    const original = readFileSync(path, "utf8");
    if (!isUntouched(original)) {
      results.push({ id: target.slot.id, status: "skipped", attempts: 0, detail: "already implemented" });
      continue;
    }
    // Errors that exist before we start aren't the model's to fix.
    if (!baselineChecked.has(target.project)) {
      const existing = await verify(target.project);
      if (existing.length > 0) throw new Error(`${target.project}/ doesn't typecheck before filling:\n${existing.slice(0, 20).join("\n")}`);
      baselineChecked.add(target.project);
    }

    const packages = packagesOf(outDir, target.project);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: brief(outDir, target, targets) }];
    const log: unknown[] = [];
    let result: SlotResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onProgress(`${target.slot.id}: attempt ${attempt}`);
      const reply = await model({ project: target.project, messages });
      messages.push({ role: "assistant", content: reply.content });

      let problems: string[];
      if (!reply.proposal) {
        problems = [`the response had no valid proposal (stop reason: ${reply.stopReason})`];
      } else {
        problems = proposalProblems(reply.proposal, packages);
        if (problems.length === 0) {
          writeFileSync(path, spliceProposal(original, target.slot.id, reply.proposal));
          problems = await verify(target.project);
        }
      }
      log.push({ attempt, proposal: reply.proposal, problems, stopReason: reply.stopReason, usage: reply.usage });

      if (problems.length === 0) {
        result = { id: target.slot.id, status: "filled", attempts: attempt, detail: reply.proposal!.summary };
        break;
      }
      messages.push({
        role: "user",
        content: `Your code was rejected:\n${problems.slice(0, 40).join("\n")}\n\nReturn corrected imports and body.`,
      });
    }

    if (!result) {
      writeFileSync(path, original);
      const last = log[log.length - 1] as { problems: string[] };
      result = { id: target.slot.id, status: "failed", attempts: maxAttempts, detail: last.problems[0] ?? "unknown" };
    }
    // Every prompt, answer and check, for debugging and replay.
    const logFile = join(outDir, ".appspec", "agent", `${target.slot.id}.json`);
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, `${JSON.stringify({ slot: target.slot.id, file: target.file, result, attempts: log }, null, 2)}\n`);
    results.push(result);
  }
  return results;
}
