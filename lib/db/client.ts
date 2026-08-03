import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Standard Postgres wire protocol (not Neon's HTTP-only serverless driver) — works
// against Neon (its normal connection string, pooled or direct), a local Postgres
// (Docker or otherwise), or any other Postgres host, all through the same DATABASE_URL.
// On Vercel, point DATABASE_URL at Neon's pooled ("-pooler") connection string, not the
// direct one — serverless invocations open a new Pool each cold start, and direct
// connections exhaust Postgres's connection limit under concurrent load much faster
// than a PgBouncer-backed pooled one.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
