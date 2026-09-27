import type { Finding, Rule } from "../context";

// Rule 11.
export const unknownEndpoint: Rule = {
  code: "unknown-endpoint",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.pages.forEach((p, i) =>
      p.uses.forEach((id, j) => {
        if (ctx.endpoints.has(id)) return;
        const hint = id.startsWith("auth.") && !spec.auth ? " (auth endpoints need an auth block)" : "";
        findings.push({ path: `pages[${i}].uses[${j}]`, message: `page ${p.id} uses unknown endpoint "${id}"${hint}` });
      }),
    );
    return findings;
  },
};
