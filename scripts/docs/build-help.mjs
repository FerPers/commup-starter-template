#!/usr/bin/env node
// N3b: copia el manual por rol (docs/MANUAL-COMMUP-POR-ROL.md) al módulo que leen /ayuda y /guia.
// El Worker no lee archivos en tiempo de ejecución, por eso va como string. Un test exige que coincidan:
// tras editar el manual, correr `npm run help:build`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const md = readFileSync(join(root, 'docs', 'MANUAL-COMMUP-POR-ROL.md'), 'utf8')
const out = `// Generado por scripts/docs/build-help.mjs desde docs/MANUAL-COMMUP-POR-ROL.md — no editar a mano.\n` +
  `export const MANUAL_MD: string = ${JSON.stringify(md)}\n`
writeFileSync(join(root, 'src', 'lib', 'help', 'manual-source.generated.ts'), out)
console.log(`manual-source.generated.ts: ${md.length} caracteres`)
