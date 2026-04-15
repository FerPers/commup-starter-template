# CommUP — Stage 15: Intelligence Layer
## "Insights que ningún CCMS tiene hoy"

---

## Arquitectura

```
Intelligence Layer — Stage 15
│
├── analytics/PredictionEngine.ts        → 15.1 Regresión lineal ponderada
│   ├── buildTimeSeries()                → Serie temporal de domain_events
│   ├── fitLinearRegression()            → Modelo WLS con pesos exponenciales
│   ├── predict()                        → P10/P50/P90 + risk score + drivers
│   ├── predictBatch()                   → Batch para todos los sistemas
│   └── buildSCurve()                    → Curva S real vs planificada
│
├── analytics/BottleneckDetector.ts      → 15.2 Análisis de grafo
│   ├── buildGraph()                     → Construye grafo system→punch→ITR
│   ├── computeBlockingScores()          → DFS para contar downstream bloqueados
│   ├── findRootBlocker()                → Blocker raíz de la cadena
│   └── getTopBottlenecks()              → Top-N con acciones prioritarias
│
├── analytics/DataQualityChecker.ts      → 15.3 Quality checks automáticos
│   ├── checkITRIntegrity()              → 5 tipos de check de integridad
│   ├── checkLoopTagCoverage()           → Loops sin tags, tags huérfanos
│   ├── checkOrphanPunches()             → Punches sin sistema, Cat A sin asignar
│   ├── checkCertificatePrereqs()        → MC con Cat A abierto, ITRs pendientes
│   └── checkDataDuplicates()            → ITRs y tags duplicados
│
├── workers/ai-assistant-worker.ts       → 15.4 Claude API agéntico
│   ├── COMMUP_TOOLS (6 herramientas)   → Tool use para queries de Supabase
│   ├── runAgenticLoop()                → Hasta 5 iteraciones con tool use
│   └── checkRateLimit()                → 60 req/hora por usuario (KV)
│
├── components/AIAssistantChat.tsx       → UI del chat conversacional
│
└── sql/analytics_layer.sql             → Vistas materializadas + funciones
    ├── systems_readiness_view           → Base para todos los analytics
    ├── data_quality_issues_view         → Checks SQL en tiempo real
    ├── get_domain_events_for_system()   → Serie temporal para ML
    ├── update_system_forecast()         → Guardar predicciones del engine
    ├── get_project_kpis()              → KPIs ejecutivos en JSONB
    └── pg_cron schedules               → Refresh automático cada hora
```

---

## 15.1 Prediction Engine — Detalle Técnico

### Algoritmo

```
1. Construir serie temporal de events (itr_completed) ponderada
   - Peso exponencial: eventos recientes pesan hasta 2x más
   
2. Regresión Lineal Ponderada (WLS):
   β = (XᵀWX)⁻¹ XᵀWy
   
3. Proyectar día donde ŷ = 100% → fecha estimada de MC

4. Intervalo de confianza:
   P50 = proyección central
   P10 = P50 - σ_residual × 1.5   (optimista)
   P90 = P50 + σ_residual × 2     (conservador)
   
5. Risk Score = suma ponderada de factores:
   - Punch Cat A (peso 30)
   - Rejection rate > 20% (peso 20)
   - Velocity insuficiente (peso 15)
   - < 50% completado con < 30 días (peso 15)
   - Sin actividad 7+ días (peso 10)
   - Subsistemas incompletos (peso 10)
```

### Fallback cuando hay pocos datos
Si `data_points < 3` o la regresión no converge:
→ Usar velocidad simple: `remaining_itrs / avg_velocity_14d`
→ Confidence reducida al mínimo (etiqueta "estimación preliminar")

---

## 15.2 Bottleneck Detector — Detalle Técnico

### Estructura del Grafo

```
Sistema (nivel 0)
 └── Subsistema (nivel 1)
      └── Loop (nivel 2)
           └── Tag (nivel 3)
                └── ITR (nivel 4)
 └── Punch Cat A → bloquea Sistema
 └── Certificate → depende de ITRs + sin Punch Cat A
```

### Blocking Score

```
blocking_score(nodo) =
  score_base_tipo(nodo) × 0.3 +
  Σ downstream_bloqueados × typeWeight × urgencyWeight × 10

typeWeight: system=3, subsystem=2, itr/punch=1
urgencyWeight: 1 + min(días_overdue / 30, 2)
```

### Output: Top-10 con acciones

```typescript
{
  rank: 1,
  node: { tag: "V-401", type: "system", blocking_score: 95 },
  root_blocker: { id: "punch-xxx", type: "punch", label: "Cat A: Leak en flange..." },
  total_blocked: 12,           // 12 elementos downstream sin completar
  estimated_unblock_days: 3,   // si se actúa hoy
  priority_actions: [
    { action_type: "clear_punch", urgency: "immediate", url: "/punches/xxx" }
  ]
}
```

---

## 15.3 Data Quality — Scoring

| Severidad | Penalización/issue |
|-----------|-------------------|
| Critical  | -10 puntos        |
| Error     | -5 puntos         |
| Warning   | -1 punto          |
| Info      | -0.2 puntos       |

**Grade scale:** A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F < 40

---

## 15.4 AI Assistant — Tool-Use Flow

```
User: "¿Qué falta para liberar el System-042?"

1. Claude → llama get_blocking_items({ system_id: "SYS-042" })
2. Worker → consulta Supabase: punches Cat A, ITRs rechazados, certs pendientes
3. Claude recibe resultado → llama get_itr_status({ system_tag: "SYS-042", status: "rejected" })
4. Worker → retorna ITRs rechazados con detalle
5. Claude genera respuesta:

"Para liberar **SYS-042** (Compresor K-101) necesita resolver:

**🚨 Bloqueadores críticos:**
| Item | Estado | Acción |
|------|--------|--------|
| Punch Cat A #P-2401 | Abierto | Reparar fuga sello mecánico |
| ITR I-CAL-042-001 | Rechazado (2x) | Re-submitir con calibración correcta |

**⚠️ Pendientes menores:**
- 3 Punch Cat B sin cerrar
- Certificado MC pendiente de firma del Client Rep

**Forecast:** Con estas acciones, MC posible en **3-5 días hábiles**.
[Ver SYS-042 →](/systems/sys-042)"
```

---

## Deploy

### 1. Predicciones programadas (Cloudflare Worker o Supabase Edge Function)

```typescript
// supabase/functions/run-predictions/index.ts
// Ejecutar cada 4 horas (pg_cron o Supabase Scheduled Function)

import { PredictionEngine } from '../../../analytics/PredictionEngine.ts';

const engine = new PredictionEngine(project.start_date, 6);
const snapshots = await getSystemSnapshots();
const events = await getDomainEvents();
const predictions = engine.predictBatch(snapshots, events);

for (const pred of predictions) {
  await supabase.rpc('update_system_forecast', {
    p_system_id: pred.system_id,
    p_predicted_p10: pred.predicted_mc_p10,
    p_predicted_p50: pred.predicted_mc_p50,
    p_predicted_p90: pred.predicted_mc_p90,
    p_rfsu_p50: pred.predicted_rfsu_p50,
    p_risk_score: pred.risk_score,
    p_model_confidence: pred.model_confidence,
  });
}
```

### 2. AI Assistant Worker

```bash
# Variables de entorno
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY

# KV para rate limiting
wrangler kv:namespace create "RATE_LIMIT_KV"

# Deploy
wrangler deploy ai-assistant-worker.ts --name commup-ai-assistant

# Agregar route en Cloudflare
# api.commup.io/api/ai/* → commup-ai-assistant
```

### 3. Rutas React Router

```typescript
{
  path: '/analytics/forecast',
  element: <ForecastDashboard />,
},
{
  path: '/analytics/bottlenecks',
  element: <BottleneckView />,
},
{
  path: '/admin/data-quality',
  element: <DataQualityPanel />,
},
{
  path: '/assistant',
  element: <AIAssistantChat userId={user.id} />,
},
```

---

## Checklist de Validación

| Test | Criterio |
|------|----------|
| Prediction Engine accuracy | Error < ±15 días vs MC real histórico |
| Bottleneck detection latency | < 2s para grafo de 500 nodos |
| Data Quality scan time | < 5s para 10,000 ITRs |
| AI Assistant latency (P50) | < 8s incluyendo tool calls |
| AI Assistant rate limit | 60 req/hora sin excepciones |
| SQL view refresh | < 30s para refresh concurrente |
| Forecast update cycle | Cada 4h en horario laboral |
| AI responde solo en lectura | ❌ Cualquier intento de escritura |

---

## Estado Stage 15

| Sub-item | Status | Archivos |
|----------|--------|----------|
| 15.1 Prediction Engine | ✅ DONE | `analytics/PredictionEngine.ts` |
| 15.2 Bottleneck Detector | ✅ DONE | `analytics/BottleneckDetector.ts` |
| 15.3 Data Quality Checker | ✅ DONE | `analytics/DataQualityChecker.ts` |
| 15.4 AI Assistant (Claude API) | ✅ DONE | `workers/ai-assistant-worker.ts`, `components/AIAssistantChat.tsx` |
| SQL Analytics Layer | ✅ DONE | `sql/analytics_layer.sql` |

**Stage 15 COMPLETO → Siguiente: Stage 16**

---

*CommUP Intelligence Layer — Plan Estratégico v15*
*Ingeniero: LuisFer Perdomo | Oil & Gas | 20+ años Automatización Industrial*
