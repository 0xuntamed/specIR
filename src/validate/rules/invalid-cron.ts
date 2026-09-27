import type { Finding, Rule } from "../context";

const FIELDS = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day of month", 1, 31],
  ["month", 1, 12],
  ["day of week", 0, 7],
] as const;

// Basic 5-field check: each field is a comma list of *, n, or n-m, each
// optionally with /step. Names like MON aren't supported.
function cronError(schedule: string): string | undefined {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return `expected 5 fields, got ${parts.length}`;
  for (const [i, [name, min, max]] of FIELDS.entries()) {
    for (const item of parts[i]!.split(",")) {
      const m = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(item);
      if (!m) return `${name}: "${item}" isn't *, n, n-m or a /step`;
      const [, from, to, step] = m;
      for (const n of [from, to]) {
        if (n !== undefined && (Number(n) < min || Number(n) > max)) return `${name}: ${n} is outside ${min}-${max}`;
      }
      if (from !== undefined && to !== undefined && Number(from) > Number(to)) return `${name}: range ${from}-${to} is reversed`;
      if (step !== undefined && Number(step) === 0) return `${name}: step can't be 0`;
    }
  }
  return undefined;
}

// Rule 13.
export const invalidCron: Rule = {
  code: "invalid-cron",
  level: "error",
  check(spec) {
    const findings: Finding[] = [];
    spec.jobs.forEach((j, i) => {
      const error = cronError(j.trigger.schedule);
      if (error) findings.push({ path: `jobs[${i}].trigger.schedule`, message: `job ${j.id}: "${j.trigger.schedule}": ${error}` });
    });
    return findings;
  },
};
