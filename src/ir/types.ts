import type { z } from "zod";
import type * as S from "./schema";

// Parsed IR: defaults applied, so generators never see missing flags.
export type Spec = z.output<typeof S.Spec>;
export type Entity = z.output<typeof S.Entity>;
export type Field = z.output<typeof S.Field>;
export type Param = z.output<typeof S.Param>;
export type Relation = z.output<typeof S.Relation>;
export type Auth = z.output<typeof S.Auth>;
export type Integration = z.output<typeof S.Integration>;
export type Access = z.output<typeof S.Access>;
export type Endpoint = z.output<typeof S.Endpoint>;
export type Job = z.output<typeof S.Job>;
export type Page = z.output<typeof S.Page>;
export type Slot = z.output<typeof S.Slot>;

// What spec authors write: defaulted keys are optional.
export type SpecInput = z.input<typeof S.Spec>;

// Identity function that gives spec files type checking and autocomplete.
// Specs must stay plain data (JSON-serializable) so a canvas can emit them.
export const defineSpec = (spec: SpecInput): SpecInput => spec;
