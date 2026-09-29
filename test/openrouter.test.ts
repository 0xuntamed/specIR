import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_MODELS, freeModels, openRouterModel, parseReply } from "../src/agent/openrouter";
import { RULES } from "../src/agent/prompt";
import { generate } from "../src/generate/index";
import { writeFiles } from "../src/generate/write";
import { validate } from "../src/validate/index";
import invoiceReminder from "../specs/invoice-reminder";

const dir = mkdtempSync(join(tmpdir(), "appspec-openrouter-"));
writeFiles(dir, generate(validate(invoiceReminder).spec!));

const ANSWER = `<imports>
import { eq } from "drizzle-orm";
</imports>
<body>
  // total in €
  return input.invoice;
</body>
<summary>Returns the invoice.</summary>`;

// An SSE response, cut into small byte chunks so lines and characters split across reads.
function sse(events: unknown[], chunkSize = 7): Response {
  const text = [": OPENROUTER PROCESSING\n\n", ...events.map((e) => `data: ${JSON.stringify(e)}\n\n`), "data: [DONE]\n\n"].join("");
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const answer = (text: string, model = "qwen/qwen3.8-27b:free", finish = "stop") =>
  sse([
    { model, choices: [{ delta: { content: text.slice(0, 40) } }] },
    { model, choices: [{ delta: { content: text.slice(40) }, finish_reason: finish }] },
    { model, choices: [{ delta: { content: "" }, finish_reason: finish }], usage: { prompt_tokens: 900, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 600 } } },
  ]);

const failure = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code: status, message } }), { status, headers: { "content-type": "application/json", ...headers } });

function fakeFetch(responses: (() => Response)[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init! });
    return responses.shift()!();
  }) as typeof globalThis.fetch;
  const body = (i: number) => JSON.parse(requests[i]!.init.body as string);
  return { fetch, requests, body };
}

function recordWaits() {
  const waits: number[] = [];
  return { waits, wait: async (ms: number) => void waits.push(ms) };
}

const brief = [{ role: "user" as const, content: "Implement slot `markInvoicePaid`." }];

describe("parseReply", () => {
  it("reads the three sections, keeping the body's indentation", () => {
    expect(parseReply(ANSWER)).toEqual({
      imports: 'import { eq } from "drizzle-orm";',
      body: "  // total in €\n  return input.invoice;",
      summary: "Returns the invoice.",
    });
  });

  it("strips markdown fences and uses the last copy of each section", () => {
    const text = `I'll answer with <body> and friends.\n<imports></imports>\n<body>\n\`\`\`ts\n  return 1;\n\`\`\`\n</body>\n<summary> One. </summary>`;
    expect(parseReply(text)).toEqual({ imports: "", body: "  return 1;", summary: "One." });
  });

  it("explains a reply without the sections", () => {
    expect(parseReply('{"body": "return 1;"}')).toMatch(/didn't have the <imports>, <body> and <summary> sections/);
  });
});

describe("openRouterModel", () => {
  it("streams a proposal from the free models, falling back in order", async () => {
    const f = fakeFetch([() => answer(ANSWER, "poolside/laguna-s-2.1:free")]);
    const model = openRouterModel(dir, FREE_MODELS, { apiKey: "test-key", fetch: f.fetch });
    const reply = await model({ project: "api", messages: brief });

    expect(reply).toMatchObject({
      proposal: { body: "  // total in €\n  return input.invoice;", summary: "Returns the invoice." },
      model: "poolside/laguna-s-2.1:free", // whichever model answered
      stopReason: "stop",
      usage: { input: 900, output: 80, cacheRead: 600, cacheWrite: 0 },
    });
    expect(f.requests[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((f.requests[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = f.body(0);
    expect(body).toMatchObject({ models: FREE_MODELS, stream: true });
    expect(body.model).toBeUndefined();
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain(RULES.api);
    expect(body.messages[0].content).toContain('<file path="api/src/db/schema.ts">');
    expect(body.messages[0].content).toMatch(/<imports>\n\.\.\.\n<\/imports>\n<body>/);
    expect(body.messages.slice(1)).toEqual(brief);
  });

  it("sends a single model as `model`, and earlier answers back as text", async () => {
    const f = fakeFetch([() => answer(ANSWER)]);
    const model = openRouterModel(dir, ["qwen/qwen3.8-27b:free"], { apiKey: "k", fetch: f.fetch });
    await model({ project: "web", messages: [...brief, { role: "assistant", content: "<body>bad</body>" }, { role: "user", content: "Your code was rejected" }] });

    const body = f.body(0);
    expect(body.model).toBe("qwen/qwen3.8-27b:free");
    expect(body.models).toBeUndefined();
    expect(body.messages[0].content).toContain(RULES.web);
    expect(body.messages[2]).toEqual({ role: "assistant", content: "<body>bad</body>" });
  });

  it("retries rate limits, honouring Retry-After, and mid-stream provider errors", async () => {
    const f = fakeFetch([
      () => failure(429, "Rate limit exceeded", { "retry-after": "2" }),
      () => sse([{ error: { code: "server_error", message: "upstream died" }, choices: [{ delta: { content: "" }, finish_reason: "error" }] }]),
      () => answer(ANSWER),
    ]);
    const { waits, wait } = recordWaits();
    const reply = await openRouterModel(dir, FREE_MODELS, { apiKey: "k", fetch: f.fetch, wait })({ project: "api", messages: brief });

    expect(reply.proposal).not.toBeNull();
    expect(waits).toEqual([2000, 10000]);
  });

  it("doesn't retry the daily free-model cap, and says what it means", async () => {
    const f = fakeFetch([() => failure(429, "Rate limit exceeded: free-models-per-day")]);
    const { waits, wait } = recordWaits();
    const model = openRouterModel(dir, FREE_MODELS, { apiKey: "k", fetch: f.fetch, wait });

    await expect(model({ project: "api", messages: brief })).rejects.toThrow(/OpenRouter 429: .*free-models-per-day \(free models allow 50 requests a day/);
    expect(waits).toEqual([]);
  });

  it("points at the privacy settings when no free endpoint matches the data policy", async () => {
    const f = fakeFetch([() => failure(404, "No endpoints found matching your data policy")]);
    const model = openRouterModel(dir, FREE_MODELS, { apiKey: "k", fetch: f.fetch });
    await expect(model({ project: "api", messages: brief })).rejects.toThrow(/settings\/privacy/);
  });

  it("gives up after four tries", async () => {
    const f = fakeFetch(Array.from({ length: 4 }, () => () => failure(503, "overloaded")));
    const { waits, wait } = recordWaits();
    const model = openRouterModel(dir, FREE_MODELS, { apiKey: "k", fetch: f.fetch, wait });

    await expect(model({ project: "api", messages: brief })).rejects.toThrow("OpenRouter 503: overloaded");
    expect(waits).toEqual([5000, 10000, 20000]);
  });

  it("reports a reply cut off at the output limit", async () => {
    const f = fakeFetch([() => answer(ANSWER.slice(0, 60), undefined, "length")]);
    const reply = await openRouterModel(dir, FREE_MODELS, { apiKey: "k", fetch: f.fetch })({ project: "api", messages: brief });

    expect(reply.proposal).toBeNull();
    expect(reply.error).toMatch(/didn't have the .* sections \(it was cut off at the model's output limit\)/);
  });
});

describe("freeModels", () => {
  it("lists free text models, newest first", async () => {
    const model = (id: string, created: number, price: string, output = ["text"]) => ({
      id,
      created,
      context_length: 131072,
      pricing: { prompt: price, completion: price },
      architecture: { output_modalities: output },
    });
    const data = [model("a/old:free", 1, "0"), model("b/paid", 3, "0.000001"), model("c/music", 4, "0", ["text", "audio"]), model("d/new:free", 2, "0")];
    const f = fakeFetch([() => new Response(JSON.stringify({ data }))]);

    expect(await freeModels(f.fetch)).toEqual([
      { id: "d/new:free", context: 131072, expires: null },
      { id: "a/old:free", context: 131072, expires: null },
    ]);
    expect(f.requests[0]!.url).toBe("https://openrouter.ai/api/v1/models");
  });
});
