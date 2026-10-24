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
      actions: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closure_note: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          number: string
          org_id: string
          original_due_date: string | null
          owner_id: string | null
          priority: string
          project_id: string
          seq: number
          source_id: string | null
          source_kind: string
          source_ref: string | null
          status: string
          system_id: string | null
          title: string
          updated_at: string
          verification_method: string
          verified_at: string | null
          verified_by: string | null
          verify_comment: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closure_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          number: string
          org_id: string
          original_due_date?: string | null
          owner_id?: string | null
          priority?: string
          project_id: string
          seq: number
          source_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?: string
          system_id?: string | null
          title: string
          updated_at?: string
          verification_method?: string
          verified_at?: string | null
          verified_by?: string | null
          verify_comment?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closure_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          number?: string
          org_id?: string
          original_due_date?: string | null
          owner_id?: string | null
          priority?: string
          project_id?: string
          seq?: number
          source_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?: string
          system_id?: string | null
          title?: string
          updated_at?: string
          verification_method?: string
          verified_at?: string | null
          verified_by?: string | null
          verify_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "actions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "actions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
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
      ai_usage: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          cost_usd: number
          created_at: string
          feature: string
          id: string
          input_tokens: number
          model: string
          ok: boolean
          org_id: string
          output_tokens: number
          project_id: string | null
          stop_reason: string | null
          user_id: string | null
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          model: string
          ok?: boolean
          org_id: string
          output_tokens?: number
          project_id?: string | null
          stop_reason?: string | null
          user_id?: string | null
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          ok?: boolean
          org_id?: string
          output_tokens?: number
          project_id?: string | null
          stop_reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      ce_causes: {
        Row: {
          code: string
          condition: string | null
          description: string
          id: string
          matrix_id: string
          notes: string | null
          project_id: string
          seq: number
          setpoint: string | null
          signal_id: string | null
          tag_id: string | null
          voting: string | null
        }
        Insert: {
          code: string
          condition?: string | null
          description: string
          id?: string
          matrix_id: string
          notes?: string | null
          project_id: string
          seq?: number
          setpoint?: string | null
          signal_id?: string | null
          tag_id?: string | null
          voting?: string | null
        }
        Update: {
          code?: string
          condition?: string | null
          description?: string
          id?: string
          matrix_id?: string
          notes?: string | null
          project_id?: string
          seq?: number
          setpoint?: string | null
          signal_id?: string | null
          tag_id?: string | null
          voting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_causes_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "ce_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_causes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_causes_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_causes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "ce_causes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_causes_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_effects: {
        Row: {
          action: string
          code: string
          description: string
          id: string
          matrix_id: string
          notes: string | null
          project_id: string
          seq: number
          tag_id: string | null
        }
        Insert: {
          action?: string
          code: string
          description: string
          id?: string
          matrix_id: string
          notes?: string | null
          project_id: string
          seq?: number
          tag_id?: string | null
        }
        Update: {
          action?: string
          code?: string
          description?: string
          id?: string
          matrix_id?: string
          notes?: string | null
          project_id?: string
          seq?: number
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ce_effects_matrix_id_fkey"
            columns: ["matrix_id"]
            isOneToOne: false
            referencedRelation: "ce_matrices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_effects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_effects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "ce_effects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_effects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_links: {
        Row: {
          cause_id: string
          delay_s: number | null
          effect_id: string
          link_type: string
          note: string | null
          project_id: string
        }
        Insert: {
          cause_id: string
          delay_s?: number | null
          effect_id: string
          link_type?: string
          note?: string | null
          project_id: string
        }
        Update: {
          cause_id?: string
          delay_s?: number | null
          effect_id?: string
          link_type?: string
          note?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_links_cause_id_fkey"
            columns: ["cause_id"]
            isOneToOne: false
            referencedRelation: "ce_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_links_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "ce_effects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_matrices: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          project_id: string
          revision: string | null
          source: string
          source_document: string | null
          system_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          revision?: string | null
          source?: string
          source_document?: string | null
          system_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          revision?: string | null
          source?: string
          source_document?: string | null
          system_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_matrices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_matrices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_matrices_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "ce_matrices_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "ce_matrices_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_matrices_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
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
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
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
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          notes: string | null
          org_id: string
          short_name: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          notes?: string | null
          org_id: string
          short_name?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          notes?: string | null
          org_id?: string
          short_name?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competency_records: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          created_at: string
          evidence: string | null
          evidence_kind: string
          expires_at: string | null
          id: string
          level: number
          org_id: string
          person_id: string
          project_id: string
          system_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          evidence?: string | null
          evidence_kind?: string
          expires_at?: string | null
          id?: string
          level: number
          org_id: string
          person_id: string
          project_id: string
          system_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          evidence?: string | null
          evidence_kind?: string
          expires_at?: string | null
          id?: string
          level?: number
          org_id?: string
          person_id?: string
          project_id?: string
          system_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competency_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "ops_personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "competency_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "competency_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competency_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      critical_spares: {
        Row: {
          eta: string | null
          id: string
          is_critical: boolean
          item: string
          kind: string
          notes: string | null
          org_id: string
          part_number: string | null
          project_id: string
          qty_available: number
          qty_required: number
          status: string
          system_id: string
          tag_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          eta?: string | null
          id?: string
          is_critical?: boolean
          item: string
          kind?: string
          notes?: string | null
          org_id: string
          part_number?: string | null
          project_id: string
          qty_available?: number
          qty_required?: number
          status?: string
          system_id: string
          tag_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          eta?: string | null
          id?: string
          is_critical?: boolean
          item?: string
          kind?: string
          notes?: string | null
          org_id?: string
          part_number?: string | null
          project_id?: string
          qty_available?: number
          qty_required?: number
          status?: string
          system_id?: string
          tag_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "critical_spares_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_spares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_spares_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "critical_spares_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "critical_spares_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_spares_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "critical_spares_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "critical_spares_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_spares_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          ai_draft: Json | null
          ai_generated_at: string | null
          ai_model: string | null
          area_id: string | null
          constraints_text: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          data: Json
          data_at: string
          id: string
          issued_at: string | null
          issued_by: string | null
          issues: string | null
          key_events: string | null
          next_day_plan: string | null
          number: string
          org_id: string
          project_id: string
          report_date: string
          revision: number
          revision_reason: string | null
          status: string
          summary: string | null
          supersedes_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_draft?: Json | null
          ai_generated_at?: string | null
          ai_model?: string | null
          area_id?: string | null
          constraints_text?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          data_at?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          issues?: string | null
          key_events?: string | null
          next_day_plan?: string | null
          number: string
          org_id: string
          project_id: string
          report_date: string
          revision?: number
          revision_reason?: string | null
          status?: string
          summary?: string | null
          supersedes_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_draft?: Json | null
          ai_generated_at?: string | null
          ai_model?: string | null
          area_id?: string | null
          constraints_text?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          data_at?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          issues?: string | null
          key_events?: string | null
          next_day_plan?: string | null
          number?: string
          org_id?: string
          project_id?: string
          report_date?: string
          revision?: number
          revision_reason?: string | null
          status?: string
          summary?: string | null
          supersedes_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "daily_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          attendees: string | null
          context: string | null
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          number: string
          org_id: string
          project_id: string
          rationale: string | null
          recorded_by: string | null
          seq: number
          source_id: string | null
          source_kind: string
          source_ref: string | null
          status: string
          supersede_reason: string | null
          superseded_at: string | null
          superseded_by: string | null
          system_id: string | null
          title: string
        }
        Insert: {
          attendees?: string | null
          context?: string | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          number: string
          org_id: string
          project_id: string
          rationale?: string | null
          recorded_by?: string | null
          seq: number
          source_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?: string
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          system_id?: string | null
          title: string
        }
        Update: {
          attendees?: string | null
          context?: string | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          number?: string
          org_id?: string
          project_id?: string
          rationale?: string | null
          recorded_by?: string | null
          seq?: number
          source_id?: string | null
          source_kind?: string
          source_ref?: string | null
          status?: string
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          system_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "decisions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "decisions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_system_id_fkey"
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
      document_references: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          itr_id: string | null
          procedure_revision_id: string | null
          project_id: string
          revalidated_at: string | null
          revalidated_by: string | null
          revalidated_from: string | null
          revalidation_reason: string | null
          revision_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          itr_id?: string | null
          procedure_revision_id?: string | null
          project_id: string
          revalidated_at?: string | null
          revalidated_by?: string | null
          revalidated_from?: string | null
          revalidation_reason?: string | null
          revision_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          itr_id?: string | null
          procedure_revision_id?: string | null
          project_id?: string
          revalidated_at?: string | null
          revalidated_by?: string | null
          revalidated_from?: string | null
          revalidation_reason?: string | null
          revision_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_references_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_procedure_revision_id_fkey"
            columns: ["procedure_revision_id"]
            isOneToOne: false
            referencedRelation: "procedure_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_revalidated_from_fkey"
            columns: ["revalidated_from"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_references_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          external_url: string | null
          file_name: string | null
          file_path: string | null
          id: string
          issued_on: string | null
          notes: string | null
          project_id: string
          rev: string
          seq: number
          status: string
          void_from_status: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          project_id: string
          rev: string
          seq: number
          status: string
          void_from_status?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          project_id?: string
          rev?: string
          seq?: number
          status?: string
          void_from_status?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_systems: {
        Row: {
          document_id: string
          project_id: string
          system_id: string
        }
        Insert: {
          document_id: string
          project_id: string
          system_id: string
        }
        Update: {
          document_id?: string
          project_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_systems_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_systems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "document_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "document_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          discipline_id: string | null
          doc_type: string
          id: string
          number: string
          org_id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          discipline_id?: string | null
          doc_type?: string
          id?: string
          number: string
          org_id: string
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          discipline_id?: string | null
          doc_type?: string
          id?: string
          number?: string
          org_id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_current_revision_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_id: string | null
          aggregate_id: string
          aggregate_type: string
          dispatched_at: string | null
          event_type: string
          id: string
          occurred_at: string
          org_id: string
          payload: Json
          project_id: string
          schema_version: number
        }
        Insert: {
          actor_id?: string | null
          aggregate_id: string
          aggregate_type: string
          dispatched_at?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          org_id: string
          payload: Json
          project_id: string
          schema_version?: number
        }
        Update: {
          actor_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          dispatched_at?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          org_id?: string
          payload?: Json
          project_id?: string
          schema_version?: number
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
          critical_valve: boolean
          id: string
          lineup_candidate: boolean
          name: string
          org_id: string
        }
        Insert: {
          category?: string | null
          code: string
          critical_valve?: boolean
          id?: string
          lineup_candidate?: boolean
          name: string
          org_id: string
        }
        Update: {
          category?: string | null
          code?: string
          critical_valve?: boolean
          id?: string
          lineup_candidate?: boolean
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
      gate_criteria: {
        Row: {
          created_at: string
          deleted_at: string | null
          gate_id: string
          id: string
          is_blocking: boolean
          kind: string
          order_index: number
          org_id: string
          params: Json
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          gate_id: string
          id?: string
          is_blocking?: boolean
          kind: string
          order_index?: number
          org_id: string
          params?: Json
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          gate_id?: string
          id?: string
          is_blocking?: boolean
          kind?: string
          order_index?: number
          org_id?: string
          params?: Json
        }
        Relationships: [
          {
            foreignKeyName: "gate_criteria_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_criteria_org_id_fkey"
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
          key_id: string | null
          manifest: Json | null
          metadata: Json
          omitted_count: number
          org_id: string
          pdf_path: string | null
          project_id: string
          signature: string | null
          signature_alg: string | null
          signature_hash: string | null
          status: string
          version: string
          zip_path: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          json_path?: string | null
          key_id?: string | null
          manifest?: Json | null
          metadata?: Json
          omitted_count?: number
          org_id: string
          pdf_path?: string | null
          project_id: string
          signature?: string | null
          signature_alg?: string | null
          signature_hash?: string | null
          status?: string
          version?: string
          zip_path?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          json_path?: string | null
          key_id?: string | null
          manifest?: Json | null
          metadata?: Json
          omitted_count?: number
          org_id?: string
          pdf_path?: string | null
          project_id?: string
          signature?: string | null
          signature_alg?: string | null
          signature_hash?: string | null
          status?: string
          version?: string
          zip_path?: string | null
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
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
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
          capture_clamped: boolean
          capture_id: string | null
          captured_at: string
          file_type: string
          file_url: string
          id: string
          item_id: string | null
          itr_id: string
          latitude: number | null
          longitude: number | null
          response_id: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          capture_clamped?: boolean
          capture_id?: string | null
          captured_at?: string
          file_type: string
          file_url: string
          id?: string
          item_id?: string | null
          itr_id: string
          latitude?: number | null
          longitude?: number | null
          response_id?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          capture_clamped?: boolean
          capture_id?: string | null
          captured_at?: string
          file_type?: string
          file_url?: string
          id?: string
          item_id?: string | null
          itr_id?: string
          latitude?: number | null
          longitude?: number | null
          response_id?: string | null
          uploaded_at?: string
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
            referencedRelation: "itr_list_v"
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
      itr_number_counters: {
        Row: {
          base: string
          last_seq: number
          project_id: string
        }
        Insert: {
          base: string
          last_seq: number
          project_id: string
        }
        Update: {
          base?: string
          last_seq?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_number_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_responses: {
        Row: {
          capture_clamped: boolean
          captured_at: string | null
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
          capture_clamped?: boolean
          captured_at?: string | null
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
          capture_clamped?: boolean
          captured_at?: string | null
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
            referencedRelation: "itr_list_v"
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
          signer_company: string | null
          user_id: string
        }
        Insert: {
          id?: string
          itr_id: string
          role: Database["public"]["Enums"]["signature_role"]
          signature_image?: string | null
          signature_url?: string | null
          signed_at?: string
          signer_company?: string | null
          user_id: string
        }
        Update: {
          id?: string
          itr_id?: string
          role?: Database["public"]["Enums"]["signature_role"]
          signature_image?: string | null
          signature_url?: string | null
          signed_at?: string
          signer_company?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_signatures_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
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
          description_es_source: string | null
          id: string
          is_critical: boolean
          is_required: boolean
          item_number: string | null
          item_type: Database["public"]["Enums"]["itr_item_type"]
          option_outcomes: Json
          options: Json | null
          order_index: number
          requires_document: boolean
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
          description_es_source?: string | null
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"]
          option_outcomes?: Json
          options?: Json | null
          order_index: number
          requires_document?: boolean
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
          description_es_source?: string | null
          id?: string
          is_critical?: boolean
          is_required?: boolean
          item_number?: string | null
          item_type?: Database["public"]["Enums"]["itr_item_type"]
          option_outcomes?: Json
          options?: Json | null
          order_index?: number
          requires_document?: boolean
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
          imported_at: string | null
          is_active: boolean
          is_global: boolean
          org_id: string
          phase_id: string
          required_signatures: string[]
          requires_test_equipment: boolean
          source_org_id: string | null
          source_template_id: string | null
          source_version: number | null
          title: string
          title_es: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discipline_id: string
          equipment_type_id?: string | null
          id?: string
          imported_at?: string | null
          is_active?: boolean
          is_global?: boolean
          org_id: string
          phase_id: string
          required_signatures?: string[]
          requires_test_equipment?: boolean
          source_org_id?: string | null
          source_template_id?: string | null
          source_version?: number | null
          title: string
          title_es?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discipline_id?: string
          equipment_type_id?: string | null
          id?: string
          imported_at?: string | null
          is_active?: boolean
          is_global?: boolean
          org_id?: string
          phase_id?: string
          required_signatures?: string[]
          requires_test_equipment?: boolean
          source_org_id?: string | null
          source_template_id?: string | null
          source_version?: number | null
          title?: string
          title_es?: string | null
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
          {
            foreignKeyName: "itr_templates_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "itr_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      itr_test_equipment: {
        Row: {
          added_at: string
          added_by: string | null
          calibrated_on: string
          calibration_due: string
          certificate_number: string
          equipment_id: string
          itr_id: string
          project_id: string
          snapshot: Json
          used_on: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          calibrated_on: string
          calibration_due: string
          certificate_number: string
          equipment_id: string
          itr_id: string
          project_id: string
          snapshot?: Json
          used_on?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          calibrated_on?: string
          calibration_due?: string
          certificate_number?: string
          equipment_id?: string
          itr_id?: string
          project_id?: string
          snapshot?: Json
          used_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "itr_test_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "test_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_test_equipment_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_test_equipment_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itr_test_equipment_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      itrs: {
        Row: {
          ce_cause_id: string | null
          completed_date: string | null
          created_at: string
          id: string
          itr_number: string
          loop_id: string | null
          phase_id: string
          progress_pct: number
          project_id: string
          required_signatures: string[]
          requires_test_equipment: boolean
          scheduled_date: string | null
          source_rows: Json | null
          status: Database["public"]["Enums"]["itr_status"]
          subsystem_id: string
          tag_id: string | null
          template_id: string
        }
        Insert: {
          ce_cause_id?: string | null
          completed_date?: string | null
          created_at?: string
          id?: string
          itr_number: string
          loop_id?: string | null
          phase_id: string
          progress_pct?: number
          project_id: string
          required_signatures?: string[]
          requires_test_equipment?: boolean
          scheduled_date?: string | null
          source_rows?: Json | null
          status?: Database["public"]["Enums"]["itr_status"]
          subsystem_id: string
          tag_id?: string | null
          template_id: string
        }
        Update: {
          ce_cause_id?: string | null
          completed_date?: string | null
          created_at?: string
          id?: string
          itr_number?: string
          loop_id?: string | null
          phase_id?: string
          progress_pct?: number
          project_id?: string
          required_signatures?: string[]
          requires_test_equipment?: boolean
          scheduled_date?: string | null
          source_rows?: Json | null
          status?: Database["public"]["Enums"]["itr_status"]
          subsystem_id?: string
          tag_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itrs_ce_cause_id_fkey"
            columns: ["ce_cause_id"]
            isOneToOne: false
            referencedRelation: "ce_causes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itrs_loop_id_fkey"
            columns: ["loop_id"]
            isOneToOne: false
            referencedRelation: "loops"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
          suspect: boolean
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
          suspect?: boolean
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
          suspect?: boolean
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
      lineup_items: {
        Row: {
          as_found_position: string | null
          found_position: string | null
          id: string
          is_critical: boolean
          label: string | null
          lock_number: string | null
          ord: number
          project_id: string
          remarks: string | null
          required_note: string | null
          required_position: string | null
          seal_number: string | null
          set_at: string | null
          set_by: string | null
          sheet_id: string
          synced_at: string | null
          tag_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          as_found_position?: string | null
          found_position?: string | null
          id?: string
          is_critical?: boolean
          label?: string | null
          lock_number?: string | null
          ord: number
          project_id: string
          remarks?: string | null
          required_note?: string | null
          required_position?: string | null
          seal_number?: string | null
          set_at?: string | null
          set_by?: string | null
          sheet_id: string
          synced_at?: string | null
          tag_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          as_found_position?: string | null
          found_position?: string | null
          id?: string
          is_critical?: boolean
          label?: string | null
          lock_number?: string | null
          ord?: number
          project_id?: string
          remarks?: string | null
          required_note?: string | null
          required_position?: string | null
          seal_number?: string | null
          set_at?: string | null
          set_by?: string | null
          sheet_id?: string
          synced_at?: string | null
          tag_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_items_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "lineup_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_items_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "lineup_items_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_items_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_sheets: {
        Row: {
          content_hash: string | null
          created_at: string
          created_by: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          number: string
          org_id: string
          procedure_id: string | null
          project_id: string
          purpose: string
          seq: number
          status: string
          superseded_at: string | null
          system_id: string
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          number: string
          org_id: string
          procedure_id?: string | null
          project_id: string
          purpose?: string
          seq: number
          status?: string
          superseded_at?: string | null
          system_id: string
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          number?: string
          org_id?: string
          procedure_id?: string | null
          project_id?: string
          purpose?: string
          seq?: number
          status?: string
          superseded_at?: string | null
          system_id?: string
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_sheets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_sheets_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_sheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_sheets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "lineup_sheets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "lineup_sheets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_sheets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      mgmt_attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_kind: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          org_id: string
          project_id: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_kind: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          org_id: string
          project_id: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_kind?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          org_id?: string
          project_id?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mgmt_attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mgmt_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mgmt_events: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          entity_id: string
          entity_kind: string
          from_value: string | null
          id: string
          org_id: string
          project_id: string
          to_value: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          entity_id: string
          entity_kind: string
          from_value?: string | null
          id?: string
          org_id: string
          project_id: string
          to_value?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          entity_id?: string
          entity_kind?: string
          from_value?: string | null
          id?: string
          org_id?: string
          project_id?: string
          to_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mgmt_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mgmt_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mgmt_kpi_snapshots: {
        Row: {
          created_at: string
          gates_approved: number
          gates_total: number
          id: string
          itr_total: number
          kpis: Json
          org_id: string
          project_id: string
          snapshot_date: string
          weighted_pct: number
        }
        Insert: {
          created_at?: string
          gates_approved?: number
          gates_total?: number
          id?: string
          itr_total?: number
          kpis?: Json
          org_id: string
          project_id: string
          snapshot_date: string
          weighted_pct?: number
        }
        Update: {
          created_at?: string
          gates_approved?: number
          gates_total?: number
          id?: string
          itr_total?: number
          kpis?: Json
          org_id?: string
          project_id?: string
          snapshot_date?: string
          weighted_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "mgmt_kpi_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mgmt_kpi_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_outbox: {
        Row: {
          notification_id: string
          queued_at: string
        }
        Insert: {
          notification_id: string
          queued_at?: string
        }
        Update: {
          notification_id?: string
          queued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
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
      ops_personnel: {
        Row: {
          active: boolean
          company: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          org_id: string
          position: string | null
          project_id: string
          shift: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          org_id: string
          position?: string | null
          project_id: string
          shift?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          org_id?: string
          position?: string | null
          project_id?: string
          shift?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_personnel_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_personnel_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_personnel_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_personnel_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          access_expires_at: string | null
          company_id: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          status: string
          suspend_reason: string | null
          suspended_at: string | null
          suspended_by: string | null
          user_id: string
        }
        Insert: {
          access_expires_at?: string | null
          company_id?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          user_id: string
        }
        Update: {
          access_expires_at?: string | null
          company_id?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      ownership_transfers: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checklist: Json
          commissioning_ack: string[] | null
          commissioning_company: string | null
          commissioning_signed_at: string | null
          commissioning_signed_by: string | null
          completed_at: string | null
          content_hash: string | null
          exceptions: Json
          from_stage: string
          handover_package_id: string | null
          id: string
          is_reversal: boolean
          number: string
          operations_ack: string[] | null
          operations_company: string | null
          operations_signed_at: string | null
          operations_signed_by: string | null
          org_id: string
          project_id: string
          reason: string | null
          requested_at: string
          requested_by: string | null
          seq: number
          status: string
          system_id: string
          to_stage: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checklist?: Json
          commissioning_ack?: string[] | null
          commissioning_company?: string | null
          commissioning_signed_at?: string | null
          commissioning_signed_by?: string | null
          completed_at?: string | null
          content_hash?: string | null
          exceptions?: Json
          from_stage: string
          handover_package_id?: string | null
          id?: string
          is_reversal?: boolean
          number: string
          operations_ack?: string[] | null
          operations_company?: string | null
          operations_signed_at?: string | null
          operations_signed_by?: string | null
          org_id: string
          project_id: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          seq: number
          status?: string
          system_id: string
          to_stage: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checklist?: Json
          commissioning_ack?: string[] | null
          commissioning_company?: string | null
          commissioning_signed_at?: string | null
          commissioning_signed_by?: string | null
          completed_at?: string | null
          content_hash?: string | null
          exceptions?: Json
          from_stage?: string
          handover_package_id?: string | null
          id?: string
          is_reversal?: boolean
          number?: string
          operations_ack?: string[] | null
          operations_company?: string | null
          operations_signed_at?: string | null
          operations_signed_by?: string | null
          org_id?: string
          project_id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          seq?: number
          status?: string
          system_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_transfers_handover_package_id_fkey"
            columns: ["handover_package_id"]
            isOneToOne: false
            referencedRelation: "handover_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "ownership_transfers_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "ownership_transfers_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_transfers_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      performance_certificates: {
        Row: {
          client_company: string | null
          client_signed_at: string | null
          client_signed_by: string | null
          commissioning_company: string | null
          commissioning_signed_at: string | null
          commissioning_signed_by: string | null
          content_hash: string | null
          created_at: string
          id: string
          number: string
          operations_company: string | null
          operations_signed_at: string | null
          operations_signed_by: string | null
          org_id: string
          project_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          run_id: string
          seq: number
          status: string
          superseded_at: string | null
          system_id: string
          test_id: string
        }
        Insert: {
          client_company?: string | null
          client_signed_at?: string | null
          client_signed_by?: string | null
          commissioning_company?: string | null
          commissioning_signed_at?: string | null
          commissioning_signed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          number: string
          operations_company?: string | null
          operations_signed_at?: string | null
          operations_signed_by?: string | null
          org_id: string
          project_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          run_id: string
          seq: number
          status?: string
          superseded_at?: string | null
          system_id: string
          test_id: string
        }
        Update: {
          client_company?: string | null
          client_signed_at?: string | null
          client_signed_by?: string | null
          commissioning_company?: string | null
          commissioning_signed_at?: string | null
          commissioning_signed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          number?: string
          operations_company?: string | null
          operations_signed_at?: string | null
          operations_signed_by?: string | null
          org_id?: string
          project_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          run_id?: string
          seq?: number
          status?: string
          superseded_at?: string | null
          system_id?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_certificates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_certificates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_certificates_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_certificates_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "performance_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_criteria: {
        Row: {
          band_hi: number | null
          band_lo: number | null
          id: string
          label: string | null
          operator: string
          ord: number
          project_id: string
          revision_id: string
          statistic: string
          target: number
          target_hi: number | null
          total_basis: string | null
          uncertainty: number
          uncertainty_mode: string
          variable_key: string
        }
        Insert: {
          band_hi?: number | null
          band_lo?: number | null
          id?: string
          label?: string | null
          operator: string
          ord: number
          project_id: string
          revision_id: string
          statistic: string
          target: number
          target_hi?: number | null
          total_basis?: string | null
          uncertainty?: number
          uncertainty_mode?: string
          variable_key: string
        }
        Update: {
          band_hi?: number | null
          band_lo?: number | null
          id?: string
          label?: string | null
          operator?: string
          ord?: number
          project_id?: string
          revision_id?: string
          statistic?: string
          target?: number
          target_hi?: number | null
          total_basis?: string | null
          uncertainty?: number
          uncertainty_mode?: string
          variable_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_criteria_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_criteria_revision_id_variable_key_fkey"
            columns: ["revision_id", "variable_key"]
            isOneToOne: false
            referencedRelation: "performance_variables"
            referencedColumns: ["revision_id", "key"]
          },
        ]
      }
      performance_disturbances: {
        Row: {
          client_ack_at: string | null
          client_ack_by: string | null
          description: string
          ended_at: string | null
          excluded: boolean
          excluded_at: string | null
          excluded_by: string | null
          exclusion_reason: string | null
          id: string
          kind: string
          project_id: string
          recorded_at: string
          recorded_by: string | null
          run_id: string
          started_at: string
        }
        Insert: {
          client_ack_at?: string | null
          client_ack_by?: string | null
          description: string
          ended_at?: string | null
          excluded?: boolean
          excluded_at?: string | null
          excluded_by?: string | null
          exclusion_reason?: string | null
          id?: string
          kind: string
          project_id: string
          recorded_at?: string
          recorded_by?: string | null
          run_id: string
          started_at: string
        }
        Update: {
          client_ack_at?: string | null
          client_ack_by?: string | null
          description?: string
          ended_at?: string | null
          excluded?: boolean
          excluded_at?: string | null
          excluded_by?: string | null
          exclusion_reason?: string | null
          id?: string
          kind?: string
          project_id?: string
          recorded_at?: string
          recorded_by?: string | null
          run_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_disturbances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_disturbances_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_meter_pairs: {
        Row: {
          id: string
          max_diff_pct: number
          ord: number
          project_id: string
          revision_id: string
          variable_a: string
          variable_b: string
        }
        Insert: {
          id?: string
          max_diff_pct: number
          ord: number
          project_id: string
          revision_id: string
          variable_a: string
          variable_b: string
        }
        Update: {
          id?: string
          max_diff_pct?: number
          ord?: number
          project_id?: string
          revision_id?: string
          variable_a?: string
          variable_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_meter_pairs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_meter_pairs_revision_id_variable_a_fkey"
            columns: ["revision_id", "variable_a"]
            isOneToOne: false
            referencedRelation: "performance_variables"
            referencedColumns: ["revision_id", "key"]
          },
          {
            foreignKeyName: "performance_meter_pairs_revision_id_variable_b_fkey"
            columns: ["revision_id", "variable_b"]
            isOneToOne: false
            referencedRelation: "performance_variables"
            referencedColumns: ["revision_id", "key"]
          },
        ]
      }
      performance_revision_systems: {
        Row: {
          project_id: string
          revision_id: string
          system_id: string
        }
        Insert: {
          project_id: string
          revision_id: string
          system_id: string
        }
        Update: {
          project_id?: string
          revision_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_revision_systems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_revision_systems_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "performance_test_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_revision_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_revision_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_revision_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_revision_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      performance_run_data: {
        Row: {
          avg_val: number | null
          bucket: string
          entered_at: string
          entered_by: string | null
          max_val: number | null
          min_val: number | null
          n_bad: number
          n_good: number
          project_id: string
          run_id: string
          source: string
          variable_id: string
        }
        Insert: {
          avg_val?: number | null
          bucket: string
          entered_at?: string
          entered_by?: string | null
          max_val?: number | null
          min_val?: number | null
          n_bad?: number
          n_good?: number
          project_id: string
          run_id: string
          source: string
          variable_id: string
        }
        Update: {
          avg_val?: number | null
          bucket?: string
          entered_at?: string
          entered_by?: string | null
          max_val?: number | null
          min_val?: number | null
          n_bad?: number
          n_good?: number
          project_id?: string
          run_id?: string
          source?: string
          variable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_run_data_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_run_data_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_run_data_variable_id_fkey"
            columns: ["variable_id"]
            isOneToOne: false
            referencedRelation: "performance_variables"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_runs: {
        Row: {
          abort_reason: string | null
          aborted_at: string | null
          aborted_by: string | null
          action_id: string | null
          attempt: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          early_close: boolean
          early_close_reason: string | null
          evaluation: Json | null
          evaluation_hash: string | null
          evaluation_preview: Json | null
          formal_start_note: string | null
          formal_started_at: string | null
          formal_started_by: string | null
          frozen_at: string | null
          frozen_rows: number | null
          id: string
          number: string
          org_id: string
          project_id: string
          result: string | null
          result_at: string | null
          result_by: string | null
          result_reason: string | null
          revision_id: string
          stabilization_started_at: string | null
          stabilization_started_by: string | null
          status: string
          suggested_result: string | null
          test_id: string
          updated_at: string
        }
        Insert: {
          abort_reason?: string | null
          aborted_at?: string | null
          aborted_by?: string | null
          action_id?: string | null
          attempt: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          early_close?: boolean
          early_close_reason?: string | null
          evaluation?: Json | null
          evaluation_hash?: string | null
          evaluation_preview?: Json | null
          formal_start_note?: string | null
          formal_started_at?: string | null
          formal_started_by?: string | null
          frozen_at?: string | null
          frozen_rows?: number | null
          id?: string
          number: string
          org_id: string
          project_id: string
          result?: string | null
          result_at?: string | null
          result_by?: string | null
          result_reason?: string | null
          revision_id: string
          stabilization_started_at?: string | null
          stabilization_started_by?: string | null
          status?: string
          suggested_result?: string | null
          test_id: string
          updated_at?: string
        }
        Update: {
          abort_reason?: string | null
          aborted_at?: string | null
          aborted_by?: string | null
          action_id?: string | null
          attempt?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          early_close?: boolean
          early_close_reason?: string | null
          evaluation?: Json | null
          evaluation_hash?: string | null
          evaluation_preview?: Json | null
          formal_start_note?: string | null
          formal_started_at?: string | null
          formal_started_by?: string | null
          frozen_at?: string | null
          frozen_rows?: number | null
          id?: string
          number?: string
          org_id?: string
          project_id?: string
          result?: string | null
          result_at?: string | null
          result_by?: string | null
          result_reason?: string | null
          revision_id?: string
          stabilization_started_at?: string | null
          stabilization_started_by?: string | null
          status?: string
          suggested_result?: string | null
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "performance_test_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_runs_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "performance_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_test_revisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          change_reason: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          editors: string[]
          exclude_out_of_range: boolean
          formal_min: number
          id: string
          max_bad_pct: number
          max_spikes: number | null
          min_coverage_pct: number
          org_id: string
          procedure_id: string | null
          project_id: string
          returned_reason: string | null
          rev: number
          sample_interval_s: number
          sections: Json
          stabilization_min: number
          status: string
          submitted_at: string | null
          submitted_by: string | null
          test_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          editors?: string[]
          exclude_out_of_range?: boolean
          formal_min?: number
          id?: string
          max_bad_pct?: number
          max_spikes?: number | null
          min_coverage_pct?: number
          org_id: string
          procedure_id?: string | null
          project_id: string
          returned_reason?: string | null
          rev: number
          sample_interval_s?: number
          sections?: Json
          stabilization_min?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          test_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          editors?: string[]
          exclude_out_of_range?: boolean
          formal_min?: number
          id?: string
          max_bad_pct?: number
          max_spikes?: number | null
          min_coverage_pct?: number
          org_id?: string
          procedure_id?: string | null
          project_id?: string
          returned_reason?: string | null
          rev?: number
          sample_interval_s?: number
          sections?: Json
          stabilization_min?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_test_revisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_test_revisions_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_test_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_test_revisions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "performance_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_tests: {
        Row: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          id: string
          number: string
          org_id: string
          primary_system_id: string
          project_id: string
          seq: number
          status: string
          title: string
          updated_at: string
          withdraw_reason: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          number: string
          org_id: string
          primary_system_id: string
          project_id: string
          seq: number
          status?: string
          title: string
          updated_at?: string
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          number?: string
          org_id?: string
          primary_system_id?: string
          project_id?: string
          seq?: number
          status?: string
          title?: string
          updated_at?: string
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_tests_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "performance_test_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_tests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_tests_primary_system_id_fkey"
            columns: ["primary_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_tests_primary_system_id_fkey"
            columns: ["primary_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_tests_primary_system_id_fkey"
            columns: ["primary_system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_tests_primary_system_id_fkey"
            columns: ["primary_system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "performance_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_variables: {
        Row: {
          id: string
          key: string
          label: string
          manual_every_min: number
          max_step: number | null
          op: string | null
          operand_a: string | null
          operand_b: string | null
          ord: number
          project_id: string
          revision_id: string
          signal_id: string | null
          source: string
          unit: string | null
        }
        Insert: {
          id?: string
          key: string
          label: string
          manual_every_min?: number
          max_step?: number | null
          op?: string | null
          operand_a?: string | null
          operand_b?: string | null
          ord: number
          project_id: string
          revision_id: string
          signal_id?: string | null
          source: string
          unit?: string | null
        }
        Update: {
          id?: string
          key?: string
          label?: string
          manual_every_min?: number
          max_step?: number | null
          op?: string | null
          operand_a?: string | null
          operand_b?: string | null
          ord?: number
          project_id?: string
          revision_id?: string
          signal_id?: string | null
          source?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_variables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_variables_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "performance_test_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_variables_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_hotspots: {
        Row: {
          created_at: string
          created_by: string
          id: string
          needs_review: boolean
          org_id: string
          page_num: number
          project_id: string
          revision_id: string
          tag_id: string
          x_pct: number
          y_pct: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          needs_review?: boolean
          org_id: string
          page_num?: number
          project_id: string
          revision_id: string
          tag_id: string
          x_pct: number
          y_pct: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          needs_review?: boolean
          org_id?: string
          page_num?: number
          project_id?: string
          revision_id?: string
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
            foreignKeyName: "pid_hotspots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_hotspots_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      pid_markups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          label: string | null
          layer: string
          needs_review: boolean
          org_id: string
          other_system_id: string | null
          page_height: number
          page_num: number
          page_rotation: number
          page_width: number
          points: Json
          project_id: string
          revision_id: string
          system_id: string | null
          target_document_id: string | null
          target_page: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          kind: string
          label?: string | null
          layer?: string
          needs_review?: boolean
          org_id: string
          other_system_id?: string | null
          page_height: number
          page_num?: number
          page_rotation?: number
          page_width: number
          points: Json
          project_id: string
          revision_id: string
          system_id?: string | null
          target_document_id?: string | null
          target_page?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          label?: string | null
          layer?: string
          needs_review?: boolean
          org_id?: string
          other_system_id?: string | null
          page_height?: number
          page_num?: number
          page_rotation?: number
          page_width?: number
          points?: Json
          project_id?: string
          revision_id?: string
          system_id?: string | null
          target_document_id?: string | null
          target_page?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_markups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_other_system_id_fkey"
            columns: ["other_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_other_system_id_fkey"
            columns: ["other_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_other_system_id_fkey"
            columns: ["other_system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_other_system_id_fkey"
            columns: ["other_system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_markups_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_markups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_redline_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          project_id: string
          redline_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          redline_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          redline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pid_redline_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redline_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redline_comments_redline_id_fkey"
            columns: ["redline_id"]
            isOneToOne: false
            referencedRelation: "pid_redlines"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_redline_photos: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          project_id: string
          redline_id: string
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          project_id: string
          redline_id: string
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          project_id?: string
          redline_id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_redline_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redline_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redline_photos_redline_id_fkey"
            columns: ["redline_id"]
            isOneToOne: false
            referencedRelation: "pid_redlines"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_redlines: {
        Row: {
          carried_from_revision_id: string | null
          created_at: string
          created_by: string
          description: string
          document_id: string
          id: string
          incorporated_at: string | null
          incorporated_by: string | null
          incorporated_revision_id: string | null
          marks: Json
          number: string
          org_id: string
          page_height: number
          page_num: number
          page_rotation: number
          page_width: number
          project_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision_id: string
          seq: number
          status: string
          system_id: string | null
          tag_id: string | null
          updated_at: string
        }
        Insert: {
          carried_from_revision_id?: string | null
          created_at?: string
          created_by: string
          description: string
          document_id: string
          id?: string
          incorporated_at?: string | null
          incorporated_by?: string | null
          incorporated_revision_id?: string | null
          marks: Json
          number: string
          org_id: string
          page_height: number
          page_num: number
          page_rotation: number
          page_width: number
          project_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_id: string
          seq: number
          status?: string
          system_id?: string | null
          tag_id?: string | null
          updated_at?: string
        }
        Update: {
          carried_from_revision_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          document_id?: string
          id?: string
          incorporated_at?: string | null
          incorporated_by?: string | null
          incorporated_revision_id?: string | null
          marks?: Json
          number?: string
          org_id?: string
          page_height?: number
          page_num?: number
          page_rotation?: number
          page_width?: number
          project_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_id?: string
          seq?: number
          status?: string
          system_id?: string | null
          tag_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pid_redlines_carried_from_revision_id_fkey"
            columns: ["carried_from_revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_incorporated_by_fkey"
            columns: ["incorporated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_incorporated_revision_id_fkey"
            columns: ["incorporated_revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "document_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_redlines_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_redlines_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "pid_redlines_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "pid_redlines_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pid_redlines_tag_id_fkey"
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      procedure_revisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          change_reason: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          editors: string[]
          field_verified_at: string | null
          field_verified_by: string | null
          id: string
          org_id: string
          procedure_id: string
          project_id: string
          returned_reason: string | null
          rev: number
          sections: Json
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          walkdown_note: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          editors?: string[]
          field_verified_at?: string | null
          field_verified_by?: string | null
          id?: string
          org_id: string
          procedure_id: string
          project_id: string
          returned_reason?: string | null
          rev: number
          sections?: Json
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          walkdown_note?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          editors?: string[]
          field_verified_at?: string | null
          field_verified_by?: string | null
          id?: string
          org_id?: string
          procedure_id?: string
          project_id?: string
          returned_reason?: string | null
          rev?: number
          sections?: Json
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          walkdown_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_revisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_revisions_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_run_events: {
        Row: {
          backfilled: boolean
          comment: string | null
          field_at: string | null
          id: string
          kind: string
          org_id: string
          project_id: string
          recorded_at: string
          run_id: string
          step_id: string | null
          user_id: string | null
        }
        Insert: {
          backfilled?: boolean
          comment?: string | null
          field_at?: string | null
          id?: string
          kind: string
          org_id: string
          project_id: string
          recorded_at?: string
          run_id: string
          step_id?: string | null
          user_id?: string | null
        }
        Update: {
          backfilled?: boolean
          comment?: string | null
          field_at?: string | null
          id?: string
          kind?: string
          org_id?: string
          project_id?: string
          recorded_at?: string
          run_id?: string
          step_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_run_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_run_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "procedure_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_run_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "procedure_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_run_steps: {
        Row: {
          actual_value: string | null
          comment: string | null
          done_at: string | null
          done_by: string | null
          ord: number
          out_of_range: boolean
          project_id: string
          release_comment: string | null
          release_role: string | null
          released_at: string | null
          released_by: string | null
          run_id: string
          status: string
          step_id: string
          synced_at: string | null
        }
        Insert: {
          actual_value?: string | null
          comment?: string | null
          done_at?: string | null
          done_by?: string | null
          ord: number
          out_of_range?: boolean
          project_id: string
          release_comment?: string | null
          release_role?: string | null
          released_at?: string | null
          released_by?: string | null
          run_id: string
          status?: string
          step_id: string
          synced_at?: string | null
        }
        Update: {
          actual_value?: string | null
          comment?: string | null
          done_at?: string | null
          done_by?: string | null
          ord?: number
          out_of_range?: boolean
          project_id?: string
          release_comment?: string | null
          release_role?: string | null
          released_at?: string | null
          released_by?: string | null
          run_id?: string
          status?: string
          step_id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_run_steps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "procedure_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_run_steps_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "procedure_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_runs: {
        Row: {
          abort_reason: string | null
          aborted_at: string | null
          aborted_by: string | null
          completed_at: string | null
          completed_by: string | null
          id: string
          number: string
          org_id: string
          procedure_id: string
          project_id: string
          revision_id: string
          seq: number
          started_at: string
          started_by: string | null
          status: string
          stop_reason: string | null
          stop_synced_at: string | null
          stopped_at: string | null
          stopped_by: string | null
          system_id: string | null
          updated_at: string
        }
        Insert: {
          abort_reason?: string | null
          aborted_at?: string | null
          aborted_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          number: string
          org_id: string
          procedure_id: string
          project_id: string
          revision_id: string
          seq: number
          started_at?: string
          started_by?: string | null
          status?: string
          stop_reason?: string | null
          stop_synced_at?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          abort_reason?: string | null
          aborted_at?: string | null
          aborted_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          number?: string
          org_id?: string
          procedure_id?: string
          project_id?: string
          revision_id?: string
          seq?: number
          started_at?: string
          started_by?: string | null
          status?: string
          stop_reason?: string | null
          stop_synced_at?: string | null
          stopped_at?: string | null
          stopped_by?: string | null
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_runs_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_runs_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "procedure_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_runs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "procedure_runs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "procedure_runs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_runs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      procedure_steps: {
        Row: {
          action: string
          expected_max: number | null
          expected_min: number | null
          expected_unit: string | null
          expected_value: string | null
          hold_capacity: string | null
          id: string
          is_hold_point: boolean
          ord: number
          project_id: string
          responsible: string | null
          revision_id: string
          stop_criteria: string | null
          tag_id: string | null
        }
        Insert: {
          action: string
          expected_max?: number | null
          expected_min?: number | null
          expected_unit?: string | null
          expected_value?: string | null
          hold_capacity?: string | null
          id?: string
          is_hold_point?: boolean
          ord: number
          project_id: string
          responsible?: string | null
          revision_id: string
          stop_criteria?: string | null
          tag_id?: string | null
        }
        Update: {
          action?: string
          expected_max?: number | null
          expected_min?: number | null
          expected_unit?: string | null
          expected_value?: string | null
          hold_capacity?: string | null
          id?: string
          is_hold_point?: boolean
          ord?: number
          project_id?: string
          responsible?: string | null
          revision_id?: string
          stop_criteria?: string | null
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_steps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_steps_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "procedure_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_steps_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "procedure_steps_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_steps_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          id: string
          kind: string
          number: string
          org_id: string
          project_id: string
          seq: number
          system_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          kind?: string
          number: string
          org_id: string
          project_id: string
          seq: number
          system_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          kind?: string
          number?: string
          org_id?: string
          project_id?: string
          seq?: number
          system_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "procedure_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "procedures_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "procedures_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
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
      project_capacities: {
        Row: {
          assigned_at: string
          assigned_by: string
          capacity: string
          company_id: string | null
          id: string
          note: string | null
          org_id: string
          project_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          capacity: string
          company_id?: string | null
          id?: string
          note?: string | null
          org_id: string
          project_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          capacity?: string
          company_id?: string | null
          id?: string
          note?: string | null
          org_id?: string
          project_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_capacities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_capacities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_capacities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_constraints: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          escalation_level: number
          gate_id: string | null
          id: string
          impact: string | null
          impact_kind: string
          last_overdue_notif_at: string | null
          need_date: string
          number: string
          org_id: string
          owner_id: string | null
          project_id: string
          recovery_plan: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          seq: number
          status: string
          system_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          escalation_level?: number
          gate_id?: string | null
          id?: string
          impact?: string | null
          impact_kind: string
          last_overdue_notif_at?: string | null
          need_date: string
          number: string
          org_id: string
          owner_id?: string | null
          project_id: string
          recovery_plan?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seq: number
          status?: string
          system_id: string
          title: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          escalation_level?: number
          gate_id?: string | null
          id?: string
          impact?: string | null
          impact_kind?: string
          last_overdue_notif_at?: string | null
          need_date?: string
          number?: string
          org_id?: string
          owner_id?: string | null
          project_id?: string
          recovery_plan?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          seq?: number
          status?: string
          system_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_constraints_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_constraints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_constraints_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_constraints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_constraints_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "project_constraints_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "project_constraints_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_constraints_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      project_discipline_events: {
        Row: {
          action: string
          created_at: string
          discipline_id: string
          id: string
          itrs_affected: number
          org_id: string
          project_id: string
          reason: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          discipline_id: string
          id?: string
          itrs_affected?: number
          org_id: string
          project_id: string
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          discipline_id?: string
          id?: string
          itrs_affected?: number
          org_id?: string
          project_id?: string
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_discipline_events_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_discipline_events_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "project_discipline_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_discipline_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_disciplines: {
        Row: {
          added_at: string
          added_by: string | null
          discipline_id: string
          org_id: string
          project_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          discipline_id: string
          org_id: string
          project_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          discipline_id?: string
          org_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_disciplines_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_disciplines_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "project_disciplines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_disciplines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          certificate_name: string | null
          code: string
          color: string
          id: string
          itr_client_signature: boolean
          name: string
          order_index: number
          org_id: string
        }
        Insert: {
          certificate_name?: string | null
          code: string
          color?: string
          id?: string
          itr_client_signature?: boolean
          name: string
          order_index: number
          org_id: string
        }
        Update: {
          certificate_name?: string | null
          code?: string
          color?: string
          id?: string
          itr_client_signature?: boolean
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
          client_logo_url: string | null
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
          timezone: string
        }
        Insert: {
          client?: string | null
          client_logo_url?: string | null
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
          timezone?: string
        }
        Update: {
          client?: string | null
          client_logo_url?: string | null
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
          timezone?: string
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
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          required_signatures: string[]
          review_due_date: string | null
          review_number: string
          rfsu_certificate_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
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
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          required_signatures?: string[]
          review_due_date?: string | null
          review_number: string
          rfsu_certificate_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
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
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          required_signatures?: string[]
          review_due_date?: string | null
          review_number?: string
          rfsu_certificate_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
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
          capacity: string | null
          discipline: string | null
          id: string
          review_id: string
          signature_data: string
          signed_at: string
          user_id: string
        }
        Insert: {
          capacity?: string | null
          discipline?: string | null
          id?: string
          review_id: string
          signature_data: string
          signed_at?: string
          user_id: string
        }
        Update: {
          capacity?: string | null
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
          required_signatures: string[]
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
          required_signatures?: string[]
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
          required_signatures?: string[]
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
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
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
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
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
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
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
          category_reviewed_at: string | null
          category_reviewed_by: string | null
          closed_date: string | null
          created_at: string
          created_via: string | null
          description: string
          discipline_id: string
          id: string
          impact: string | null
          itr_id: string | null
          itr_item_id: string | null
          ops_notes: string | null
          ops_target_date: string | null
          post_handover_status: string | null
          preservation_record_id: string | null
          priority: Database["public"]["Enums"]["punch_priority"]
          project_id: string
          punch_number: string
          raised_by: string
          resolved_at: string | null
          resolved_by: string | null
          startup_disposition: string | null
          status: Database["public"]["Enums"]["punch_status"]
          subsystem_id: string
          tag_id: string | null
          target_date: string | null
          transferred_at: string | null
          transferred_to_user_id: string | null
          verified_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          category: Database["public"]["Enums"]["punch_category"]
          category_reviewed_at?: string | null
          category_reviewed_by?: string | null
          closed_date?: string | null
          created_at?: string
          created_via?: string | null
          description: string
          discipline_id: string
          id?: string
          impact?: string | null
          itr_id?: string | null
          itr_item_id?: string | null
          ops_notes?: string | null
          ops_target_date?: string | null
          post_handover_status?: string | null
          preservation_record_id?: string | null
          priority?: Database["public"]["Enums"]["punch_priority"]
          project_id: string
          punch_number: string
          raised_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          startup_disposition?: string | null
          status?: Database["public"]["Enums"]["punch_status"]
          subsystem_id: string
          tag_id?: string | null
          target_date?: string | null
          transferred_at?: string | null
          transferred_to_user_id?: string | null
          verified_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["punch_category"]
          category_reviewed_at?: string | null
          category_reviewed_by?: string | null
          closed_date?: string | null
          created_at?: string
          created_via?: string | null
          description?: string
          discipline_id?: string
          id?: string
          impact?: string | null
          itr_id?: string | null
          itr_item_id?: string | null
          ops_notes?: string | null
          ops_target_date?: string | null
          post_handover_status?: string | null
          preservation_record_id?: string | null
          priority?: Database["public"]["Enums"]["punch_priority"]
          project_id?: string
          punch_number?: string
          raised_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          startup_disposition?: string | null
          status?: Database["public"]["Enums"]["punch_status"]
          subsystem_id?: string
          tag_id?: string | null
          target_date?: string | null
          transferred_at?: string | null
          transferred_to_user_id?: string | null
          verified_by?: string | null
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
            foreignKeyName: "punches_category_reviewed_by_fkey"
            columns: ["category_reviewed_by"]
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
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_itr_item_id_fkey"
            columns: ["itr_item_id"]
            isOneToOne: false
            referencedRelation: "itr_template_items"
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
            foreignKeyName: "punches_resolved_by_fkey"
            columns: ["resolved_by"]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "punches_verified_by_fkey"
            columns: ["verified_by"]
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
      readiness_gates: {
        Row: {
          approval_roles: string[]
          code: string
          cosign_roles: string[]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_startup_gate: boolean
          name: string
          order_index: number
          org_id: string
          phase_id: string | null
          required_signatures: string[]
          requires_lineup: boolean
          requires_performance: boolean
          requires_previous: boolean
          weight: number | null
        }
        Insert: {
          approval_roles?: string[]
          code: string
          cosign_roles?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_startup_gate?: boolean
          name: string
          order_index?: number
          org_id: string
          phase_id?: string | null
          required_signatures?: string[]
          requires_lineup?: boolean
          requires_performance?: boolean
          requires_previous?: boolean
          weight?: number | null
        }
        Update: {
          approval_roles?: string[]
          code?: string
          cosign_roles?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_startup_gate?: boolean
          name?: string
          order_index?: number
          org_id?: string
          phase_id?: string | null
          required_signatures?: string[]
          requires_lineup?: boolean
          requires_performance?: boolean
          requires_previous?: boolean
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "readiness_gates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_gates_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      register_events: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          from_status: string | null
          id: string
          item_id: string
          org_id: string
          project_id: string
          to_status: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          item_id: string
          org_id: string
          project_id: string
          to_status?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          item_id?: string
          org_id?: string
          project_id?: string
          to_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "register_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "register_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      register_item_links: {
        Row: {
          created_at: string
          item_id: string
          linked_item_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          linked_item_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          linked_item_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_item_links_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "register_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_item_links_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "register_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_item_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      register_item_tags: {
        Row: {
          item_id: string
          project_id: string
          role: string
          tag_id: string
        }
        Insert: {
          item_id: string
          project_id: string
          role?: string
          tag_id: string
        }
        Update: {
          item_id?: string
          project_id?: string
          role?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "register_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_item_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "register_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      register_items: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          authorized_at: string | null
          authorized_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          data: Json
          description: string | null
          id: string
          kind: string
          number: string
          org_id: string
          owner_id: string | null
          project_id: string
          proposed_at: string
          proposed_by: string | null
          removed_at: string | null
          removed_by: string | null
          seq: number
          status: string
          system_id: string | null
          title: string
          type_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          data?: Json
          description?: string | null
          id?: string
          kind: string
          number: string
          org_id: string
          owner_id?: string | null
          project_id: string
          proposed_at?: string
          proposed_by?: string | null
          removed_at?: string | null
          removed_by?: string | null
          seq: number
          status?: string
          system_id?: string | null
          title: string
          type_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          data?: Json
          description?: string | null
          id?: string
          kind?: string
          number?: string
          org_id?: string
          owner_id?: string | null
          project_id?: string
          proposed_at?: string
          proposed_by?: string | null
          removed_at?: string | null
          removed_by?: string | null
          seq?: number
          status?: string
          system_id?: string | null
          title?: string
          type_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "register_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_items_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "register_items_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "register_items_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_items_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "register_items_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "register_types"
            referencedColumns: ["id"]
          },
        ]
      }
      register_types: {
        Row: {
          blocks_gate_id: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          org_id: string
          prefix: string
        }
        Insert: {
          blocks_gate_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          org_id: string
          prefix: string
        }
        Update: {
          blocks_gate_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          org_id?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_types_blocks_gate_id_fkey"
            columns: ["blocks_gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_handovers: {
        Row: {
          content_hash: string | null
          handed_at: string | null
          handed_by: string | null
          id: string
          number: string
          opened_at: string
          opened_by: string | null
          org_id: string
          pending_items: string | null
          project_id: string
          received_at: string | null
          received_by: string | null
          receiver_comment: string | null
          safety_notes: string | null
          seq: number
          shift_date: string
          shift_label: string
          snapshot: Json
          snapshot_at: string
          status: string
          updated_at: string
        }
        Insert: {
          content_hash?: string | null
          handed_at?: string | null
          handed_by?: string | null
          id?: string
          number: string
          opened_at?: string
          opened_by?: string | null
          org_id: string
          pending_items?: string | null
          project_id: string
          received_at?: string | null
          received_by?: string | null
          receiver_comment?: string | null
          safety_notes?: string | null
          seq: number
          shift_date: string
          shift_label?: string
          snapshot?: Json
          snapshot_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          content_hash?: string | null
          handed_at?: string | null
          handed_by?: string | null
          id?: string
          number?: string
          opened_at?: string
          opened_by?: string | null
          org_id?: string
          pending_items?: string | null
          project_id?: string
          received_at?: string | null
          received_by?: string | null
          receiver_comment?: string | null
          safety_notes?: string | null
          seq?: number
          shift_date?: string
          shift_label?: string
          snapshot?: Json
          snapshot_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      signal_samples_202607: {
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
        Relationships: []
      }
      signal_samples_202608: {
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
        Relationships: []
      }
      signal_samples_202609: {
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
        Relationships: []
      }
      signal_samples_202610: {
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
        Relationships: []
      }
      signal_samples_202611: {
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
        Relationships: []
      }
      signal_samples_202612: {
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
        Relationships: []
      }
      signal_samples_202701: {
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
        Relationships: []
      }
      signals: {
        Row: {
          active: boolean
          alarm_setpoints: string | null
          dcs_tag: string | null
          description: string | null
          destination: string | null
          eng_unit: string | null
          hi: number | null
          hi_hi: number | null
          hmi_display: string | null
          id: string
          io_card: string | null
          io_channel: string | null
          junction_box: string | null
          lo: number | null
          lo_lo: number | null
          loop_diagram: string | null
          loop_id: string | null
          marshalling: string | null
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
          dcs_tag?: string | null
          description?: string | null
          destination?: string | null
          eng_unit?: string | null
          hi?: number | null
          hi_hi?: number | null
          hmi_display?: string | null
          id?: string
          io_card?: string | null
          io_channel?: string | null
          junction_box?: string | null
          lo?: number | null
          lo_lo?: number | null
          loop_diagram?: string | null
          loop_id?: string | null
          marshalling?: string | null
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
          dcs_tag?: string | null
          description?: string | null
          destination?: string | null
          eng_unit?: string | null
          hi?: number | null
          hi_hi?: number | null
          hmi_display?: string | null
          id?: string
          io_card?: string | null
          io_channel?: string | null
          junction_box?: string | null
          lo?: number | null
          lo_lo?: number | null
          loop_diagram?: string | null
          loop_id?: string | null
          marshalling?: string | null
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      startup_event_params: {
        Row: {
          added_by: string | null
          created_at: string
          event_id: string
          id: string
          label: string
          offset_s: number | null
          project_id: string
          quality: number | null
          sampled_at: string | null
          signal_id: string | null
          source: string
          unit: string | null
          value: number | null
          value_text: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          label: string
          offset_s?: number | null
          project_id: string
          quality?: number | null
          sampled_at?: string | null
          signal_id?: string | null
          source: string
          unit?: string | null
          value?: number | null
          value_text?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          offset_s?: number | null
          project_id?: string
          quality?: number | null
          sampled_at?: string | null
          signal_id?: string | null
          source?: string
          unit?: string | null
          value?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_event_params_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "startup_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_event_params_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_event_params_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_event_tags: {
        Row: {
          event_id: string
          project_id: string
          tag_id: string
        }
        Insert: {
          event_id: string
          project_id: string
          tag_id: string
        }
        Update: {
          event_id?: string
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_event_tags_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "startup_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_event_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_event_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "startup_event_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_event_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_events: {
        Row: {
          backdate_reason: string | null
          category: string | null
          description: string | null
          id: string
          kind: string
          milestone: string | null
          number: string
          occurred_at: string
          org_id: string
          project_id: string
          recorded_at: string
          recorded_by: string | null
          run_id: string | null
          seq: number
          status: string
          system_id: string
          title: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          witness_at: string | null
          witness_by: string | null
          witness_capacity: string | null
        }
        Insert: {
          backdate_reason?: string | null
          category?: string | null
          description?: string | null
          id?: string
          kind: string
          milestone?: string | null
          number: string
          occurred_at: string
          org_id: string
          project_id: string
          recorded_at?: string
          recorded_by?: string | null
          run_id?: string | null
          seq: number
          status: string
          system_id: string
          title: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          witness_at?: string | null
          witness_by?: string | null
          witness_capacity?: string | null
        }
        Update: {
          backdate_reason?: string | null
          category?: string | null
          description?: string | null
          id?: string
          kind?: string
          milestone?: string | null
          number?: string
          occurred_at?: string
          org_id?: string
          project_id?: string
          recorded_at?: string
          recorded_by?: string | null
          run_id?: string | null
          seq?: number
          status?: string
          system_id?: string
          title?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          witness_at?: string | null
          witness_by?: string | null
          witness_capacity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "procedure_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "startup_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "startup_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
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
      system_competency_targets: {
        Row: {
          project_id: string
          required: number
          system_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          project_id: string
          required?: number
          system_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          project_id?: string
          required?: number
          system_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_competency_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_competency_targets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_competency_targets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_competency_targets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_competency_targets_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_dependencies: {
        Row: {
          blocked_gate_id: string
          created_at: string
          created_by: string | null
          depends_on_system_id: string
          id: string
          kind: string
          notes: string | null
          org_id: string
          project_id: string
          required_gate_id: string
          source: string
          system_id: string
        }
        Insert: {
          blocked_gate_id: string
          created_at?: string
          created_by?: string | null
          depends_on_system_id: string
          id?: string
          kind?: string
          notes?: string | null
          org_id: string
          project_id: string
          required_gate_id: string
          source?: string
          system_id: string
        }
        Update: {
          blocked_gate_id?: string
          created_at?: string
          created_by?: string | null
          depends_on_system_id?: string
          id?: string
          kind?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          required_gate_id?: string
          source?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_dependencies_blocked_gate_id_fkey"
            columns: ["blocked_gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_depends_on_system_id_fkey"
            columns: ["depends_on_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_dependencies_depends_on_system_id_fkey"
            columns: ["depends_on_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_dependencies_depends_on_system_id_fkey"
            columns: ["depends_on_system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_depends_on_system_id_fkey"
            columns: ["depends_on_system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_dependencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_required_gate_id_fkey"
            columns: ["required_gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_dependencies_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_dependencies_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_dependencies_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_gate_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          approved_company: string | null
          approved_role: string
          completed_at: string | null
          conditions: Json
          evidence: Json
          gate_id: string
          id: string
          notes: string | null
          org_id: string
          project_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          system_id: string
          target_status: string | null
        }
        Insert: {
          approved_at?: string
          approved_by: string
          approved_company?: string | null
          approved_role: string
          completed_at?: string | null
          conditions?: Json
          evidence?: Json
          gate_id: string
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status: string
          system_id: string
          target_status?: string | null
        }
        Update: {
          approved_at?: string
          approved_by?: string
          approved_company?: string | null
          approved_role?: string
          completed_at?: string | null
          conditions?: Json
          evidence?: Json
          gate_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          system_id?: string
          target_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_approvals_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_approvals_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_approvals_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_approvals_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_approvals_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_gate_attestations: {
        Row: {
          attested_at: string
          attested_by: string
          comment: string
          criterion_id: string
          file_path: string
          id: string
          org_id: string
          project_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          system_id: string
        }
        Insert: {
          attested_at?: string
          attested_by: string
          comment: string
          criterion_id: string
          file_path: string
          id?: string
          org_id: string
          project_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          system_id: string
        }
        Update: {
          attested_at?: string
          attested_by?: string
          comment?: string
          criterion_id?: string
          file_path?: string
          id?: string
          org_id?: string
          project_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_attestations_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "gate_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_attestations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_attestations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_attestations_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_attestations_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_attestations_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_attestations_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_gate_plan_events: {
        Row: {
          created_at: string
          from_date: string | null
          gate_id: string
          id: string
          kind: string
          org_id: string
          project_id: string
          reason: string | null
          system_id: string
          to_date: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          from_date?: string | null
          gate_id: string
          id?: string
          kind: string
          org_id: string
          project_id: string
          reason?: string | null
          system_id: string
          to_date?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          from_date?: string | null
          gate_id?: string
          id?: string
          kind?: string
          org_id?: string
          project_id?: string
          reason?: string | null
          system_id?: string
          to_date?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_plan_events_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plan_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_gate_plans: {
        Row: {
          commitment_at: string | null
          commitment_by: string | null
          commitment_date: string | null
          forecast_at: string | null
          forecast_by: string | null
          forecast_date: string | null
          gate_id: string
          notes: string | null
          org_id: string
          project_id: string
          system_id: string
          updated_at: string
        }
        Insert: {
          commitment_at?: string | null
          commitment_by?: string | null
          commitment_date?: string | null
          forecast_at?: string | null
          forecast_by?: string | null
          forecast_date?: string | null
          gate_id: string
          notes?: string | null
          org_id: string
          project_id: string
          system_id: string
          updated_at?: string
        }
        Update: {
          commitment_at?: string | null
          commitment_by?: string | null
          commitment_date?: string | null
          forecast_at?: string | null
          forecast_by?: string | null
          forecast_date?: string | null
          gate_id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_plans_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plans_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_plans_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_plans_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_plans_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_gate_signatures: {
        Row: {
          approval_id: string
          capacity: string
          comments: string | null
          id: string
          org_id: string
          project_id: string
          signed_at: string
          signer_company: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          approval_id: string
          capacity: string
          comments?: string | null
          id?: string
          org_id: string
          project_id: string
          signed_at?: string
          signer_company?: string | null
          user_id: string
          user_role: string
        }
        Update: {
          approval_id?: string
          capacity?: string
          comments?: string | null
          id?: string
          org_id?: string
          project_id?: string
          signed_at?: string
          signer_company?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_signatures_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "system_gate_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_signatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      system_gate_status: {
        Row: {
          computed_at: string | null
          computed_version: number | null
          gates: Json | null
          org_id: string
          project_id: string
          system_id: string
          version: number
        }
        Insert: {
          computed_at?: string | null
          computed_version?: number | null
          gates?: Json | null
          org_id: string
          project_id: string
          system_id: string
          version?: number
        }
        Update: {
          computed_at?: string | null
          computed_version?: number | null
          gates?: Json | null
          org_id?: string
          project_id?: string
          system_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_gate_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_status_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_status_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_gate_status_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_gate_status_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_ownership: {
        Row: {
          last_transfer_id: string | null
          org_id: string
          project_id: string
          since: string
          stage: string
          system_id: string
        }
        Insert: {
          last_transfer_id?: string | null
          org_id: string
          project_id: string
          since?: string
          stage?: string
          system_id: string
        }
        Update: {
          last_transfer_id?: string | null
          org_id?: string
          project_id?: string
          since?: string
          stage?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_ownership_last_transfer_fk"
            columns: ["last_transfer_id"]
            isOneToOne: false
            referencedRelation: "ownership_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_ownership_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_ownership_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_ownership_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_ownership_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_ownership_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_ownership_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: true
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      system_progress_snapshots: {
        Row: {
          created_at: string
          gates_approved: number
          gates_total: number
          id: string
          itr_approved: number
          itr_total: number
          org_id: string
          per_gate: Json
          project_id: string
          snapshot_date: string
          system_id: string
          weighted_pct: number
        }
        Insert: {
          created_at?: string
          gates_approved?: number
          gates_total?: number
          id?: string
          itr_approved?: number
          itr_total?: number
          org_id: string
          per_gate?: Json
          project_id: string
          snapshot_date: string
          system_id: string
          weighted_pct?: number
        }
        Update: {
          created_at?: string
          gates_approved?: number
          gates_total?: number
          id?: string
          itr_approved?: number
          itr_total?: number
          org_id?: string
          per_gate?: Json
          project_id?: string
          snapshot_date?: string
          system_id?: string
          weighted_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_progress_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_progress_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_progress_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_progress_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "system_progress_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_progress_snapshots_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      systems: {
        Row: {
          area_id: string
          battery_limits: Json
          boundary_frozen_at: string | null
          boundary_frozen_by: string | null
          code: string
          color: string
          current_phase_id: string | null
          description: string | null
          id: string
          name: string
          priority: number | null
          project_id: string
          system_type: string | null
        }
        Insert: {
          area_id: string
          battery_limits?: Json
          boundary_frozen_at?: string | null
          boundary_frozen_by?: string | null
          code: string
          color?: string
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name: string
          priority?: number | null
          project_id: string
          system_type?: string | null
        }
        Update: {
          area_id?: string
          battery_limits?: Json
          boundary_frozen_at?: string | null
          boundary_frozen_by?: string | null
          code?: string
          color?: string
          current_phase_id?: string | null
          description?: string | null
          id?: string
          name?: string
          priority?: number | null
          project_id?: string
          system_type?: string | null
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
            foreignKeyName: "systems_boundary_frozen_by_fkey"
            columns: ["boundary_frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      tag_itr_ai_proposals: {
        Row: {
          action: string
          applied_tags: number | null
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          org_id: string
          project_id: string
          reason: string
          review_id: string
          skipped_tags: number | null
          status: string
          template_code: string
        }
        Insert: {
          action: string
          applied_tags?: number | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          org_id: string
          project_id: string
          reason: string
          review_id: string
          skipped_tags?: number | null
          status?: string
          template_code: string
        }
        Update: {
          action?: string
          applied_tags?: number | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          org_id?: string
          project_id?: string
          reason?: string
          review_id?: string
          skipped_tags?: number | null
          status?: string
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_itr_ai_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_ai_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_ai_proposals_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "tag_itr_ai_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_itr_ai_reviews: {
        Row: {
          base_codes: string[]
          created_at: string
          created_by: string | null
          desc_norm: string
          discipline_id: string | null
          equipment_type_id: string
          id: string
          model: string | null
          org_id: string
          prefix: string
          project_id: string
        }
        Insert: {
          base_codes: string[]
          created_at?: string
          created_by?: string | null
          desc_norm: string
          discipline_id?: string | null
          equipment_type_id: string
          id?: string
          model?: string | null
          org_id: string
          prefix: string
          project_id: string
        }
        Update: {
          base_codes?: string[]
          created_at?: string
          created_by?: string | null
          desc_norm?: string
          discipline_id?: string | null
          equipment_type_id?: string
          id?: string
          model?: string | null
          org_id?: string
          prefix?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_itr_ai_reviews_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_ai_reviews_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "tag_itr_ai_reviews_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_ai_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_ai_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_itr_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          reason: string | null
          source: string
          tag_id: string
          template_code: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          project_id: string
          reason?: string | null
          source?: string
          tag_id: string
          template_code: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          project_id?: string
          reason?: string | null
          source?: string
          tag_id?: string
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_itr_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_overrides_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "tag_itr_overrides_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_itr_overrides_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_requirement_dirty: {
        Row: {
          project_id: string
          tag_id: string
        }
        Insert: {
          project_id: string
          tag_id: string
        }
        Update: {
          project_id?: string
          tag_id?: string
        }
        Relationships: []
      }
      tag_requirement_rows: {
        Row: {
          discipline_id: string | null
          itr_id: string | null
          itr_status: string | null
          origin: string | null
          phase_id: string | null
          project_id: string
          reason: string | null
          state: string
          subsystem_id: string | null
          tag_id: string
          template_code: string
          template_title: string | null
        }
        Insert: {
          discipline_id?: string | null
          itr_id?: string | null
          itr_status?: string | null
          origin?: string | null
          phase_id?: string | null
          project_id: string
          reason?: string | null
          state: string
          subsystem_id?: string | null
          tag_id: string
          template_code: string
          template_title?: string | null
        }
        Update: {
          discipline_id?: string | null
          itr_id?: string | null
          itr_status?: string | null
          origin?: string | null
          phase_id?: string | null
          project_id?: string
          reason?: string | null
          state?: string
          subsystem_id?: string | null
          tag_id?: string
          template_code?: string
          template_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_requirement_rows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_requirement_rows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "tag_requirement_rows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_requirement_rows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_requirement_state: {
        Row: {
          computed_at: string | null
          computed_version: number
          project_id: string
          version: number
        }
        Insert: {
          computed_at?: string | null
          computed_version?: number
          project_id: string
          version?: number
        }
        Update: {
          computed_at?: string | null
          computed_version?: number
          project_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_requirement_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_type_proposals: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          desc_norm: string
          discipline_id: string | null
          equipment_type_id: string | null
          id: string
          model: string | null
          new_type: Json | null
          org_id: string
          outcome: string
          prefix: string
          project_id: string
          reason: string | null
          status: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          desc_norm: string
          discipline_id?: string | null
          equipment_type_id?: string | null
          id?: string
          model?: string | null
          new_type?: Json | null
          org_id: string
          outcome: string
          prefix: string
          project_id: string
          reason?: string | null
          status?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          desc_norm?: string
          discipline_id?: string | null
          equipment_type_id?: string | null
          id?: string
          model?: string | null
          new_type?: Json | null
          org_id?: string
          outcome?: string
          prefix?: string
          project_id?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_type_proposals_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_type_proposals_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "tag_type_proposals_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_type_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_type_proposals_project_id_fkey"
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
          criticality: string
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
          tag_key: string | null
          tag_number: string
        }
        Insert: {
          created_at?: string
          criticality?: string
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
          tag_key?: string | null
          tag_number: string
        }
        Update: {
          created_at?: string
          criticality?: string
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
          tag_key?: string | null
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
      technical_queries: {
        Row: {
          addressed_to: string
          addressed_to_name: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          design_change: boolean
          discipline_id: string | null
          id: string
          issued_at: string | null
          issued_by: string | null
          moc_ref: string | null
          number: string
          org_id: string
          project_id: string
          question: string
          raised_by: string | null
          required_by: string | null
          responded_at: string | null
          responded_by: string | null
          responded_by_name: string | null
          response: string | null
          seq: number
          status: string
          subject: string
          system_id: string | null
          updated_at: string
        }
        Insert: {
          addressed_to?: string
          addressed_to_name?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          design_change?: boolean
          discipline_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          moc_ref?: string | null
          number: string
          org_id: string
          project_id: string
          question: string
          raised_by?: string | null
          required_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          response?: string | null
          seq: number
          status?: string
          subject: string
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          addressed_to?: string
          addressed_to_name?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          design_change?: boolean
          discipline_id?: string | null
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          moc_ref?: string | null
          number?: string
          org_id?: string
          project_id?: string
          question?: string
          raised_by?: string | null
          required_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          response?: string | null
          seq?: number
          status?: string
          subject?: string
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_queries_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_queries_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["discipline_id"]
          },
          {
            foreignKeyName: "technical_queries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_queries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_queries_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "technical_queries_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "technical_queries_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_queries_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      technical_query_tags: {
        Row: {
          project_id: string
          tag_id: string
          tq_id: string
        }
        Insert: {
          project_id: string
          tag_id: string
          tq_id: string
        }
        Update: {
          project_id?: string
          tag_id?: string
          tq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technical_query_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_query_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "technical_query_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_query_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technical_query_tags_tq_id_fkey"
            columns: ["tq_id"]
            isOneToOne: false
            referencedRelation: "technical_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      template_client_codes: {
        Row: {
          client_code: string
          id: string
          org_id: string
          project_id: string | null
          template_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_code: string
          id?: string
          org_id: string
          project_id?: string | null
          template_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_code?: string
          id?: string
          org_id?: string
          project_id?: string | null
          template_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_client_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_client_codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_equipment: {
        Row: {
          calibrated_on: string
          calibration_due: string
          certificate_number: string
          certificate_path: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          make: string | null
          model: string | null
          notes: string | null
          org_id: string
          owner_company: string | null
          owner_company_id: string | null
          serial_number: string
          updated_at: string
        }
        Insert: {
          calibrated_on: string
          calibration_due: string
          certificate_number: string
          certificate_path?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind: string
          make?: string | null
          model?: string | null
          notes?: string | null
          org_id: string
          owner_company?: string | null
          owner_company_id?: string | null
          serial_number: string
          updated_at?: string
        }
        Update: {
          calibrated_on?: string
          calibration_due?: string
          certificate_number?: string
          certificate_path?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          org_id?: string
          owner_company?: string | null
          owner_company_id?: string | null
          serial_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_equipment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_equipment_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_activities: {
        Row: {
          created_at: string
          id: string
          kind: string
          location: string | null
          notes: string | null
          package_id: string
          performed_on: string | null
          planned_date: string | null
          project_id: string
          recorded_by: string | null
          result: string
          result_at: string | null
          result_by: string | null
          retest_of: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          location?: string | null
          notes?: string | null
          package_id: string
          performed_on?: string | null
          planned_date?: string | null
          project_id: string
          recorded_by?: string | null
          result?: string
          result_at?: string | null
          result_by?: string | null
          retest_of?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          package_id?: string
          performed_on?: string | null
          planned_date?: string | null
          project_id?: string
          recorded_by?: string | null
          result?: string
          result_at?: string | null
          result_by?: string | null
          retest_of?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_activities_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_activities_retest_of_fkey"
            columns: ["retest_of"]
            isOneToOne: false
            referencedRelation: "vendor_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_checklist: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          done: boolean
          item_key: string
          note: string | null
          package_id: string
          phase: string
          project_id: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          done?: boolean
          item_key: string
          note?: string | null
          package_id: string
          phase: string
          project_id: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          done?: boolean
          item_key?: string
          note?: string | null
          package_id?: string
          phase?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_checklist_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_checklist_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_findings: {
        Row: {
          action_id: string | null
          activity_id: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          package_id: string
          project_id: string
          punch_id: string | null
          tag_id: string | null
        }
        Insert: {
          action_id?: string | null
          activity_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          package_id: string
          project_id: string
          punch_id?: string | null
          tag_id?: string | null
        }
        Update: {
          action_id?: string | null
          activity_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          package_id?: string
          project_id?: string
          punch_id?: string | null
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_findings_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "vendor_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "ops_dashboard"
            referencedColumns: ["punch_id"]
          },
          {
            foreignKeyName: "vendor_findings_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punch_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_punch_id_fkey"
            columns: ["punch_id"]
            isOneToOne: false
            referencedRelation: "punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "vendor_findings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_findings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_interfaces: {
        Row: {
          counterpart: string | null
          counterpart_company_id: string | null
          created_at: string
          description: string
          id: string
          package_id: string
          project_id: string
          responsible: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          counterpart?: string | null
          counterpart_company_id?: string | null
          created_at?: string
          description: string
          id?: string
          package_id: string
          project_id: string
          responsible?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          counterpart?: string | null
          counterpart_company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          package_id?: string
          project_id?: string
          responsible?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_interfaces_counterpart_company_id_fkey"
            columns: ["counterpart_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interfaces_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_interfaces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_package_systems: {
        Row: {
          package_id: string
          project_id: string
          system_id: string
        }
        Insert: {
          package_id: string
          project_id: string
          system_id: string
        }
        Update: {
          package_id?: string
          project_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_package_systems_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_systems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "vendor_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "vendor_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
        ]
      }
      vendor_package_tags: {
        Row: {
          package_id: string
          project_id: string
          tag_id: string
        }
        Insert: {
          package_id: string
          project_id: string
          tag_id: string
        }
        Update: {
          package_id?: string
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_package_tags_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "vendor_package_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_package_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_packages: {
        Row: {
          boundaries: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          demobilization_note: string | null
          demobilized_at: string | null
          demobilized_by: string | null
          id: string
          mob_gate_id: string | null
          mob_system_id: string | null
          mobilization_note: string | null
          mobilized_at: string | null
          mobilized_by: string | null
          number: string
          org_id: string
          planned_mobilization: string | null
          project_id: string
          scope: string | null
          seq: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          boundaries?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          demobilization_note?: string | null
          demobilized_at?: string | null
          demobilized_by?: string | null
          id?: string
          mob_gate_id?: string | null
          mob_system_id?: string | null
          mobilization_note?: string | null
          mobilized_at?: string | null
          mobilized_by?: string | null
          number: string
          org_id: string
          planned_mobilization?: string | null
          project_id: string
          scope?: string | null
          seq: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          boundaries?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          demobilization_note?: string | null
          demobilized_at?: string | null
          demobilized_by?: string | null
          id?: string
          mob_gate_id?: string | null
          mob_system_id?: string | null
          mobilization_note?: string | null
          mobilized_at?: string | null
          mobilized_by?: string | null
          number?: string
          org_id?: string
          planned_mobilization?: string | null
          project_id?: string
          scope?: string | null
          seq?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_packages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_packages_mob_gate_id_fkey"
            columns: ["mob_gate_id"]
            isOneToOne: false
            referencedRelation: "readiness_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_packages_mob_system_id_fkey"
            columns: ["mob_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_bottlenecks"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "vendor_packages_mob_system_id_fkey"
            columns: ["mob_system_id"]
            isOneToOne: false
            referencedRelation: "analytics_subsystem_progress"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "vendor_packages_mob_system_id_fkey"
            columns: ["mob_system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_packages_mob_system_id_fkey"
            columns: ["mob_system_id"]
            isOneToOne: false
            referencedRelation: "tag_360"
            referencedColumns: ["system_id"]
          },
          {
            foreignKeyName: "vendor_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_recommendations: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          description: string
          id: string
          implementation_note: string | null
          implemented_at: string | null
          implemented_by: string | null
          moc_reference: string | null
          package_id: string
          project_id: string
          proposed_at: string
          proposed_by: string | null
          rationale: string | null
          requires_moc: boolean
          seq: number
          status: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description: string
          id?: string
          implementation_note?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          moc_reference?: string | null
          package_id: string
          project_id: string
          proposed_at?: string
          proposed_by?: string | null
          rationale?: string | null
          requires_moc?: boolean
          seq: number
          status?: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description?: string
          id?: string
          implementation_note?: string | null
          implemented_at?: string | null
          implemented_by?: string | null
          moc_reference?: string | null
          package_id?: string
          project_id?: string
          proposed_at?: string
          proposed_by?: string | null
          rationale?: string | null
          requires_moc?: boolean
          seq?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_recommendations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_recommendations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reports: {
        Row: {
          activities: string
          headcount: number | null
          hours: number | null
          id: string
          issued_at: string
          issued_by: string | null
          issues: string | null
          kind: string
          package_id: string
          project_id: string
          report_date: string
        }
        Insert: {
          activities: string
          headcount?: number | null
          hours?: number | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issues?: string | null
          kind: string
          package_id: string
          project_id: string
          report_date: string
        }
        Update: {
          activities?: string
          headcount?: number | null
          hours?: number | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          issues?: string | null
          kind?: string
          package_id?: string
          project_id?: string
          report_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reports_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "vendor_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
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
            referencedRelation: "itr_list_v"
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
      itr_list_v: {
        Row: {
          area_id: string | null
          assignee_ids: string[] | null
          completed_date: string | null
          created_at: string | null
          discipline_code: string | null
          discipline_color: string | null
          discipline_name: string | null
          id: string | null
          itr_number: string | null
          org_id: string | null
          phase_code: string | null
          phase_color: string | null
          phase_id: string | null
          phase_name: string | null
          progress_pct: number | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          scheduled_date: string | null
          search_text: string | null
          status: Database["public"]["Enums"]["itr_status"] | null
          subsystem_id: string | null
          system_id: string | null
          tag_description: string | null
          tag_id: string | null
          tag_number: string | null
          template_code: string | null
          template_id: string | null
          template_title: string | null
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
        ]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
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
      punch_list_v: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          category: Database["public"]["Enums"]["punch_category"] | null
          category_reviewed_at: string | null
          closed_date: string | null
          created_at: string | null
          description: string | null
          discipline_code: string | null
          discipline_color: string | null
          discipline_id: string | null
          discipline_name: string | null
          id: string | null
          impact: string | null
          itr_id: string | null
          org_id: string | null
          priority: Database["public"]["Enums"]["punch_priority"] | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          punch_number: string | null
          raised_by: string | null
          raised_by_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          search_text: string | null
          startup_disposition: string | null
          status: Database["public"]["Enums"]["punch_status"] | null
          subsystem_code: string | null
          subsystem_id: string | null
          subsystem_name: string | null
          system_code: string | null
          system_id: string | null
          system_name: string | null
          tag_description: string | null
          tag_id: string | null
          tag_number: string | null
          target_date: string | null
          verified_by: string | null
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
            referencedRelation: "itr_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_itr_id_fkey"
            columns: ["itr_id"]
            isOneToOne: false
            referencedRelation: "itrs"
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
            foreignKeyName: "punches_resolved_by_fkey"
            columns: ["resolved_by"]
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
            referencedRelation: "tag_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      tag_list_v: {
        Row: {
          area_code: string | null
          area_id: string | null
          area_name: string | null
          created_at: string | null
          description: string | null
          discipline_code: string | null
          discipline_color: string | null
          discipline_id: string | null
          discipline_name: string | null
          equipment_type_code: string | null
          equipment_type_id: string | null
          equipment_type_name: string | null
          id: string | null
          manufacturer: string | null
          model: string | null
          org_id: string | null
          pid_drawing: string | null
          preservation_required: boolean | null
          project_id: string | null
          search_text: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["tag_status"] | null
          subsystem_code: string | null
          subsystem_id: string | null
          subsystem_name: string | null
          system_code: string | null
          system_id: string | null
          system_name: string | null
          tag_number: string | null
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
    }
    Functions: {
      abort_performance_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      accept_itr_suggestion: {
        Args: { p_note?: string; p_suggestion_id: string }
        Returns: string
      }
      accept_shift_handover: {
        Args: { p_comment?: string; p_handover_id: string }
        Returns: string
      }
      acknowledge_performance_exclusions: {
        Args: { p_run_id: string }
        Returns: number
      }
      activate_itr_template_revision: {
        Args: { p_template_id: string }
        Returns: Json
      }
      add_certificate_exception: {
        Args: {
          p_certificate_id: string
          p_justification: string
          p_punch_id: string
        }
        Returns: string
      }
      add_document_reference: {
        Args: { p_document_id: string; p_kind: string; p_target_id: string }
        Returns: string
      }
      add_document_revision: {
        Args: {
          p_document_id: string
          p_external_url: string
          p_file_name: string
          p_file_path: string
          p_issued_on: string
          p_notes: string
          p_rev: string
          p_status: string
        }
        Returns: string
      }
      add_mgmt_attachment: {
        Args: {
          p_entity_id: string
          p_entity_kind: string
          p_file_name: string
          p_file_path: string
          p_mime_type?: string
          p_size_bytes?: number
        }
        Returns: string
      }
      add_org_member: {
        Args: {
          p_expires_at?: string
          p_org_id: string
          p_role: string
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      add_performance_manual_reading: {
        Args: {
          p_at: string
          p_run_id: string
          p_value: number
          p_variable_id: string
        }
        Returns: undefined
      }
      add_pid_redline_comment: {
        Args: { p_body: string; p_id: string }
        Returns: string
      }
      add_pid_redline_photo: {
        Args: {
          p_file_name: string
          p_file_path: string
          p_id: string
          p_mime_type?: string
          p_size_bytes?: number
        }
        Returns: string
      }
      add_startup_event_param: {
        Args: {
          p_event_id: string
          p_label: string
          p_unit?: string
          p_value: string
        }
        Returns: undefined
      }
      add_vendor_finding: {
        Args: {
          p_activity_id: string
          p_category: string
          p_description: string
          p_due_date?: string
          p_owner_id?: string
          p_tag_id: string
        }
        Returns: string
      }
      add_vendor_report: {
        Args: {
          p_activities: string
          p_headcount: number
          p_hours: number
          p_issues: string
          p_kind: string
          p_package_id: string
          p_report_date: string
        }
        Returns: string
      }
      advance_performance_run: {
        Args: {
          p_at?: string
          p_comment?: string
          p_run_id: string
          p_to: string
        }
        Returns: string
      }
      ai_quota_status: {
        Args: { p_org_id: string }
        Returns: {
          budget_usd: number
          used_usd: number
        }[]
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
      answer_tq: {
        Args: {
          p_design_change?: boolean
          p_moc_ref?: string
          p_responded_by_name?: string
          p_response: string
          p_tq_id: string
        }
        Returns: undefined
      }
      approve_pssr: { Args: { p_review_id: string }; Returns: string }
      approve_system_gate: {
        Args: {
          p_conditions?: Json
          p_gate_id: string
          p_notes?: string
          p_system_id: string
        }
        Returns: string
      }
      assign_project_capacity: {
        Args: {
          p_capacity: string
          p_note?: string
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      attest_gate_criterion: {
        Args: {
          p_comment: string
          p_criterion_id: string
          p_file_path: string
          p_system_id: string
        }
        Returns: string
      }
      auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      bootstrap_org: {
        Args: { p_input: Json; p_user_id: string }
        Returns: Json
      }
      bump_push_subscription_failure: {
        Args: { p_sub_id: string }
        Returns: undefined
      }
      cancel_ownership_transfer: {
        Args: { p_reason: string; p_transfer_id: string }
        Returns: undefined
      }
      cancel_punch: {
        Args: { p_punch_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_vendor_package: {
        Args: { p_package_id: string; p_reason: string }
        Returns: undefined
      }
      capacity_designated: {
        Args: { p_capacity: string; p_project_id: string }
        Returns: boolean
      }
      capacity_eligible: {
        Args: { p_capacity: string; p_org_id: string; p_user_id: string }
        Returns: string
      }
      capacity_fallback_roles: {
        Args: { p_capacity: string }
        Returns: string[]
      }
      capacity_holders: {
        Args: { p_capacity: string; p_project_id: string }
        Returns: string[]
      }
      certificate_blocker: {
        Args: {
          p_justified: string[]
          p_phase_id: string
          p_subsystem_id: string
        }
        Returns: string
      }
      certificate_eligibility: {
        Args: { p_phase_id: string; p_subsystem_id: string }
        Returns: Json
      }
      certificate_previous_blocker: {
        Args: { p_phase_id: string; p_subsystem_id: string }
        Returns: string
      }
      certificate_role_capacity: { Args: { p_role: string }; Returns: string }
      claim_push_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          id: string
          kind: string
          link_url: string
          org_id: string
          payload: Json
          recipient_user_id: string
          title: string
        }[]
      }
      claim_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          delivery_id: string
          enabled: boolean
          endpoint_url: string
          event_id: string
          event_type: string
          occurred_at: string
          payload: Json
          schema_version: number
          secret: string
          subscription_id: string
        }[]
      }
      cleanup_event_retention: { Args: never; Returns: Json }
      cleanup_signal_samples_retention: { Args: never; Returns: number }
      clone_itr_template_from_catalog: {
        Args: {
          p_code_suffix?: string
          p_content_hash?: string
          p_description?: string
          p_expected_latest_version?: number
          p_source_template_id: string
          p_target_org_id: string
          p_update_existing?: boolean
        }
        Returns: Json
      }
      close_performance_run: {
        Args: { p_at?: string; p_reason?: string; p_run_id: string }
        Returns: number
      }
      complete_lineup_sheet: { Args: { p_sheet_id: string }; Returns: string }
      complete_run_step: {
        Args: {
          p_actual?: string
          p_captured_at?: string
          p_comment?: string
          p_na?: boolean
          p_run_id: string
          p_step_id: string
        }
        Returns: string
      }
      compute_project_gate_progress: {
        Args: { p_project_id: string }
        Returns: {
          gate_id: string
          itr_approved: number
          itr_total: number
          pct: number
          system_id: string
        }[]
      }
      compute_project_gates: {
        Args: { p_project_id: string }
        Returns: {
          area_code: string
          area_name: string
          gates: Json
          system_code: string
          system_id: string
          system_name: string
        }[]
      }
      compute_project_pid_coverage: {
        Args: { p_project_id: string }
        Returns: {
          system_id: string
          tags_cited: number
          tags_pinned: number
          tags_total: number
        }[]
      }
      compute_project_pid_drawing_coverage: {
        Args: { p_project_id: string }
        Returns: {
          document_id: string
          pins: number
          tags_cited: number
          tags_cited_pinned: number
        }[]
      }
      compute_project_progress: {
        Args: { p_project_id: string }
        Returns: {
          gates_approved: number
          gates_total: number
          itr_approved: number
          itr_total: number
          system_code: string
          system_id: string
          weighted_pct: number
        }[]
      }
      compute_project_readiness: {
        Args: { p_project_id: string }
        Returns: {
          area_code: string
          area_name: string
          blockers: Json
          cat_b_limit: number
          gates: Json
          itr_approved: number
          itr_pct: number
          itr_total: number
          open_punches_a: number
          open_punches_b: number
          open_punches_c: number
          system_code: string
          system_id: string
          system_name: string
        }[]
      }
      compute_system_gates: {
        Args: { p_system_id: string }
        Returns: {
          approval: Json
          approval_roles: string[]
          computed_level: string
          cosign_roles: string[]
          criteria: Json
          gate_code: string
          gate_id: string
          gate_name: string
          gate_order: number
          gate_phase_id: string
          required_signatures: string[]
          requires_previous: boolean
          status: string
        }[]
      }
      compute_system_gates_upto: {
        Args: { p_max_order: number; p_system_id: string }
        Returns: {
          approval: Json
          approval_roles: string[]
          computed_level: string
          cosign_roles: string[]
          criteria: Json
          gate_code: string
          gate_id: string
          gate_name: string
          gate_order: number
          gate_phase_id: string
          required_signatures: string[]
          requires_previous: boolean
          status: string
        }[]
      }
      compute_system_progress: {
        Args: { p_system_id: string }
        Returns: {
          approved: boolean
          gate_code: string
          gate_id: string
          gate_order: number
          itr_approved: number
          itr_total: number
          pct: number
          phase_id: string
          weight: number
        }[]
      }
      compute_system_readiness: {
        Args: { p_system_id: string }
        Returns: {
          blockers: Json
          cat_b_limit: number
          gates: Json
          itr_approved: number
          itr_pct: number
          itr_total: number
          open_punches_a: number
          open_punches_b: number
          open_punches_c: number
          system_id: string
        }[]
      }
      configure_register_type: {
        Args: {
          p_blocks_gate_id: string
          p_is_active: boolean
          p_type_id: string
        }
        Returns: undefined
      }
      copy_procedure: {
        Args: { p_source_procedure_id: string; p_target_project_id: string }
        Returns: string
      }
      create_action: {
        Args: {
          p_description?: string
          p_due_date?: string
          p_owner_id: string
          p_priority?: string
          p_project_id: string
          p_source_id?: string
          p_source_kind?: string
          p_source_ref?: string
          p_system_id?: string
          p_title: string
          p_verification_method?: string
        }
        Returns: string
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
      create_ce_matrix_from_review: {
        Args: { p_causes: Json; p_effects: Json; p_links: Json; p_matrix: Json }
        Returns: string
      }
      create_constraint: {
        Args: {
          p_description: string
          p_gate_id?: string
          p_impact?: string
          p_impact_kind: string
          p_level?: number
          p_need_date: string
          p_owner_id: string
          p_project_id: string
          p_recovery_plan?: string
          p_system_id: string
          p_title: string
        }
        Returns: string
      }
      create_daily_report_draft: {
        Args: { p_area_id?: string; p_date?: string; p_project_id: string }
        Returns: string
      }
      create_itr: {
        Args: {
          p_assignments: Json
          p_ce_cause_id?: string
          p_id: string
          p_itr_number: string
          p_loop_id?: string
          p_project_id: string
          p_scheduled_date?: string
          p_subsystem_id: string
          p_tag_id: string
          p_template_id: string
        }
        Returns: Json
      }
      create_itr_template_revision: {
        Args: { p_template_id: string }
        Returns: string
      }
      create_lineup_sheet: {
        Args: {
          p_generate?: boolean
          p_procedure_id?: string
          p_project_id: string
          p_purpose?: string
          p_system_id: string
          p_title: string
        }
        Returns: string
      }
      create_performance_test: {
        Args: {
          p_primary_system_id: string
          p_project_id: string
          p_title: string
        }
        Returns: string
      }
      create_pid_redline: {
        Args: {
          p_description: string
          p_marks: Json
          p_page_height: number
          p_page_num: number
          p_page_rotation: number
          p_page_width: number
          p_revision_id: string
          p_system_id?: string
          p_tag_id?: string
        }
        Returns: Json
      }
      create_procedure: {
        Args: {
          p_kind?: string
          p_project_id: string
          p_system_id?: string
          p_title: string
        }
        Returns: string
      }
      create_register_item: {
        Args: {
          p_data?: Json
          p_description?: string
          p_kind: string
          p_owner_id?: string
          p_project_id: string
          p_system_id?: string
          p_tags?: Json
          p_title: string
        }
        Returns: string
      }
      create_tq: {
        Args: {
          p_addressed_to?: string
          p_addressed_to_name?: string
          p_discipline_id?: string
          p_project_id: string
          p_question: string
          p_required_by?: string
          p_subject: string
          p_system_id?: string
          p_tag_ids?: string[]
        }
        Returns: string
      }
      create_vendor_retest: {
        Args: { p_activity_id: string; p_planned_date?: string }
        Returns: string
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
      daily_report_data: {
        Args: { p_area_id?: string; p_date?: string; p_project_id: string }
        Returns: Json
      }
      daily_report_hash: {
        Args: { r: Database["public"]["Tables"]["daily_reports"]["Row"] }
        Returns: string
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
      decide_tag_itr_ai_proposal: {
        Args: { p_decision: string; p_proposal_id: string }
        Returns: Json
      }
      decide_vendor_recommendation: {
        Args: {
          p_decision: string
          p_id: string
          p_reason: string
          p_requires_moc: boolean
        }
        Returns: undefined
      }
      delete_critical_spare: {
        Args: { p_spare_id: string }
        Returns: undefined
      }
      delete_daily_report_draft: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      delete_lineup_sheet_draft: {
        Args: { p_sheet_id: string }
        Returns: undefined
      }
      delete_mgmt_item: {
        Args: { p_entity_id: string; p_entity_kind: string }
        Returns: undefined
      }
      delete_performance_manual_reading: {
        Args: { p_bucket: string; p_run_id: string; p_variable_id: string }
        Returns: undefined
      }
      delete_performance_test_draft: {
        Args: { p_test_id: string }
        Returns: undefined
      }
      delete_procedure_draft: {
        Args: { p_procedure_id: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_register_item: { Args: { p_item_id: string }; Returns: undefined }
      delete_shift_handover_draft: {
        Args: { p_handover_id: string }
        Returns: undefined
      }
      delete_webhook_subscription: {
        Args: { p_sub_id: string }
        Returns: undefined
      }
      demobilize_vendor_package: {
        Args: { p_note?: string; p_package_id: string }
        Returns: undefined
      }
      document_check_refs: {
        Args: {
          p_company_id: string
          p_discipline_id: string
          p_project_id: string
          p_systems: string[]
        }
        Returns: undefined
      }
      document_is_controller: { Args: { p_role: string }; Returns: boolean }
      document_key: { Args: { p_text: string }; Returns: string }
      document_reference_target: {
        Args: { p_kind: string; p_target_id: string }
        Returns: Record<string, unknown>
      }
      document_references_blocker: {
        Args: { p_kind: string; p_target_id: string }
        Returns: string
      }
      document_refresh_current: {
        Args: { p_document_id: string }
        Returns: string
      }
      document_status_controlled: {
        Args: { p_status: string }
        Returns: boolean
      }
      end_performance_disturbance: {
        Args: { p_disturbance_id: string; p_ended_at?: string }
        Returns: undefined
      }
      ensure_register_types: { Args: { p_org_id: string }; Returns: undefined }
      ensure_signal_sample_partitions: {
        Args: { p_months_ahead?: number }
        Returns: number
      }
      escalate_constraint: {
        Args: { p_constraint_id: string; p_level: number; p_reason: string }
        Returns: undefined
      }
      evaluate_itr_capture: { Args: { p_itr_id: string }; Returns: Json }
      evaluate_itr_continuity: { Args: { p_value: string }; Returns: Json }
      evaluate_itr_table:
        | { Args: { p_options: Json; p_value: string }; Returns: Json }
        | {
            Args: { p_options: Json; p_source_count: number; p_value: string }
            Returns: Json
          }
      evaluate_performance_run: { Args: { p_run_id: string }; Returns: Json }
      evaluate_signal_rules_for_batch: {
        Args: { p_batch_id: string }
        Returns: number
      }
      field_verify_procedure_revision: {
        Args: { p_note: string; p_revision_id: string }
        Returns: undefined
      }
      finalize_preservation_record: {
        Args: {
          p_punch_category?: Database["public"]["Enums"]["punch_category"]
          p_record_id: string
          p_remarks?: string
          p_result: Database["public"]["Enums"]["preservation_result"]
        }
        Returns: Json
      }
      function_definition_md5: {
        Args: { p_signatures: string[] }
        Returns: {
          md5: string
          signature: string
        }[]
      }
      gate_approvers: {
        Args: { p_gate_id: string; p_project_id: string }
        Returns: string[]
      }
      gate_conditions_create_actions: {
        Args: { p_approval_id: string }
        Returns: number
      }
      gate_cosigners: {
        Args: { p_capacity: string; p_gate_id: string; p_project_id: string }
        Returns: string[]
      }
      gate_plan_context: {
        Args: { p_gate_id: string; p_system_id: string }
        Returns: Record<string, unknown>
      }
      gate_status_audit: { Args: { p_project_id: string }; Returns: Json }
      gate_status_compute: { Args: { p_system_id: string }; Returns: Json }
      gate_status_mark: { Args: { p_system_ids: string[] }; Returns: undefined }
      gate_status_refresh_dirty: { Args: never; Returns: number }
      gate_status_systems: {
        Args: { p_rows: Json; p_table: string }
        Returns: string[]
      }
      generate_handover_package: {
        Args: { p_project_id: string; p_system_ids?: string[] }
        Returns: Json
      }
      generate_itrs: {
        Args: {
          p_assign?: Json
          p_limit?: number
          p_phase_ids: string[]
          p_project_id: string
          p_subsystem_ids?: string[]
          p_system_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      generate_punch_number: { Args: { p_project_id: string }; Returns: string }
      get_my_editor_project_ids: { Args: never; Returns: string[] }
      get_my_field_project_ids: { Args: never; Returns: string[] }
      get_my_org_ids: { Args: never; Returns: string[] }
      get_my_project_ids: { Args: never; Returns: string[] }
      get_org_member_emails: {
        Args: { p_org_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      hand_over_shift: { Args: { p_handover_id: string }; Returns: undefined }
      handover_hash: {
        Args: { h: Database["public"]["Tables"]["shift_handovers"]["Row"] }
        Returns: string
      }
      handover_snapshot: { Args: { p_project_id: string }; Returns: Json }
      has_capacity: {
        Args: { p_capacity: string; p_project_id: string; p_user_id?: string }
        Returns: boolean
      }
      hold_release_roles: { Args: { p_capacity: string }; Returns: string[] }
      implement_vendor_recommendation: {
        Args: { p_id: string; p_moc_reference: string; p_note: string }
        Returns: undefined
      }
      incorporate_pid_redlines: {
        Args: { p_incorporate?: string[]; p_revision_id: string }
        Returns: Json
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
          p_project_id?: string
          p_samples: Json
          p_source: string
          p_source_system: string
          p_upsert?: boolean
        }
        Returns: Json
      }
      is_catalog_org: { Args: { target_org_id: string }; Returns: boolean }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_editor: { Args: { p_org_id: string }; Returns: boolean }
      is_org_privileged: { Args: { p_org_id: string }; Returns: boolean }
      is_project_editor: { Args: { p_project_id: string }; Returns: boolean }
      is_project_field_member: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      issue_certificate: {
        Args: {
          p_exceptions?: Json
          p_notes?: string
          p_phase_id: string
          p_subsystem_id: string
        }
        Returns: string
      }
      issue_daily_report: { Args: { p_report_id: string }; Returns: string }
      issue_document_revision: {
        Args: { p_issued_on?: string; p_revision_id: string; p_status: string }
        Returns: undefined
      }
      issue_lineup_sheet: { Args: { p_sheet_id: string }; Returns: undefined }
      issue_performance_certificate: {
        Args: { p_run_id: string }
        Returns: string
      }
      itr_cause_source_rows: { Args: { p_cause_id: string }; Returns: Json }
      itr_generation_candidates: {
        Args: {
          p_phase_ids: string[]
          p_project_id: string
          p_subsystem_ids?: string[]
          p_system_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          discipline_id: string
          equipment_type_id: string
          origin: string
          outcome: string
          phase_id: string
          subsystem_id: string
          tag_id: string
          tag_number: string
          template_code: string
          template_id: string
          template_title: string
        }[]
      }
      itr_generation_summary: {
        Args: {
          p_phase_ids: string[]
          p_project_id: string
          p_subsystem_ids?: string[]
          p_system_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: Json
      }
      itr_loop_source_rows: { Args: { p_loop_id: string }; Returns: Json }
      itr_option_outcomes_valid: {
        Args: { p_options: Json; p_outcomes: Json }
        Returns: boolean
      }
      itr_signing_roles: { Args: { p_roles: string[] }; Returns: string[] }
      itr_status_counts: {
        Args: { p_org_id?: string; p_project_id?: string }
        Returns: {
          n: number
          status: Database["public"]["Enums"]["itr_status"]
        }[]
      }
      itr_table_config_valid: { Args: { p_options: Json }; Returns: boolean }
      itr_table_deviation: {
        Args: { p_formula: Json; p_observed: number; p_reference: number }
        Returns: number
      }
      itr_test_equipment_blocker: {
        Args: { p_itr_id: string }
        Returns: string
      }
      lineup_is_stale: { Args: { p_sheet_id: string }; Returns: boolean }
      link_register_items: {
        Args: { p_item_id: string; p_link?: boolean; p_linked_item_id: string }
        Returns: undefined
      }
      link_transfer_handover: {
        Args: { p_package_id: string; p_transfer_id: string }
        Returns: undefined
      }
      list_catalog_template_updates: {
        Args: { p_org_id: string }
        Returns: {
          catalog_org_id: string
          catalog_org_name: string
          catalog_template_id: string
          catalog_version: number
          code: string
          local_version: number
          source_template_id: string
          source_version: number
          template_id: string
        }[]
      }
      log_procedure_run_event: {
        Args: {
          p_comment: string
          p_field_at: string
          p_kind: string
          p_step_id: string
          r: Database["public"]["Tables"]["procedure_runs"]["Row"]
        }
        Returns: undefined
      }
      log_sync_conflict: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_local_payload: Json
          p_local_ts: string
          p_notes: string
          p_project_id?: string
          p_remote_payload: Json
          p_remote_ts: string
          p_winner: string
        }
        Returns: string
      }
      member_caller_role: { Args: { p_org_id: string }; Returns: string }
      member_company_name: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: string
      }
      mgmt_check_refs: {
        Args: {
          p_discipline_id?: string
          p_gate_id?: string
          p_org_id: string
          p_owner_id: string
          p_project_id: string
          p_system_id: string
        }
        Returns: undefined
      }
      mgmt_check_source: {
        Args: { p_kind: string; p_project_id: string; p_source_id: string }
        Returns: undefined
      }
      mgmt_log: {
        Args: {
          p_action: string
          p_comment?: string
          p_from?: string
          p_id: string
          p_kind: string
          p_org: string
          p_project: string
          p_to?: string
        }
        Returns: undefined
      }
      mgmt_next_seq: {
        Args: { p_project_id: string; p_table: string }
        Returns: number
      }
      mgmt_text: { Args: { p_max?: number; p_value: string }; Returns: string }
      milestone_witness_capacity: {
        Args: { p_milestone: string }
        Returns: string
      }
      mobilize_vendor_package: {
        Args: { p_note?: string; p_package_id: string }
        Returns: undefined
      }
      move_tag_subsystem: {
        Args: { p_reason: string; p_subsystem_id: string; p_tag_id: string }
        Returns: Json
      }
      my_capacities: {
        Args: { p_project_id: string }
        Returns: {
          allowed: boolean
          capacity: string
          designated: boolean
        }[]
      }
      my_readiness_items: {
        Args: { p_org_id: string }
        Returns: {
          entity_id: string
          project_id: string
          queue: string
          ref: string
          since: string
          system_code: string
          system_id: string
          title: string
        }[]
      }
      my_work_counts: { Args: { p_org_id: string }; Returns: Json }
      new_performance_revision: {
        Args: { p_reason: string; p_test_id: string }
        Returns: string
      }
      new_procedure_revision: {
        Args: { p_procedure_id: string; p_reason: string }
        Returns: string
      }
      next_punch_number_atomic: {
        Args: { p_project_id: string }
        Returns: string
      }
      notify_constraints_overdue: { Args: never; Returns: Json }
      notify_preservation_overdue: { Args: never; Returns: Json }
      notify_pssr_reviews_overdue: { Args: never; Returns: Json }
      notify_registers_overdue: { Args: never; Returns: Json }
      notify_users: {
        Args: {
          p_body: string
          p_dedupe_key?: string
          p_kind: string
          p_link: string
          p_org_id: string
          p_payload?: Json
          p_title: string
          p_users: string[]
        }
        Returns: number
      }
      open_shift_handover: {
        Args: {
          p_project_id: string
          p_shift_date?: string
          p_shift_label?: string
        }
        Returns: string
      }
      org_ai_budget: { Args: { p_org_id: string }; Returns: number }
      org_caller_role: { Args: { p_org_id: string }; Returns: string }
      org_cat_b_limit: { Args: { p_org_id: string }; Returns: number }
      org_document_policy: { Args: { p_org_id: string }; Returns: string }
      org_gate_policy: { Args: { p_org_id: string }; Returns: Json }
      org_last_active_owner: { Args: { p_member_id: string }; Returns: boolean }
      org_transfer_non_dispensable: {
        Args: { p_org_id: string }
        Returns: string[]
      }
      outbox_dispatch: { Args: { p_limit?: number }; Returns: Json }
      ownership_check_keys: { Args: never; Returns: string[] }
      ownership_checklist: {
        Args: { p_system_id: string; p_to_stage: string }
        Returns: Json
      }
      ownership_stage_index: { Args: { p_stage: string }; Returns: number }
      performance_check_at: {
        Args: { p_at: string; p_floor: string }
        Returns: string
      }
      performance_compute_evaluation: {
        Args: { p_run_id: string }
        Returns: Json
      }
      performance_evaluate_core: {
        Args: { p_ignore_exclusions: boolean; p_run_id: string }
        Returns: Json
      }
      performance_freeze_run: { Args: { p_run_id: string }; Returns: number }
      performance_is_lead: { Args: { p_role: string }; Returns: boolean }
      performance_revision_hash: {
        Args: { p_revision_id: string }
        Returns: string
      }
      performance_section_keys: { Args: never; Returns: string[] }
      performance_write_content: {
        Args: {
          p_content: Json
          r: Database["public"]["Tables"]["performance_test_revisions"]["Row"]
        }
        Returns: undefined
      }
      person_name_key: { Args: { p_name: string }; Returns: string }
      person_system_level: {
        Args: { p_person_id: string; p_system_id: string }
        Returns: number
      }
      pid_markup_points_ok: {
        Args: { p_kind: string; p_points: Json }
        Returns: boolean
      }
      pid_redline_marks_ok: { Args: { p_marks: Json }; Returns: boolean }
      preservation_due_counts: {
        Args: { p_days?: number; p_project_ids: string[] }
        Returns: {
          active: number
          due_soon: number
          overdue: number
          project_id: string
        }[]
      }
      preservation_is_overdue: {
        Args: {
          p_next_due: string
          p_ref?: string
          p_status: Database["public"]["Enums"]["preservation_plan_status"]
        }
        Returns: boolean
      }
      procedure_revision_hash: {
        Args: { p_revision_id: string }
        Returns: string
      }
      procedure_section_keys: { Args: never; Returns: string[] }
      procedure_write_content: {
        Args: {
          p_sections: Json
          p_steps: Json
          r: Database["public"]["Tables"]["procedure_revisions"]["Row"]
        }
        Returns: undefined
      }
      profile_full_name: { Args: { p_user_id: string }; Returns: string }
      project_cert_counts: {
        Args: { p_org_id?: string; p_project_id?: string }
        Returns: {
          n: number
          project_id: string
          status: Database["public"]["Enums"]["certificate_status"]
        }[]
      }
      project_discipline_scope: {
        Args: { p_project_id: string }
        Returns: {
          code: string
          color: string
          discipline_id: string
          included: boolean
          itrs: number
          name: string
          requirements: number
        }[]
      }
      project_itr_phase_counts: {
        Args: { p_org_id?: string; p_project_id?: string }
        Returns: {
          n: number
          phase_id: string
          project_id: string
          status: Database["public"]["Enums"]["itr_status"]
        }[]
      }
      project_punch_counts: {
        Args: { p_org_id?: string; p_project_id?: string }
        Returns: {
          category: Database["public"]["Enums"]["punch_category"]
          n: number
          project_id: string
          status: Database["public"]["Enums"]["punch_status"]
        }[]
      }
      project_role_members: {
        Args: { p_project_id: string; p_roles: string[] }
        Returns: string[]
      }
      project_timezone: { Args: { p_project_id: string }; Returns: string }
      project_today: { Args: { p_project_id: string }; Returns: string }
      propose_vendor_recommendation: {
        Args: {
          p_description: string
          p_package_id: string
          p_rationale: string
          p_requires_moc: boolean
        }
        Returns: string
      }
      pssr_items_pending: { Args: { p_review_id: string }; Returns: number }
      pssr_punch_blocker: { Args: { p_review_id: string }; Returns: string }
      punch_caller_role: {
        Args: { p_punch: Database["public"]["Tables"]["punches"]["Row"] }
        Returns: string
      }
      punch_log: {
        Args: {
          p_action: string
          p_payload: Json
          p_punch: Database["public"]["Tables"]["punches"]["Row"]
        }
        Returns: undefined
      }
      punch_summary_counts: {
        Args: { p_org_id?: string; p_project_id?: string }
        Returns: {
          category: Database["public"]["Enums"]["punch_category"]
          n: number
          status: Database["public"]["Enums"]["punch_status"]
        }[]
      }
      record_competency: {
        Args: {
          p_assessed_at?: string
          p_evidence?: string
          p_evidence_kind?: string
          p_expires_at?: string
          p_level: number
          p_person_id: string
          p_system_id: string
        }
        Returns: string
      }
      record_decision: {
        Args: {
          p_attendees?: string
          p_context?: string
          p_decided_at?: string
          p_decided_by?: string
          p_decision: string
          p_project_id: string
          p_rationale?: string
          p_source_id?: string
          p_source_kind?: string
          p_source_ref?: string
          p_supersede_reason?: string
          p_supersedes_id?: string
          p_system_id?: string
          p_title: string
        }
        Returns: string
      }
      record_performance_disturbance: {
        Args: {
          p_description: string
          p_ended_at?: string
          p_kind: string
          p_run_id: string
          p_started_at: string
        }
        Returns: string
      }
      record_performance_result: {
        Args: { p_reason?: string; p_result: string; p_run_id: string }
        Returns: string
      }
      record_startup_event: {
        Args: {
          p_backdate_reason?: string
          p_code: string
          p_description?: string
          p_kind: string
          p_manual?: Json
          p_occurred_at: string
          p_project_id: string
          p_run_id?: string
          p_signal_ids?: string[]
          p_system_id: string
          p_tag_ids?: string[]
          p_title: string
        }
        Returns: string
      }
      record_vendor_activity_result: {
        Args: {
          p_activity_id: string
          p_notes?: string
          p_performed_on: string
          p_result: string
        }
        Returns: undefined
      }
      reference_document_in_open_itrs: {
        Args: { p_document_id: string; p_system_ids?: string[] }
        Returns: number
      }
      refreeze_performance_run: { Args: { p_run_id: string }; Returns: number }
      refresh_certificate_block: {
        Args: { p_certificate_id: string }
        Returns: undefined
      }
      refresh_certificates_for: {
        Args: { p_phase_id?: string; p_subsystem_id: string }
        Returns: undefined
      }
      refresh_daily_report_data: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      refresh_itr_status: { Args: { p_itr_id: string }; Returns: Json }
      register_caller_role: { Args: { p_project_id: string }; Returns: string }
      register_required_fields: {
        Args: { p_kind: string; p_status: string }
        Returns: string[]
      }
      register_set_tags: {
        Args: { p_item_id: string; p_project_id: string; p_tags: Json }
        Returns: undefined
      }
      reject_itr_suggestion: {
        Args: { p_note?: string; p_suggestion_id: string }
        Returns: string
      }
      reject_pssr: {
        Args: { p_reason: string; p_review_id: string }
        Returns: undefined
      }
      release_hold_point: {
        Args: { p_comment?: string; p_run_id: string; p_step_id: string }
        Returns: undefined
      }
      remove_certificate_exception: {
        Args: { p_exception_id: string }
        Returns: undefined
      }
      remove_document_reference: {
        Args: { p_reference_id: string }
        Returns: undefined
      }
      remove_org_member: { Args: { p_member_id: string }; Returns: undefined }
      reopen_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      reopen_itr_atomic: {
        Args: { p_itr_id: string; p_reason: string }
        Returns: Json
      }
      replace_daily_report_ai_draft: {
        Args: { p_draft: Json; p_model: string; p_report_id: string }
        Returns: undefined
      }
      request_ownership_transfer: {
        Args: {
          p_exceptions?: Json
          p_reason?: string
          p_system_id: string
          p_to_stage: string
        }
        Returns: string
      }
      resolve_punch: {
        Args: { p_comment: string; p_punch_id: string }
        Returns: undefined
      }
      respond_org_invitation: {
        Args: { p_accept: boolean; p_org_id: string }
        Returns: undefined
      }
      return_itr_to_executor: {
        Args: { p_itr_id: string; p_reason: string }
        Returns: Json
      }
      revalidate_document_references: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      review_pid_redline: {
        Args: { p_accept: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      review_punch_category: {
        Args: {
          p_category: Database["public"]["Enums"]["punch_category"]
          p_note?: string
          p_punch_id: string
        }
        Returns: undefined
      }
      revise_daily_report: {
        Args: { p_reason: string; p_report_id: string }
        Returns: string
      }
      revoke_api_key: { Args: { p_key_id: string }; Returns: undefined }
      revoke_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: Json
      }
      revoke_gate_attestation: {
        Args: { p_attestation_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_performance_certificate: {
        Args: { p_certificate_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_project_capacity: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_system_gate_approval: {
        Args: { p_approval_id: string; p_reason: string }
        Returns: undefined
      }
      save_company: {
        Args: {
          p_id: string
          p_is_active: boolean
          p_kind: string
          p_name: string
          p_notes: string
          p_org_id: string
          p_short_name: string
          p_tax_id: string
        }
        Returns: string
      }
      save_document: {
        Args: {
          p_company_id: string
          p_discipline_id: string
          p_doc_type: string
          p_id: string
          p_number: string
          p_project_id: string
          p_systems: string[]
          p_title: string
        }
        Returns: string
      }
      save_lineup_items: {
        Args: { p_items: Json; p_sheet_id: string }
        Returns: undefined
      }
      save_performance_revision: {
        Args: {
          p_change_reason?: string
          p_content: Json
          p_revision_id: string
        }
        Returns: undefined
      }
      save_preservation_response: {
        Args: {
          p_is_passed?: boolean
          p_item_id: string
          p_record_id: string
          p_value_bool?: boolean
          p_value_numeric?: number
          p_value_text?: string
        }
        Returns: undefined
      }
      save_procedure_revision: {
        Args: {
          p_change_reason?: string
          p_revision_id: string
          p_sections: Json
          p_steps: Json
        }
        Returns: undefined
      }
      save_vendor_activity: {
        Args: {
          p_id: string
          p_kind: string
          p_location: string
          p_notes: string
          p_package_id: string
          p_planned_date: string
          p_title: string
        }
        Returns: string
      }
      save_vendor_interface: {
        Args: {
          p_counterpart: string
          p_counterpart_company_id: string
          p_description: string
          p_id: string
          p_package_id: string
          p_responsible: string
          p_status: string
        }
        Returns: string
      }
      save_vendor_package: {
        Args: {
          p_boundaries: string
          p_company_id: string
          p_id: string
          p_mob_gate_id: string
          p_mob_system_id: string
          p_planned_mobilization: string
          p_project_id: string
          p_scope: string
          p_systems: string[]
          p_tags: string[]
          p_title: string
        }
        Returns: string
      }
      search_everything: {
        Args: {
          p_limit?: number
          p_org_id: string
          p_project_id?: string
          p_q: string
        }
        Returns: {
          extra_id: string
          id: string
          kind: string
          project_id: string
          rank: number
          ref: string
          title: string
        }[]
      }
      seed_default_gate_for_phase: {
        Args: { p_phase_id: string }
        Returns: string
      }
      set_competency_target: {
        Args: { p_required: number; p_system_id: string }
        Returns: undefined
      }
      set_daily_report_ai_draft: {
        Args: { p_draft: Json; p_model: string; p_report_id: string }
        Returns: undefined
      }
      set_gate_commitment: {
        Args: {
          p_date: string
          p_gate_id: string
          p_reason?: string
          p_system_id: string
        }
        Returns: undefined
      }
      set_gate_forecast: {
        Args: {
          p_date: string
          p_gate_id: string
          p_note?: string
          p_system_id: string
        }
        Returns: undefined
      }
      set_gate_weights: {
        Args: { p_org_id: string; p_weights: Json }
        Returns: undefined
      }
      set_lineup_item: {
        Args: {
          p_as_found?: string
          p_captured_at?: string
          p_check_expected?: boolean
          p_expected_set_at?: string
          p_expected_verified_at?: string
          p_found: string
          p_item_id: string
          p_lock_number?: string
          p_remarks?: string
          p_seal_number?: string
        }
        Returns: string
      }
      set_member_access: {
        Args: {
          p_expires_at?: string
          p_member_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      set_member_company: {
        Args: { p_company_id: string; p_org_id: string; p_user_id: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_member_id: string; p_role: string }
        Returns: undefined
      }
      set_performance_disturbance_exclusion: {
        Args: {
          p_disturbance_id: string
          p_excluded: boolean
          p_reason: string
        }
        Returns: undefined
      }
      set_project_disciplines: {
        Args: {
          p_discipline_ids: string[]
          p_project_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_tag_itr_override: {
        Args: {
          p_action: string
          p_reason?: string
          p_tag_id: string
          p_template_code: string
        }
        Returns: undefined
      }
      set_template_client_codes: {
        Args: { p_codes: Json; p_level: string; p_project_id: string }
        Returns: number
      }
      set_vendor_checklist_item: {
        Args: {
          p_done: boolean
          p_key: string
          p_note: string
          p_package_id: string
          p_phase: string
        }
        Returns: undefined
      }
      set_webhook_enabled: {
        Args: { p_enabled: boolean; p_sub_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_certificate: {
        Args: {
          p_certificate_id: string
          p_comments?: string
          p_role: string
          p_signature_image?: string
        }
        Returns: Json
      }
      sign_itr_atomic: {
        Args: { p_itr_id: string; p_role: string; p_signature_image?: string }
        Returns: Json
      }
      sign_ownership_transfer: {
        Args: {
          p_acknowledged?: string[]
          p_capacity: string
          p_transfer_id: string
        }
        Returns: string
      }
      sign_performance_certificate: {
        Args: { p_capacity: string; p_certificate_id: string }
        Returns: string
      }
      sign_pssr: {
        Args: {
          p_capacity: string
          p_review_id: string
          p_signature_data: string
        }
        Returns: string
      }
      sign_system_gate: {
        Args: { p_approval_id: string; p_capacity: string; p_comments?: string }
        Returns: string
      }
      signal_series: {
        Args: {
          p_bucket_s?: number
          p_from: string
          p_max_points?: number
          p_signal_ids: string[]
          p_to: string
        }
        Returns: {
          avg_val: number
          bucket: string
          max_val: number
          min_val: number
          sample_count: number
          signal_id: string
        }[]
      }
      start_performance_run: { Args: { p_test_id: string }; Returns: string }
      start_preservation_record: {
        Args: { p_plan_id: string }
        Returns: string
      }
      start_procedure_run: {
        Args: { p_procedure_id: string; p_system_id?: string }
        Returns: string
      }
      startup_field_time: {
        Args: { p_captured_at: string; p_floor: string }
        Returns: string
      }
      startup_prerequisites: { Args: { p_system_id: string }; Returns: Json }
      startup_snapshot_param: {
        Args: {
          p_at: string
          p_event_id: string
          p_project_id: string
          p_signal_id: string
        }
        Returns: undefined
      }
      storage_document_uploader: { Args: { p_name: string }; Returns: boolean }
      storage_object_in_my_project: {
        Args: { p_bucket: string; p_name: string }
        Returns: boolean
      }
      submit_pssr: { Args: { p_review_id: string }; Returns: undefined }
      subsystem_phase_itr_counts: {
        Args: { p_project_id: string }
        Returns: {
          itr_approved: number
          itr_total: number
          phase_id: string
          subsystem_id: string
        }[]
      }
      subsystem_rollup: {
        Args: { p_project_id: string }
        Returns: {
          itr_approved: number
          itr_total: number
          open_punches_a: number
          open_punches_b: number
          open_punches_c: number
          subsystem_id: string
          tag_count: number
        }[]
      }
      system_open_punches: {
        Args: { p_project_id: string }
        Returns: {
          open_a: number
          open_b: number
          system_id: string
        }[]
      }
      system_palette: { Args: never; Returns: string[] }
      system_phase_level: {
        Args: {
          p_limit: number
          p_phase_id: string
          p_punches_before?: string
          p_system_id: string
        }
        Returns: Json
      }
      system_pid_sheets: { Args: { p_system_id: string }; Returns: Json }
      system_pssr_status: { Args: { p_system_id: string }; Returns: Json }
      system_staffing: {
        Args: { p_level: number; p_system_id: string }
        Returns: Json
      }
      tag_ai_signatures: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_project_id: string
          p_status?: string
        }
        Returns: Json
      }
      tag_desc_norm: { Args: { p: string }; Returns: string }
      tag_discipline_counts: {
        Args: { p_project_id: string; p_subsystem_id?: string }
        Returns: {
          discipline_code: string
          discipline_color: string
          discipline_name: string
          n: number
        }[]
      }
      tag_itr_requirements: {
        Args: {
          p_project_id: string
          p_subsystem_ids?: string[]
          p_system_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          discipline_id: string
          itr_id: string
          itr_status: string
          origin: string
          phase_id: string
          reason: string
          state: string
          tag_id: string
          template_code: string
          template_title: string
        }[]
      }
      tag_itr_requirements_core: {
        Args: {
          p_project_id: string
          p_subsystem_ids?: string[]
          p_system_ids?: string[]
          p_tag_ids?: string[]
        }
        Returns: {
          discipline_id: string
          itr_id: string
          itr_status: string
          origin: string
          phase_id: string
          reason: string
          state: string
          tag_id: string
          template_code: string
          template_title: string
        }[]
      }
      tag_number_prefix: { Args: { p: string }; Returns: string }
      tag_requirements_audit: { Args: { p_project_id: string }; Returns: Json }
      tag_requirements_export: {
        Args: {
          p_area_id?: string
          p_limit?: number
          p_project_id: string
          p_subsystem_id?: string
          p_system_id?: string
        }
        Returns: Json
      }
      tag_requirements_mark_projects: {
        Args: { p_project_ids: string[] }
        Returns: undefined
      }
      tag_requirements_page: {
        Args: {
          p_area_id?: string
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_project_id: string
          p_q?: string
          p_subsystem_id?: string
          p_system_id?: string
        }
        Returns: Json
      }
      tag_requirements_rebuild: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      tag_requirements_rebuild_pending: { Args: never; Returns: number }
      tag_requirements_refresh: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      tag_requirements_summary: {
        Args: { p_project_id: string }
        Returns: Json
      }
      tag_subsystem_move_preview: {
        Args: { p_subsystem_id: string; p_tag_id: string }
        Returns: Json
      }
      tag_type_change_preview: {
        Args: { p_project_id: string; p_tag_ids: string[]; p_type_id: string }
        Returns: Json
      }
      tag_type_group_tags: {
        Args: {
          p_desc_norm: string
          p_discipline_id: string
          p_prefix: string
          p_project_id: string
        }
        Returns: string[]
      }
      tag_type_groups: { Args: { p_project_id: string }; Returns: Json }
      take_kpi_snapshot: {
        Args: { p_date?: string; p_project_id: string }
        Returns: Json
      }
      take_mgmt_snapshot: {
        Args: { p_date?: string; p_project_id: string }
        Returns: Json
      }
      template_client_codes_for: {
        Args: { p_project_id: string }
        Returns: {
          client_code: string
          source: string
          template_code: string
        }[]
      }
      tq_set_tags: {
        Args: { p_project_id: string; p_tag_ids: string[]; p_tq_id: string }
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
      transition_action: {
        Args: { p_action_id: string; p_comment?: string; p_to: string }
        Returns: string
      }
      transition_constraint: {
        Args: { p_comment?: string; p_constraint_id: string; p_to: string }
        Returns: string
      }
      transition_performance_revision: {
        Args: { p_comment?: string; p_revision_id: string; p_to: string }
        Returns: string
      }
      transition_procedure_revision: {
        Args: { p_comment?: string; p_revision_id: string; p_to: string }
        Returns: string
      }
      transition_procedure_run: {
        Args: {
          p_captured_at?: string
          p_comment?: string
          p_run_id: string
          p_to: string
        }
        Returns: string
      }
      transition_register_item: {
        Args: {
          p_comment?: string
          p_data?: Json
          p_item_id: string
          p_to: string
        }
        Returns: string
      }
      transition_tq: {
        Args: { p_comment?: string; p_to: string; p_tq_id: string }
        Returns: string
      }
      try_finite_double: { Args: { p: string }; Returns: number }
      try_timestamptz: { Args: { p: string }; Returns: string }
      tz_day_start: { Args: { p_date: string; p_tz: string }; Returns: string }
      tz_today: { Args: { p_tz: string }; Returns: string }
      unsign_certificate: {
        Args: { p_signature_id: string }
        Returns: undefined
      }
      unsign_pssr: { Args: { p_signature_id: string }; Returns: undefined }
      update_action: {
        Args: {
          p_action_id: string
          p_description: string
          p_due_date: string
          p_owner_id: string
          p_priority: string
          p_reason?: string
          p_source_ref?: string
          p_system_id: string
          p_title: string
          p_verification_method: string
        }
        Returns: undefined
      }
      update_constraint: {
        Args: {
          p_constraint_id: string
          p_description: string
          p_gate_id: string
          p_impact: string
          p_impact_kind: string
          p_need_date: string
          p_owner_id: string
          p_reason?: string
          p_recovery_plan: string
          p_system_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_daily_report_sections: {
        Args: { p_report_id: string; p_sections: Json }
        Returns: undefined
      }
      update_document_reference: {
        Args: { p_reason?: string; p_reference_id: string }
        Returns: undefined
      }
      update_performance_test: {
        Args: {
          p_primary_system_id: string
          p_test_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_pid_redline: {
        Args: {
          p_description: string
          p_id: string
          p_system_id?: string
          p_tag_id?: string
        }
        Returns: undefined
      }
      update_procedure: {
        Args: {
          p_kind: string
          p_procedure_id: string
          p_system_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_pssr_meta: {
        Args: {
          p_due: string
          p_notes: string
          p_review_id: string
          p_set_due: boolean
          p_set_notes: boolean
        }
        Returns: undefined
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
      update_register_item: {
        Args: {
          p_data: Json
          p_description: string
          p_item_id: string
          p_owner_id?: string
          p_system_id: string
          p_tags?: Json
          p_title: string
        }
        Returns: undefined
      }
      update_shift_handover: {
        Args: { p_handover_id: string; p_pending: string; p_safety: string }
        Returns: undefined
      }
      update_tq: {
        Args: {
          p_addressed_to: string
          p_addressed_to_name: string
          p_discipline_id: string
          p_question: string
          p_required_by: string
          p_subject: string
          p_system_id: string
          p_tag_ids?: string[]
          p_tq_id: string
        }
        Returns: undefined
      }
      upsert_critical_spare: {
        Args: {
          p_eta?: string
          p_is_critical?: boolean
          p_item: string
          p_kind?: string
          p_notes?: string
          p_part_number?: string
          p_project_id: string
          p_qty_available?: number
          p_qty_required?: number
          p_spare_id: string
          p_status?: string
          p_system_id: string
          p_tag_id?: string
        }
        Returns: string
      }
      upsert_ops_person: {
        Args: {
          p_active?: boolean
          p_company?: string
          p_full_name: string
          p_person_id: string
          p_position?: string
          p_project_id: string
          p_shift?: string
          p_user_id?: string
        }
        Returns: string
      }
      upsert_push_subscription: {
        Args: {
          p_auth_secret: string
          p_device_info: Json
          p_endpoint: string
          p_org_id?: string
          p_p256dh: string
          p_topics: string[]
        }
        Returns: string
      }
      user_in_project_org: { Args: { p_project_id: string }; Returns: boolean }
      vendor_checklist_keys: { Args: { p_phase: string }; Returns: string[] }
      vendor_demobilization_status: {
        Args: { p_package_id: string }
        Returns: Json
      }
      vendor_mobilization_status: {
        Args: { p_package_id: string }
        Returns: Json
      }
      vendor_package_for_write: {
        Args: { p_lead: boolean; p_package_id: string }
        Returns: Record<string, unknown>
      }
      verify_handover_package: { Args: { p_hash: string }; Returns: Json }
      verify_lineup_item: { Args: { p_item_id: string }; Returns: undefined }
      verify_punch: {
        Args: { p_accept: boolean; p_comment?: string; p_punch_id: string }
        Returns: undefined
      }
      void_competency_record: {
        Args: { p_reason: string; p_record_id: string }
        Returns: undefined
      }
      void_document_revision: {
        Args: { p_reason: string; p_revision_id: string }
        Returns: undefined
      }
      void_startup_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      withdraw_performance_test: {
        Args: { p_reason: string; p_test_id: string }
        Returns: undefined
      }
      witness_startup_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
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
        | "continuity"
        | "table"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "continuity",
        "table",
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
