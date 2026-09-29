import type { Model, ModelReply, Project, Proposal } from "./fill";
import { projectContext, RULES } from "./prompt";

// OpenRouter: one OpenAI-style API in front of many models, some of them free.
// Free models come and go; `appspec models` lists today's.

const API = "https://openrouter.ai/api/v1";

// The default for `fill`. OpenRouter tries them in order within one request:
// if one errors (rate limit, downtime, prompt too long), the next answers.
export const FREE_MODELS = ["qwen/qwen3.8-27b:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "poolside/laguna-s-2.1:free"];

// Code inside JSON strings needs escaping that smaller models get wrong, and
// not every free model supports structured output. Tagged sections work everywhere.
const FORMAT = `Reply with exactly these three sections and nothing after them. Put raw code inside the tags, without markdown fences.
<imports>
...
</imports>
<body>
...
</body>
<summary>...</summary>`;

function section(text: string, tag: string): string | undefined {
  const start = text.lastIndexOf(`<${tag}>`);
  const end = start < 0 ? -1 : text.indexOf(`</${tag}>`, start);
  if (end < 0) return undefined;
  return text
    .slice(start + tag.length + 2, end)
    .replace(/^\s*```[\w-]*\n([\s\S]*?)\n?```\s*$/, "$1") // fences, despite the instructions
    .replace(/^\s*\n/, "") // leading blank lines, keeping the first line's indentation
    .trimEnd();
}

// A proposal, or what's wrong with the reply.
export function parseReply(text: string): Proposal | string {
  const [imports, body, summary] = ["imports", "body", "summary"].map((tag) => section(text, tag));
  if (imports === undefined || body === undefined || summary === undefined) {
    return "the reply didn't have the <imports>, <body> and <summary> sections";
  }
  return { imports, body, summary: summary.trim() };
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(`OpenRouter ${status}: ${message}${hint(status, message)}`);
  }
  get retryable(): boolean {
    return (this.status === 429 && !/per-day/i.test(this.message)) || this.status >= 500;
  }
}

function hint(status: number, message: string): string {
  if (/data policy/i.test(message)) return " (free models need your OpenRouter privacy settings to allow them: https://openrouter.ai/settings/privacy)";
  if (/per-day/i.test(message)) return " (free models allow 50 requests a day, or 1000 once you've bought $10 of credits)";
  if (status === 401) return " (check OPENROUTER_API_KEY)";
  return "";
}

type Completion = { text: string; finish: string | null; model: string; usage: ModelReply["usage"] };

type Chunk = {
  model?: string;
  error?: { message?: string };
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

export type OpenRouterOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

export function openRouterModel(outDir: string, models: string[], options: OpenRouterOptions): Model {
  const doFetch = options.fetch ?? fetch;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // Streams, so slow free models don't hit a response-header timeout while thinking.
  async function complete(body: object): Promise<Completion> {
    const res = await doFetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", "x-title": "AppSpec" },
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; metadata?: { raw?: unknown } } };
      const raw = typeof data.error?.metadata?.raw === "string" ? ` — ${data.error.metadata.raw.slice(0, 300)}` : "";
      const retryAfter = Number(res.headers.get("retry-after"));
      throw new OpenRouterError(res.status, `${data.error?.message ?? res.statusText}${raw}`, retryAfter > 0 ? retryAfter * 1000 : undefined);
    }
    const out: Completion = { text: "", finish: null, model: models[0]!, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (buffer + value).split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data:")) continue; // blank lines and ": OPENROUTER PROCESSING" keep-alives
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const chunk = JSON.parse(data) as Chunk;
        // An error after the stream started: the provider failed mid-answer.
        if (chunk.error) throw new OpenRouterError(502, chunk.error.message ?? "error during the response");
        out.model = chunk.model ?? out.model;
        const choice = chunk.choices?.[0];
        out.text += choice?.delta?.content ?? "";
        out.finish = choice?.finish_reason ?? out.finish;
        if (chunk.usage) {
          out.usage = {
            input: chunk.usage.prompt_tokens ?? 0,
            output: chunk.usage.completion_tokens ?? 0,
            cacheRead: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
            cacheWrite: 0,
          };
        }
      }
    }
    return out;
  }

  // Free models are rate limited (20 requests a minute), so wait and retry briefly.
  async function completeWithRetries(body: object): Promise<Completion> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await complete(body);
      } catch (err) {
        const retryable = err instanceof OpenRouterError ? err.retryable : err instanceof TypeError; // TypeError: fetch failed
        const delay = (err instanceof OpenRouterError ? err.retryAfterMs : undefined) ?? 5000 * 2 ** (attempt - 1);
        if (!retryable || attempt === 4 || delay > 60_000) throw err;
        await wait(delay);
      }
    }
  }

  const contexts = new Map<Project, string>();
  return async ({ project, messages }) => {
    const context = contexts.get(project) ?? projectContext(outDir, project);
    contexts.set(project, context);
    const reply = await completeWithRetries({
      ...(models.length === 1 ? { model: models[0] } : { models }),
      messages: [
        // Identical for every slot of a project, so providers that cache prompt prefixes can reuse it.
        { role: "system", content: `${RULES[project]}\n\n${context}\n\n${FORMAT}` },
        ...messages.map((m) => ({ role: m.role, content: String(m.content) })),
      ],
      reasoning: { effort: "high" }, // ignored by models that don't reason
    });
    const parsed = parseReply(reply.text);
    const cutOff = reply.finish === "length" ? " (it was cut off at the model's output limit)" : "";
    return {
      proposal: typeof parsed === "string" ? null : parsed,
      ...(typeof parsed === "string" ? { error: parsed + cutOff } : {}),
      content: reply.text,
      model: reply.model,
      stopReason: reply.finish,
      usage: reply.usage,
    };
  };
}

export type FreeModel = { id: string; context: number | null; expires: string | null };

// Text models that cost nothing, newest first. The model list is public; no key needed.
export async function freeModels(doFetch: typeof fetch = fetch): Promise<FreeModel[]> {
  const res = await doFetch(`${API}/models`);
  if (!res.ok) throw new OpenRouterError(res.status, res.statusText);
  const { data } = (await res.json()) as {
    data: {
      id: string;
      created: number;
      context_length: number | null;
      expiration_date?: string | null;
      pricing: { prompt: string; completion: string };
      architecture: { output_modalities: string[] };
    }[];
  };
  return data
    .filter((m) => Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)
    .filter((m) => m.architecture.output_modalities.join() === "text")
    .sort((a, b) => b.created - a.created)
    .map((m) => ({ id: m.id, context: m.context_length, expires: m.expiration_date ?? null }));
}
