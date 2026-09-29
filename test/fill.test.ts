import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fill, slotTargets, type Model, type ModelReply, type Proposal, type Turn, type Verifier } from "../src/agent/fill";
import { generate } from "../src/generate/index";
import { REGION, regionsOf } from "../src/generate/regions";
import { writeFiles } from "../src/generate/write";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";

const spec = validate(invoiceReminder).spec!;
const SLOT = "api/src/slots/markInvoicePaid.ts";

function generated(): string {
  const dir = mkdtempSync(join(tmpdir(), "appspec-fill-"));
  writeFiles(dir, generate(spec));
  return dir;
}

const reply = (proposal: Proposal): ModelReply => ({
  proposal,
  content: JSON.stringify(proposal),
  model: "fake",
  stopReason: "end_turn",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});
const good: Proposal = { imports: 'import { eq } from "drizzle-orm";', body: "  void eq;\n  return input.invoice;", summary: "returns it" };

// A model that replays canned replies and records what it was sent.
function fakeModel(replies: (ModelReply | Error)[]) {
  const calls: Turn[][] = [];
  const model: Model = async ({ messages }) => {
    calls.push(structuredClone(messages));
    const next = replies.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  return { model, calls };
}

// A verifier that returns canned results in order (the first is the baseline check).
function fakeVerifier(results: string[][]) {
  let count = 0;
  const verify: Verifier = async () => {
    count++;
    return results.shift() ?? [];
  };
  return { verify, count: () => count };
}

const lastUserText = (messages: Turn[]) => String(messages[messages.length - 1]!.content);
const outsideRegions = (text: string) => text.replace(REGION, "$1$4");

describe("fill", () => {
  it("fills a slot with code that passes verification, and touches only its regions", async () => {
    const dir = generated();
    const before = readFileSync(join(dir, SLOT), "utf8");
    const { model } = fakeModel([reply(good)]);
    const results = await fill({ outDir: dir, spec, model, verify: fakeVerifier([[], []]).verify, only: ["markInvoicePaid"] });

    expect(results).toEqual([{ id: "markInvoicePaid", status: "filled", attempts: 1, detail: "returns it" }]);
    const after = readFileSync(join(dir, SLOT), "utf8");
    expect(regionsOf(after).get("markInvoicePaid")).toBe("  void eq;\n  return input.invoice;\n");
    expect(regionsOf(after).get("markInvoicePaid:imports")).toBe('import { eq } from "drizzle-orm";\n');
    expect(outsideRegions(after)).toBe(outsideRegions(before));
  });

  it("sends typecheck errors back and keeps the retry that passes", async () => {
    const dir = generated();
    const { model, calls } = fakeModel([reply({ ...good, body: "  return 42;" }), reply(good)]);
    const verifier = fakeVerifier([[], ["api/src/slots/markInvoicePaid.ts(12,3): error TS2322: Type 'number' is not assignable"], []]);
    const results = await fill({ outDir: dir, spec, model, verify: verifier.verify, only: ["markInvoicePaid"] });

    expect(results[0]).toMatchObject({ status: "filled", attempts: 2 });
    expect(lastUserText(calls[1]!)).toContain("error TS2322");
    expect(calls[1]![1]!.role).toBe("assistant"); // the first answer is echoed back
  });

  it("restores the stub and logs every attempt when all attempts fail", async () => {
    const dir = generated();
    const before = readFileSync(join(dir, SLOT), "utf8");
    const { model } = fakeModel([reply(good), reply(good), reply(good)]);
    const results = await fill({ outDir: dir, spec, model, verify: fakeVerifier([[], ["e1"], ["e2"], ["e3"]]).verify, only: ["markInvoicePaid"] });

    expect(results[0]).toMatchObject({ status: "failed", attempts: 3, detail: "e3" });
    expect(readFileSync(join(dir, SLOT), "utf8")).toBe(before);
    const log = JSON.parse(readFileSync(join(dir, ".appspec/agent/markInvoicePaid.json"), "utf8"));
    expect(log.attempts).toHaveLength(3);
  });

  it("restores the stub and moves on when the model request fails mid-slot", async () => {
    const dir = generated();
    const before = readFileSync(join(dir, SLOT), "utf8");
    const { model } = fakeModel([reply({ ...good, body: "  return 42;" }), new Error("OpenRouter 429: Rate limit exceeded")]);
    const results = await fill({ outDir: dir, spec, model, verify: fakeVerifier([[], ["error TS2322"]]).verify, only: ["markInvoicePaid"] });

    expect(results[0]).toEqual({ id: "markInvoicePaid", status: "failed", attempts: 2, detail: "model request failed: OpenRouter 429: Rate limit exceeded" });
    expect(readFileSync(join(dir, SLOT), "utf8")).toBe(before); // not the rejected first attempt
  });

  it("rejects undeclared packages before writing or typechecking", async () => {
    const dir = generated();
    const { model, calls } = fakeModel([reply({ ...good, imports: 'import PDFDocument from "pdfkit";' }), reply(good)]);
    const verifier = fakeVerifier([[], []]);
    const results = await fill({ outDir: dir, spec, model, verify: verifier.verify, only: ["markInvoicePaid"] });

    expect(results[0]).toMatchObject({ status: "filled", attempts: 2 });
    expect(lastUserText(calls[1]!)).toContain('"pdfkit" is not a dependency');
    expect(verifier.count()).toBe(2); // baseline + the accepted attempt only
  });

  it("skips slots that already hold code, without calling the model", async () => {
    const dir = generated();
    const path = join(dir, SLOT);
    writeFileSync(path, readFileSync(path, "utf8").replace('  throw new NotImplemented("markInvoicePaid");\n', "  return input.invoice;\n"));
    const { model, calls } = fakeModel([]);
    const results = await fill({ outDir: dir, spec, model, verify: fakeVerifier([]).verify, only: ["markInvoicePaid"] });

    expect(results).toEqual([{ id: "markInvoicePaid", status: "skipped", attempts: 0, detail: "already implemented" }]);
    expect(calls).toHaveLength(0);
  });

  it("won't start when the project already fails to typecheck", async () => {
    const dir = generated();
    const { model } = fakeModel([]);
    await expect(fill({ outDir: dir, spec, model, verify: fakeVerifier([["broken before we began"]]).verify })).rejects.toThrow(/doesn't typecheck before filling/);
    expect(existsSync(join(dir, ".appspec/agent"))).toBe(false);
  });

  it("targets backend slots and the frontend page slot", () => {
    expect(slotTargets(spec).map((t) => t.file)).toEqual([
      "api/src/slots/sendInvoice.ts",
      "api/src/slots/renderInvoicePdf.ts",
      "api/src/slots/markInvoicePaid.ts",
      "api/src/slots/processDueReminders.ts",
      "web/src/slots/invoiceEditor.tsx",
    ]);
  });
});
