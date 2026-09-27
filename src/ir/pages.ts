import { entityParam, pathParams } from "../validate/context";
import type { Endpoint, Page, Spec } from "./types";

type Crud = Extract<Endpoint, { kind: "crud" }>;
type Custom = Extract<Endpoint, { kind: "custom" }>;

// What a page does, derived from its layout and the endpoints it uses. The
// validator reports pages that fit no plan; the React generator renders plans.
export type PagePlan =
  | { kind: "list"; entity: string; list: Crud; remove?: Crud }
  | { kind: "create"; entity: string; create: Crud; pickers: Crud[] }
  | { kind: "edit"; entity: string; get: Crud; update: Crud; pickers: Crud[] }
  | { kind: "login" }
  | { kind: "register" }
  | { kind: "detail"; entity: string; get: Crud; remove?: Crud; children: Crud[]; actions: Custom[] }
  | { kind: "custom" };

export function planPage(spec: Spec, page: Page): { plan: PagePlan } | { error: string } {
  if (page.layout === "custom") return { plan: { kind: "custom" } };

  // Unknown ids are rule 11's problem; plan with the ones that exist.
  const uses = page.uses.flatMap((id) => spec.endpoints.filter((ep) => ep.id === id));
  const crud = (op: Crud["op"]) => uses.filter((ep): ep is Crud => ep.kind === "crud" && ep.op === op);
  const route = new Set(pathParams(page.route));
  const fail = (error: string) => ({ error: `page ${page.id}: ${error}` });
  const missingParam = (ep: Endpoint) => pathParams(ep.path).find((p) => !route.has(p));
  const rest = (...used: Endpoint[]) => uses.find((ep) => !used.includes(ep));
  const belongsTo = (entity: string) =>
    spec.entities.find((e) => e.name === entity)?.relations.filter((r) => r.kind === "belongsTo") ?? [];
  // Flat list endpoints of belongsTo targets feed form pickers.
  const pickersFor = (entity: string) =>
    crud("list").filter((ep) => pathParams(ep.path).length === 0 && belongsTo(entity).some((r) => r.target === ep.entity));

  switch (page.layout) {
    case "list": {
      const [list, ...more] = crud("list");
      if (!list || more.length > 0) return fail("a list page uses exactly one list endpoint");
      const remove = crud("delete").find((ep) => ep.entity === list.entity);
      const extra = rest(list, ...(remove ? [remove] : []));
      if (extra) return fail(`a list page can't use ${extra.id} (only its list and delete endpoints)`);
      const missing = missingParam(list);
      if (missing) return fail(`route ${page.route} needs :${missing} for ${list.id}`);
      return { plan: { kind: "list", entity: list.entity, list, ...(remove ? { remove } : {}) } };
    }

    case "form": {
      const authIds = page.uses.filter((id) => id === "auth.login" || id === "auth.register");
      if (authIds.length > 0) {
        if (page.uses.length !== 1) return fail("an auth form uses only auth.login or auth.register");
        return { plan: { kind: authIds[0] === "auth.login" ? "login" : "register" } };
      }
      const [create, ...moreCreates] = crud("create");
      const [get, ...moreGets] = crud("get");
      const [update, ...moreUpdates] = crud("update");
      if (moreCreates.length || moreGets.length || moreUpdates.length) return fail("a form page edits one thing");
      if (create && !get && !update) {
        const pickers = pickersFor(create.entity);
        const extra = rest(create, ...pickers);
        if (extra) return fail(`a create form can't use ${extra.id} (only list endpoints for its belongsTo pickers)`);
        const missing = missingParam(create);
        if (missing) return fail(`route ${page.route} needs :${missing} for ${create.id}`);
        return { plan: { kind: "create", entity: create.entity, create, pickers } };
      }
      if (!create && get && update && get.entity === update.entity) {
        const pickers = pickersFor(get.entity);
        const extra = rest(get, update, ...pickers);
        if (extra) return fail(`an edit form can't use ${extra.id} (only list endpoints for its belongsTo pickers)`);
        const missing = missingParam(get) ?? missingParam(update);
        if (missing) return fail(`route ${page.route} needs :${missing}`);
        return { plan: { kind: "edit", entity: get.entity, get, update, pickers } };
      }
      return fail("a form page uses one create endpoint, or get + update of one entity, or auth.login / auth.register");
    }

    case "detail": {
      const [get, ...more] = crud("get");
      if (!get || more.length > 0) return fail("a detail page uses exactly one get endpoint");
      const missing = missingParam(get);
      if (missing) return fail(`route ${page.route} needs :${missing} for ${get.id}`);
      const remove = crud("delete").find((ep) => ep.entity === get.entity);
      // Child lists nested under this entity: /invoices/:invoiceId/line-items.
      const children = crud("list").filter((ep) => {
        const params = pathParams(ep.path);
        return params.length === 1 && belongsTo(ep.entity).some((r) => r.target === get.entity && `${r.name}Id` === params[0]);
      });
      // Actions on this row: custom endpoints guarding this entity, needing no other input.
      const actions = uses.filter((ep): ep is Custom => {
        if (ep.kind !== "custom" || ep.entity !== get.entity) return false;
        const params = pathParams(ep.path);
        const slot = spec.slots.find((s) => s.id === ep.slot);
        return params.length === 1 && params[0] === entityParam(get.entity) && !slot?.inputs.some((i) => i.required && i.name !== params[0]);
      });
      const extra = rest(get, ...(remove ? [remove] : []), ...children, ...actions);
      if (extra) return fail(`a detail page can't use ${extra.id} (only its get/delete, child lists, and actions on the row)`);
      return { plan: { kind: "detail", entity: get.entity, get, ...(remove ? { remove } : {}), children, actions } };
    }
  }
}
