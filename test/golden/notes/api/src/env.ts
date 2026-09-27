// @appspec:generated — do not edit
import { z } from "zod";

// Fails at boot, not on first use, when configuration is missing.
export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    PORT: z.coerce.number().int().default(3000),
  })
  .parse(process.env);
