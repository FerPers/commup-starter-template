/**
 * CommUP — AI Assistant Worker (Stage 15.4)
 * Cloudflare Worker · Claude API
 *
 * Asistente conversacional que responde preguntas en lenguaje natural
 * sobre el estado de completions, readiness, ITRs y punches.
 *
 * Ejemplos de queries:
 *   "¿Qué falta para liberar el System-042?"
 *   "¿Cuál es el sistema más atrasado del área de utilities?"
 *   "¿Cuántos punches Cat A hay abiertos en la disciplina de instrumentación?"
 *   "Dame el forecast de MC para los sistemas del Train 2"
 *   "¿Qué está bloqueando el certificado del Scrubber V-401?"
 *
 * Arquitectura:
 *   1. Auth: Authorization: Bearer <supabase_jwt> validado contra Supabase Auth.
 *   2. Multi-tenancy: queries pasan el JWT del usuario a PostgREST → RLS aplica.
 *   3. Tool-use: Claude llama herramientas que consultan Supabase en tiempo real.
 *   4. Guardrails: solo SELECT (no service role para queries de tools).
 *   5. Rate limiting: 60 requests/hora por usuario (key derivada del JWT validado).
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
}

// ─── Claude Tool Definitions ──────────────────────────────────────────────

const COMMUP_TOOLS = [
  {
    name: 'get_system_status',
    description: 'Obtiene el estado detallado de uno o varios sistemas de completions. Incluye ITRs, punches, certificados, y forecast de MC.',
    input_schema: {
      type: 'object',
      properties: {
        system_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de tags de sistemas (ej: ["SYS-042", "SYS-101"]) o vacío para todos',
        },
        include_forecast: {
          type: 'boolean',
          description: 'Si incluir el forecast de fecha de MC',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_blocking_items',
    description: 'Obtiene los elementos que están bloqueando el progreso de un sistema o subsistema específico. Identifica punches Cat A, ITRs rechazados, certificados pendientes.',
    input_schema: {
      type: 'object',
      properties: {
        system_id: { type: 'string', description: 'ID o tag del sistema a consultar' },
        include_dependencies: {
          type: 'boolean',
          description: 'Si incluir bloqueos de dependencias upstream',
        },
      },
      required: ['system_id'],
    },
  },
  {
    name: 'get_punch_list',
    description: 'Obtiene el punch list filtrado por categoría, sistema, disciplina o estado.',
    input_schema: {
      type: 'object',
      properties: {
        system_tag: { type: 'string', description: 'Tag del sistema (opcional)' },
        category: { type: 'string', enum: ['A', 'B', 'C', 'all'], description: 'Categoría de punch' },
        discipline: { type: 'string', description: 'Disciplina (INST, MECH, ELEC, CIVIL, etc.)' },
        status: { type: 'string', enum: ['open', 'in_progress', 'cleared', 'all'] },
        limit: { type: 'number', description: 'Máximo de punches a retornar (default 20)' },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_itr_status',
    description: 'Consulta el estado de ITRs, incluyendo ITRs rechazados, pendientes o sin asignar.',
    input_schema: {
      type: 'object',
      properties: {
        system_tag: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'all'] },
        discipline: { type: 'string' },
        assigned_to_name: { type: 'string', description: 'Nombre parcial del ejecutor asignado' },
        limit: { type: 'number', description: 'Default 20, máx 50' },
      },
      required: [],
    },
  },
  {
    name: 'get_forecast_summary',
    description: 'Obtiene el resumen de forecast de MC/RFSU para todos los sistemas o un área específica.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Área o tren (ej: "Train 2", "Utilities", "Flare")' },
        risk_level: {
          type: 'string',
          enum: ['critical', 'delayed', 'at_risk', 'on_track', 'all'],
        },
        top_n: { type: 'number', description: 'Top N sistemas por riesgo (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_data_quality_issues',
    description: 'Obtiene los problemas de calidad de datos detectados automáticamente.',
    input_schema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['critical', 'error', 'warning', 'info', 'all'] },
        category: { type: 'string', description: 'Categoría de issue (itr_integrity, tag_coverage, etc.)' },
        limit: { type: 'number', description: 'Default 10' },
      },
      required: [],
    },
  },
] as const;

// ─── Auth ─────────────────────────────────────────────────────────────────

interface SupabaseUser {
  id: string;
  email?: string;
  aud?: string;
}

/**
 * Valida un JWT de Supabase contra el endpoint `/auth/v1/user`.
 * Devuelve el user verificado o `null` si el token es inválido/expirado.
 */
async function verifySupabaseJwt(env: Env, jwt: string): Promise<SupabaseUser | null> {
  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${jwt}`,
    },
  });
  if (!resp.ok) return null;
  const user = await resp.json() as Partial<SupabaseUser> & { id?: string };
  if (!user || typeof user.id !== 'string') return null;
  return user as SupabaseUser;
}

// ─── Supabase Query Executor ──────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * Ejecuta una consulta PostgREST con el JWT del usuario.
 * RLS se aplica automáticamente — solo verá datos de orgs a las que pertenece.
 */
async function supabase(
  env: Env,
  userJwt: string,
  path: string,
  params?: Record<string, string>,
): Promise<Row[]> {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const resp = await fetch(url.toString(), {
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${userJwt}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ─── Tool Executor ────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  env: Env,
  userJwt: string,
): Promise<string> {
  try {
    switch (toolName) {
      case 'get_system_status': {
        const tags = toolInput.system_tags as string[] | undefined;
        let query = 'systems_readiness_view?select=system_tag,description,mc_status,mc_completion_pct,punch_cat_a_open,punch_cat_b_open,itrs_approved,itrs_total,planned_mc_date,predicted_mc_p50,delay_days_p50,delay_risk';
        if (tags && tags.length > 0) {
          query += `&system_tag=in.(${tags.map((t) => `"${t}"`).join(',')})`;
        }
        query += '&order=delay_risk.desc&limit=20';
        const data = await supabase(env, userJwt, query);
        return JSON.stringify({
          systems: data,
          count: data.length,
          summary: `${data.filter((s) => s.delay_risk === 'critical').length} críticos, ${data.filter((s) => s.delay_risk === 'delayed').length} retrasados`,
        });
      }

      case 'get_blocking_items': {
        const sysId = toolInput.system_id as string;
        // Buscar por tag o ID
        const systems = await supabase(env, userJwt, `systems?or=(id.eq.${sysId},system_tag.eq.${sysId})&limit=1`);
        if (!systems.length) return JSON.stringify({ error: 'Sistema no encontrado', system_id: sysId });

        const sys = systems[0];
        const [punches, rejectedITRs, pendingCerts] = await Promise.all([
          supabase(env, userJwt, `punch_items?system_id=eq.${sys.id}&status=neq.cleared&order=category.asc&limit=20`),
          supabase(env, userJwt, `itrs?system_id=eq.${sys.id}&status=in.(rejected,pending)&limit=20`),
          supabase(env, userJwt, `certificates?system_id=eq.${sys.id}&status=neq.issued&limit=10`),
        ]);

        return JSON.stringify({
          system: { id: sys.id, tag: sys.system_tag, mc_status: sys.mc_status },
          blocking_items: {
            punch_cat_a: punches.filter((p) => p.category === 'A'),
            punch_cat_b: punches.filter((p) => p.category === 'B'),
            rejected_itrs: rejectedITRs.filter((i) => i.status === 'rejected'),
            pending_itrs: rejectedITRs.filter((i) => i.status === 'pending'),
            pending_certificates: pendingCerts,
          },
          summary: `${punches.filter((p) => p.category === 'A').length} Punch Cat A, ${rejectedITRs.length} ITRs pendientes/rechazados`,
        });
      }

      case 'get_punch_list': {
        let query = 'punch_items?select=punch_number,category,description,status,assigned_to_name,system_tag,discipline,raised_at';
        if (toolInput.system_tag) query += `&system_tag=eq.${toolInput.system_tag}`;
        if (toolInput.category !== 'all') query += `&category=eq.${toolInput.category}`;
        if (toolInput.discipline) query += `&discipline=eq.${toolInput.discipline}`;
        if (toolInput.status !== 'all' && toolInput.status) query += `&status=eq.${toolInput.status}`;
        query += `&order=category.asc,raised_at.asc&limit=${Math.min((toolInput.limit as number) || 20, 50)}`;

        const data = await supabase(env, userJwt, query);
        return JSON.stringify({
          punches: data,
          count: data.length,
          cat_a_count: data.filter((p) => p.category === 'A').length,
        });
      }

      case 'get_itr_status': {
        let query = 'itrs?select=itr_number,status,discipline,system_tag,assigned_to_name,rejection_count,planned_date,submitted_at';
        if (toolInput.system_tag) query += `&system_tag=eq.${toolInput.system_tag}`;
        if (toolInput.status && toolInput.status !== 'all') query += `&status=eq.${toolInput.status}`;
        if (toolInput.discipline) query += `&discipline=eq.${toolInput.discipline}`;
        if (toolInput.assigned_to_name) query += `&assigned_to_name=ilike.*${toolInput.assigned_to_name}*`;
        query += `&order=rejection_count.desc,planned_date.asc&limit=${Math.min((toolInput.limit as number) || 20, 50)}`;

        const data = await supabase(env, userJwt, query);
        const stats = {
          pending: data.filter((i) => i.status === 'pending').length,
          rejected: data.filter((i) => i.status === 'rejected').length,
          approved: data.filter((i) => i.status === 'approved').length,
        };
        return JSON.stringify({ itrs: data, count: data.length, stats });
      }

      case 'get_forecast_summary': {
        let query = 'systems_readiness_view?select=system_tag,area,description,planned_mc_date,predicted_mc_p50,delay_days_p50,delay_risk,risk_score,mc_completion_pct&order=delay_days_p50.desc';
        if (toolInput.area) query += `&area=ilike.*${toolInput.area}*`;
        if (toolInput.risk_level && toolInput.risk_level !== 'all') query += `&delay_risk=eq.${toolInput.risk_level}`;
        query += `&limit=${toolInput.top_n || 10}`;

        const data = await supabase(env, userJwt, query);
        const worstDelay = data[0];
        return JSON.stringify({
          systems: data,
          count: data.length,
          worst_case: worstDelay
            ? `${worstDelay.system_tag}: ${(worstDelay.delay_days_p50 as number) > 0 ? '+' : ''}${worstDelay.delay_days_p50} días vs plan`
            : 'N/A',
          critical_count: data.filter((s) => s.delay_risk === 'critical').length,
        });
      }

      case 'get_data_quality_issues': {
        let query = 'data_quality_issues_view?select=severity,category,entity_type,entity_label,description,suggested_fix';
        if (toolInput.severity && toolInput.severity !== 'all') query += `&severity=eq.${toolInput.severity}`;
        if (toolInput.category) query += `&category=eq.${toolInput.category}`;
        query += `&order=severity.asc&limit=${toolInput.limit || 10}`;

        const data = await supabase(env, userJwt, query);
        return JSON.stringify({ issues: data, count: data.length });
      }

      default:
        return JSON.stringify({ error: `Tool desconocida: ${toolName}` });
    }
  } catch (err: unknown) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err), tool: toolName });
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el Asistente de Completions de CommUP, especializado en proyectos Oil & Gas.

Tu rol:
- Responder preguntas en lenguaje natural sobre el estado de completions del proyecto
- Identificar cuellos de botella, riesgos de schedule y problemas de datos
- Proporcionar insights accionables y concisos
- Usar terminología técnica de Commissioning & Completions (ITR, Punch Cat A/B/C, MC, RFSU, Loop Check, etc.)

Capacidades:
- Consultar estado de sistemas, subsistemas y loops en tiempo real
- Analizar forecast de MC/RFSU con probabilidades P10/P50/P90
- Identificar bloqueadores críticos (Punch Cat A, ITRs rechazados)
- Detectar problemas de calidad de datos
- Proporcionar recomendaciones de acciones inmediatas

Restricciones:
- Solo lectura: NO puedes modificar datos, asignar ejecutores, ni aprobar ITRs
- Siempre menciona limitaciones cuando los datos sean insuficientes
- Si una consulta es ambigua, usa las herramientas para obtener contexto antes de responder
- Responde en el idioma del usuario (español por defecto)
- Sé conciso: prioriza insights accionables sobre listas largas de datos crudos

Formato de respuesta:
- Usa formato markdown con emojis para mejor legibilidad
- Para listas de sistemas o punches, usa tablas cuando haya más de 3 items
- Siempre termina con una recomendación de acción inmediata si hay riesgos críticos`;

// ─── Agentic Loop ─────────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ClaudeResponse {
  stop_reason: string;
  content: ContentBlock[];
}

async function runAgenticLoop(
  messages: Message[],
  env: Env,
  userJwt: string,
  maxIterations = 5,
): Promise<string> {
  const currentMessages = [...messages];
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: COMMUP_TOOLS,
        messages: currentMessages,
        tool_choice: { type: 'auto' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const result = await response.json() as ClaudeResponse;

    // Sin tool use → respuesta final
    if (result.stop_reason === 'end_turn' || !result.content.some((c) => c.type === 'tool_use')) {
      const textContent = result.content.find((c): c is Extract<ContentBlock, { type: 'text' }> => c.type === 'text');
      return textContent?.text || 'No se pudo generar una respuesta.';
    }

    // Procesar tool calls
    currentMessages.push({ role: 'assistant', content: result.content });

    const toolResults: ContentBlock[] = [];
    for (const block of result.content) {
      if (block.type === 'tool_use') {
        const toolResult = await executeTool(block.name, block.input, env, userJwt);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResult,
        });
      }
    }

    currentMessages.push({ role: 'user', content: toolResults });
  }

  return 'Se alcanzó el límite de iteraciones. Por favor, haga una pregunta más específica.';
}

// ─── Rate Limiting ────────────────────────────────────────────────────────

async function checkRateLimit(userId: string, env: Env): Promise<boolean> {
  const key = `rl:${userId}:${Math.floor(Date.now() / 3600000)}`; // bucket horario
  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0');
  if (current >= 60) return false; // 60 requests/hora
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
}

// ─── Request Handler ──────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    try {
      const authHeader = request.headers.get('Authorization') ?? '';
      const jwtMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!jwtMatch) {
        return json({ error: 'Authorization header con Bearer JWT requerido' }, 401);
      }
      const userJwt = jwtMatch[1].trim();

      const user = await verifySupabaseJwt(env, userJwt);
      if (!user) {
        return json({ error: 'JWT inválido o expirado' }, 401);
      }
      const userId = user.id;

      const body = await request.json() as { messages?: Message[] };
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return json({ error: 'messages es requerido (array no vacío)' }, 400);
      }

      const allowed = await checkRateLimit(userId, env);
      if (!allowed) {
        return json({ error: 'Límite de 60 consultas por hora alcanzado', retry_after: 'próxima hora' }, 429);
      }

      const answer = await runAgenticLoop(body.messages, env, userJwt);

      return json({
        answer,
        model: 'claude-opus-4-6',
        timestamp: new Date().toISOString(),
      });

    } catch (err: unknown) {
      console.error('[AI Assistant] Error:', err);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
