// @appspec:generated — do not edit
// How a field is shown, edited and sent. Pages declare FieldDef lists; the
// kit turns them into tables, detail lists and forms.
export type FieldDef = {
  name: string;
  label: string;
  kind: "string" | "text" | "email" | "password" | "uuid" | "int" | "money" | "bool" | "datetime" | "date" | "enum" | "ref";
  required: boolean;
  values?: string[]; // enum
  default?: string | number | boolean;
  options?: () => Promise<{ value: string; label: string }[]>; // ref pickers
};

export type FormValues = Record<string, string | boolean>;

// Money is integer minor units on the wire, shown with 2 decimals.
export function display(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.kind) {
    case "money":
      return (Number(value) / 100).toFixed(2);
    case "bool":
      return value ? "Yes" : "No";
    case "datetime":
      return new Date(String(value)).toLocaleString();
    default:
      return String(value);
  }
}

function toInput(field: FieldDef, value: unknown): string | boolean {
  if (field.kind === "bool") return value === true;
  if (value === null || value === undefined) return "";
  switch (field.kind) {
    case "money":
      return (Number(value) / 100).toFixed(2);
    case "datetime": {
      // datetime-local wants local time without a zone: YYYY-MM-DDTHH:mm
      const date = new Date(String(value));
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }
    default:
      return String(value);
  }
}

// undefined = leave the field out; null = clear it.
function fromInput(field: FieldDef, input: string | boolean): unknown {
  if (field.kind === "bool") return input === true;
  const text = String(input);
  if (text.trim() === "") return field.required ? undefined : null;
  switch (field.kind) {
    case "int": {
      const n = Number.parseInt(text, 10);
      return Number.isNaN(n) ? text : n;
    }
    case "money": {
      const n = Number.parseFloat(text);
      return Number.isNaN(n) ? text : Math.round(n * 100);
    }
    case "datetime":
      return new Date(text).toISOString();
    default:
      return text;
  }
}

// Form state from a record (edit) or from field defaults (create).
export function initialValues(fields: FieldDef[], record?: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const field of fields) values[field.name] = toInput(field, record ? record[field.name] : field.default);
  return values;
}

export function payload(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = fromInput(field, values[field.name] ?? "");
    if (value !== undefined) body[field.name] = value;
  }
  return body;
}
