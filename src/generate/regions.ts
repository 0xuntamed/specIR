// Slot regions: the only parts of a generated file that are preserved when
// regenerating. Each slot has a body region `<id>` and an `<id>:imports`
// region at module scope.
export const regionBegin = (id: string) => `// @appspec:slot ${id} begin`;
export const regionEnd = (id: string) => `// @appspec:slot ${id} end`;

// Begin line, body, end line (same id). Tolerates CRLF from editors.
export const REGION = /^([ \t]*\/\/ @appspec:slot (\S+) begin\r?\n)([\s\S]*?)(^[ \t]*\/\/ @appspec:slot \2 end)$/gm;

export function regionsOf(text: string): Map<string, string> {
  return new Map([...text.matchAll(REGION)].map((m) => [m[2]!, m[3]!]));
}

// Stub bodies, exactly as generated. A region still holding its stub has no
// user code in it, so its file can be deleted when the slot leaves the spec.
export const backendStub = (id: string) => `  throw new NotImplemented(${JSON.stringify(id)});\n`;
export const pageStub = (id: string) => `  void api;\n  void params;\n  return <NotImplemented slot=${JSON.stringify(id)} intent={INTENT} />;\n`;

export function isStub(id: string, body: string): boolean {
  if (id.endsWith(":imports")) return body === "";
  return body === backendStub(id) || body === pageStub(id);
}
