import type { Spec } from "../../ir/types";
import { entityNamed, loginField } from "../model";
import { camel, HEADER, pascal } from "../names";

// src/auth.ts: password hashing, JWT, the implicit auth.* endpoints, and the
// preHandlers routes use for "user" and { role } access.
export function authModule(spec: Spec): string {
  const auth = spec.auth!;
  const user = entityNamed(spec, auth.userEntity);
  const table = camel(user.name);
  const schema = pascal(user.name);
  const email = loginField(spec);
  const hasRoles = auth.roles.length > 0;
  const claims = hasRoles ? "{ sub: string; role: string }" : "{ sub: string }";
  const liveOnly = user.softDelete ? `, isNull(${table}.deletedAt)` : "";
  const ormImports = user.softDelete ? "and, eq, isNull" : "and, eq";
  const sign = hasRoles ? "{ sub: row.id, role: row.role }" : "{ sub: row.id }";

  return `${HEADER}
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ${ormImports} } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "./db/client.js";
import { ${table} } from "./db/schema.js";
import { HttpError } from "./lib/errors.js";
import { ${schema}, ${schema}Create } from "./schemas/${table}.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: ${claims};
    user: ${claims};
  }
}

export type AuthUser = { id: string${hasRoles ? "; role: string" : ""} };

const TOKEN_TTL = "7d";
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Stored as scrypt$<salt>$<hash>, both base64.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return \`scrypt$\${salt.toString("base64")}$\${hash.toString("base64")}\`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

// preHandler for auth: "user". Rejects with 401 unless the bearer token is valid.
export async function authenticate(request: FastifyRequest): Promise<void> {
  await request.jwtVerify();
}
${
  hasRoles
    ? `
// preHandler for auth: { role }. 401 without a valid token, 403 with the wrong role.
export function requireRole(role: string) {
  return async (request: FastifyRequest): Promise<void> => {
    await request.jwtVerify();
    if (request.user.role !== role) throw new HttpError(403, "Forbidden");
  };
}
`
    : ""
}
const RegisterBody = ${schema}Create.extend({ password: z.string().min(8) });
const LoginBody = z.strictObject({ ${email}: z.email(), password: z.string() });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // auth.register
  app.post("/auth/register", async (request, reply) => {
    const { password, ...fields } = RegisterBody.parse(request.body);
    const [row] = await db
      .insert(${table})
      .values({ ...fields, ${email}: fields.${email}.toLowerCase(), passwordHash: await hashPassword(password) })
      .returning();
    return reply.status(201).send({ token: app.jwt.sign(${sign}, { expiresIn: TOKEN_TTL }), user: ${schema}.parse(row) });
  });

  // auth.login
  app.post("/auth/login", async (request) => {
    const body = LoginBody.parse(request.body);
    const [row] = await db
      .select()
      .from(${table})
      .where(and(eq(${table}.${email}, body.${email}.toLowerCase())${liveOnly}));
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      throw new HttpError(401, "Invalid ${email} or password");
    }
    return { token: app.jwt.sign(${sign}, { expiresIn: TOKEN_TTL }), user: ${schema}.parse(row) };
  });

  // auth.me
  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const [row] = await db
      .select()
      .from(${table})
      .where(and(eq(${table}.id, request.user.sub)${liveOnly}));
    if (!row) throw new HttpError(404, "User not found");
    return ${schema}.parse(row);
  });
}
`;
}
