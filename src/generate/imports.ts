// Collects named imports while a file is generated, then renders them sorted
// (packages before relative paths, names alphabetically) so output is stable.
// A name prefixed with "type " is a type-only import.
export class Imports {
  private modules = new Map<string, Set<string>>();

  add(from: string, ...names: string[]): this {
    const set = this.modules.get(from) ?? new Set<string>();
    for (const name of names) set.add(name);
    this.modules.set(from, set);
    return this;
  }

  render(): string[] {
    const bare = (m: string) => (m.startsWith(".") ? 1 : 0);
    const plain = (n: string) => n.replace(/^type /, "");
    return [...this.modules]
      .sort(([a], [b]) => bare(a) - bare(b) || (a < b ? -1 : a > b ? 1 : 0))
      .map(([from, names]) => {
        const sorted = [...names].sort((a, b) => (plain(a) < plain(b) ? -1 : plain(a) > plain(b) ? 1 : 0));
        const typeOnly = sorted.every((n) => n.startsWith("type "));
        const list = typeOnly ? sorted.map(plain) : sorted;
        return `import ${typeOnly ? "type " : ""}{ ${list.join(", ")} } from "${from}";`;
      });
  }
}
