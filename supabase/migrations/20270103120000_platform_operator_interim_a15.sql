-- A15: primer operador de salud. Decisión de Luis (2026-10-25/26): las alertas son responsabilidad del arquitecto
-- que administrará CommUp; mientras su cuenta no exista, las recibe luis.perdomo@outlook.com en «CommUp Catálogo»
-- (org que no se borra con la limpieza de DEMO). Cuando exista el arquitecto, otra migración lo agrega y saca esta fila.
-- Por correo y nombre (no ids generados): en una BD sin esa cuenta u org (local, CI) no inserta nada.

INSERT INTO public.platform_operators (user_id, org_id)
SELECT u.id, o.id
FROM auth.users u
JOIN public.org_members m ON m.user_id = u.id AND m.status = 'active'
JOIN public.organizations o ON o.id = m.org_id AND o.name = 'CommUp Catálogo'
WHERE lower(u.email) = 'luis.perdomo@outlook.com'
ON CONFLICT (user_id) DO UPDATE SET org_id = EXCLUDED.org_id;
