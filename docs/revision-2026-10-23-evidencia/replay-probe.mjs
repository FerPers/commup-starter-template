// Sonda de auditoría: ejecuta el módulo real con dependencias simuladas.
// No accede a la red ni a una base de datos. Ejecutar desde la raíz: node docs/revision-2026-10-23-evidencia/replay-probe.mjs
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, mocks) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    exports,
    require: name => {
      if (name in mocks) return mocks[name]
      throw Error(`Unexpected dependency: ${name}`)
    },
    console, Set, Map, Date,
  })
  return exports
}

async function main() {
  const policy = load('src/lib/sync/outbox-utils.ts', { '../itr/completion': {} })
  for (const kind of ['response', 'photo']) {
    let removed = false
    let traceAttempts = 0
    const entry = {
      id: 1, itrId: 'itr', itemId: 'item', templateId: 'template', projectId: 'project',
      capturedBy: 'user', attempts: 2, queuedAt: new Date().toISOString(),
      kind: 'photo', blob: { size: 42 }, fileName: 'evidence.png', fileType: 'image/png',
    }
    const queue = {
      getAllQueued: async () => kind === 'response' && !removed ? [entry] : [],
      getOutbox: async () => kind === 'photo' && !removed ? [entry] : [],
      removeFromQueue: async () => { removed = true },
      removeFromOutbox: async () => { removed = true },
      notifyOutboxChanged: () => {}, markResponseAttempt: async () => {}, markOutboxAttempt: async () => {},
    }
    const replay = load('src/lib/sync/replay.ts', {
      '@/lib/offline-queue': queue,
      '@/lib/sync/outbox': { uploadPhoto: async () => ({ error: 'permission temporarily denied' }), isNetworkFailure: () => false },
      '@/lib/sync/outbox-utils': policy,
      '@/lib/sync/owner': { currentUserId: async () => 'user' },
      '@/lib/sync/ownership': { sendableBy: rows => rows },
      '@/lib/sync/response-utils': { responseHeld: () => false, expectedVersion: () => null, responseKey: () => '' },
      '@/lib/sync/startup-outbox': { replayStartupOnce: async () => ({ flushed: 0, issues: 0, remaining: 0 }) },
      '@/app/actions/itr-instances': { upsertResponse: async () => ({ error: 'permission temporarily denied' }) },
      '@/app/actions/punches': {},
      '@/lib/supabase/client': { createClient: () => ({ rpc: async () => {
        traceAttempts++
        return { error: { message: 'audit storage failed' } }
      } }) },
    })
    const result = await replay.replayQueueOnce()
    console.log(JSON.stringify({ scenario: kind, traceAttempts, traceFailed: true, localEntryDeleted: removed, result }))
    if (!removed) throw Error('El comportamiento cambió: volver a evaluar el hallazgo de pérdida local')
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
