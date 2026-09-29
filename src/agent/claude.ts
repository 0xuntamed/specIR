import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Proposal, type Model, type Project } from "./fill";
import { projectContext, RULES } from "./prompt";

export const CLAUDE_MODEL = "claude-opus-5";

export function claudeModel(outDir: string, client = new Anthropic()): Model {
  const contexts = new Map<Project, string>();
  return async ({ project, messages }) => {
    const context = contexts.get(project) ?? projectContext(outDir, project);
    contexts.set(project, context);
    const stream = client.beta.messages.stream({
      model: CLAUDE_MODEL,
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
      // Assistant turns are this adapter's own content blocks (thinking included), echoed back.
      messages: messages as Anthropic.Beta.BetaMessageParam[],
    });
    const message = await stream.finalMessage();
    const usage = message.usage;
    return {
      proposal: message.stop_reason === "refusal" ? null : message.parsed_output,
      content: message.content,
      model: message.model,
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
