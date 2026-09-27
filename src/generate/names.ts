// LineItem → lineItem
export const camel = (s: string): string => s[0]!.toLowerCase() + s.slice(1);

// sendInvoice → SendInvoice
export const pascal = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

// LineItem / issueDate → line_item / issue_date
export const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// Every generated file starts with this marker, in the file type's comment
// syntax. The writer only overwrites files that carry it.
export const MARKER = "@appspec:generated";
export const HEADER = `// ${MARKER} — do not edit`;

// Wraps text into `// `-prefixed (or other) comment lines of at most `width` chars.
export function wrap(text: string, prefix: string, width = 100): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && prefix.length + line.length + 1 + word.length > width) {
      lines.push(prefix + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(prefix + line);
  return lines;
}
