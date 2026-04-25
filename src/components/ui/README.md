# CommUp UI Components

Componentes base del rediseño Stage 17. Todos consumen tokens de [src/app/globals.css](../../app/globals.css). Cero hex hardcoded.

## Convención

- **Inline styles** (decisión Stage 17 #4) — consistente con el resto del codebase.
- **Tokens** vía `var(--*)` — nunca hex literal.
- **A11y** — focus rings (`--focus-ring`), `aria-*`, semántica nativa.
- **TypeScript estricto** — todos los tipos exportados.
- **Dark mode automático** — los aliases semánticos cambian con `[data-theme="dark"]`.

## Importar

```tsx
import { Button, Card, Badge, useToast } from '@/components/ui';
```

## Componentes

### Button

```tsx
<Button variant="primary" size="md" leftIcon={<Plus size={16} />}>Crear</Button>
<Button variant="outline" loading>Guardando…</Button>
<Button variant="danger" size="sm">Eliminar</Button>
```
Variants: `primary` | `outline` | `ghost` | `danger`. Sizes: `sm` | `md` | `lg`. Props extra: `loading`, `leftIcon`, `rightIcon`, `fullWidth`.

### Badge

```tsx
<Badge variant="success" dot>Closed</Badge>
<Badge variant="danger">Cat A</Badge>
<Badge variant="info" size="md">In Progress</Badge>
```
Variants: `success` | `warning` | `danger` | `info` | `neutral` | `accent`.

### Card / CardHeader

```tsx
<Card padding="md" hoverable elevation="sm">
  <CardHeader title="Project Status" subtitle="Last 30 days" action={<Button size="sm">Refresh</Button>} />
  <p>…</p>
</Card>
```

### Input / Select / Textarea

```tsx
<Input placeholder="Search" leftIcon={<Search size={14} />} />
<Select value={v} onChange={e => setV(e.target.value)}>
  <option>One</option>
</Select>
<Textarea rows={4} placeholder="Notes…" />
```
Props: `inputSize` / `selectSize`, `invalid`, `fullWidth`, `disabled`.

### Skeleton / SkeletonStack

```tsx
<Skeleton shape="line" width="60%" />
<Skeleton shape="circle" width={48} />
<SkeletonStack rows={4} />
```

### EmptyState

```tsx
<EmptyState
  icon={<FileX size={24} />}
  title="No ITRs yet"
  description="Create your first ITR template to get started."
  action={<Button>Create ITR</Button>}
/>
```

### Modal

```tsx
<Modal open={open} onClose={() => setOpen(false)} title="Delete project?" size="sm"
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete</Button></>}>
  This action cannot be undone.
</Modal>
```
Sizes: `sm` (400) | `md` (560) | `lg` (720) | `xl` (960). ESC + click backdrop + focus trap + portal.

### Toast (necesita `<ToastProvider>` en el layout)

```tsx
// En (dashboard)/layout.tsx (ya integrado en Fase 4)
<ToastProvider>{children}</ToastProvider>

// En cualquier componente
const toast = useToast();
toast.success('Saved');
toast.error('Failed to save', 'Network error');
```

### Tooltip

```tsx
<Tooltip content="Refresh data" placement="top">
  <button>↻</button>
</Tooltip>
```

### Table primitives (uso bajo)

```tsx
<TableWrapper>
  <Table>
    <THead><TR><TH>Tag</TH><TH>Status</TH></TR></THead>
    <TBody>{rows.map(r => <TR key={r.id}><TD>{r.tag}</TD><TD>{r.status}</TD></TR>)}</TBody>
  </Table>
</TableWrapper>
```

### DataTable (uso normal — Fase 5 reemplaza grids fijos)

```tsx
<DataTable
  rows={itrs}
  rowKey={r => r.id}
  responsive="scroll-sticky"
  columns={[
    { key: 'tag', header: 'Tag', cell: r => r.tag, sticky: 'left' },
    { key: 'status', header: 'Status', cell: r => <Badge variant="success">{r.status}</Badge> },
    { key: 'actions', header: '', cell: r => <Button size="sm">Open</Button>, sticky: 'right' },
  ]}
/>
```
Responsive: `scroll-sticky` (default) | `stack` (mobile card) | `scroll`. `hideBelow={px}` por columna para esconder en viewports chicos.

## Roadmap

- Fase 5 hace tablas responsive con `<DataTable responsive="stack">`.
- Fase 7 activa dark mode → estos componentes ya lo soportan vía tokens.
- Fase 11 (opcional) agrega Storybook stories.
