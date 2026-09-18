import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// Real PostgreSQL in an isolated WASM process. No Supabase credentials or network.
export async function createTestDatabase({beforeMigration}={}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    grant usage on schema auth to authenticated,anon,service_role;
  `);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) {
    await beforeMigration?.(file,db);
    try { await db.exec(await readFile(new URL(file,dir),'utf8')); }
    catch(error) { await db.close(); throw new Error(`${file}: ${error.message}; ${error.where||''}`,{cause:error}); }
  }
  // Activation fixtures need an unused setup row, created only inside this local DB.
  await db.exec("insert into private.owner_setup(id,token_hash) values(true,'local-test-only')");
  return db;
}
