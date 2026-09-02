/**
 * AUTO-GENERATED from the live Supabase schema (mdyljpgzvigzjpqluket).
 * Regenerate via MCP generate_typescript_types or:
 *   supabase gen types typescript --project-id mdyljpgzvigzjpqluket > src/types/supabase.generated.ts
 * Do NOT edit by hand. Hand-written domain interfaces live in src/types/database.ts.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          org_id: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          org_id: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          message: string | null
          org_id: string
          project_id: string | null
          read: boolean
          read_at: string | null
          role: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source_event_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          org_id: string
          project_id?: string | null
          read?: boolean
          read_at?: string | null
          role?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_event_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          org_id?: string
          project_id?: string | null
          read?: boolean
          read_at?: string | null
          role?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_event_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          code: string
          description: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cables: {
        Row: {
          cable_number: string
          cable_type: string | null
          from_tag_id: string | null
          id: string
          length_m: number | null
          project_id: string
          size: string | null
          status: Database["public"]["Enums"]["tag_status"]
          subsystem_id: string | null
          to_tag_id: string | null
        }
        Insert: {
          cable_number: string
          cable_type?: string | null
          from_tag_id?: string | null
          id?: string
          length_m?: number | null
          project_id: string
          size?: string | null
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id?: string | null
          to_tag_id?: string | null
        }
        Update: {
          cable_number?: string
          cable_type?: string | null
          from_tag_id?: string | null
          id?: string
          length_m?: number | null
          project_id?: string
          size?: string | null
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id?: string | null
          to_tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cables_from_tag_id_fkey"
            columns: ["from_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "cables_from_tag_id_fkey"
            columns: ["from_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "cables_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "cables_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "cables_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cables_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "cables_to_tag_id_fkey"
            columns: ["to_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "cables_to_tag_id_fkey"
            columns: ["to_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_punch_exceptions: {
        Row: {
          approved_at: string
          approved_by: string
          certificate_id: string
          id: string
          justification: string
          punch_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          certificate_id: string
          id?: string
          justification: string
          punch_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          certificate_id?: string
          id?: string
          justification?: string
          punch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_punch_exceptions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_punch_exceptions_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_punch_exceptions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "certificate_punch_exceptions_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_signatures: {
        Row: {
          certificate_id: string
          comments: string | null
          id: string
          role: Database["public"]["Enums"]["cert_signature_role"]
          signature_image: string | null
          signed_at: string
          user_id: string
        }
        Insert: {
          certificate_id: string
          comments?: string | null
          id?: string
          role: Database["public"]["Enums"]["cert_signature_role"]
          signature_image?: string | null
          signed_at?: string
          user_id: string
        }
        Update: {
          certificate_id?: string
          comments?: string | null
          id?: string
          role?: Database["public"]["Enums"]["cert_signature_role"]
          signature_image?: string | null
          signed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_signatures_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          approved_by: string | null
          block_reason: string | null
          certificate_number: string
          created_at: string
          document_url: string | null
          id: string
          is_blocked: boolean
          issued_by: string | null
          issued_date: string | null
          notes: string | null
          phase_id: string
          project_id: string
          status: Database["public"]["Enums"]["certificate_status"]
          subsystem_id: string | null
          system_id: string | null
          title: string
        }
        Insert: {
          approved_by?: string | null
          block_reason?: string | null
          certificate_number: string
          created_at?: string
          document_url?: string | null
          id?: string
          is_blocked?: boolean
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          phase_id: string
          project_id: string
          status?: Database["public"]["Enums"]["certificate_status"]
          subsystem_id?: string | null
          system_id?: string | null
          title: string
        }
        Update: {
          approved_by?: string | null
          block_reason?: string | null
          certificate_number?: string
          created_at?: string
          document_url?: string | null
          id?: string
          is_blocked?: boolean
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          phase_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["certificate_status"]
          subsystem_id?: string | null
          system_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "certificates_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "certificates_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "certificates_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      disciplines: {
        Row: {
          code: string
          color: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          code: string
          color?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          code?: string
          color?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_id: string | null
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id: string
          occurred_at: string
          org_id: string
          payload: Json
          project_id: string
        }
        Insert: {
          actor_id?: string | null
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id?: string
          occurred_at?: string
          org_id: string
          payload: Json
          project_id: string
        }
        Update: {
          actor_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          org_id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_type_templates: {
        Row: {
          confidence: number | null
          equipment_type_id: string
          id: string
          itr_template_id: string
          model: string | null
          org_id: string
          proposed_at: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
        }
        Insert: {
          confidence?: number | null
          equipment_type_id: string
          id?: string
          itr_template_id: string
          model?: string | null
          org_id: string
          proposed_at?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
        }
        Update: {
          confidence?: number | null
          equipment_type_id?: string
          id?: string
          itr_template_id?: string
          model?: string | null
          org_id?: string
          proposed_at?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_type_templates_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_type_templates_itr_template_id_fkey"
            columns: ["itr_template_id"]
            isOneToOne: false
            referencedRelation: "itr_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_type_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_types: {
        Row: {
          category: string | null
          code: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          category?: string | null
          code: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          category?: string | null
          code?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_package_systems: {
        Row: {
          package_id: string
          system_id: string
        }
        Insert: {
          package_id: string
          system_id: string
        }
        Update: {
          package_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_package_systems_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "handover_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "handover_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "handover_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      handover_packages: {
        Row: {
          created_at: string
          error_message: string | null
          generated_at: string
          generated_by: string | null
          id: string
          json_path: string | null
          metadata: Json
          org_id: string
          pdf_path: string | null
          project_id: string
          signature_hash: string | null
          status: string
          version: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          json_path?: string | null
          metadata?: Json
          org_id: string
          pdf_path?: string | null
          project_id: string
          signature_hash?: string | null
          status?: string
          version?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          json_path?: string | null
          metadata?: Json
          org_id?: string
          pdf_path?: string | null
          project_id?: string
          signature_hash?: string | null
          status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_packages_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      interlocks: {
        Row: {
          action: string | null
          cause_tag_id: string | null
          description: string
          effect_tag_id: string | null
          id: string
          interlock_number: string
          project_id: string
          set_point: string | null
          subsystem_id: string
        }
        Insert: {
          action?: string | null
          cause_tag_id?: string | null
          description: string
          effect_tag_id?: string | null
          id?: string
          interlock_number: string
          project_id: string
          set_point?: string | null
          subsystem_id: string
        }
        Update: {
          action?: string | null
          cause_tag_id?: string | null
          description?: string
          effect_tag_id?: string | null
          id?: string
          interlock_number?: string
          project_id?: string
          set_point?: string | null
          subsystem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interlocks_cause_tag_id_fkey"
            columns: ["cause_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "interlocks_cause_tag_id_fkey"
            columns: ["cause_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlocks_effect_tag_id_fkey"
            columns: ["effect_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "interlocks_effect_tag_id_fkey"
            columns: ["effect_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlocks_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "interlocks_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "interlocks_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "interlocks_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlocks_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
        ]
      }
      itr_assignments: {
        Row: {
          assigned_at: string
          id: string
          itr_id: string
          role: Database["public"]["Enums"]["signature_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          itr_id: string
          role: Database["public"]["Enums"]["signature_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          itr_id?: string
          role?: Database["public"]["Enums"]["signature_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_assignments_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_attachments: {
        Row: {
          captured_at: string
          file_type: string
          file_url: string
          id: string
          item_id: string | null
          itr_id: string
          latitude: number | null
          longitude: number | null
          response_id: string | null
          uploaded_by: string
        }
        Insert: {
          captured_at?: string
          file_type: string
          file_url: string
          id?: string
          item_id?: string | null
          itr_id: string
          latitude?: number | null
          longitude?: number | null
          response_id?: string | null
          uploaded_by: string
        }
        Update: {
          captured_at?: string
          file_type?: string
          file_url?: string
          id?: string
          item_id?: string | null
          itr_id?: string
          latitude?: number | null
          longitude?: number | null
          response_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_attachments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itr_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_attachments_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_attachments_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "itr_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_responses: {
        Row: {
          id: string
          is_passed: boolean | null
          item_id: string
          itr_id: string
          remarks: string | null
          responded_at: string | null
          responded_by: string | null
          value_bool: boolean | null
          value_numeric: number | null
          value_option: string | null
          value_text: string | null
        }
        Insert: {
          id?: string
          is_passed?: boolean | null
          item_id: string
          itr_id: string
          remarks?: string | null
          responded_at?: string | null
          responded_by?: string | null
          value_bool?: boolean | null
          value_numeric?: number | null
          value_option?: string | null
          value_text?: string | null
        }
        Update: {
          id?: string
          is_passed?: boolean | null
          item_id?: string
          itr_id?: string
          remarks?: string | null
          responded_at?: string | null
          responded_by?: string | null
          value_bool?: boolean | null
          value_numeric?: number | null
          value_option?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itr_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itr_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_responses_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_responses_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_signatures: {
        Row: {
          id: string
          itr_id: string
          role: Database["public"]["Enums"]["signature_role"]
          signature_image: string | null
          signature_url: string | null
          signed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          itr_id: string
          role: Database["public"]["Enums"]["signature_role"]
          signature_image?: string | null
          signature_url?: string | null
          signed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          itr_id?: string
          role?: Database["public"]["Enums"]["signature_role"]
          signature_image?: string | null
          signature_url?: string | null
          signed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_signatures_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_suggestions: {
        Row: {
          expires_at: string | null
          id: string
          itr_id: string
          message: string | null
          org_id: string
          pre_filled_data: Json
          project_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          sampled_at: string | null
          signal_id: string | null
          signal_tag: string | null
          signal_unit: string | null
          signal_value: number | null
          status: string
          suggested_at: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          itr_id: string
          message?: string | null
          org_id: string
          pre_filled_data?: Json
          project_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          sampled_at?: string | null
          signal_id?: string | null
          signal_tag?: string | null
          signal_unit?: string | null
          signal_value?: number | null
          status?: string
          suggested_at?: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          itr_id?: string
          message?: string | null
          org_id?: string
          pre_filled_data?: Json
          project_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          sampled_at?: string | null
          signal_id?: string | null
          signal_tag?: string | null
          signal_unit?: string | null
          signal_value?: number | null
          status?: string
          suggested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_suggestions_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_suggestions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_suggestions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_template_items: {
        Row: {
          acceptance_max: number | null
          acceptance_min: number | null
          acceptance_text: string | null
          condition_item_id: string | null
          condition_value: string | null
          description: string
          description_es: string | null
          id: string
          is_critical: boolean
          is_required: boolean
          item_number: string | null
          item_type: Database["public"]["Enums"]["itr_item_type"]
          options: Json | null
          order_index: number
          requires_measurement: boolean
          requires_photo: boolean
          section_id: string
          template_id: string
          unit: string | null
        }
        Insert: {
          acceptance_max?: number | null
          acceptance_min?: number | null
          acceptance_text?: string | null
          condition_item_id?: string | null
          condition_value?: string | null
          description: string
          description_es?: string | null
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"]
          options?: Json | null
          order_index: number
          requires_measurement?: boolean
          requires_photo?: boolean
          section_id: string
          template_id: string
          unit?: string | null
        }
        Update: {
          acceptance_max?: number | null
          acceptance_min?: number | null
          acceptance_text?: string | null
          condition_item_id?: string | null
          condition_value?: string | null
          description?: string
          description_es?: string | null
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"]
          options?: Json | null
          order_index?: number
          requires_measurement?: boolean
          requires_photo?: boolean
          section_id?: string
          template_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itr_template_items_condition_item_id_fkey"
            columns: ["condition_item_id"]
            isOneToOne: false
            referencedRelation: "itr_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_template_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "itr_template_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "itr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_template_items_backup_pre_split: {
        Row: {
          acceptance_max: number | null
          acceptance_min: number | null
          acceptance_text: string | null
          condition_item_id: string | null
          condition_value: string | null
          description: string | null
          description_es: string | null
          id: string | null
          is_critical: boolean | null
          is_required: boolean | null
          item_number: string | null
          item_type: Database["public"]["Enums"]["itr_item_type"] | null
          options: Json | null
          order_index: number | null
          requires_measurement: boolean | null
          requires_photo: boolean | null
          section_id: string | null
          template_id: string | null
          unit: string | null
        }
        Insert: {
          acceptance_max?: number | null
          acceptance_min?: number | null
          acceptance_text?: string | null
          condition_item_id?: string | null
          condition_value?: string | null
          description?: string | null
          description_es?: string | null
          id?: string | null
          is_critical?: boolean | null
          is_required?: boolean | null
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"] | null
          options?: Json | null
          order_index?: number | null
          requires_measurement?: boolean | null
          requires_photo?: boolean | null
          section_id?: string | null
          template_id?: string | null
          unit?: string | null
        }
        Update: {
          acceptance_max?: number | null
          acceptance_min?: number | null
          acceptance_text?: string | null
          condition_item_id?: string | null
          condition_value?: string | null
          description?: string | null
          description_es?: string | null
          id?: string | null
          is_critical?: boolean | null
          is_required?: boolean | null
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"] | null
          options?: Json | null
          order_index?: number | null
          requires_measurement?: boolean | null
          requires_photo?: boolean | null
          section_id?: string | null
          template_id?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      itr_template_sections: {
        Row: {
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          id?: string
          order_index: number
          template_id: string
          title: string
        }
        Update: {
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "itr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_templates: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discipline_id: string
          equipment_type_id: string | null
          id: string
          is_active: boolean
          is_global: boolean
          org_id: string
          phase_id: string
          title: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discipline_id: string
          equipment_type_id?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          org_id: string
          phase_id: string
          title: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discipline_id?: string
          equipment_type_id?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          org_id?: string
          phase_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "itr_templates_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_templates_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "itr_templates_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_templates_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      itrs: {
        Row: {
          completed_date: string | null
          created_at: string
          id: string
          itr_number: string
          phase_id: string
          progress_pct: number
          project_id: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["itr_status"]
          subsystem_id: string
          tag_id: string | null
          template_id: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          id?: string
          itr_number: string
          phase_id: string
          progress_pct?: number
          project_id: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["itr_status"]
          subsystem_id: string
          tag_id?: string | null
          template_id: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          id?: string
          itr_number?: string
          phase_id?: string
          progress_pct?: number
          project_id?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["itr_status"]
          subsystem_id?: string
          tag_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itrs_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itrs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itrs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "itrs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "itrs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "itrs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itrs_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "itrs_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "itrs_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itrs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "itr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshots: {
        Row: {
          area_id: string | null
          completed_itrs: number
          completion_pct: number
          id: string
          open_punches_a: number
          open_punches_b: number
          overdue_preservation: number
          phase_id: string | null
          project_id: string
          snapshot_date: string
          subsystem_id: string | null
          system_id: string | null
          total_itrs: number
          total_preservation: number
          total_punches_a: number
          total_punches_b: number
          total_tags: number
        }
        Insert: {
          area_id?: string | null
          completed_itrs?: number
          completion_pct?: number
          id?: string
          open_punches_a?: number
          open_punches_b?: number
          overdue_preservation?: number
          phase_id?: string | null
          project_id: string
          snapshot_date: string
          subsystem_id?: string | null
          system_id?: string | null
          total_itrs?: number
          total_preservation?: number
          total_punches_a?: number
          total_punches_b?: number
          total_tags?: number
        }
        Update: {
          area_id?: string | null
          completed_itrs?: number
          completion_pct?: number
          id?: string
          open_punches_a?: number
          open_punches_b?: number
          overdue_preservation?: number
          phase_id?: string | null
          project_id?: string
          snapshot_date?: string
          subsystem_id?: string | null
          system_id?: string | null
          total_itrs?: number
          total_preservation?: number
          total_punches_a?: number
          total_punches_b?: number
          total_tags?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshots_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "kpi_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          locale: string | null
          message: string | null
          name: string
          project_type: string | null
          source: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message?: string | null
          name: string
          project_type?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message?: string | null
          name?: string
          project_type?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      loop_tags: {
        Row: {
          id: string
          loop_id: string
          role_in_loop: string | null
          tag_id: string
        }
        Insert: {
          id?: string
          loop_id: string
          role_in_loop?: string | null
          tag_id: string
        }
        Update: {
          id?: string
          loop_id?: string
          role_in_loop?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loop_tags_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loop_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "loop_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      loops: {
        Row: {
          description: string | null
          discipline_id: string
          id: string
          loop_number: string
          project_id: string
          status: Database["public"]["Enums"]["tag_status"]
          subsystem_id: string
        }
        Insert: {
          description?: string | null
          discipline_id: string
          id?: string
          loop_number: string
          project_id: string
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id: string
        }
        Update: {
          description?: string | null
          discipline_id?: string
          id?: string
          loop_number?: string
          project_id?: string
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loops_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loops_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "loops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loops_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "loops_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "loops_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "loops_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loops_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link_url: string | null
          org_id: string
          payload: Json | null
          read_at: string | null
          recipient_user_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link_url?: string | null
          org_id: string
          payload?: Json | null
          read_at?: string | null
          recipient_user_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link_url?: string | null
          org_id?: string
          payload?: Json | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          joined_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      pid_documents: {
        Row: {
          created_at: string | null
          drawing_number: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          project_id: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          drawing_number: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          project_id: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          drawing_number?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          project_id?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_hotspots: {
        Row: {
          created_at: string
          created_by: string
          id: string
          org_id: string
          page_num: number
          pid_document_id: string
          project_id: string
          tag_id: string
          x_pct: number
          y_pct: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          page_num?: number
          pid_document_id: string
          project_id: string
          tag_id: string
          x_pct: number
          y_pct: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          page_num?: number
          pid_document_id?: string
          project_id?: string
          tag_id?: string
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "pid_hotspots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_hotspots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_hotspots_pid_document_id_fkey"
            columns: ["pid_document_id"]
            isOneToOne: false
            referencedRelation: "pid_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_hotspots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_hotspots_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "pid_hotspots_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_attachments: {
        Row: {
          captured_at: string
          file_type: string
          file_url: string
          id: string
          latitude: number | null
          longitude: number | null
          record_id: string
        }
        Insert: {
          captured_at?: string
          file_type: string
          file_url: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          record_id: string
        }
        Update: {
          captured_at?: string
          file_type?: string
          file_url?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preservation_attachments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "preservation_records"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_plans: {
        Row: {
          end_date: string | null
          id: string
          last_performed_date: string | null
          next_due_date: string
          procedure_id: string
          project_id: string
          responsible_user_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["preservation_plan_status"]
          tag_id: string
        }
        Insert: {
          end_date?: string | null
          id?: string
          last_performed_date?: string | null
          next_due_date: string
          procedure_id: string
          project_id: string
          responsible_user_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["preservation_plan_status"]
          tag_id: string
        }
        Update: {
          end_date?: string | null
          id?: string
          last_performed_date?: string | null
          next_due_date?: string
          procedure_id?: string
          project_id?: string
          responsible_user_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["preservation_plan_status"]
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preservation_plans_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "preservation_procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_plans_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_plans_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "preservation_plans_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_procedure_items: {
        Row: {
          created_at: string
          id: string
          is_critical: boolean
          is_required: boolean
          item_type: string
          label: string
          max_value: number | null
          min_value: number | null
          order_index: number
          procedure_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_type: string
          label: string
          max_value?: number | null
          min_value?: number | null
          order_index?: number
          procedure_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_type?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          order_index?: number
          procedure_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preservation_procedure_items_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "preservation_procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_procedures: {
        Row: {
          code: string
          description: string | null
          discipline_id: string | null
          equipment_type_id: string | null
          frequency: Database["public"]["Enums"]["preservation_frequency"]
          id: string
          interval_days: number
          org_id: string
          requires_photo: boolean
          requires_signature: boolean
          title: string
        }
        Insert: {
          code: string
          description?: string | null
          discipline_id?: string | null
          equipment_type_id?: string | null
          frequency: Database["public"]["Enums"]["preservation_frequency"]
          id?: string
          interval_days: number
          org_id: string
          requires_photo?: boolean
          requires_signature?: boolean
          title: string
        }
        Update: {
          code?: string
          description?: string | null
          discipline_id?: string | null
          equipment_type_id?: string | null
          frequency?: Database["public"]["Enums"]["preservation_frequency"]
          id?: string
          interval_days?: number
          org_id?: string
          requires_photo?: boolean
          requires_signature?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "preservation_procedures_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_procedures_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "preservation_procedures_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_procedures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_record_responses: {
        Row: {
          id: string
          is_passed: boolean | null
          item_id: string
          record_id: string
          responded_at: string
          responded_by: string
          value_bool: boolean | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          id?: string
          is_passed?: boolean | null
          item_id: string
          record_id: string
          responded_at?: string
          responded_by: string
          value_bool?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          id?: string
          is_passed?: boolean | null
          item_id?: string
          record_id?: string
          responded_at?: string
          responded_by?: string
          value_bool?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preservation_record_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "preservation_procedure_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_record_responses_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "preservation_records"
            referencedColumns: ["id"]
          },
        ]
      }
      preservation_records: {
        Row: {
          created_at: string
          id: string
          performed_at: string
          performed_by: string
          plan_id: string
          punch_id: string | null
          punch_raised: boolean
          remarks: string | null
          result: Database["public"]["Enums"]["preservation_result"]
          status: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          performed_at: string
          performed_by: string
          plan_id: string
          punch_id?: string | null
          punch_raised?: boolean
          remarks?: string | null
          result: Database["public"]["Enums"]["preservation_result"]
          status?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          performed_at?: string
          performed_by?: string
          plan_id?: string
          punch_id?: string | null
          punch_raised?: boolean
          remarks?: string | null
          result?: Database["public"]["Enums"]["preservation_result"]
          status?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preservation_records_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "preservation_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_records_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "preservation_records_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preservation_records_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "preservation_records_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dashboard_layout: Json | null
          full_name: string
          id: string
          locale: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          full_name: string
          id: string
          locale?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          full_name?: string
          id?: string
          locale?: string | null
        }
        Relationships: []
      }
      project_phases: {
        Row: {
          certificate_name: string | null
          code: string
          color: string
          id: string
          name: string
          order_index: number
          org_id: string
        }
        Insert: {
          certificate_name?: string | null
          code: string
          color?: string
          id?: string
          name: string
          order_index: number
          org_id: string
        }
        Update: {
          certificate_name?: string | null
          code?: string
          color?: string
          id?: string
          name?: string
          order_index?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string | null
          code: string
          country: string | null
          created_at: string
          end_date: string | null
          id: string
          location: string | null
          name: string
          org_id: string
          region: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          client?: string | null
          code: string
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          org_id: string
          region?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          client?: string | null
          code?: string
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          region?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pssr_review_items: {
        Row: {
          actions: string | null
          category: string
          completion_date: string | null
          element: string
          id: string
          item_order: number
          notes_hint: string | null
          requirement: string
          responsible: string | null
          review_id: string
          status: string
          template_item_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: string | null
          category: string
          completion_date?: string | null
          element: string
          id?: string
          item_order: number
          notes_hint?: string | null
          requirement: string
          responsible?: string | null
          review_id: string
          status?: string
          template_item_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: string | null
          category?: string
          completion_date?: string | null
          element?: string
          id?: string
          item_order?: number
          notes_hint?: string | null
          requirement?: string
          responsible?: string | null
          review_id?: string
          status?: string
          template_item_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pssr_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "pssr_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_review_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "pssr_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_review_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pssr_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          last_overdue_notif_at: string | null
          notes: string | null
          org_id: string
          project_id: string
          review_due_date: string | null
          review_number: string
          rfsu_certificate_id: string | null
          status: string
          system_id: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_overdue_notif_at?: string | null
          notes?: string | null
          org_id: string
          project_id: string
          review_due_date?: string | null
          review_number: string
          rfsu_certificate_id?: string | null
          status?: string
          system_id: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_overdue_notif_at?: string | null
          notes?: string | null
          org_id?: string
          project_id?: string
          review_due_date?: string | null
          review_number?: string
          rfsu_certificate_id?: string | null
          status?: string
          system_id?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pssr_reviews_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_rfsu_certificate_id_fkey"
            columns: ["rfsu_certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pssr_reviews_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pssr_reviews_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_reviews_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pssr_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pssr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pssr_signatures: {
        Row: {
          discipline: string | null
          id: string
          review_id: string
          signature_data: string
          signed_at: string
          user_id: string
        }
        Insert: {
          discipline?: string | null
          id?: string
          review_id: string
          signature_data: string
          signed_at?: string
          user_id: string
        }
        Update: {
          discipline?: string | null
          id?: string
          review_id?: string
          signature_data?: string
          signed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pssr_signatures_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "pssr_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pssr_template_items: {
        Row: {
          category: string
          created_at: string
          element: string
          id: string
          is_required: boolean
          item_order: number
          notes_hint: string | null
          requirement: string
          template_id: string
        }
        Insert: {
          category: string
          created_at?: string
          element: string
          id?: string
          is_required?: boolean
          item_order: number
          notes_hint?: string | null
          requirement: string
          template_id: string
        }
        Update: {
          category?: string
          created_at?: string
          element?: string
          id?: string
          is_required?: boolean
          item_order?: number
          notes_hint?: string | null
          requirement?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pssr_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pssr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pssr_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pssr_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pssr_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_attachments: {
        Row: {
          created_at: string
          file_url: string
          id: string
          punch_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          punch_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          punch_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_attachments_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "punch_attachments_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          punch_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          punch_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          punch_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_comments_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "punch_comments_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_counters: {
        Row: {
          last_seq: number
          project_id: string
        }
        Insert: {
          last_seq?: number
          project_id: string
        }
        Update: {
          last_seq?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_post_handover_events: {
        Row: {
          event_type: string
          evidence_urls: string[]
          from_status: string | null
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          punch_id: string
          to_status: string | null
        }
        Insert: {
          event_type: string
          evidence_urls?: string[]
          from_status?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          punch_id: string
          to_status?: string | null
        }
        Update: {
          event_type?: string
          evidence_urls?: string[]
          from_status?: string | null
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          punch_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_post_handover_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_post_handover_events_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "punch_post_handover_events_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
        ]
      }
      punches: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["punch_category"]
          closed_date: string | null
          created_at: string
          created_via: string | null
          description: string
          discipline_id: string
          id: string
          itr_id: string | null
          ops_notes: string | null
          ops_target_date: string | null
          post_handover_status: string | null
          preservation_record_id: string | null
          priority: Database["public"]["Enums"]["punch_priority"]
          project_id: string
          punch_number: string
          raised_by: string
          status: Database["public"]["Enums"]["punch_status"]
          subsystem_id: string
          tag_id: string | null
          target_date: string | null
          transferred_at: string | null
          transferred_to_user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: Database["public"]["Enums"]["punch_category"]
          closed_date?: string | null
          created_at?: string
          created_via?: string | null
          description: string
          discipline_id: string
          id?: string
          itr_id?: string | null
          ops_notes?: string | null
          ops_target_date?: string | null
          post_handover_status?: string | null
          preservation_record_id?: string | null
          priority?: Database["public"]["Enums"]["punch_priority"]
          project_id: string
          punch_number: string
          raised_by: string
          status?: Database["public"]["Enums"]["punch_status"]
          subsystem_id: string
          tag_id?: string | null
          target_date?: string | null
          transferred_at?: string | null
          transferred_to_user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["punch_category"]
          closed_date?: string | null
          created_at?: string
          created_via?: string | null
          description?: string
          discipline_id?: string
          id?: string
          itr_id?: string | null
          ops_notes?: string | null
          ops_target_date?: string | null
          post_handover_status?: string | null
          preservation_record_id?: string | null
          priority?: Database["public"]["Enums"]["punch_priority"]
          project_id?: string
          punch_number?: string
          raised_by?: string
          status?: Database["public"]["Enums"]["punch_status"]
          subsystem_id?: string
          tag_id?: string | null
          target_date?: string | null
          transferred_at?: string | null
          transferred_to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punches_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "punches_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_preservation_record_id_fkey"
            columns: ["preservation_record_id"]
            isOneToOne: false
            referencedRelation: "preservation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "punches_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_transferred_to_user_id_fkey"
            columns: ["transferred_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          device_info: Json
          enabled: boolean
          endpoint: string
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          org_id: string
          p256dh: string
          topics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          device_info?: Json
          enabled?: boolean
          endpoint: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          org_id: string
          p256dh: string
          topics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          device_info?: Json
          enabled?: boolean
          endpoint?: string
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          org_id?: string
          p256dh?: string
          topics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_sample_batches: {
        Row: {
          accepted_count: number
          api_key_id: string | null
          id: string
          idempotency_key: string | null
          org_id: string
          received_at: string
          rejected_count: number
          sample_count: number
          source: string | null
          source_system: string | null
        }
        Insert: {
          accepted_count?: number
          api_key_id?: string | null
          id?: string
          idempotency_key?: string | null
          org_id: string
          received_at?: string
          rejected_count?: number
          sample_count?: number
          source?: string | null
          source_system?: string | null
        }
        Update: {
          accepted_count?: number
          api_key_id?: string | null
          id?: string
          idempotency_key?: string | null
          org_id?: string
          received_at?: string
          rejected_count?: number
          sample_count?: number
          source?: string | null
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_sample_batches_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_sample_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_samples: {
        Row: {
          ingested_at: string
          quality: number
          sampled_at: string
          signal_id: string
          source_batch: string | null
          value: number | null
        }
        Insert: {
          ingested_at?: string
          quality?: number
          sampled_at: string
          signal_id: string
          source_batch?: string | null
          value?: number | null
        }
        Update: {
          ingested_at?: string
          quality?: number
          sampled_at?: string
          signal_id?: string
          source_batch?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_samples_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          active: boolean
          alarm_setpoints: string | null
          description: string | null
          destination: string | null
          eng_unit: string | null
          hi: number | null
          hi_hi: number | null
          id: string
          lo: number | null
          lo_lo: number | null
          loop_diagram: string | null
          loop_id: string | null
          notes: string | null
          opc_node_id: string | null
          origin: string | null
          pi_path: string | null
          pid_drawing: string | null
          range_max: number | null
          range_min: number | null
          service: string | null
          signal_tag: string
          signal_type: Database["public"]["Enums"]["signal_type"]
          source: string | null
          tag_id: string
          wiring_diagram: string | null
        }
        Insert: {
          active?: boolean
          alarm_setpoints?: string | null
          description?: string | null
          destination?: string | null
          eng_unit?: string | null
          hi?: number | null
          hi_hi?: number | null
          id?: string
          lo?: number | null
          lo_lo?: number | null
          loop_diagram?: string | null
          loop_id?: string | null
          notes?: string | null
          opc_node_id?: string | null
          origin?: string | null
          pi_path?: string | null
          pid_drawing?: string | null
          range_max?: number | null
          range_min?: number | null
          service?: string | null
          signal_tag: string
          signal_type: Database["public"]["Enums"]["signal_type"]
          source?: string | null
          tag_id: string
          wiring_diagram?: string | null
        }
        Update: {
          active?: boolean
          alarm_setpoints?: string | null
          description?: string | null
          destination?: string | null
          eng_unit?: string | null
          hi?: number | null
          hi_hi?: number | null
          id?: string
          lo?: number | null
          lo_lo?: number | null
          loop_diagram?: string | null
          loop_id?: string | null
          notes?: string | null
          opc_node_id?: string | null
          origin?: string | null
          pi_path?: string | null
          pid_drawing?: string | null
          range_max?: number | null
          range_min?: number | null
          service?: string | null
          signal_tag?: string
          signal_type?: Database["public"]["Enums"]["signal_type"]
          source?: string | null
          tag_id?: string
          wiring_diagram?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "signals_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      subsystems: {
        Row: {
          code: string
          completion_pct: number
          current_phase_id: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          system_id: string
        }
        Insert: {
          code: string
          completion_pct?: number
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          system_id: string
        }
        Update: {
          code?: string
          completion_pct?: number
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subsystems_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "subsystems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "subsystems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      sync_conflict_log: {
        Row: {
          detected_at: string
          entity_id: string
          entity_type: string
          id: string
          local_payload: Json
          local_ts: string
          notes: string | null
          org_id: string
          remote_payload: Json | null
          remote_ts: string | null
          resolution: string
          resolved_by: string | null
          user_id: string
          winner: string
        }
        Insert: {
          detected_at?: string
          entity_id: string
          entity_type: string
          id?: string
          local_payload: Json
          local_ts: string
          notes?: string | null
          org_id: string
          remote_payload?: Json | null
          remote_ts?: string | null
          resolution?: string
          resolved_by?: string | null
          user_id: string
          winner: string
        }
        Update: {
          detected_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          local_payload?: Json
          local_ts?: string
          notes?: string | null
          org_id?: string
          remote_payload?: Json | null
          remote_ts?: string | null
          resolution?: string
          resolved_by?: string | null
          user_id?: string
          winner?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflict_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflict_log_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflict_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      systems: {
        Row: {
          area_id: string
          code: string
          current_phase_id: string | null
          description: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          area_id: string
          code: string
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          area_id?: string
          code?: string
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "systems_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "systems_current_phase_id_fkey"
            columns: ["current_phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "systems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          datasheet_number: string | null
          description: string
          discipline_id: string
          eng_unit: string | null
          equipment_type_id: string | null
          fluid_type: string | null
          id: string
          io_address: string | null
          junction_box: string | null
          manufacturer: string | null
          model: string | null
          mounting_typical: string | null
          nfc_uid: string | null
          pid_drawing: string | null
          preservation_required: boolean
          project_id: string
          range_max: number | null
          range_min: number | null
          revision: string | null
          serial_number: string | null
          signal_type: string | null
          sil_level: string | null
          sp_h: number | null
          sp_hh: number | null
          sp_l: number | null
          sp_ll: number | null
          status: Database["public"]["Enums"]["tag_status"]
          subsystem_id: string
          tag_number: string
        }
        Insert: {
          created_at?: string
          datasheet_number?: string | null
          description: string
          discipline_id: string
          eng_unit?: string | null
          equipment_type_id?: string | null
          fluid_type?: string | null
          id?: string
          io_address?: string | null
          junction_box?: string | null
          manufacturer?: string | null
          model?: string | null
          mounting_typical?: string | null
          nfc_uid?: string | null
          pid_drawing?: string | null
          preservation_required?: boolean
          project_id: string
          range_max?: number | null
          range_min?: number | null
          revision?: string | null
          serial_number?: string | null
          signal_type?: string | null
          sil_level?: string | null
          sp_h?: number | null
          sp_hh?: number | null
          sp_l?: number | null
          sp_ll?: number | null
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id: string
          tag_number: string
        }
        Update: {
          created_at?: string
          datasheet_number?: string | null
          description?: string
          discipline_id?: string
          eng_unit?: string | null
          equipment_type_id?: string | null
          fluid_type?: string | null
          id?: string
          io_address?: string | null
          junction_box?: string | null
          manufacturer?: string | null
          model?: string | null
          mounting_typical?: string | null
          nfc_uid?: string | null
          pid_drawing?: string | null
          preservation_required?: boolean
          project_id?: string
          range_max?: number | null
          range_min?: number | null
          revision?: string | null
          serial_number?: string | null
          signal_type?: string | null
          sil_level?: string | null
          sp_h?: number | null
          sp_hh?: number | null
          sp_l?: number | null
          sp_ll?: number | null
          status?: Database["public"]["Enums"]["tag_status"]
          subsystem_id?: string
          tag_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "tags_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "tags_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "tags_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "tags_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          domain_event_id: string
          id: string
          last_response_body: string | null
          last_response_code: number | null
          next_retry_at: string
          status: string
          subscription_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          domain_event_id: string
          id?: string
          last_response_body?: string | null
          last_response_code?: number | null
          next_retry_at?: string
          status?: string
          subscription_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          domain_event_id?: string
          id?: string
          last_response_body?: string | null
          last_response_code?: number | null
          next_retry_at?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_domain_event_id_fkey"
            columns: ["domain_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          endpoint_url: string
          event_types: string[]
          failure_count: number
          id: string
          last_error_at: string | null
          last_success_at: string | null
          name: string
          org_id: string
          project_id: string | null
          secret: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint_url: string
          event_types?: string[]
          failure_count?: number
          id?: string
          last_error_at?: string | null
          last_success_at?: string | null
          name: string
          org_id: string
          project_id?: string | null
          secret: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          endpoint_url?: string
          event_types?: string[]
          failure_count?: number
          id?: string
          last_error_at?: string | null
          last_success_at?: string | null
          name?: string
          org_id?: string
          project_id?: string | null
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_subscriptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_plan_items: {
        Row: {
          actual_finish: string | null
          actual_start: string | null
          assigned_to: string
          duration_days: number | null
          id: string
          itr_id: string
          p6_activity_id: string | null
          p6_sync_at: string | null
          p6_wbs_code: string | null
          planned_finish: string | null
          planned_start: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["tag_status"]
          title: string | null
          work_plan_id: string
        }
        Insert: {
          actual_finish?: string | null
          actual_start?: string | null
          assigned_to: string
          duration_days?: number | null
          id?: string
          itr_id: string
          p6_activity_id?: string | null
          p6_sync_at?: string | null
          p6_wbs_code?: string | null
          planned_finish?: string | null
          planned_start?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["tag_status"]
          title?: string | null
          work_plan_id: string
        }
        Update: {
          actual_finish?: string | null
          actual_start?: string | null
          assigned_to?: string
          duration_days?: number | null
          id?: string
          itr_id?: string
          p6_activity_id?: string | null
          p6_sync_at?: string | null
          p6_wbs_code?: string | null
          planned_finish?: string | null
          planned_start?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["tag_status"]
          title?: string | null
          work_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_plan_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_plan_items_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_plan_items_work_plan_id_fkey"
            columns: ["work_plan_id"]
            isOneToOne: false
            referencedRelation: "work_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      work_plans: {
        Row: {
          discipline_id: string
          id: string
          leader_id: string
          notes: string | null
          plan_date: string
          project_id: string
          status: Database["public"]["Enums"]["work_plan_status"]
        }
        Insert: {
          discipline_id: string
          id?: string
          leader_id: string
          notes?: string | null
          plan_date: string
          project_id: string
          status?: Database["public"]["Enums"]["work_plan_status"]
        }
        Update: {
          discipline_id?: string
          id?: string
          leader_id?: string
          notes?: string | null
          plan_date?: string
          project_id?: string
          status?: Database["public"]["Enums"]["work_plan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "work_plans_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_plans_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "work_plans_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          action_result: Json | null
          error_message: string | null
          event_id: string
          executed_at: string
          id: string
          matched: boolean
          org_id: string
          rule_id: string
        }
        Insert: {
          action_result?: Json | null
          error_message?: string | null
          event_id: string
          executed_at?: string
          id?: string
          matched: boolean
          org_id: string
          rule_id: string
        }
        Update: {
          action_result?: Json | null
          error_message?: string | null
          event_id?: string
          executed_at?: string
          id?: string
          matched?: boolean
          org_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          action_payload: Json
          action_type: Database["public"]["Enums"]["workflow_action_type"]
          condition_jsonlogic: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          name: string
          org_id: string
          priority: number
          trigger_event: string
          updated_at: string
        }
        Insert: {
          action_payload?: Json
          action_type: Database["public"]["Enums"]["workflow_action_type"]
          condition_jsonlogic?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          org_id: string
          priority?: number
          trigger_event: string
          updated_at?: string
        }
        Update: {
          action_payload?: Json
          action_type?: Database["public"]["Enums"]["workflow_action_type"]
          condition_jsonlogic?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          org_id?: string
          priority?: number
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analytics_bottlenecks: {
        Row: {
          bottleneck_score: number | null
          itrs_approved: number | null
          itrs_remaining: number | null
          org_id: string | null
          project_id: string | null
          punch_a_open: number | null
          punch_b_open: number | null
          punch_c_open: number | null
          reasons: string[] | null
          recent_rejects: number | null
          subsystem_code: string | null
          subsystem_id: string | null
          subsystem_name: string | null
          system_id: string | null
          system_name: string | null
          total_itrs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_subsystem_progress: {
        Row: {
          completion_pct: number | null
          itrs_approved: number | null
          itrs_completed: number | null
          itrs_in_progress: number | null
          itrs_not_started: number | null
          itrs_rejected: number | null
          itrs_remaining: number | null
          org_id: string | null
          project_id: string | null
          punch_a_open: number | null
          punch_b_open: number | null
          punch_c_open: number | null
          punches_closed: number | null
          subsystem_code: string | null
          subsystem_id: string | null
          subsystem_name: string | null
          system_id: string | null
          system_name: string | null
          total_itrs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_subsystem_velocity: {
        Row: {
          approvals_30d: number | null
          approvals_90d: number | null
          org_id: string | null
          project_id: string | null
          subsystem_id: string | null
          velocity_per_day_30d: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsystems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_issues: {
        Row: {
          category: string | null
          description: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          fix_url: string | null
          org_id: string | null
          project_id: string | null
          severity: string | null
          suggested_fix: string | null
        }
        Relationships: []
      }
      ops_dashboard: {
        Row: {
          assigned_to_name: string | null
          closed_date: string | null
          description: string | null
          ops_notes: string | null
          ops_target_date: string | null
          post_handover_status: string | null
          priority: Database["public"]["Enums"]["punch_priority"] | null
          project_id: string | null
          punch_id: string | null
          punch_number: string | null
          subsystem_code: string | null
          subsystem_id: string | null
          system_code: string | null
          system_name: string | null
          tag_id: string | null
          tag_number: string | null
          target_date: string | null
          transferred_at: string | null
          transferred_to_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_velocity"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "subsystems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_subsystem_id_fkey"
            columns: ["subsystem_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["subsystem_id"]
          },
          {
            foreignKeyName: "punches_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "punches_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_transferred_to_user_id_fkey"
            columns: ["transferred_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_samples_1min: {
        Row: {
          avg_val: number | null
          bucket: string | null
          max_val: number | null
          min_val: number | null
          sample_count: number | null
          signal_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_samples_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_360: {
        Row: {
          area_code: string | null
          area_id: string | null
          area_name: string | null
          certs_issued: number | null
          certs_summary: string | null
          description: string | null
          discipline_code: string | null
          discipline_color: string | null
          discipline_id: string | null
          discipline_name: string | null
          first_pid_doc_id: string | null
          first_pid_drawing: string | null
          io_address: string | null
          itr_approved: number | null
          itr_open: number | null
          itr_pct: number | null
          itr_semaforo: string | null
          itr_total: number | null
          last_cert_date: string | null
          manufacturer: string | null
          model: string | null
          open_punches_a: number | null
          open_punches_b: number | null
          open_punches_c: number | null
          open_punches_total: number | null
          org_id: string | null
          pid_drawing: string | null
          pid_hotspot_count: number | null
          preservation_active_plans: number | null
          preservation_next_due: string | null
          preservation_required: boolean | null
          project_id: string | null
          semaforo_global: string | null
          serial_number: string | null
          signal_type: string | null
          sil_level: string | null
          subsystem_code: string | null
          subsystem_id: string | null
          subsystem_name: string | null
          system_code: string | null
          system_id: string | null
          system_name: string | null
          tag_id: string | null
          tag_number: string | null
          tag_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_itr_suggestion: {
        Args: { p_note?: string; p_suggestion_id: string }
        Returns: string
      }
      analytics_project_forecast: {
        Args: { p_project_id: string }
        Returns: {
          blockers: number
          confidence: string
          days_to_complete_p50: number
          eta_p50: string
          itrs_approved: number
          itrs_remaining: number
          project_id: string
          punch_a_open: number
          total_itrs: number
          velocity_per_day: number
        }[]
      }
      bump_push_subscription_failure: {
        Args: { p_sub_id: string }
        Returns: undefined
      }
      cleanup_signal_samples_retention: { Args: never; Returns: number }
      compute_project_readiness: {
        Args: { p_project_id: string }
        Returns: {
          area_code: string
          area_name: string
          blockers: Json
          itr_approved: number
          itr_pct: number
          itr_total: number
          open_punches_a: number
          open_punches_b: number
          open_punches_c: number
          ready_mc: boolean
          ready_rfc: boolean
          ready_rfsu: boolean
          system_code: string
          system_id: string
          system_name: string
        }[]
      }
      compute_system_readiness: {
        Args: { p_system_id: string }
        Returns: {
          blockers: Json
          itr_approved: number
          itr_pct: number
          itr_total: number
          open_punches_a: number
          open_punches_b: number
          open_punches_c: number
          ready_mc: boolean
          ready_rfc: boolean
          ready_rfsu: boolean
          system_id: string
        }[]
      }
      create_api_key: {
        Args: {
          p_expires_at?: string
          p_name: string
          p_org_id: string
          p_scopes: string[]
        }
        Returns: {
          id: string
          key_prefix: string
          token: string
        }[]
      }
      create_webhook_subscription: {
        Args: {
          p_endpoint_url: string
          p_event_types?: string[]
          p_name: string
          p_org_id: string
          p_project_id: string
        }
        Returns: {
          id: string
          secret: string
        }[]
      }
      data_quality_list: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_project_id?: string
          p_severity?: string
        }
        Returns: {
          category: string
          description: string
          entity_id: string
          entity_label: string
          entity_type: string
          fix_url: string
          project_id: string
          severity: string
          suggested_fix: string
        }[]
      }
      data_quality_summary: {
        Args: { p_org_id: string }
        Returns: {
          category: string
          count: number
          severity: string
        }[]
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_webhook_subscription: {
        Args: { p_sub_id: string }
        Returns: undefined
      }
      evaluate_signal_rules_for_batch: {
        Args: { p_batch_id: string }
        Returns: number
      }
      generate_handover_package: {
        Args: { p_project_id: string; p_system_ids?: string[] }
        Returns: Json
      }
      generate_punch_number: { Args: { p_project_id: string }; Returns: string }
      get_my_org_ids: { Args: never; Returns: string[] }
      get_org_member_emails: {
        Args: { p_org_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      increment_webhook_failure_count: {
        Args: { sub_id: string }
        Returns: undefined
      }
      ingest_signal_samples: {
        Args: {
          p_api_key_id: string
          p_idempotency_key: string
          p_org_id: string
          p_samples: Json
          p_source: string
          p_source_system: string
        }
        Returns: Json
      }
      is_catalog_org: { Args: { target_org_id: string }; Returns: boolean }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_editor: { Args: { p_org_id: string }; Returns: boolean }
      is_project_editor: { Args: { p_project_id: string }; Returns: boolean }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      log_sync_conflict: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_local_payload: Json
          p_local_ts: string
          p_notes?: string
          p_remote_payload: Json
          p_remote_ts: string
          p_winner: string
        }
        Returns: string
      }
      next_punch_number_atomic: {
        Args: { p_project_id: string }
        Returns: string
      }
      reject_itr_suggestion: {
        Args: { p_note?: string; p_suggestion_id: string }
        Returns: string
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: undefined }
      set_webhook_enabled: {
        Args: { p_enabled: boolean; p_sub_id: string }
        Returns: undefined
      }
      transfer_punch_to_ops: {
        Args: {
          p_notes?: string
          p_ops_target_date?: string
          p_punch_id: string
          p_transferred_to: string
        }
        Returns: string
      }
      update_punch_ops_status: {
        Args: {
          p_new_status: string
          p_notes?: string
          p_punch_id: string
          p_target_date?: string
        }
        Returns: string
      }
      update_push_subscription_topics: {
        Args: { p_endpoint: string; p_topics: string[] }
        Returns: undefined
      }
      upsert_push_subscription: {
        Args: {
          p_auth_secret: string
          p_device_info?: Json
          p_endpoint: string
          p_p256dh: string
          p_topics: string[]
        }
        Returns: string
      }
      user_in_project_org: { Args: { p_project_id: string }; Returns: boolean }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      cert_signature_role: "completion" | "client" | "authority"
      certificate_status: "pending" | "in_review" | "issued" | "rejected"
      itr_item_type:
        | "checkbox"
        | "text"
        | "number"
        | "measurement"
        | "select"
        | "photo"
        | "signature"
        | "date"
        | "yes_no"
      itr_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "approved"
        | "rejected"
      org_member_role:
        | "owner"
        | "admin"
        | "architect"
        | "leader"
        | "inspector"
        | "client"
      preservation_frequency:
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
      preservation_plan_status: "active" | "suspended" | "completed"
      preservation_result: "ok" | "nok" | "na"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      punch_category: "A" | "B" | "C"
      punch_priority: "critical" | "major" | "minor"
      punch_status: "open" | "in_progress" | "closed" | "cancelled"
      signal_type: "AI" | "AO" | "DI" | "DO" | "PI" | "PO"
      signature_role: "executor" | "supervisor" | "client"
      tag_status: "not_started" | "in_progress" | "completed" | "on_hold"
      work_plan_status: "draft" | "published" | "in_progress" | "completed"
      workflow_action_type:
        | "block_certificate"
        | "notify_user"
        | "create_punch"
        | "change_system_state"
        | "webhook_call"
        | "suggest_close_itr"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["info", "warning", "critical"],
      cert_signature_role: ["completion", "client", "authority"],
      certificate_status: ["pending", "in_review", "issued", "rejected"],
      itr_item_type: [
        "checkbox",
        "text",
        "number",
        "measurement",
        "select",
        "photo",
        "signature",
        "date",
        "yes_no",
      ],
      itr_status: [
        "not_started",
        "in_progress",
        "completed",
        "approved",
        "rejected",
      ],
      org_member_role: [
        "owner",
        "admin",
        "architect",
        "leader",
        "inspector",
        "client",
      ],
      preservation_frequency: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
      ],
      preservation_plan_status: ["active", "suspended", "completed"],
      preservation_result: ["ok", "nok", "na"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      punch_category: ["A", "B", "C"],
      punch_priority: ["critical", "major", "minor"],
      punch_status: ["open", "in_progress", "closed", "cancelled"],
      signal_type: ["AI", "AO", "DI", "DO", "PI", "PO"],
      signature_role: ["executor", "supervisor", "client"],
      tag_status: ["not_started", "in_progress", "completed", "on_hold"],
      work_plan_status: ["draft", "published", "in_progress", "completed"],
      workflow_action_type: [
        "block_certificate",
        "notify_user",
        "create_punch",
        "change_system_state",
        "webhook_call",
        "suggest_close_itr",
      ],
    },
  },
} as const
