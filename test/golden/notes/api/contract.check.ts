// @appspec:generated — do not edit
// Compile-time proof that contract/client.ts matches this backend. If the client
// and the Zod schemas ever drift, `npm run typecheck` fails on the line below.
import type * as Api from "../contract/client.js";
import type { z } from "zod";
import type { LoginBody, RegisterBody } from "./src/auth.js";
import type { Note, NoteCreate, NoteUpdate } from "./src/schemas/note.js";
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
  Assert<Same<Api.Note, Wire<z.output<typeof Note>>>>,
  Assert<Same<Api.NoteCreate, z.input<typeof NoteCreate>>>,
  Assert<Same<Api.NoteUpdate, z.input<typeof NoteUpdate>>>,
  Assert<Same<Api.RegisterRequest, z.input<typeof RegisterBody>>>,
  Assert<Same<Api.LoginRequest, z.input<typeof LoginBody>>>,
];
