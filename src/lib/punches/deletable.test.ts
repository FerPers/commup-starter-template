import { describe, expect, it } from 'vitest'
import { punchDeleteBlocker } from './deletable'

describe('borrar punch (S08, C-27)', () => {
  const base = { status: 'open', resolved_at: null, attachments: 0 }
  it('solo un punch abierto, sin resolución, fotos ni vínculos', () => {
    expect(punchDeleteBlocker(base)).toBeNull()
    expect(punchDeleteBlocker({ ...base, status: 'closed' })).toMatch(/cerrado/)
    expect(punchDeleteBlocker({ ...base, resolved_at: '2026-10-19' })).toMatch(/resolución/)
    expect(punchDeleteBlocker({ ...base, attachments: 1 })).toMatch(/fotos/)
    expect(punchDeleteBlocker({ ...base, preservation_record_id: 'r' })).toMatch(/preservación/)
    expect(punchDeleteBlocker({ ...base, post_handover_status: 'transferred_to_ops' })).toMatch(/Operaciones/)
    expect(punchDeleteBlocker({ ...base, post_handover_status: 'active' })).toBeNull()
  })
})
