#!/usr/bin/env python3
"""Clasifica los 302 originales Word (CB&I) por la estructura real de sus tablas.

Lee insumos-locales/revision-itr/lote-completo/estructuras/<codigo>.json (tablas
con celdas extraídas del .docx) y decide, por formato, qué contiene el cuerpo:
  - lista de chequeo (Item No / Inspection Description / Value-Status)
  - ítems de la lista que exigen un valor (registrar, medir, unidades)
  - bloque de datos (Label: valor) en cabecera del cuerpo
  - matrices de medición (rejillas con secuencias numéricas o fases/tiempos)
  - tabla de equipo de prueba (Make / Model / Serial / Expiry)
  - nota condicional (sección que solo aplica en ciertos casos)
Y lo contrasta con lo que hoy tiene la plantilla activa en CommUp (tipos de ítem),
para señalar dónde la importación por Excel aplanó todo como casillas.

Salida: docs/ITR-CLASIFICACION-ORIGINALES-<fecha>.csv y .md
Uso: python3 scripts/itr-v2/clasificar-originales.py  (desde la raíz del repo)
"""
from __future__ import annotations
import csv, json, os, re, sys, urllib.request, urllib.parse
from collections import Counter, defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EST = os.path.join(ROOT, 'insumos-locales/revision-itr/lote-completo/estructuras')
OUT_CSV = os.path.join(ROOT, f'docs/ITR-CLASIFICACION-ORIGINALES-{date.today().isoformat()}.csv')
OUT_MD = OUT_CSV[:-4] + '.md'
DEMO_ORG = 'e12c53b2-85fd-462f-86f3-bba318aa77ee'

VALUE_RE = re.compile(
    r"(\brecord(?:ed|ing)?\b(?! ?(?:and|&) ?check)|\bregistr(?:ar|e|o|ando)\b|\bmeasure(?:d|s)?\b(?! ?(?:s )?(?:have|has|are|implemented|removed))|\bmedi(?:r|ción|cion|da[s]?)\b(?! ?(?:de|del) ?(?:preserv|protecci))"
    r"|\breading|\blectura|\bvalue of|\bvalor de|insulation resistance|resistencia de aislamiento|continuity (?:test|check)|prueba de continuidad"
    r"|\d\s*(?:kv|v\b|ma\b|mω|ohm|psi|bar\b|°c|deg ?c|mm\b|rpm|amps?|hz)|[\[(]\s*(?:mω|ohm|kv|psi|bar|°c|mm|amps?|volts?)\s*[\])])", re.I)
LABEL_RE = re.compile(r'^[^:]{2,60}:\s*(?:[^:]{0,60}:)?\s*$')  # "Manufacturer: Fabricante:"  ó "Rev:"
DATA_LABEL_RE = re.compile(r'^(?:\*\s*)?(?:[A-Za-zÁÉÍÓÚÑáéíóúñ/().&\- ]{2,40})$')
DATA_WORDS = re.compile(r'\b(manufacturer|fabricante|model|modelo|serial|serie|type|tipo|rating|nominal|voltage|voltaje|volt|size|tamaño|ratio|core|rated|drawing|plano|location|ubicaci|frame|class|clase|power|potencia|current|corriente|frequency|frecuencia|speed|velocidad|range|rango|service|servicio|material|tag no|equipment type|vendor)\b', re.I)
NUMSEQ_RE = re.compile(r'^\s*-?\d+(?:[.,]\d+)?\s*%?\s*$')
MATRIX_KW = re.compile(r'\b(time|tiempo|phase|fase|l1|l2|l3|r-s|s-t|r-t|r-y|y-b|b-e|input|entrada|output|salida|reading|lectura|before|after|antes|despu[eé]s|set ?point|trip|reset|repos|step|paso|ohm|mω|kv|amps?|volts?|deg|°c|%|pass|no pass|no apply|ratio|protocol|cubicle|circuit|joint|bolt|iso#|report no|measurements|measured|medidas|mediciones|medid[ao]s?|˚c|%rh|vibration|vibraci|humidity|humedad|temp\b|temperature|temperatura)\b', re.I)
COND_RE = re.compile(r'only to be completed|solo .*(?:si|cuando)|if within|if not originally|where applicable|(?:si|cuando) aplique', re.I)
NOTE_RE = re.compile(r'^(?:note|nota|this form|the following checks|for measurements|reference p&id|list of|i\.d\. numbers)', re.I)
PRESERV_RE = re.compile(r'preservation measures|medidas de (?:mantenci[oó]n|mantenimiento|preservaci[oó]n|conservaci[oó]n)', re.I)
EQUIP_RE = re.compile(r'test equipment|equipo de prueba|calibration equipment|equipo de calibraci', re.I)


def cell_texts(row):
    return [(c.get('texto') or '').replace('\n', ' ').strip() for c in row]


def classify_table(table):
    rows = [cell_texts(r) for r in table]
    flat = ' '.join(' '.join(r) for r in rows)
    first = ' '.join(rows[0]) if rows else ''
    ncols = max((len(r) for r in rows), default=0)
    info = {'kind': 'otra', 'items': [], 'fields': 0, 'headers': '', 'conditional': bool(COND_RE.search(flat))}
    if EQUIP_RE.search(first) and re.search(r'make|marca|model', flat, re.I):
        info['kind'] = 'equipo_prueba'
        return info
    is_checklist = bool(re.search(r'item no', first, re.I) and re.search(r'description|descripci|inspection|check', first, re.I)) \
        or bool(re.search(r'\bpass\b', first, re.I) and re.search(r'no pass|fail|no apply', first, re.I) and re.search(r'description|descripci|function|funci', first, re.I))
    if is_checklist:
        info['kind'] = 'chequeo'
        for r in rows[1:]:
            if not r or all(not c for c in r):
                continue
            num, desc = r[0], (r[1] if len(r) > 1 else '')
            if re.search(r'item no|value / status|initials|^pass$', ' '.join(r), re.I):
                continue
            if not desc and not num:
                continue
            if not re.match(r'^\s*\d', num) and len(r) > 1 and not desc:
                continue
            text = f'{num} {desc}'
            if EQUIP_RE.search(text):
                info['has_equipment_row'] = True
                continue
            # subtítulos de sección dentro de la lista (una sola celda con texto largo y sin número)
            if not re.match(r'^\s*\d', num) and (len(r) == 1 or (num and not desc)):
                continue
            clean = PRESERV_RE.sub(' ', desc)
            info['items'].append({'num': num, 'desc': desc[:120], 'value': bool(VALUE_RE.search(clean)), 'conditional': bool(COND_RE.search(desc))})
        return info
    if NOTE_RE.search(first) and ncols <= 2 and len(rows) <= 3:
        info['kind'] = 'nota'
        return info
    if re.search(r'figure|figura', first, re.I) and ncols <= 2:
        info['kind'] = 'figura'
        return info
    label_cells = sum(1 for r in rows for c in r if c and (LABEL_RE.match(c) or (DATA_LABEL_RE.match(c) and DATA_WORDS.search(c))))
    numeric_cells = sum(1 for r in rows for c in r if NUMSEQ_RE.match(c))
    kw_cells = sum(1 for r in rows[:2] for c in r if c and MATRIX_KW.search(c))
    header_cells = sum(1 for c in rows[0] if c and len(c) <= 60) if rows else 0
    empty_body = sum(1 for r in rows[1:] for c in r if not c)
    body_cells = sum(len(r) for r in rows[1:])
    log_like = ncols >= 3 and len(rows) >= 2 and header_cells >= 3 and body_cells > 0 and empty_body / body_cells >= 0.6
    if ncols >= 3 and (numeric_cells >= 3 or kw_cells >= 2 or log_like):
        info['kind'] = 'matriz'
        info['headers'] = ' | '.join(c for c in (rows[0] + (rows[1] if len(rows) > 1 else []))[:8] if c)[:160]
        return info
    if label_cells >= 2:
        info['kind'] = 'datos'
        info['fields'] = label_cells
        return info
    if re.search(r'remarks|observaciones', first, re.I):
        info['kind'] = 'observaciones'
        return info
    info['headers'] = ' | '.join(c for c in rows[0][:6] if c)[:120] if rows else ''
    return info


def classify(code, data):
    body = [t for p in data['partes'] if p['parte'].startswith('word/document') for t in p['tablas']]
    tables = [classify_table(t) for t in body]
    items = [i for t in tables if t['kind'] == 'chequeo' for i in t['items']]
    matrices = [t for t in tables if t['kind'] == 'matriz']
    datos = sum(t['fields'] for t in tables if t['kind'] == 'datos')
    equip = any(t['kind'] == 'equipo_prueba' or t.get('has_equipment_row') for t in tables)
    cond = any(t['conditional'] for t in tables) or any(i['conditional'] for i in items)
    value_items = [i for i in items if i['value']]
    otras = [t for t in tables if t['kind'] == 'otra']
    notas = sum(1 for t in tables if t['kind'] in ('nota', 'figura'))
    if matrices and datos:
        fam = 'DM'
    elif matrices:
        fam = 'M'
    elif datos:
        fam = 'D'
    elif value_items:
        fam = 'C+V'
    else:
        fam = 'C'
    return {
        'codigo': code, 'familia': fam, 'tablas_cuerpo': len(body), 'campos_datos': datos,
        'items_chequeo': len(items), 'items_con_valor': len(value_items),
        'tablas_matriz': len(matrices), 'matriz_cabeceras': ' || '.join(m['headers'] for m in matrices)[:240],
        'equipo_prueba': 'sí' if equip else '', 'nota_condicional': 'sí' if cond else '',
        'tablas_sin_clasificar': len(otras), 'otras_cabeceras': ' || '.join(t['headers'] for t in otras)[:160],
        'notas_o_figuras': notas,
        'ejemplos_valor': ' || '.join(f"{i['num']} {i['desc'][:70]}" for i in value_items[:3]),
    }


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env.local')) as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"')
    return env


def db_state():
    """Tipos de ítem de la plantilla ACTIVA por código en la org DEMO (PostgREST, clave de servicio)."""
    try:
        env = load_env()
        url = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/itr_templates?' + urllib.parse.urlencode({
            'select': 'code,version,is_active,itr_template_items(item_type)',
            'org_id': f'eq.{DEMO_ORG}', 'is_active': 'eq.true', 'limit': '1000'})
        req = urllib.request.Request(url, headers={'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']})
        rows = json.load(urllib.request.urlopen(req, timeout=60))
    except Exception as e:  # sin red o sin clave: se clasifica igual, sin contraste
        print('sin contraste con la base:', e, file=sys.stderr)
        return {}
    out = {}
    for r in rows:
        types = Counter(i['item_type'] for i in r['itr_template_items'])
        out[r['code']] = {'db_version': r['version'], 'db_items': sum(types.values()), 'db_checkbox': types.get('checkbox', 0),
                          'db_otros': ', '.join(f'{k}:{v}' for k, v in sorted(types.items()) if k != 'checkbox')}
    return out


def main():
    codes = sorted(f[:-5] for f in os.listdir(EST) if f.endswith('.json'))
    db = db_state()
    rows = []
    for code in codes:
        with open(os.path.join(EST, f'{code}.json')) as f:
            row = classify(code, json.load(f))
        row.update(db.get(code, {'db_version': '', 'db_items': '', 'db_checkbox': '', 'db_otros': ''}))
        reasons = []
        if row['familia'] != 'C':
            if row['db_items'] != '' and row['db_items'] == row['db_checkbox']:
                reasons.append('en la base es solo casillas')
        if row['tablas_matriz']:
            reasons.append(f"{row['tablas_matriz']} matriz")
        if row['campos_datos']:
            reasons.append(f"{row['campos_datos']} campos de datos")
        if row['items_con_valor']:
            reasons.append(f"{row['items_con_valor']} ítems con valor")
        if row['tablas_sin_clasificar']:
            reasons.append(f"{row['tablas_sin_clasificar']} tabla(s) sin clasificar")
        if row['items_chequeo'] == 0:
            reasons.append('sin lista de chequeo reconocible')
        if row['db_items'] == '':
            reasons.append('sin plantilla activa en la base')
        elif row['items_chequeo'] and abs(row['db_items'] - row['items_chequeo']) > max(3, row['items_chequeo'] // 3) and row['familia'] == 'C':
            reasons.append(f"conteo distinto: original {row['items_chequeo']} / base {row['db_items']}")
        row['atencion'] = '; '.join(reasons)
        rows.append(row)

    cols = ['codigo', 'familia', 'tablas_cuerpo', 'campos_datos', 'items_chequeo', 'items_con_valor', 'tablas_matriz', 'equipo_prueba', 'nota_condicional',
            'db_version', 'db_items', 'db_checkbox', 'db_otros', 'atencion', 'matriz_cabeceras', 'ejemplos_valor', 'tablas_sin_clasificar', 'otras_cabeceras']
    with open(OUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, '') for c in cols})

    fam = Counter(r['familia'] for r in rows)
    by_disc = defaultdict(Counter)
    for r in rows:
        by_disc[r['codigo'][0]][r['familia']] += 1
    flat_bad = [r for r in rows if r['familia'] != 'C' and r['db_items'] != '' and r['db_items'] == r['db_checkbox']]
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write(f"# Clasificación de los originales ITR por estructura de tablas — {date.today().isoformat()}\n\n")
        f.write("Fuente: `insumos-locales/revision-itr/lote-completo/estructuras/*.json` (tablas del .docx). Generado por `scripts/itr-v2/clasificar-originales.py`. Contraste con la plantilla activa de la org DEMO.\n\n")
        f.write("Familias: **C** lista de chequeo pura · **C+V** lista con ítems que exigen valor/lectura · **D** bloque de datos + lista · **M** lista + matriz de medición · **DM** datos + lista + matriz.\n\n")
        f.write("| Familia | Formatos |\n|---|---|\n")
        for k in ['C', 'C+V', 'D', 'M', 'DM']:
            f.write(f"| {k} | {fam.get(k, 0)} |\n")
        f.write("\n| Disciplina | C | C+V | D | M | DM | Total |\n|---|---|---|---|---|---|---|\n")
        for d in sorted(by_disc):
            c = by_disc[d]
            f.write(f"| {d} | {c.get('C',0)} | {c.get('C+V',0)} | {c.get('D',0)} | {c.get('M',0)} | {c.get('DM',0)} | {sum(c.values())} |\n")
        f.write(f"\n## Formatos que hoy son solo casillas en la base pero el original no es lista pura: {len(flat_bad)}\n\n")
        f.write("| Código | Familia | Datos | Ítems | Con valor | Matrices | Cabeceras de matriz |\n|---|---|---|---|---|---|---|\n")
        for r in flat_bad:
            f.write(f"| {r['codigo']} | {r['familia']} | {r['campos_datos']} | {r['items_chequeo']} | {r['items_con_valor']} | {r['tablas_matriz']} | {r['matriz_cabeceras'][:90]} |\n")
        pure = [r for r in rows if r['familia'] == 'C']
        f.write(f"\n## Listas de chequeo puras (candidatas al script de Fase 2): {len(pure)}\n\n")
        f.write(', '.join(r['codigo'] for r in pure) + '\n')
        figs = [r for r in rows if r.get('notas_o_figuras')]
        f.write(f"\n## Formatos con notas o figuras en el cuerpo (diseño manual): {len(figs)}\n\n")
        f.write(', '.join(r['codigo'] for r in figs) + '\n')
        cv = [r for r in rows if r['familia'] == 'C+V']
        f.write(f"\n## Listas con ítems que exigen valor o registro (C+V): {len(cv)}\n\nEl script de Fase 2 los convierte en selección + campo de valor/texto acompañante; revisar cada uno.\n\n")
        for r in cv:
            f.write(f"- {r['codigo']} ({r['items_con_valor']}): {r['ejemplos_valor'][:160]}\n")
        unclassified = [r for r in rows if r['tablas_sin_clasificar']]
        f.write(f"\n## Tablas que el clasificador no reconoció (revisar a mano): {len(unclassified)}\n\n")
        for r in unclassified:
            f.write(f"- {r['codigo']}: {r['otras_cabeceras']}\n")
    print(f"{len(rows)} formatos → {OUT_CSV}\n{dict(fam)}\nsolo casillas en base con original no puro: {len(flat_bad)}")


if __name__ == '__main__':
    main()
