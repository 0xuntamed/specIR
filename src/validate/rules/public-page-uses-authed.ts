import type { Finding, Rule } from "../context";

// Rule 12. A warning: the page renders for anyone, but its calls will 401.
export const publicPageUsesAuthed: Rule = {
  code: "public-page-uses-authed",
  level: "warning",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.pages.forEach((p, i) => {
      if (p.auth !== "public") return;
      p.uses.forEach((id, j) => {
        const ep = ctx.endpoints.get(id);
        if (ep && ep.auth !== "public") {
          findings.push({ path: `pages[${i}].uses[${j}]`, message: `public page ${p.id} uses ${id}, which requires auth` });
        }
      });
    });
    return findings;
  },
};
