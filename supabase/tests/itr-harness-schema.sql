-- Disposable PostgreSQL harness. Never run on production. Schema columns extracted from baseline.

CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;

CREATE TYPE public.alert_severity AS ENUM (
    'info',
    'warning',
    'critical'
);

CREATE TYPE public.cert_signature_role AS ENUM (
    'completion',
    'client',
    'authority'
);

CREATE TYPE public.certificate_status AS ENUM (
    'pending',
    'in_review',
    'issued',
    'rejected'
);

CREATE TYPE public.itr_item_type AS ENUM (
    'checkbox',
    'text',
    'number',
    'measurement',
    'select',
    'photo',
    'signature',
    'date',
    'yes_no'
);

CREATE TYPE public.itr_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'approved',
    'rejected'
);

CREATE TYPE public.org_member_role AS ENUM (
    'owner',
    'admin',
    'architect',
    'leader',
    'inspector',
    'client'
);

CREATE TYPE public.preservation_frequency AS ENUM (
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'quarterly'
);

CREATE TYPE public.preservation_plan_status AS ENUM (
    'active',
    'suspended',
    'completed'
);

CREATE TYPE public.preservation_result AS ENUM (
    'ok',
    'nok',
    'na'
);

CREATE TYPE public.project_status AS ENUM (
    'planning',
    'active',
    'on_hold',
    'completed',
    'cancelled'
);

CREATE TYPE public.punch_category AS ENUM (
    'A',
    'B',
    'C'
);

CREATE TYPE public.punch_priority AS ENUM (
    'critical',
    'major',
    'minor'
);

CREATE TYPE public.punch_status AS ENUM (
    'open',
    'in_progress',
    'closed',
    'cancelled'
);

CREATE TYPE public.signal_type AS ENUM (
    'AI',
    'AO',
    'DI',
    'DO',
    'PI',
    'PO'
);

CREATE TYPE public.signature_role AS ENUM (
    'executor',
    'supervisor',
    'client'
);

CREATE TYPE public.tag_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'on_hold'
);

CREATE TYPE public.work_plan_status AS ENUM (
    'draft',
    'published',
    'in_progress',
    'completed'
);

CREATE TYPE public.workflow_action_type AS ENUM (
    'block_certificate',
    'notify_user',
    'create_punch',
    'change_system_state',
    'webhook_call',
    'suggest_close_itr'
);

CREATE TABLE public.projects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    location text,
    client text,
    start_date date,
    end_date date,
    status public.project_status DEFAULT 'planning'::public.project_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.projects ADD PRIMARY KEY(id);

CREATE TABLE public.org_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.org_member_role DEFAULT 'inspector'::public.org_member_role NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    locale text DEFAULT 'es'::text,
    dashboard_layout jsonb,
    CONSTRAINT profiles_locale_check CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text])))
);

ALTER TABLE public.profiles ADD PRIMARY KEY(id);

CREATE TABLE public.itrs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    template_id uuid NOT NULL,
    tag_id uuid,
    subsystem_id uuid NOT NULL,
    project_id uuid NOT NULL,
    phase_id uuid NOT NULL,
    itr_number text NOT NULL,
    status public.itr_status DEFAULT 'not_started'::public.itr_status NOT NULL,
    scheduled_date date,
    completed_date date,
    progress_pct numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.itrs ADD PRIMARY KEY(id);

CREATE TABLE public.itr_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.signature_role NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.itr_assignments ADD PRIMARY KEY(id);

CREATE TABLE public.itr_responses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    item_id uuid NOT NULL,
    value_text text,
    value_numeric numeric,
    value_bool boolean,
    value_option text,
    remarks text,
    is_passed boolean,
    responded_at timestamp with time zone,
    responded_by uuid
);

ALTER TABLE public.itr_responses ADD PRIMARY KEY(id);

CREATE TABLE public.itr_attachments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    item_id uuid,
    response_id uuid,
    file_url text NOT NULL,
    file_type text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid NOT NULL
);

ALTER TABLE public.itr_attachments ADD PRIMARY KEY(id);

CREATE TABLE public.itr_signatures (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    itr_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.signature_role NOT NULL,
    signature_url text,
    signed_at timestamp with time zone DEFAULT now() NOT NULL,
    signature_image text
);

ALTER TABLE public.itr_signatures ADD PRIMARY KEY(id);

CREATE TABLE public.itr_templates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    equipment_type_id uuid,
    phase_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.itr_templates ADD PRIMARY KEY(id);

CREATE TABLE public.itr_template_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    template_id uuid NOT NULL,
    title text NOT NULL,
    order_index integer NOT NULL
);

ALTER TABLE public.itr_template_sections ADD PRIMARY KEY(id);

CREATE TABLE public.itr_template_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section_id uuid NOT NULL,
    template_id uuid NOT NULL,
    description text NOT NULL,
    item_type public.itr_item_type DEFAULT 'checkbox'::public.itr_item_type NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    is_critical boolean DEFAULT false NOT NULL,
    requires_photo boolean DEFAULT false NOT NULL,
    requires_measurement boolean DEFAULT false NOT NULL,
    options jsonb,
    unit text,
    acceptance_min numeric,
    acceptance_max numeric,
    acceptance_text text,
    order_index integer NOT NULL,
    item_number text,
    description_es text,
    condition_item_id uuid,
    condition_value text
);

ALTER TABLE public.itr_template_items ADD PRIMARY KEY(id);

CREATE TABLE public.activity_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    action text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.activity_log ADD PRIMARY KEY(id);

CREATE TABLE public.tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    subsystem_id uuid NOT NULL,
    project_id uuid NOT NULL,
    discipline_id uuid NOT NULL,
    equipment_type_id uuid,
    tag_number text NOT NULL,
    description text NOT NULL,
    manufacturer text,
    model text,
    serial_number text,
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL,
    preservation_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pid_drawing text,
    range_min numeric,
    range_max numeric,
    eng_unit text,
    sp_h numeric,
    sp_hh numeric,
    sp_l numeric,
    sp_ll numeric,
    signal_type text,
    sil_level text DEFAULT 'None'::text,
    io_address text,
    junction_box text,
    revision text,
    datasheet_number text,
    fluid_type text,
    mounting_typical text,
    nfc_uid text
);

ALTER TABLE public.tags ADD PRIMARY KEY(id);

CREATE TABLE public.subsystems (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    system_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    current_phase_id uuid,
    completion_pct numeric(5,2) DEFAULT 0 NOT NULL
);

ALTER TABLE public.subsystems ADD PRIMARY KEY(id);

CREATE TABLE public.systems (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    area_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    current_phase_id uuid
);

ALTER TABLE public.systems ADD PRIMARY KEY(id);

CREATE TABLE public.areas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text
);

ALTER TABLE public.areas ADD PRIMARY KEY(id);

CREATE TABLE public.project_phases (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    order_index integer NOT NULL,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    certificate_name text
);

ALTER TABLE public.project_phases ADD PRIMARY KEY(id);

CREATE TABLE public.work_plan_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    work_plan_id uuid NOT NULL,
    itr_id uuid NOT NULL,
    assigned_to uuid NOT NULL,
    status public.tag_status DEFAULT 'not_started'::public.tag_status NOT NULL,
    remarks text,
    p6_activity_id text,
    p6_wbs_code text,
    planned_start date,
    planned_finish date,
    actual_start date,
    actual_finish date,
    duration_days integer,
    p6_sync_at timestamp with time zone,
    title text
);

ALTER TABLE public.work_plan_items ADD PRIMARY KEY(id);

ALTER TABLE public.itr_signatures ADD UNIQUE(itr_id,role);

ALTER TABLE public.itr_assignments ADD UNIQUE(itr_id,role);

ALTER TABLE public.itr_responses ADD UNIQUE(itr_id,item_id);

CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb);

GRANT USAGE ON SCHEMA public,auth,storage TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO authenticated;
