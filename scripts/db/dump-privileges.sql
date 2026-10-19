-- A-14 (2026-10-19): genera las sentencias que reproducen los privilegios vigentes de la BD.
-- Salida = una columna `stmt`; se pega en una migración (ver 20261026120000_privileges_storage_snapshot.sql).
-- Uso: supabase db query --linked -f scripts/db/dump-privileges.sql -o csv
-- Solo toca los roles de la API (PUBLIC, anon, authenticated, service_role); el dueño y los roles internos
-- de Supabase quedan como están. Tablas: solo las que se desvían del estándar Supabase (ALL a los tres roles).
with fn as (
  select p.oid, format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) sig, p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
), fn_grantees as (
  select fn.sig, fn.proname,
    string_agg(case when a.grantee = 0 then 'PUBLIC' else quote_ident(r.rolname) end, ', '
               order by case when a.grantee = 0 then '' else r.rolname end) grantees
  from fn
  cross join lateral aclexplode(coalesce((select proacl from pg_proc where oid = fn.oid), acldefault('f', (select proowner from pg_proc where oid = fn.oid)))) a
  left join pg_roles r on r.oid = a.grantee
  where a.privilege_type = 'EXECUTE' and (a.grantee = 0 or r.rolname in ('anon','authenticated','service_role'))
  group by fn.sig, fn.proname
), fn_stmts as (
  select 1 grp, fn.proname || fn.sig ord,
    format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role;', fn.sig)
    || coalesce(format(E'\nGRANT EXECUTE ON FUNCTION %s TO %s;', fn.sig, g.grantees), '') stmt
  from fn left join fn_grantees g on g.sig = fn.sig
), rel as (
  select c.oid, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')
), rel_privs as (
  select rel.relname, rel.relkind, r.rolname,
    coalesce((select string_agg(g.privilege_type, ', ' order by g.privilege_type)
              from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.table_name = rel.relname and g.grantee = r.rolname), '') privs
  from rel cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
), rel_stmts as (
  select 2 grp, relname || rolname ord,
    format('REVOKE ALL ON public.%I FROM %I;', relname, rolname)
    || case when privs <> '' then format(E'\nGRANT %s ON public.%I TO %I;', privs, relname, rolname) else '' end stmt
  from rel_privs
  where privs <> 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'
)
select stmt from (select * from fn_stmts union all select * from rel_stmts) s order by grp, ord;
