-- Newer Supabase projects don't grant table access to service_role by default. The importer
-- (scripts/import-xlsx.ts) uses the service-role key, so give it full access, including to
-- tables and views added by later migrations. service_role bypasses row-level security.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
