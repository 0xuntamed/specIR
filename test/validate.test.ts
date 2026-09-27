import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rules, validate } from "../src/validate/index";

const brokenSpecs = readdirSync(new URL("../specs/broken/", import.meta.url))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.slice(0, -".ts".length))
  .sort();

it("every rule has exactly one broken spec, named after its code", () => {
  expect(brokenSpecs).toEqual(rules.map((r) => r.code).sort());
});

describe.each(brokenSpecs)("specs/broken/%s.ts", (code) => {
  it("fires its own rule and nothing else", async () => {
    const { default: spec } = await import(`../specs/broken/${code}.ts`);
    const { diagnostics } = validate(spec);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.map((d) => d.code)).toEqual(diagnostics.map(() => code));
    // The snapshot pins every path and message, so wording changes show up in review.
    expect(diagnostics).toMatchSnapshot();
  });
});
