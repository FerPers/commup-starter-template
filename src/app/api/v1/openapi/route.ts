/**
 * GET /api/v1/openapi — OpenAPI 3.1 spec for CommUp Public API v1
 * No authentication required — public documentation endpoint.
 */

import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Scopes that match src/lib/api/auth.ts and the api_keys_scopes_valid CHECK constraint.
const SCOPE_ENUM = [
  'tags:read',        'tags:write',
  'itrs:read',        'itrs:write',
  'punches:read',     'punches:write',
  'certificates:read',
  'systems:read',
  'events:read',
  '*',
]

const SPEC = {
  openapi: '3.1.0',
  info: {
    title:       'CommUp Public API',
    version:     '1.0.0',
    description: [
      'REST API for Completion & Commissioning data. Integrates with P6, SAP, Maximo, and custom tools.',
      '',
      '## Authentication',
      'All endpoints require a bearer token obtained from **Admin → API Keys** in the dashboard.',
      'Keys have the format `sk_live_<64 hex chars>` and are shown only once at creation.',
      '',
      '## Scopes',
      'Each API key is granted one or more of the following scopes:',
      '',
      '| Scope | Grants |',
      '|-------|--------|',
      '| `tags:read` | `GET /tags` |',
      '| `tags:write` | `POST /tags` |',
      '| `itrs:read` | `GET /itrs` |',
      '| `itrs:write` | `POST /itrs` |',
      '| `punches:read` | `GET /punches` |',
      '| `punches:write` | `POST /punches` |',
      '| `certificates:read` | `GET /certificates` |',
      '| `systems:read` | `GET /systems` |',
      '| `events:read` | `GET /events` |',
      '| `*` | Superscope — grants access to every endpoint, including future ones |',
      '',
      '## Webhooks',
      'In addition to polling, CommUp can push domain events to an HTTPS endpoint. Each delivery is signed',
      'with HMAC-SHA256 in the `X-CommUp-Signature` header. Retries use exponential backoff (0s, 60s, 5m, 30m, 2h)',
      'and are abandoned after 5 failed attempts. Configure subscriptions under **Admin → Webhooks**.',
    ].join('\n'),
    contact: { name: 'CommUp Support', url: 'https://commup.app' },
  },
  servers: [{ url: 'https://commup.app/api/v1', description: 'Production' }],

  components: {
    securitySchemes: {
      BearerAuth: {
        type:         'http',
        scheme:       'bearer',
        description:  'API key in the form `sk_live_...` — obtain from Admin → API Keys',
      },
    },
    parameters: {
      project_id: {
        name: 'project_id', in: 'query', required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'UUID of the project',
      },
      limit: {
        name: 'limit', in: 'query',
        schema: { type: 'integer', default: 100, maximum: 500 },
      },
      offset: {
        name: 'offset', in: 'query',
        schema: { type: 'integer', default: 0 },
      },
    },
    schemas: {
      Scope: { type: 'string', enum: SCOPE_ENUM },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          docs:  { type: 'string', format: 'uri' },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id:                { type: 'string', format: 'uuid' },
          tag_number:        { type: 'string' },
          description:       { type: 'string', nullable: true },
          status:            { type: 'string', enum: ['not_started','in_progress','completed','on_hold'] },
          discipline_code:   { type: 'string' },
          discipline_color:  { type: 'string' },
          subsystem_code:    { type: 'string' },
          system_code:       { type: 'string' },
          area_code:         { type: 'string' },
          itr_total:         { type: 'integer' },
          itr_approved:      { type: 'integer' },
          itr_pct:           { type: 'number' },
          open_punches_a:    { type: 'integer' },
          open_punches_b:    { type: 'integer' },
          semaforo_global:   { type: 'string', enum: ['green','yellow','red','grey'] },
        },
      },
      Itr: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          itr_number:     { type: 'string' },
          status:         { type: 'string', enum: ['not_started','in_progress','completed','approved','rejected'] },
          progress_pct:   { type: 'number' },
          scheduled_date: { type: 'string', format: 'date', nullable: true },
          tag_id:         { type: 'string', format: 'uuid' },
        },
      },
      Punch: {
        type: 'object',
        properties: {
          id:           { type: 'string', format: 'uuid' },
          punch_number: { type: 'string' },
          category:     { type: 'string', enum: ['A','B','C'] },
          description:  { type: 'string' },
          status:       { type: 'string', enum: ['open','in_progress','closed','cancelled'] },
          priority:     { type: 'string', enum: ['critical','major','minor'] },
          raised_at:    { type: 'string', format: 'date-time' },
          tag_id:       { type: 'string', format: 'uuid' },
        },
      },
      DomainEvent: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          aggregate_type: { type: 'string', enum: ['tag','itr','punch','certificate','preservation'] },
          aggregate_id:   { type: 'string', format: 'uuid' },
          event_type:     { type: 'string', examples: ['punch.created','itr.approved','tag.status_changed'] },
          payload:        { type: 'object' },
          occurred_at:    { type: 'string', format: 'date-time' },
        },
      },
    },
  },

  // Default security applies to every operation. Each op can override with its own `security`
  // to declare the required scope in `x-required-scope` (OpenAPI 3.1 `http` scheme does not
  // support scopes natively — we use a custom extension that tooling can render).
  security: [{ BearerAuth: [] }],

  paths: {
    '/tags': {
      get: {
        operationId: 'listTags',
        summary:     'List tags with 360° metrics',
        tags:        ['Tags'],
        'x-required-scope': 'tags:read',
        parameters:  [
          { $ref: '#/components/parameters/project_id' },
          { name: 'subsystem_id',    in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'discipline_code', in: 'query', schema: { type: 'string' } },
          { name: 'status',          in: 'query', schema: { type: 'string' } },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/offset' },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Tag' } } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Missing required scope `tags:read`' },
        },
      },
      post: {
        operationId: 'createTag',
        summary:     'Create a tag',
        tags:        ['Tags'],
        'x-required-scope': 'tags:write',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['project_id','tag_number','subsystem_id','discipline_id'], properties: { project_id: { type: 'string', format: 'uuid' }, tag_number: { type: 'string' }, subsystem_id: { type: 'string', format: 'uuid' }, discipline_id: { type: 'string', format: 'uuid' }, description: { type: 'string' }, status: { type: 'string', default: 'not_started' } } } } },
        },
        responses: {
          '201': { description: 'Created' },
          '403': { description: 'Missing required scope `tags:write`' },
          '422': { description: 'Validation error' },
        },
      },
    },
    '/itrs': {
      get: {
        operationId: 'listItrs',
        summary: 'List ITR instances',
        tags: ['ITRs'],
        'x-required-scope': 'itrs:read',
        parameters: [
          { $ref: '#/components/parameters/project_id' },
          { name: 'tag_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/offset' },
        ],
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Missing required scope `itrs:read`' },
        },
      },
      post: {
        operationId: 'createItr',
        summary: 'Create an ITR instance',
        tags: ['ITRs'],
        'x-required-scope': 'itrs:write',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['project_id','tag_id','template_id'], properties: { project_id: { type: 'string', format: 'uuid' }, tag_id: { type: 'string', format: 'uuid' }, template_id: { type: 'string', format: 'uuid' }, itr_number: { type: 'string' }, scheduled_date: { type: 'string', format: 'date' }, phase_id: { type: 'string', format: 'uuid' } } } } } },
        responses: {
          '201': { description: 'Created' },
          '403': { description: 'Missing required scope `itrs:write`' },
        },
      },
    },
    '/punches': {
      get: {
        operationId: 'listPunches',
        summary: 'List punches',
        tags: ['Punches'],
        'x-required-scope': 'punches:read',
        parameters: [
          { $ref: '#/components/parameters/project_id' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['A','B','C'] } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/offset' },
        ],
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Missing required scope `punches:read`' },
        },
      },
      post: {
        operationId: 'createPunch',
        summary: 'Create a punch',
        tags: ['Punches'],
        'x-required-scope': 'punches:write',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['project_id','tag_id','category','description'], properties: { project_id: { type: 'string' }, tag_id: { type: 'string' }, category: { type: 'string', enum: ['A','B','C'] }, description: { type: 'string' }, priority: { type: 'string', enum: ['critical','major','minor'], default: 'minor' } } } } } },
        responses: {
          '201': { description: 'Created' },
          '403': { description: 'Missing required scope `punches:write`' },
        },
      },
    },
    '/certificates': {
      get: {
        operationId: 'listCertificates',
        summary: 'List certificates',
        tags: ['Certificates'],
        'x-required-scope': 'certificates:read',
        parameters: [
          { $ref: '#/components/parameters/project_id' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending','in_review','issued','rejected'] } },
          { $ref: '#/components/parameters/limit' },
          { $ref: '#/components/parameters/offset' },
        ],
        responses: {
          '200': { description: 'OK' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Missing required scope `certificates:read`' },
        },
      },
    },
    '/systems': {
      get: {
        operationId: 'getHierarchy',
        summary: 'Get project hierarchy (areas→systems→subsystems)',
        tags: ['Systems'],
        'x-required-scope': 'systems:read',
        parameters: [{ $ref: '#/components/parameters/project_id' }],
        responses: {
          '200': { description: 'Nested hierarchy' },
          '403': { description: 'Missing required scope `systems:read`' },
        },
      },
    },
    '/events': {
      get: {
        operationId: 'listEvents',
        summary: 'Stream domain events (poll for integration sync)',
        tags: ['Events'],
        'x-required-scope': 'events:read',
        parameters: [
          { $ref: '#/components/parameters/project_id' },
          { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Return events after this timestamp (default: 24h ago)' },
          { name: 'aggregate_type', in: 'query', schema: { type: 'string' } },
          { name: 'event_type', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } },
        ],
        responses: {
          '200': { description: 'Event list with next_since cursor' },
          '403': { description: 'Missing required scope `events:read`' },
        },
      },
    },
  },
}

export function GET() {
  return NextResponse.json(SPEC, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
