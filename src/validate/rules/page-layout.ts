import { planPage } from "../../ir/pages";
import type { Finding, Rule } from "../context";

// Each layout needs a specific set of endpoints (see src/ir/pages.ts) so the
// frontend generator knows what to render. Pages using unknown endpoints are
// left to rule 11.
export const pageLayout: Rule = {
  code: "page-layout",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    spec.pages.forEach((page, i) => {
      if (page.uses.some((id) => !ctx.endpoints.has(id))) return;
      const result = planPage(spec, page);
      if ("error" in result) findings.push({ path: `pages[${i}]`, message: result.error });
    });
    return findings;
  },
};
