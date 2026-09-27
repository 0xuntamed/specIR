// @appspec:generated — do not edit
// Compile-time proof that contract/client.ts matches this backend. If the client
// and the Zod schemas ever drift, `npm run typecheck` fails on the line below.
import type * as Api from "../contract/client.js";
import type { z } from "zod";
import type { LoginBody, RegisterBody } from "./src/auth.js";
import type { Client, ClientCreate, ClientUpdate } from "./src/schemas/client.js";
import type { Invoice, InvoiceCreate, InvoiceUpdate } from "./src/schemas/invoice.js";
import type { LineItem, LineItemCreate, LineItemUpdate } from "./src/schemas/lineItem.js";
import type { Reminder } from "./src/schemas/reminder.js";
import type { User, UserCreate } from "./src/schemas/user.js";

// Mutual assignability catches type, required-vs-optional and nullability
// differences; comparing keys also catches an extra optional field, which
// assignability alone lets through ({ a } and { a, b? } accept each other).
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Same<A, B> = Mutual<A, B> extends true ? Mutual<keyof A, keyof B> : false;
// What JSON serialization makes of a response: Dates become ISO strings.
type Wire<T> = T extends Date ? string : T extends (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
type Assert<T extends true> = T;

export type ContractChecks = [
  Assert<Same<Api.User, Wire<z.output<typeof User>>>>,
  Assert<Same<Api.UserCreate, z.input<typeof UserCreate>>>,
  Assert<Same<Api.Client, Wire<z.output<typeof Client>>>>,
  Assert<Same<Api.ClientCreate, z.input<typeof ClientCreate>>>,
  Assert<Same<Api.ClientUpdate, z.input<typeof ClientUpdate>>>,
  Assert<Same<Api.Invoice, Wire<z.output<typeof Invoice>>>>,
  Assert<Same<Api.InvoiceCreate, z.input<typeof InvoiceCreate>>>,
  Assert<Same<Api.InvoiceUpdate, z.input<typeof InvoiceUpdate>>>,
  Assert<Same<Api.LineItem, Wire<z.output<typeof LineItem>>>>,
  Assert<Same<Api.LineItemCreate, z.input<typeof LineItemCreate>>>,
  Assert<Same<Api.LineItemUpdate, z.input<typeof LineItemUpdate>>>,
  Assert<Same<Api.Reminder, Wire<z.output<typeof Reminder>>>>,
  Assert<Same<Api.RegisterRequest, z.input<typeof RegisterBody>>>,
  Assert<Same<Api.LoginRequest, z.input<typeof LoginBody>>>,
];
