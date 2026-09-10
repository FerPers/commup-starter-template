#!/usr/bin/env python3
"""Informe del lote Fase 2: borradores v2 generados por scripts/itr-v2/generar-v2-listas.mjs.

Lee de Supabase (PostgREST, clave de servicio de .env.local) las revisiones inactivas
cuya descripción empieza por «Revisión N (borrador Fase 2» y escribe
docs/ITR-FASE2-LOTE-<fecha>.md con una fila por formato: revisión activa, borrador,
ítems, fotos, equipo de prueba y enlace al editor para revisarlo y activarlo.
"""
import json, os, urllib.request, urllib.parse
from collections import Counter, defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORG = 'e12c53b2-85fd-462f-86f3-bba318aa77ee'
OUT = os.path.join(ROOT, f'docs/ITR-FASE2-LOTE-{date.today().isoformat()}.md')


def env():
    out = {}
    with open(os.path.join(ROOT, '.env.local')) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                out[k.strip()] = v.strip().strip('"')
    return out


def get(e, params):
    url = e['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/itr_templates?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'apikey': e['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + e['SUPABASE_SERVICE_ROLE_KEY']})
    return json.load(urllib.request.urlopen(req, timeout=120))


def warnings_by_code():
    """Avisos del generador (docs/ITR-FASE2-AVISOS-*.csv, vista previa por familia)."""
    import csv, glob
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'docs/ITR-FASE2-AVISOS-*.csv'))):
        with open(f, encoding='utf-8-sig') as fh:
            for r in csv.DictReader(fh):
                if r.get('avisos'):
                    out[r['codigo']] = '; '.join(w for w in r['avisos'].split('; ') if not w.startswith('NO GENERADO'))
    return out


def main():
    e = env()
    warn = warnings_by_code()
    drafts = get(e, {'select': 'id,code,version,title_es,title,description,itr_template_sections(title),itr_template_items(item_type,requires_photo,requires_document,description_es)',
                     'org_id': f'eq.{ORG}', 'is_active': 'eq.false', 'description': 'like.Revisión % (borrador Fase 2%', 'order': 'code', 'limit': '1000'})
    active = {r['code']: r['version'] for r in get(e, {'select': 'code,version', 'org_id': f'eq.{ORG}', 'is_active': 'eq.true', 'limit': '1000'})}
    rows = []
    for d in drafts:
        items = d['itr_template_items']
        rows.append({'code': d['code'], 'id': d['id'], 'v': d['version'], 'active': active.get(d['code'], '—'),
                     'items': sum(1 for i in items if i['item_type'] == 'select'), 'photos': sum(1 for i in items if i['requires_photo']),
                     'records': sum(1 for i in items if i['item_type'] in ('measurement', 'number')) , 'texts': sum(1 for i in items if i['item_type'] == 'text') - 1,
                     'equip': any(s['title'] == 'Equipo de prueba' for s in d['itr_template_sections']),
                     'no_es': sum(1 for i in items if not (i.get('description_es') or '').strip()),
                     'title': (d.get('title_es') or d.get('title') or '')[:60], 'warn': warn.get(d['code'], '')})
    by_disc = defaultdict(list)
    for r in rows:
        by_disc[r['code'][0]].append(r)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(f"# Fase 2 — borradores v2 de listas de chequeo — {date.today().isoformat()}\n\n")
        f.write(f"{len(rows)} borradores inactivos generados desde la tabla de chequeo del Word original (`scripts/itr-v2/generar-v2-listas.mjs`). "
                "Estructura: Referencias de ejecución (R.1) · Inspección (numeración original, selección Conforme/No conforme/No aplica con resultado, fotos según regla §7.1) · Equipo de prueba (T.1–T.5) si el original lo trae · Observaciones (O.1).\n\n")
        f.write(f"Ítems de inspección (selección): {sum(r['items'] for r in rows)} · con foto: {sum(r['photos'] for r in rows)} · mediciones: {sum(r['records'] for r in rows)} · campos de texto (registros N-R, datos, libres): {sum(r['texts'] for r in rows)} · con equipo de prueba: {sum(1 for r in rows if r['equip'])} · sin traducción ES: {sum(r['no_es'] for r in rows)}.\n\n")
        f.write("Avisos: «base N ítems / original M» = la plantilla actual tiene más filas que la tabla del Word (subfilas o cabeceras importadas como casillas); comparar con el original antes de activar. «campos de registro (N-R)» = ítems que exigen valor y recibieron un campo acompañante.\n\n")
        f.write("Revisión por lote: abrir el editor, comparar con el Word, ajustar fotos y redacción, y pulsar «Activar esta revisión». La v1 queda inactiva y la matriz equipo×ITR se re-apunta sola.\n\n")
        for disc in sorted(by_disc):
            f.write(f"## {disc} — {len(by_disc[disc])} formatos\n\n| Código | Activa | Borrador | Selecciones | Fotos | Mediciones | Textos | Equipo | Sin ES | Título | Avisos |\n|---|---|---|---|---|---|---|---|---|---|---|\n")
            for r in by_disc[disc]:
                f.write(f"| [{r['code']}](https://commup.app/admin/templates/{r['id']}) | v{r['active']} | v{r['v']} | {r['items']} | {r['photos']} | {r['records'] or ''} | {r['texts'] or ''} | {'sí' if r['equip'] else ''} | {r['no_es'] or ''} | {r['title']} | {r['warn']} |\n")
            f.write('\n')
    print(f"{len(rows)} borradores → {OUT}")


if __name__ == '__main__':
    main()
