import type { Rule } from "../context";

// Rule 4. The login identifier must be a required, unique email.
export const authUserEntity: Rule = {
  code: "auth-user-entity",
  level: "error",
  check(spec, ctx) {
    if (!spec.auth) return [];
    const user = ctx.entities.get(spec.auth.userEntity);
    if (!user) {
      return [{ path: "auth.userEntity", message: `auth user entity "${spec.auth.userEntity}" doesn't exist` }];
    }
    if (!user.fields.some((f) => f.type === "email" && f.required && f.unique)) {
      return [{ path: "auth.userEntity", message: `${user.name} needs a required, unique email field to log in with` }];
    }
    return [];
  },
};
