// @appspec:generated — do not edit
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "./db/client.js";
import { user } from "./db/schema.js";
import { HttpError } from "./lib/errors.js";
import { User, UserCreate } from "./schemas/user.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export type AuthUser = { id: string };

const TOKEN_TTL = "7d";
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Stored as scrypt$<salt>$<hash>, both base64.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
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

export const RegisterBody = UserCreate.extend({ password: z.string().min(8) });
export const LoginBody = z.strictObject({ email: z.email(), password: z.string() });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // auth.register
  app.post("/auth/register", async (request, reply) => {
    const { password, ...fields } = RegisterBody.parse(request.body);
    const [row] = await db
      .insert(user)
      .values({ ...fields, email: fields.email.toLowerCase(), passwordHash: await hashPassword(password) })
      .returning();
    return reply.status(201).send({ token: app.jwt.sign({ sub: row.id }, { expiresIn: TOKEN_TTL }), user: User.parse(row) });
  });

  // auth.login
  app.post("/auth/login", async (request) => {
    const body = LoginBody.parse(request.body);
    const [row] = await db
      .select()
      .from(user)
      .where(and(eq(user.email, body.email.toLowerCase())));
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    return { token: app.jwt.sign({ sub: row.id }, { expiresIn: TOKEN_TTL }), user: User.parse(row) };
  });

  // auth.me
  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const [row] = await db
      .select()
      .from(user)
      .where(and(eq(user.id, request.user.sub)));
    if (!row) throw new HttpError(404, "User not found");
    return User.parse(row);
  });
}
