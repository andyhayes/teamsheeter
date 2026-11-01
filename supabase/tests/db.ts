import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/** The parts of Supabase's auth schema and roles that the migrations rely on. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid;
  $$;
`;

const migrationsDir = join(import.meta.dirname, '..', 'migrations');

/** A fresh in-memory Postgres with every migration applied. */
export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

export async function createUser(db: Db, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return rows[0].id;
}

/**
 * Run queries as a signed-in user, the way PostgREST does: role `authenticated` with JWT claims
 * set for the transaction. The transaction is rolled back if `fn` throws.
 */
export async function as<T>(db: Db, user: { id: string; email: string } | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = user ? JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }) : '';
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
}

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
