import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Proposal, type Model, type Project } from "./fill";

export const MODEL = "claude-opus-5";

const COMMON = `You implement a "slot": one function in an app that the AppSpec compiler generated from a spec. The compiler writes every other file. A slot holds logic the spec could only describe in plain English (its intent). Your code is placed into the slot file between its marker comments; nothing else in the file or project changes.

Return:
- imports: module-level code for the slot's imports region (extra import declarations, helper functions, constants). Empty string if you need none.
- body: the statements of the slot function's body, indented two spaces. It replaces the stub.
- summary: one sentence on what your implementation does.

Your code is kept only if the whole project still typechecks (tsc, strict) and every bare import is a Node built-in (with the node: prefix) or a package listed in package.json dependencies. If it's rejected, you get the errors and another try.

Implement the intent completely, with no placeholders, TODOs or mock behavior. Keep it as simple as the intent allows.`;

const RULES: Record<Project, string> = {
  api: `${COMMON}

This is the backend: Fastify, Drizzle ORM over node-postgres, and Zod, shown below.
- Use ctx.db (Drizzle) for data access and ctx.db.transaction for multi-step writes. For row locking you can run raw SQL through drizzle-orm's sql tag.
- Access is checked before the slot runs: rows passed in the input are already loaded and owned by the current user.
- Relative imports use .js extensions (NodeNext modules), e.g. "../db/schema.js".
- Money columns hold integer minor units; the invoice's currency field names the currency.`,
  web: `${COMMON}

This is the frontend: React 19, react-router and Vite, shown below. It talks to the backend only through the typed client in contract/client.ts, exposed as \`api\` from src/api.ts.
- Build the UI from the kit components (src/components/kit.tsx) and the existing CSS classes (src/styles.css).
- Relative imports are extensionless, e.g. "../components/kit".
- The slot component receives its route params as props.`,
};

// Project files any slot may need. They don't change while slots are being
// filled, so they sit in the cached part of the prompt.
function projectFiles(outDir: string, project: Project): string[] {
  if (project === "web") {
    return ["web/package.json", "contract/client.ts", "web/src/api.ts", "web/src/components/kit.tsx", "web/src/lib/fields.ts", "web/src/lib/hooks.ts", "web/src/styles.css"];
  }
  const schemas = readdirSync(join(outDir, "api/src/schemas")).map((f) => `api/src/schemas/${f}`);
  return [
    "api/package.json",
    "api/migrations/0000_init.sql",
    "api/src/db/schema.ts",
    "api/src/lib/context.ts",
    "api/src/lib/errors.ts",
    "api/src/lib/load.ts",
    "api/src/integrations/email.ts",
    ...schemas,
  ];
}

function projectContext(outDir: string, project: Project): string {
  return projectFiles(outDir, project)
    .filter((path) => existsSync(join(outDir, path)))
    .map((path) => `<file path="${path}">\n${readFileSync(join(outDir, path), "utf8").trimEnd()}\n</file>`)
    .join("\n\n");
}

export function claudeModel(outDir: string, client = new Anthropic()): Model {
  const contexts = new Map<Project, string>();
  return async ({ project, messages }) => {
    const context = contexts.get(project) ?? projectContext(outDir, project);
    contexts.set(project, context);
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(Proposal) },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: RULES[project] },
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    const message = await stream.finalMessage();
    const usage = message.usage;
    return {
      proposal: message.stop_reason === "refusal" ? null : message.parsed_output,
      content: message.content,
      stopReason: message.stop_reason,
      usage: {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}
