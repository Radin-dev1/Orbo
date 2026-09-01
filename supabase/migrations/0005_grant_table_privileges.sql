-- ═══════════════════════════════════════════════════════════════════════════
-- Orbo — grant base table privileges to the PostgREST API roles
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS (enabled with policies in 0001) stays the row-level gate. These GRANTs
-- are the table-level prerequisite PostgREST needs before RLS is even consulted.
-- Without them every request fails with "permission denied for table ...".
-- (Supabase's default privileges normally cover this, but tables created
-- outside the standard `postgres` role path don't inherit them.)

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Apply the same grants to anything created later.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
