import type { Finding, Rule } from "../context";

// Rule 10. Custom endpoints, custom pages and jobs must name an existing slot;
// other pages must not have one.
export const slotRef: Rule = {
  code: "slot-ref",
  level: "error",
  check(spec, ctx) {
    const findings: Finding[] = [];
    const require = (slot: string | undefined, path: string, what: string) => {
      if (slot === undefined) findings.push({ path, message: `${what} must declare a slot` });
      else if (!ctx.slots.has(slot)) findings.push({ path: `${path}.slot`, message: `${what} names unknown slot "${slot}"` });
    };

    spec.endpoints.forEach((ep, i) => {
      if (ep.kind === "custom") require(ep.slot, `endpoints[${i}]`, `custom endpoint ${ep.id}`);
    });
    spec.jobs.forEach((j, i) => require(j.slot, `jobs[${i}]`, `job ${j.id}`));
    spec.pages.forEach((p, i) => {
      if (p.layout === "custom") require(p.slot, `pages[${i}]`, `custom page ${p.id}`);
      else if (p.slot !== undefined) {
        findings.push({ path: `pages[${i}].slot`, message: `page ${p.id} has layout ${p.layout}; only custom pages take a slot` });
      }
    });
    return findings;
  },
};
