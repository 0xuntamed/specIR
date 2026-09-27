import { planPage, type PagePlan } from "../../ir/pages";
import type { Page, Spec } from "../../ir/types";
import { pathParams } from "../../validate/context";
import { pascal } from "../names";

// The frontend's view of the spec: every page with its plan, plus the lookups
// pages use to link to each other.
export type SitePage = { page: Page; plan: PagePlan; component: string; file: string };

export type Site = {
  pages: SitePage[];
  home: string; // where "/" and a successful login land
  loginRoute?: string;
  registerRoute?: string;
  nav: SitePage[]; // parameterless list pages
  pageFor: (kind: "list" | "detail" | "edit" | "create", entity: string) => SitePage | undefined;
};

export function siteOf(spec: Spec): Site {
  const pages = spec.pages.map((page): SitePage => {
    const result = planPage(spec, page);
    if ("error" in result) throw new Error(`${result.error}; validate before generating`);
    return { page, plan: result.plan, component: `${pascal(page.id)}Page`, file: pascal(page.id) };
  });
  const noParams = (p: SitePage) => pathParams(p.page.route).length === 0;
  const nav = pages.filter((p) => p.plan.kind === "list" && noParams(p));
  const home =
    pages.find((p) => p.page.route === "/")?.page.route ??
    nav.find((p) => p.page.auth !== "public")?.page.route ??
    pages.find((p) => noParams(p) && p.plan.kind !== "login" && p.plan.kind !== "register")?.page.route ??
    "/";
  return {
    pages,
    home,
    loginRoute: pages.find((p) => p.plan.kind === "login")?.page.route,
    registerRoute: pages.find((p) => p.plan.kind === "register")?.page.route,
    nav,
    pageFor: (kind, entity) => pages.find((p) => p.plan.kind === kind && "entity" in p.plan && p.plan.entity === entity),
  };
}

// A route as a TS expression, filling params from `values` (param → expression).
// Undefined when some param can't be filled, i.e. the link isn't possible.
export function routeExpr(route: string, values: Record<string, string>): string | undefined {
  const params = pathParams(route);
  if (params.some((p) => !(p in values))) return undefined;
  if (params.length === 0) return JSON.stringify(route);
  return `\`${route.replace(/:([A-Za-z0-9]+)/g, (_, name: string) => `\${${values[name]}}`)}\``;
}

// The current page's route params, as expressions: { invoiceId: "params.invoiceId" }.
export function paramValues(route: string): Record<string, string> {
  return Object.fromEntries(pathParams(route).map((p) => [p, `params.${p}`]));
}

// dueDate → Due date, LineItem → Line item
export function humanize(s: string): string {
  const words = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0]!.toUpperCase() + words.slice(1);
}
