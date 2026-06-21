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
      access_review_schedule: {
        Row: {
          id: string
          last_completed_at: string | null
          last_completed_by: string | null
          next_due_at: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          last_completed_at?: string | null
          last_completed_by?: string | null
          next_due_at: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          last_completed_at?: string | null
          last_completed_by?: string | null
          next_due_at?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          active_application_name: string | null
          active_window_title: string | null
          activity_percentage: number
          created_at: string
          id: string
          interval_end: string
          interval_start: string
          keystrokes_count: number
          mouse_clicks_count: number
          screenshot_path: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          active_application_name?: string | null
          active_window_title?: string | null
          activity_percentage?: number
          created_at?: string
          id?: string
          interval_end: string
          interval_start: string
          keystrokes_count?: number
          mouse_clicks_count?: number
          screenshot_path?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          active_application_name?: string | null
          active_window_title?: string | null
          activity_percentage?: number
          created_at?: string
          id?: string
          interval_end?: string
          interval_start?: string
          keystrokes_count?: number
          mouse_clicks_count?: number
          screenshot_path?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "productivity_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attendance_employee_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          raw_code: string
          raw_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          raw_code?: string
          raw_name?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          raw_code?: string
          raw_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_aliases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_entries: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          entry_date: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          entry_date: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          entry_date?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: []
      }
      attendance_import_mapping_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          mapping: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          mapping: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          mapping?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_import_row_errors: {
        Row: {
          created_at: string
          employee_name: string | null
          entry_date: string | null
          error_message: string
          id: string
          payload: Json
          row_index: number
          run_id: string
        }
        Insert: {
          created_at?: string
          employee_name?: string | null
          entry_date?: string | null
          error_message: string
          id?: string
          payload: Json
          row_index: number
          run_id: string
        }
        Update: {
          created_at?: string
          employee_name?: string | null
          entry_date?: string | null
          error_message?: string
          id?: string
          payload?: Json
          row_index?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_import_row_errors_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "attendance_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_import_runs: {
        Row: {
          created_by: string | null
          failed_rows: number
          file_name: string
          file_size: number | null
          finished_at: string | null
          id: string
          inserted_rows: number
          mapping: Json | null
          notes: string | null
          parent_run_id: string | null
          started_at: string
          status: string
          total_rows: number
        }
        Insert: {
          created_by?: string | null
          failed_rows?: number
          file_name: string
          file_size?: number | null
          finished_at?: string | null
          id?: string
          inserted_rows?: number
          mapping?: Json | null
          notes?: string | null
          parent_run_id?: string | null
          started_at?: string
          status?: string
          total_rows?: number
        }
        Update: {
          created_by?: string | null
          failed_rows?: number
          file_name?: string
          file_size?: number | null
          finished_at?: string | null
          id?: string
          inserted_rows?: number
          mapping?: Json | null
          notes?: string | null
          parent_run_id?: string | null
          started_at?: string
          status?: string
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_import_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "attendance_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          applied_settings_id: string | null
          auto_status: string
          created_at: string
          created_by: string | null
          day_of_week: string | null
          department: string | null
          designation: string | null
          early_by_minutes: number
          employee_code: string | null
          employee_name: string
          entry_date: string
          id: string
          import_batch_id: string | null
          import_run_id: string | null
          is_early_checkout: boolean
          is_late_arrival: boolean
          late_by_minutes: number
          matched_employee_id: string | null
          punch_in: string | null
          punch_out: string | null
          raw_break: string | null
          raw_status: string | null
          raw_total_hours: string | null
          total_minutes_in_office: number
        }
        Insert: {
          applied_settings_id?: string | null
          auto_status?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: string | null
          department?: string | null
          designation?: string | null
          early_by_minutes?: number
          employee_code?: string | null
          employee_name: string
          entry_date: string
          id?: string
          import_batch_id?: string | null
          import_run_id?: string | null
          is_early_checkout?: boolean
          is_late_arrival?: boolean
          late_by_minutes?: number
          matched_employee_id?: string | null
          punch_in?: string | null
          punch_out?: string | null
          raw_break?: string | null
          raw_status?: string | null
          raw_total_hours?: string | null
          total_minutes_in_office?: number
        }
        Update: {
          applied_settings_id?: string | null
          auto_status?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: string | null
          department?: string | null
          designation?: string | null
          early_by_minutes?: number
          employee_code?: string | null
          employee_name?: string
          entry_date?: string
          id?: string
          import_batch_id?: string | null
          import_run_id?: string | null
          is_early_checkout?: boolean
          is_late_arrival?: boolean
          late_by_minutes?: number
          matched_employee_id?: string | null
          punch_in?: string | null
          punch_out?: string | null
          raw_break?: string | null
          raw_status?: string | null
          raw_total_hours?: string | null
          total_minutes_in_office?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_applied_settings_id_fkey"
            columns: ["applied_settings_id"]
            isOneToOne: false
            referencedRelation: "company_hr_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "attendance_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          id: string
          ip: unknown
          occurred_at: string
          reason: string | null
          request_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          ip?: unknown
          occurred_at?: string
          reason?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          ip?: unknown
          occurred_at?: string
          reason?: string | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          id: number
          identifier: string
          ip: unknown
          kind: string
          occurred_at: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          id?: number
          identifier: string
          ip?: unknown
          kind: string
          occurred_at?: string
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          id?: number
          identifier?: string
          ip?: unknown
          kind?: string
          occurred_at?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      campaign_tasks: {
        Row: {
          assignee_id: string | null
          campaign_id: string
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          campaign_id: string
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          campaign_id?: string
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      categorisation_config: {
        Row: {
          allow_multi_segment: boolean
          auto_post_ledger: boolean
          country_code: string
          created_at: string
          display_name: string
          doc_type: string
          gemini_bootstrap_done: boolean
          gemini_enabled: boolean
          gemini_sample_target: number
          highlight_color: string
          id: string
          is_active: boolean
          mapped_category: string
          min_confidence: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_multi_segment?: boolean
          auto_post_ledger?: boolean
          country_code?: string
          created_at?: string
          display_name: string
          doc_type: string
          gemini_bootstrap_done?: boolean
          gemini_enabled?: boolean
          gemini_sample_target?: number
          highlight_color?: string
          id?: string
          is_active?: boolean
          mapped_category: string
          min_confidence?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_multi_segment?: boolean
          auto_post_ledger?: boolean
          country_code?: string
          created_at?: string
          display_name?: string
          doc_type?: string
          gemini_bootstrap_done?: boolean
          gemini_enabled?: boolean
          gemini_sample_target?: number
          highlight_color?: string
          id?: string
          is_active?: boolean
          mapped_category?: string
          min_confidence?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      categorisation_ml_model: {
        Row: {
          id: string
          is_active: boolean
          model_json: Json
          per_class_counts: Json
          sample_count: number
          trained_at: string
          vocab_size: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          model_json: Json
          per_class_counts?: Json
          sample_count?: number
          trained_at?: string
          vocab_size?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          model_json?: Json
          per_class_counts?: Json
          sample_count?: number
          trained_at?: string
          vocab_size?: number
        }
        Relationships: []
      }
      categorisation_rules: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          is_active: boolean
          priority: number
          signal_source: string
          signal_text: string
          signal_type: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          is_active?: boolean
          priority?: number
          signal_source?: string
          signal_text: string
          signal_type: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          is_active?: boolean
          priority?: number
          signal_source?: string
          signal_text?: string
          signal_type?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      chat_archive_state: {
        Row: {
          archived_at: string
          auto: boolean
          kind: string
          target_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          auto?: boolean
          kind: string
          target_id: string
          user_id?: string
        }
        Update: {
          archived_at?: string
          auto?: boolean
          kind?: string
          target_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          author_id: string
          body: string
          client_msg_id: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          pinned_at: string | null
          reply_to_message_id: string | null
          thread_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id: string
          body: string
          client_msg_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          pinned_at?: string | null
          reply_to_message_id?: string | null
          thread_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string
          body?: string
          client_msg_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          pinned_at?: string | null
          reply_to_message_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_presence: {
        Row: {
          last_seen_at: string
          status: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          status?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_thread_members: {
        Row: {
          joined_at: string
          last_read_at: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          last_read_at?: string | null
          role?: string
          thread_id: string
          user_id?: string
        }
        Update: {
          joined_at?: string
          last_read_at?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          dm_key: string | null
          id: string
          kind: string
          name: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          dm_key?: string | null
          id?: string
          kind: string
          name?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          dm_key?: string | null
          id?: string
          kind?: string
          name?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_entities: {
        Row: {
          client_id: string | null
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          identifier: string | null
          name: string
          project_id: string
          slug: string
          software: Database["public"]["Enums"]["software_type"][]
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          identifier?: string | null
          name: string
          project_id: string
          slug: string
          software?: Database["public"]["Enums"]["software_type"][]
        }
        Update: {
          client_id?: string | null
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          identifier?: string | null
          name?: string
          project_id?: string
          slug?: string
          software?: Database["public"]["Enums"]["software_type"][]
        }
        Relationships: [
          {
            foreignKeyName: "client_entities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_log: {
        Row: {
          component_stack: string | null
          created_at: string
          extra: Json | null
          id: string
          message: string | null
          name: string | null
          role: string | null
          route: string | null
          stack: string | null
          ua: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          extra?: Json | null
          id?: string
          message?: string | null
          name?: string | null
          role?: string | null
          route?: string | null
          stack?: string | null
          ua?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          extra?: Json | null
          id?: string
          message?: string | null
          name?: string | null
          role?: string | null
          route?: string | null
          stack?: string | null
          ua?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          is_archived: boolean
          kind: string
          name: string
          notes: string | null
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          is_archived?: boolean
          kind?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          is_archived?: boolean
          kind?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      company_hr_settings: {
        Row: {
          cl_carry_forward_max: number
          cl_opening_balance: number
          cl_quota: number
          created_at: string
          early_checkout_grace_minutes: number
          el_carry_forward_max: number
          el_opening_balance: number
          el_quota: number
          grace_period_minutes: number
          id: string
          is_active: boolean
          min_hours_full_day: number
          min_hours_half_day: number
          name: string | null
          opening_balance_date: string | null
          sl_carry_forward_max: number
          sl_opening_balance: number
          sl_quota: number
          standard_end_time: string
          standard_start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          early_checkout_grace_minutes?: number
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          grace_period_minutes?: number
          id?: string
          is_active?: boolean
          min_hours_full_day?: number
          min_hours_half_day?: number
          name?: string | null
          opening_balance_date?: string | null
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          standard_end_time?: string
          standard_start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          early_checkout_grace_minutes?: number
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          grace_period_minutes?: number
          id?: string
          is_active?: boolean
          min_hours_full_day?: number
          min_hours_half_day?: number
          name?: string | null
          opening_balance_date?: string | null
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          standard_end_time?: string
          standard_start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      connected_email_accounts: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          delta_token: string | null
          display_name: string | null
          email_address: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          provider: string
          refresh_token_encrypted: string | null
          scopes: string[]
          sync_error: string | null
          sync_status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          webhook_expires_at: string | null
          webhook_subscription_id: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          delta_token?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider: string
          refresh_token_encrypted?: string | null
          scopes?: string[]
          sync_error?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          webhook_expires_at?: string | null
          webhook_subscription_id?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          delta_token?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          scopes?: string[]
          sync_error?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          webhook_expires_at?: string | null
          webhook_subscription_id?: string | null
        }
        Relationships: []
      }
      contract_documents: {
        Row: {
          contract_type: Database["public"]["Enums"]["contract_type"]
          file_name: string
          generated_at: string
          generated_by: string
          id: string
          output_format: Database["public"]["Enums"]["contract_doc_format"]
          profile_id: string | null
          profile_name: string
          template_id: string | null
          template_name: string
        }
        Insert: {
          contract_type: Database["public"]["Enums"]["contract_type"]
          file_name: string
          generated_at?: string
          generated_by: string
          id?: string
          output_format: Database["public"]["Enums"]["contract_doc_format"]
          profile_id?: string | null
          profile_name: string
          template_id?: string | null
          template_name: string
        }
        Update: {
          contract_type?: Database["public"]["Enums"]["contract_type"]
          file_name?: string
          generated_at?: string
          generated_by?: string
          id?: string
          output_format?: Database["public"]["Enums"]["contract_doc_format"]
          profile_id?: string | null
          profile_name?: string
          template_id?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "contract_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_profiles: {
        Row: {
          address: string | null
          campaign_id: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string
          effective_date: string | null
          email: string | null
          id: string
          jurisdiction: string | null
          lead_id: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          registered_legal_name: string
          signatory_name: string | null
          signatory_title: string | null
          status: string
          trading_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          campaign_id?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by: string
          effective_date?: string | null
          email?: string | null
          id?: string
          jurisdiction?: string | null
          lead_id?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          registered_legal_name: string
          signatory_name?: string | null
          signatory_title?: string | null
          status?: string
          trading_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          campaign_id?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string
          effective_date?: string | null
          email?: string | null
          id?: string
          jurisdiction?: string | null
          lead_id?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          registered_legal_name?: string
          signatory_name?: string | null
          signatory_title?: string | null
          status?: string
          trading_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_profiles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body_html: string
          body_json: Json
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string
          description: string | null
          id: string
          jurisdiction: string | null
          name: string
          parent_template_id: string | null
          status: Database["public"]["Enums"]["contract_template_status"]
          updated_at: string
          version: number
        }
        Insert: {
          body_html?: string
          body_json?: Json
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          name: string
          parent_template_id?: string | null
          status?: Database["public"]["Enums"]["contract_template_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          body_html?: string
          body_json?: Json
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          name?: string
          parent_template_id?: string | null
          status?: Database["public"]["Enums"]["contract_template_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_note_shares: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          note_id: string
          permission: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          note_id: string
          permission: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          note_id?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_note_shares_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "daily_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_note_templates: {
        Row: {
          content_json: Json
          created_at: string
          default_title: string
          description: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content_json: Json
          created_at?: string
          default_title?: string
          description?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          default_title?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_notes: {
        Row: {
          color: string | null
          content_json: Json
          created_at: string
          id: string
          is_pinned: boolean
          note_date: string
          onenote_page_id: string | null
          onenote_sync_error: string | null
          owner_id: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          content_json?: Json
          created_at?: string
          id?: string
          is_pinned?: boolean
          note_date?: string
          onenote_page_id?: string | null
          onenote_sync_error?: string | null
          owner_id: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          content_json?: Json
          created_at?: string
          id?: string
          is_pinned?: boolean
          note_date?: string
          onenote_page_id?: string | null
          onenote_sync_error?: string | null
          owner_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_client_addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          direct_client_id: string
          id: string
          is_primary: boolean
          label: string | null
          notes: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          direct_client_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          direct_client_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_addresses_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_contact_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          contact_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          contact_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          contact_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_contact_capabilities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "direct_client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_contacts: {
        Row: {
          created_at: string
          direct_client_id: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          portal_enabled: boolean
          role_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          direct_client_id: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          direct_client_id?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_contacts_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_internal_team: {
        Row: {
          created_at: string
          direct_client_id: string
          id: string
          role_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          direct_client_id: string
          id?: string
          role_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          direct_client_id?: string
          id?: string
          role_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_internal_team_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_lifecycle_events: {
        Row: {
          actor_id: string | null
          created_at: string
          direct_client_id: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          direct_client_id: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          direct_client_id?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_lifecycle_events_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_member_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          direct_client_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          direct_client_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          direct_client_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_member_capabilities_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_sharepoint_config: {
        Row: {
          created_at: string
          direct_client_id: string
          last_error: string | null
          last_sync_at: string | null
          provisioning_status: string
          sp_drive_id: string | null
          sp_list_id: string | null
          sp_site_id: string | null
          sp_site_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          direct_client_id: string
          last_error?: string | null
          last_sync_at?: string | null
          provisioning_status?: string
          sp_drive_id?: string | null
          sp_list_id?: string | null
          sp_site_id?: string | null
          sp_site_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          direct_client_id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provisioning_status?: string
          sp_drive_id?: string | null
          sp_list_id?: string | null
          sp_site_id?: string | null
          sp_site_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_sharepoint_config_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: true
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_task_pricing: {
        Row: {
          billing_mode: string
          created_at: string
          direct_client_id: string
          id: string
          rate: number
          task_type_id: string
          updated_at: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          direct_client_id: string
          id?: string
          rate: number
          task_type_id: string
          updated_at?: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          direct_client_id?: string
          id?: string
          rate?: number
          task_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_client_task_pricing_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_client_task_pricing_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "direct_client_task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_client_task_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_pricing: number | null
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_pricing?: number | null
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_pricing?: number | null
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      direct_clients: {
        Row: {
          accounting_software: string[]
          address_line1: string | null
          address_line2: string | null
          billing_email: string | null
          city: string | null
          client_code: string
          client_type: Database["public"]["Enums"]["direct_client_type"]
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          display_name: string
          email: string
          esign_reply_to: string | null
          esign_sender_name: string | null
          feature_flags: Json
          id: string
          identifier: string | null
          image_url: string | null
          legal_name: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          pm_software: string[]
          portal_user_id: string | null
          postal_code: string | null
          provisioned_via: string
          state: string | null
          status: string
          tax_software: string[]
          timezone: string | null
          updated_at: string
          us_timezone: string | null
        }
        Insert: {
          accounting_software?: string[]
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          city?: string | null
          client_code: string
          client_type?: Database["public"]["Enums"]["direct_client_type"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name: string
          email: string
          esign_reply_to?: string | null
          esign_sender_name?: string | null
          feature_flags?: Json
          id?: string
          identifier?: string | null
          image_url?: string | null
          legal_name?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pm_software?: string[]
          portal_user_id?: string | null
          postal_code?: string | null
          provisioned_via?: string
          state?: string | null
          status?: string
          tax_software?: string[]
          timezone?: string | null
          updated_at?: string
          us_timezone?: string | null
        }
        Update: {
          accounting_software?: string[]
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          city?: string | null
          client_code?: string
          client_type?: Database["public"]["Enums"]["direct_client_type"]
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name?: string
          email?: string
          esign_reply_to?: string | null
          esign_sender_name?: string | null
          feature_flags?: Json
          id?: string
          identifier?: string | null
          image_url?: string | null
          legal_name?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pm_software?: string[]
          portal_user_id?: string | null
          postal_code?: string | null
          provisioned_via?: string
          state?: string | null
          status?: string
          tax_software?: string[]
          timezone?: string | null
          updated_at?: string
          us_timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_clients_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_categorisation_results: {
        Row: {
          confidence_score: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          detection_method: string
          doc_type: string | null
          gemini_cost_usd: number | null
          gemini_input_tokens: number | null
          gemini_model: string | null
          gemini_output_tokens: number | null
          id: string
          mapped_category: string | null
          runner_up_score: number | null
          runner_up_type: string | null
          segment_index: number
          segment_pages: string | null
          segment_text: string | null
          signals_matched: string | null
          status: string
          task_attachment_id: string
        }
        Insert: {
          confidence_score?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detection_method: string
          doc_type?: string | null
          gemini_cost_usd?: number | null
          gemini_input_tokens?: number | null
          gemini_model?: string | null
          gemini_output_tokens?: number | null
          id?: string
          mapped_category?: string | null
          runner_up_score?: number | null
          runner_up_type?: string | null
          segment_index?: number
          segment_pages?: string | null
          segment_text?: string | null
          signals_matched?: string | null
          status?: string
          task_attachment_id: string
        }
        Update: {
          confidence_score?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          detection_method?: string
          doc_type?: string | null
          gemini_cost_usd?: number | null
          gemini_input_tokens?: number | null
          gemini_model?: string | null
          gemini_output_tokens?: number | null
          id?: string
          mapped_category?: string | null
          runner_up_score?: number | null
          runner_up_type?: string | null
          segment_index?: number
          segment_pages?: string | null
          segment_text?: string | null
          signals_matched?: string | null
          status?: string
          task_attachment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_categorisation_results_task_attachment_id_fkey"
            columns: ["task_attachment_id"]
            isOneToOne: false
            referencedRelation: "task_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_nodes: {
        Row: {
          created_at: string
          deleted_at: string | null
          etag: string | null
          extension: string | null
          firm_id: string
          id: string
          last_modified_at: string | null
          last_modified_by: string | null
          mime_type: string | null
          name: string
          node_type: string
          parent_node_id: string | null
          project_id: string | null
          size_bytes: number | null
          sp_item_id: string | null
          sp_list_item_id: string | null
          sp_web_url: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          etag?: string | null
          extension?: string | null
          firm_id: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          mime_type?: string | null
          name: string
          node_type: string
          parent_node_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          sp_item_id?: string | null
          sp_list_item_id?: string | null
          sp_web_url?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          etag?: string | null
          extension?: string | null
          firm_id?: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          mime_type?: string | null
          name?: string
          node_type?: string
          parent_node_id?: string | null
          project_id?: string | null
          size_bytes?: number | null
          sp_item_id?: string | null
          sp_list_item_id?: string | null
          sp_web_url?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_nodes_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "document_nodes_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "document_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_nodes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          deleted_at: string | null
          file_name: string
          file_size_bytes: number | null
          firm_id: string | null
          id: string
          migrated_from: string | null
          mime_type: string | null
          project_id: string | null
          sharepoint_item_id: string
          sharepoint_url: string
          sharepoint_web_url: string | null
          storage_path: string | null
          task_id: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          deleted_at?: string | null
          file_name: string
          file_size_bytes?: number | null
          firm_id?: string | null
          id?: string
          migrated_from?: string | null
          mime_type?: string | null
          project_id?: string | null
          sharepoint_item_id: string
          sharepoint_url: string
          sharepoint_web_url?: string | null
          storage_path?: string | null
          task_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          deleted_at?: string | null
          file_name?: string
          file_size_bytes?: number | null
          firm_id?: string | null
          id?: string
          migrated_from?: string | null
          mime_type?: string | null
          project_id?: string | null
          sharepoint_item_id?: string
          sharepoint_url?: string
          sharepoint_web_url?: string | null
          storage_path?: string | null
          task_id?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "documents_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      email_context_links: {
        Row: {
          created_at: string
          firm_id: string | null
          id: string
          link_type: string
          linked_by: string
          note: string | null
          project_id: string | null
          task_id: string | null
          thread_id: string
        }
        Insert: {
          created_at?: string
          firm_id?: string | null
          id?: string
          link_type: string
          linked_by: string
          note?: string | null
          project_id?: string | null
          task_id?: string | null
          thread_id: string
        }
        Update: {
          created_at?: string
          firm_id?: string | null
          id?: string
          link_type?: string
          linked_by?: string
          note?: string | null
          project_id?: string | null
          task_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_context_links_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "tracked_email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notification_queue: {
        Row: {
          actor_name: string | null
          created_at: string
          error: string | null
          extra: Json | null
          id: string
          notification_type: string
          sent_at: string | null
          task_id: string | null
          task_title: string | null
          user_id: string
        }
        Insert: {
          actor_name?: string | null
          created_at?: string
          error?: string | null
          extra?: Json | null
          id?: string
          notification_type: string
          sent_at?: string | null
          task_id?: string | null
          task_title?: string | null
          user_id: string
        }
        Update: {
          actor_name?: string | null
          created_at?: string
          error?: string | null
          extra?: Json | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          task_id?: string | null
          task_title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_notification_queue_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_outbox: {
        Row: {
          account_id: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload: Json
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_outbox_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_jobs: {
        Row: {
          account_id: string
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          job_type: string
          last_error: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          account_id: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_audit: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          changed_fields: string[]
          context: Json | null
          id: string
          import_run_id: string | null
          occurred_at: string
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_fields?: string[]
          context?: Json | null
          id?: string
          import_run_id?: string | null
          occurred_at?: string
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_fields?: string[]
          context?: Json | null
          id?: string
          import_run_id?: string | null
          occurred_at?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_audit_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "employee_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number: string
          account_type: string
          bank_name: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          ifsc_code: string | null
          is_payroll_account: boolean
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          account_type?: string
          bank_name: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          ifsc_code?: string | null
          is_payroll_account?: boolean
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          ifsc_code?: string | null
          is_payroll_account?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bank_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_client_assignments: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_client_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_client_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          doc_type: string
          employee_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          doc_type: string
          employee_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          doc_type?: string
          employee_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_firm_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          firm_id: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          firm_id: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          firm_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_firm_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_firm_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_firm_assignments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "employee_firm_assignments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_import_runs: {
        Row: {
          actor_id: string
          failed_rows: number
          failures: Json
          file_name: string | null
          finished_at: string | null
          id: string
          imported_rows: number
          parent_run_id: string | null
          started_at: string
          total_rows: number
          valid_rows: number
        }
        Insert: {
          actor_id: string
          failed_rows?: number
          failures?: Json
          file_name?: string | null
          finished_at?: string | null
          id?: string
          imported_rows?: number
          parent_run_id?: string | null
          started_at?: string
          total_rows?: number
          valid_rows?: number
        }
        Update: {
          actor_id?: string
          failed_rows?: number
          failures?: Json
          file_name?: string | null
          finished_at?: string | null
          id?: string
          imported_rows?: number
          parent_run_id?: string | null
          started_at?: string
          total_rows?: number
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_import_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "employee_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_managers: {
        Row: {
          created_at: string
          employee_id: string
          manager_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          manager_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_managers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_managers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_specialties: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          specialty: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          specialty: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          specialty?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_specialties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_specialties_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          firm_id: string | null
          id: string
          is_internal: boolean
          is_pinned: boolean
          project_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          is_internal?: boolean
          is_pinned?: boolean
          project_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          is_internal?: boolean
          is_pinned?: boolean
          project_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      esign_audit_log: {
        Row: {
          actor_email: string | null
          actor_phone: string | null
          envelope_id: string
          event: Database["public"]["Enums"]["esign_event"]
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip: unknown
          metadata_json: Json
          occurred_at: string
          recipient_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_phone?: string | null
          envelope_id: string
          event: Database["public"]["Enums"]["esign_event"]
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: unknown
          metadata_json?: Json
          occurred_at?: string
          recipient_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_phone?: string | null
          envelope_id?: string
          event?: Database["public"]["Enums"]["esign_event"]
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip?: unknown
          metadata_json?: Json
          occurred_at?: string
          recipient_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esign_audit_log_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_audit_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "esign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_completed_documents: {
        Row: {
          audit_event_count: number | null
          bytes_hashed: number | null
          cert_issuer: string | null
          cert_serial: string | null
          cert_subject: string | null
          certificate_pdf_path: string
          envelope_id: string
          id_appendix_included: boolean
          sealed_pdf_path: string
          sha256_hex: string
          signature_algo: string
          signed_at: string
          signer_count: number | null
          verification_slug: string
        }
        Insert: {
          audit_event_count?: number | null
          bytes_hashed?: number | null
          cert_issuer?: string | null
          cert_serial?: string | null
          cert_subject?: string | null
          certificate_pdf_path: string
          envelope_id: string
          id_appendix_included?: boolean
          sealed_pdf_path: string
          sha256_hex: string
          signature_algo?: string
          signed_at?: string
          signer_count?: number | null
          verification_slug: string
        }
        Update: {
          audit_event_count?: number | null
          bytes_hashed?: number | null
          cert_issuer?: string | null
          cert_serial?: string | null
          cert_subject?: string | null
          certificate_pdf_path?: string
          envelope_id?: string
          id_appendix_included?: boolean
          sealed_pdf_path?: string
          sha256_hex?: string
          signature_algo?: string
          signed_at?: string
          signer_count?: number | null
          verification_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "esign_completed_documents_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: true
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_documents: {
        Row: {
          created_at: string
          envelope_id: string
          flattened_path: string | null
          height_pt: number | null
          id: string
          name: string
          order_index: number
          page_count: number | null
          source_mime: string
          source_path: string
          width_pt: number | null
        }
        Insert: {
          created_at?: string
          envelope_id: string
          flattened_path?: string | null
          height_pt?: number | null
          id?: string
          name: string
          order_index?: number
          page_count?: number | null
          source_mime: string
          source_path: string
          width_pt?: number | null
        }
        Update: {
          created_at?: string
          envelope_id?: string
          flattened_path?: string | null
          height_pt?: number | null
          id?: string
          name?: string
          order_index?: number
          page_count?: number | null
          source_mime?: string
          source_path?: string
          width_pt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "esign_documents_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_envelopes: {
        Row: {
          branding_json: Json
          completed_at: string | null
          created_at: string
          created_by: string
          current_node: number
          envelope_secret: string
          expires_at: string
          firm_id: string
          id: string
          last_reminder_at: string | null
          message: string | null
          project_id: string | null
          reminder_cadence_hours: number
          routing_mode: Database["public"]["Enums"]["esign_routing_mode"]
          status: Database["public"]["Enums"]["esign_envelope_status"]
          target_direct_client_id: string | null
          target_kind: Database["public"]["Enums"]["esign_target_kind"] | null
          target_organizer_deployment_id: string | null
          target_profile_id: string | null
          target_task_id: string | null
          title: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          branding_json?: Json
          completed_at?: string | null
          created_at?: string
          created_by: string
          current_node?: number
          envelope_secret?: string
          expires_at?: string
          firm_id: string
          id?: string
          last_reminder_at?: string | null
          message?: string | null
          project_id?: string | null
          reminder_cadence_hours?: number
          routing_mode?: Database["public"]["Enums"]["esign_routing_mode"]
          status?: Database["public"]["Enums"]["esign_envelope_status"]
          target_direct_client_id?: string | null
          target_kind?: Database["public"]["Enums"]["esign_target_kind"] | null
          target_organizer_deployment_id?: string | null
          target_profile_id?: string | null
          target_task_id?: string | null
          title: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          branding_json?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          current_node?: number
          envelope_secret?: string
          expires_at?: string
          firm_id?: string
          id?: string
          last_reminder_at?: string | null
          message?: string | null
          project_id?: string | null
          reminder_cadence_hours?: number
          routing_mode?: Database["public"]["Enums"]["esign_routing_mode"]
          status?: Database["public"]["Enums"]["esign_envelope_status"]
          target_direct_client_id?: string | null
          target_kind?: Database["public"]["Enums"]["esign_target_kind"] | null
          target_organizer_deployment_id?: string | null
          target_profile_id?: string | null
          target_task_id?: string | null
          title?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esign_envelopes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "esign_envelopes_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_target_direct_client_id_fkey"
            columns: ["target_direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_target_organizer_deployment_id_fkey"
            columns: ["target_organizer_deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_envelopes_target_task_id_fkey"
            columns: ["target_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_field_values: {
        Row: {
          envelope_id: string
          field_id: string
          id: string
          ip: unknown
          recipient_id: string
          signed_at: string
          user_agent: string | null
          value_image_path: string | null
          value_text: string | null
        }
        Insert: {
          envelope_id: string
          field_id: string
          id?: string
          ip?: unknown
          recipient_id: string
          signed_at?: string
          user_agent?: string | null
          value_image_path?: string | null
          value_text?: string | null
        }
        Update: {
          envelope_id?: string
          field_id?: string
          id?: string
          ip?: unknown
          recipient_id?: string
          signed_at?: string
          user_agent?: string | null
          value_image_path?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esign_field_values_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "esign_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_field_values_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "esign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_fields: {
        Row: {
          conditional_json: Json | null
          created_at: string
          default_value: string | null
          document_id: string
          envelope_id: string
          field_type: Database["public"]["Enums"]["esign_field_type"]
          group_key: string | null
          height_pt: number
          id: string
          is_required: boolean
          options_json: Json | null
          page_index: number
          recipient_id: string
          tab_order: number | null
          variable_token: string | null
          width_pt: number
          x_pt: number
          y_pt: number
        }
        Insert: {
          conditional_json?: Json | null
          created_at?: string
          default_value?: string | null
          document_id: string
          envelope_id: string
          field_type: Database["public"]["Enums"]["esign_field_type"]
          group_key?: string | null
          height_pt: number
          id?: string
          is_required?: boolean
          options_json?: Json | null
          page_index?: number
          recipient_id: string
          tab_order?: number | null
          variable_token?: string | null
          width_pt: number
          x_pt: number
          y_pt: number
        }
        Update: {
          conditional_json?: Json | null
          created_at?: string
          default_value?: string | null
          document_id?: string
          envelope_id?: string
          field_type?: Database["public"]["Enums"]["esign_field_type"]
          group_key?: string | null
          height_pt?: number
          id?: string
          is_required?: boolean
          options_json?: Json | null
          page_index?: number
          recipient_id?: string
          tab_order?: number | null
          variable_token?: string | null
          width_pt?: number
          x_pt?: number
          y_pt?: number
        }
        Relationships: [
          {
            foreignKeyName: "esign_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "esign_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_fields_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_fields_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "esign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_page_layouts: {
        Row: {
          document_id: string
          envelope_id: string
          id: string
          mode: string
          orientation: string | null
          origin_x_pt: number | null
          origin_y_pt: number | null
          page_index: number
          recipient_id: string
          sequence_json: Json
          spacing_pt: number
          updated_at: string
        }
        Insert: {
          document_id: string
          envelope_id: string
          id?: string
          mode?: string
          orientation?: string | null
          origin_x_pt?: number | null
          origin_y_pt?: number | null
          page_index: number
          recipient_id: string
          sequence_json?: Json
          spacing_pt?: number
          updated_at?: string
        }
        Update: {
          document_id?: string
          envelope_id?: string
          id?: string
          mode?: string
          orientation?: string | null
          origin_x_pt?: number | null
          origin_y_pt?: number | null
          page_index?: number
          recipient_id?: string
          sequence_json?: Json
          spacing_pt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "esign_page_layouts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "esign_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_page_layouts_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_page_layouts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "esign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_recipients: {
        Row: {
          access_code_hash: string | null
          access_token_hash: string | null
          auth_method: Database["public"]["Enums"]["esign_auth_method"]
          color_hex: string
          completed_at: string | null
          consented_at: string | null
          created_at: string
          decline_reason: string | null
          email: string
          envelope_id: string
          full_name: string
          id: string
          notified_at: string | null
          phone_e164: string | null
          role: Database["public"]["Enums"]["esign_recipient_role"]
          routing_order: number
          signing_geo_city: string | null
          signing_geo_country: string | null
          signing_geo_region: string | null
          signing_ip: string | null
          signing_user_agent: string | null
          status: Database["public"]["Enums"]["esign_recipient_status"]
          token_expires_at: string | null
          viewed_at: string | null
        }
        Insert: {
          access_code_hash?: string | null
          access_token_hash?: string | null
          auth_method?: Database["public"]["Enums"]["esign_auth_method"]
          color_hex?: string
          completed_at?: string | null
          consented_at?: string | null
          created_at?: string
          decline_reason?: string | null
          email: string
          envelope_id: string
          full_name: string
          id?: string
          notified_at?: string | null
          phone_e164?: string | null
          role?: Database["public"]["Enums"]["esign_recipient_role"]
          routing_order?: number
          signing_geo_city?: string | null
          signing_geo_country?: string | null
          signing_geo_region?: string | null
          signing_ip?: string | null
          signing_user_agent?: string | null
          status?: Database["public"]["Enums"]["esign_recipient_status"]
          token_expires_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          access_code_hash?: string | null
          access_token_hash?: string | null
          auth_method?: Database["public"]["Enums"]["esign_auth_method"]
          color_hex?: string
          completed_at?: string | null
          consented_at?: string | null
          created_at?: string
          decline_reason?: string | null
          email?: string
          envelope_id?: string
          full_name?: string
          id?: string
          notified_at?: string | null
          phone_e164?: string | null
          role?: Database["public"]["Enums"]["esign_recipient_role"]
          routing_order?: number
          signing_geo_city?: string | null
          signing_geo_country?: string | null
          signing_geo_region?: string | null
          signing_ip?: string | null
          signing_user_agent?: string | null
          status?: Database["public"]["Enums"]["esign_recipient_status"]
          token_expires_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esign_recipients_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "esign_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      esign_templates: {
        Row: {
          created_at: string
          created_by: string | null
          doc_kind: string | null
          field_layout_json: Json
          firm_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_kind?: string | null
          field_layout_json?: Json
          firm_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_kind?: string | null
          field_layout_json?: Json
          firm_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "esign_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esign_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "esign_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      file_request_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          last_used_at: string | null
          max_uploads: number
          message: string | null
          password_hash: string | null
          password_set_at: string | null
          revoked_at: string | null
          task_id: string
          token: string
          upload_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          max_uploads?: number
          message?: string | null
          password_hash?: string | null
          password_set_at?: string | null
          revoked_at?: string | null
          task_id: string
          token: string
          upload_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          max_uploads?: number
          message?: string | null
          password_hash?: string | null
          password_set_at?: string | null
          revoked_at?: string | null
          task_id?: string
          token?: string
          upload_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_request_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          firm_id: string
          id: string
          is_primary: boolean
          label: string | null
          notes: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          firm_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          firm_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          notes?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_addresses_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "firm_addresses_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_contact_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          contact_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          contact_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          contact_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_contact_capabilities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "firm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_contacts: {
        Row: {
          created_at: string
          email: string | null
          firm_id: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          portal_enabled: boolean
          role_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          firm_id: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          firm_id?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          portal_enabled?: boolean
          role_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      firm_internal_team: {
        Row: {
          created_at: string
          firm_id: string
          id: string
          role_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          id?: string
          role_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          id?: string
          role_label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      firm_lifecycle_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          firm_id: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          firm_id: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          firm_id?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "firm_lifecycle_events_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "firm_lifecycle_events_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_member_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          firm_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          firm_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          firm_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_member_capabilities_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "firm_member_capabilities_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          firm_id: string
          id: string
          is_client_visible: boolean
          project_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          firm_id: string
          id?: string
          is_client_visible?: boolean
          project_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          firm_id?: string
          id?: string
          is_client_visible?: boolean
          project_id?: string | null
        }
        Relationships: []
      }
      firm_sharepoint_config: {
        Row: {
          created_at: string
          firm_id: string
          last_synced_at: string | null
          provisioned_at: string | null
          provisioning_error: string | null
          provisioning_status: string
          sp_drive_id: string | null
          sp_list_id: string | null
          sp_site_id: string | null
          sp_site_url: string | null
          tenant_domain: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          last_synced_at?: string | null
          provisioned_at?: string | null
          provisioning_error?: string | null
          provisioning_status?: string
          sp_drive_id?: string | null
          sp_list_id?: string | null
          sp_site_id?: string | null
          sp_site_url?: string | null
          tenant_domain?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          last_synced_at?: string | null
          provisioned_at?: string | null
          provisioning_error?: string | null
          provisioning_status?: string
          sp_drive_id?: string | null
          sp_list_id?: string | null
          sp_site_id?: string | null
          sp_site_url?: string | null
          tenant_domain?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_sharepoint_config_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "firm_sharepoint_config_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          accounting_software: string[]
          address: string | null
          address_line1: string | null
          address_line2: string | null
          billing_email: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          currency: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          esign_reply_to: string | null
          esign_sender_name: string | null
          feature_flags: Json
          firm_identifier: string
          id: string
          image_url: string | null
          name: string
          notes: string | null
          pm_software: string[]
          postal_code: string | null
          primary_partner_user_id: string | null
          sharepoint_site_url: string | null
          software: Database["public"]["Enums"]["software_type"][]
          state: string | null
          status: string
          tax_software: string[]
          timezone: string | null
          updated_at: string
          us_timezone: string | null
        }
        Insert: {
          accounting_software?: string[]
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          esign_reply_to?: string | null
          esign_sender_name?: string | null
          feature_flags?: Json
          firm_identifier: string
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          pm_software?: string[]
          postal_code?: string | null
          primary_partner_user_id?: string | null
          sharepoint_site_url?: string | null
          software?: Database["public"]["Enums"]["software_type"][]
          state?: string | null
          status?: string
          tax_software?: string[]
          timezone?: string | null
          updated_at?: string
          us_timezone?: string | null
        }
        Update: {
          accounting_software?: string[]
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          esign_reply_to?: string | null
          esign_sender_name?: string | null
          feature_flags?: Json
          firm_identifier?: string
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
          pm_software?: string[]
          postal_code?: string | null
          primary_partner_user_id?: string | null
          sharepoint_site_url?: string | null
          software?: Database["public"]["Enums"]["software_type"][]
          state?: string | null
          status?: string
          tax_software?: string[]
          timezone?: string | null
          updated_at?: string
          us_timezone?: string | null
        }
        Relationships: []
      }
      folder_library_template_nodes: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_node_id: string | null
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_node_id?: string | null
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_node_id?: string | null
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_library_template_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "folder_library_template_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_library_template_nodes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "folder_library_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_library_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          firm_id: string
          id: string
          is_active: boolean
          name: string
          project_types: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          firm_id: string
          id?: string
          is_active?: boolean
          name: string
          project_types?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          firm_id?: string
          id?: string
          is_active?: boolean
          name?: string
          project_types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_library_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "folder_library_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_template_deployments: {
        Row: {
          actor_id: string | null
          firm_id: string
          folders_created: number
          folders_skipped: number
          id: string
          is_client_visible: boolean
          mode: string
          occurred_at: string
          project_id: string | null
          scope: string
          target_path: string
          task_id: string | null
          tasks_touched: number
          template_id: string | null
          template_name_snapshot: string
        }
        Insert: {
          actor_id?: string | null
          firm_id: string
          folders_created?: number
          folders_skipped?: number
          id?: string
          is_client_visible?: boolean
          mode?: string
          occurred_at?: string
          project_id?: string | null
          scope: string
          target_path?: string
          task_id?: string | null
          tasks_touched?: number
          template_id?: string | null
          template_name_snapshot: string
        }
        Update: {
          actor_id?: string | null
          firm_id?: string
          folders_created?: number
          folders_skipped?: number
          id?: string
          is_client_visible?: boolean
          mode?: string
          occurred_at?: string
          project_id?: string | null
          scope?: string
          target_path?: string
          task_id?: string | null
          tasks_touched?: number
          template_id?: string | null
          template_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_template_deployments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "folder_template_deployments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_template_deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_template_deployments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_template_deployments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "folder_library_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gemini_usage_daily: {
        Row: {
          date: string
          error_count: number
          id: string
          model: string
          org_id: string | null
          tier: string
          total_calls: number
          total_cost_usd: number
          total_input_tokens: number
          total_output_tokens: number
        }
        Insert: {
          date: string
          error_count?: number
          id?: string
          model: string
          org_id?: string | null
          tier: string
          total_calls?: number
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
        }
        Update: {
          date?: string
          error_count?: number
          id?: string
          model?: string
          org_id?: string | null
          tier?: string
          total_calls?: number
          total_cost_usd?: number
          total_input_tokens?: number
          total_output_tokens?: number
        }
        Relationships: []
      }
      gemini_usage_log: {
        Row: {
          call_purpose: string
          called_at: string
          cost_usd: number
          doc_id: string | null
          doc_type_result: string | null
          error_code: string | null
          gemini_model: string
          id: string
          input_tokens: number
          latency_ms: number | null
          org_id: string | null
          output_tokens: number
          result_id: string | null
          tier: string
        }
        Insert: {
          call_purpose: string
          called_at?: string
          cost_usd?: number
          doc_id?: string | null
          doc_type_result?: string | null
          error_code?: string | null
          gemini_model?: string
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          org_id?: string | null
          output_tokens?: number
          result_id?: string | null
          tier?: string
        }
        Update: {
          call_purpose?: string
          called_at?: string
          cost_usd?: number
          doc_id?: string | null
          doc_type_result?: string | null
          error_code?: string | null
          gemini_model?: string
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          org_id?: string | null
          output_tokens?: number
          result_id?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "gemini_usage_log_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "task_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gemini_usage_log_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "doc_categorisation_results"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          actor_id: string
          created_at: string
          expires_at: string
          key: string
          request_hash: string | null
          response: Json | null
          scope: string
          status: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          expires_at?: string
          key: string
          request_hash?: string | null
          response?: Json | null
          scope: string
          status?: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          expires_at?: string
          key?: string
          request_hash?: string | null
          response?: Json | null
          scope?: string
          status?: string
        }
        Relationships: []
      }
      inbox_unread_overrides: {
        Row: {
          created_at: string
          forced_unread: boolean
          scope: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          forced_unread?: boolean
          scope: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          forced_unread?: boolean
          scope?: string
          target_id?: string
          user_id?: string
        }
        Relationships: []
      }
      incident_records: {
        Row: {
          actions_taken: string | null
          created_at: string
          created_by: string
          detected_at: string | null
          id: string
          is_tabletop: boolean
          occurred_at: string
          owner_id: string | null
          post_mortem: string | null
          resolved_at: string | null
          scenario: string
          severity: string
          status: string
          summary: string
          timeline: Json
          updated_at: string
        }
        Insert: {
          actions_taken?: string | null
          created_at?: string
          created_by?: string
          detected_at?: string | null
          id?: string
          is_tabletop?: boolean
          occurred_at?: string
          owner_id?: string | null
          post_mortem?: string | null
          resolved_at?: string | null
          scenario: string
          severity: string
          status?: string
          summary: string
          timeline?: Json
          updated_at?: string
        }
        Update: {
          actions_taken?: string | null
          created_at?: string
          created_by?: string
          detected_at?: string | null
          id?: string
          is_tabletop?: boolean
          occurred_at?: string
          owner_id?: string | null
          post_mortem?: string | null
          resolved_at?: string | null
          scenario?: string
          severity?: string
          status?: string
          summary?: string
          timeline?: Json
          updated_at?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          integration_key: string
          is_active: boolean
          last_test_error: string | null
          last_test_status: string | null
          last_tested_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          integration_key: string
          is_active?: boolean
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          integration_key?: string
          is_active?: boolean
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          firm_id: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          firm_id?: string | null
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          firm_id?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "invitations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          lead_id: string
          occurred_at: string
          summary: string
          type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          occurred_at?: string
          summary: string
          type?: Database["public"]["Enums"]["lead_activity_type"]
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          occurred_at?: string
          summary?: string
          type?: Database["public"]["Enums"]["lead_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campaign_id: string | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          notes: string | null
          owner_id: string | null
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_answers: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          question_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          question_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "learning_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_news_posts: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          firm_id: string
          id: string
          pinned: boolean
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          firm_id: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          firm_id?: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_news_posts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "learning_news_posts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_questions: {
        Row: {
          asker_id: string
          body: string | null
          course_id: string | null
          created_at: string
          firm_id: string
          id: string
          is_resolved: boolean
          title: string
          updated_at: string
        }
        Insert: {
          asker_id: string
          body?: string | null
          course_id?: string | null
          created_at?: string
          firm_id: string
          id?: string
          is_resolved?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          asker_id?: string
          body?: string | null
          course_id?: string | null
          created_at?: string
          firm_id?: string
          id?: string
          is_resolved?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_questions_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "learning_questions_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          employee_id: string
          id: string
          policy_year: number
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id: string
          id?: string
          policy_year: number
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          employee_id?: string
          id?: string
          policy_year?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_policy_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_policy_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "leave_policy_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy_templates: {
        Row: {
          cl_carry_forward_max: number
          cl_opening_balance: number
          cl_quota: number
          created_at: string
          created_by: string | null
          el_carry_forward_max: number
          el_opening_balance: number
          el_quota: number
          id: string
          name: string
          opening_balance_date: string | null
          policy_year: number
          sl_carry_forward_max: number
          sl_opening_balance: number
          sl_quota: number
          updated_at: string
        }
        Insert: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          created_by?: string | null
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          id?: string
          name: string
          opening_balance_date?: string | null
          policy_year: number
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          updated_at?: string
        }
        Update: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          created_by?: string | null
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          id?: string
          name?: string
          opening_balance_date?: string | null
          policy_year?: number
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_policy_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: number
          employee_id: string
          end_date: string
          id?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Relationships: []
      }
      login_events: {
        Row: {
          browser: string | null
          browser_version: string | null
          city: string | null
          country: string | null
          created_at: string
          device_name: string | null
          device_type: string | null
          event_type: string
          id: string
          ip_address: string | null
          language: string | null
          os: string | null
          os_version: string | null
          region: string | null
          screen_resolution: string | null
          session_id: string | null
          timezone: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          browser_version?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          language?: string | null
          os?: string | null
          os_version?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          browser_version?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          language?: string | null
          os?: string | null
          os_version?: string | null
          region?: string | null
          screen_resolution?: string | null
          session_id?: string | null
          timezone?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      marketing_assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["marketing_asset_type"]
          campaign_id: string | null
          created_at: string
          description: string | null
          id: string
          owner_id: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          asset_type?: Database["public"]["Enums"]["marketing_asset_type"]
          campaign_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["marketing_asset_type"]
          campaign_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          actual_spend: number
          budget: number
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          currency: string
          description: string | null
          end_date: string | null
          goal: string | null
          id: string
          name: string
          owner_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_metric: string | null
          updated_at: string
        }
        Insert: {
          actual_spend?: number
          budget?: number
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          owner_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_metric?: string | null
          updated_at?: string
        }
        Update: {
          actual_spend?: number
          budget?: number
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_metric?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      message_reads: {
        Row: {
          last_read_at: string
          scope: Database["public"]["Enums"]["message_scope"]
          scope_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          scope: Database["public"]["Enums"]["message_scope"]
          scope_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          scope?: Database["public"]["Enums"]["message_scope"]
          scope_id?: string
          user_id?: string
        }
        Relationships: []
      }
      message_reads_detail: {
        Row: {
          message_id: string
          read_at: string
          scope: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          scope: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      message_snoozes: {
        Row: {
          created_at: string
          scope: string
          snooze_until: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          scope: string
          snooze_until: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          scope?: string
          snooze_until?: string
          target_id?: string
          user_id?: string
        }
        Relationships: []
      }
      message_stars: {
        Row: {
          created_at: string
          message_id: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_required_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          device_id: string
          expires_at: string
          ip: unknown
          label: string | null
          last_used_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          expires_at: string
          ip?: unknown
          label?: string | null
          last_used_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          expires_at?: string
          ip?: unknown
          label?: string | null
          last_used_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      my_day_flags: {
        Row: {
          created_at: string
          flagged_for: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flagged_for?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          flagged_for?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_day_flags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          created_at: string
          level: string
          scope: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          level?: string
          scope: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          level?: string
          scope?: string
          target_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          firm_id: string | null
          id: string
          is_pinned: boolean
          kind: string
          project_id: string | null
          read_at: string | null
          task_id: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          is_pinned?: boolean
          kind: string
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          is_pinned?: boolean
          kind?: string
          project_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "notifications_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      open_point_replies: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          open_point_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          open_point_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          open_point_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_point_replies_open_point_id_fkey"
            columns: ["open_point_id"]
            isOneToOne: false
            referencedRelation: "open_points"
            referencedColumns: ["id"]
          },
        ]
      }
      open_points: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          firm_id: string | null
          id: string
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_points_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "open_points_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_points_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_block_scores: {
        Row: {
          block_id: string
          created_at: string
          deployment_id: string
          earned: number
          graded_at: string
          graded_by: string
          id: string
          is_correct: boolean | null
          possible: number
          reviewer_note: string | null
          updated_at: string
        }
        Insert: {
          block_id: string
          created_at?: string
          deployment_id: string
          earned?: number
          graded_at?: string
          graded_by: string
          id?: string
          is_correct?: boolean | null
          possible?: number
          reviewer_note?: string | null
          updated_at?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          deployment_id?: string
          earned?: number
          graded_at?: string
          graded_by?: string
          id?: string
          is_correct?: boolean | null
          possible?: number
          reviewer_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_block_scores_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "organizer_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_block_scores_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["organizer_block_type"]
          conditional_rules_json: Json | null
          config_json: Json
          created_at: string
          help_text: string | null
          id: string
          is_required: boolean
          order_index: number
          parent_id: string | null
          question_text: string | null
          scoring_json: Json | null
          template_id: string
          updated_at: string
        }
        Insert: {
          block_type: Database["public"]["Enums"]["organizer_block_type"]
          conditional_rules_json?: Json | null
          config_json?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          order_index?: number
          parent_id?: string | null
          question_text?: string | null
          scoring_json?: Json | null
          template_id: string
          updated_at?: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["organizer_block_type"]
          conditional_rules_json?: Json | null
          config_json?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          order_index?: number
          parent_id?: string | null
          question_text?: string | null
          scoring_json?: Json | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_blocks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizer_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_blocks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_deployment_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          created_by: string
          firm_id: string | null
          id: string
          name: string | null
          note: string | null
          target_type:
            | Database["public"]["Enums"]["organizer_target_type"]
            | null
          template_id: string
          template_version: number | null
          total_count: number | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          created_by: string
          firm_id?: string | null
          id?: string
          name?: string | null
          note?: string | null
          target_type?:
            | Database["public"]["Enums"]["organizer_target_type"]
            | null
          template_id: string
          template_version?: number | null
          total_count?: number | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          created_by?: string
          firm_id?: string | null
          id?: string
          name?: string | null
          note?: string | null
          target_type?:
            | Database["public"]["Enums"]["organizer_target_type"]
            | null
          template_id?: string
          template_version?: number | null
          total_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_deployment_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_deployments: {
        Row: {
          anon_session_token: string | null
          assigned_by: string | null
          assignee_profile_id: string | null
          campaign_id: string | null
          created_at: string
          display_mode_override:
            | Database["public"]["Enums"]["organizer_display_mode"]
            | null
          due_at: string | null
          external_company: string | null
          external_email: string | null
          external_name: string | null
          firm_id: string | null
          graded_at: string | null
          id: string
          last_visited_block_id: string | null
          notes: string | null
          public_link_id: string | null
          score: number | null
          score_breakdown_json: Json | null
          status: Database["public"]["Enums"]["organizer_deployment_status"]
          submitted_at: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["organizer_target_type"]
          template_id: string
          template_version: number
          updated_at: string
        }
        Insert: {
          anon_session_token?: string | null
          assigned_by?: string | null
          assignee_profile_id?: string | null
          campaign_id?: string | null
          created_at?: string
          display_mode_override?:
            | Database["public"]["Enums"]["organizer_display_mode"]
            | null
          due_at?: string | null
          external_company?: string | null
          external_email?: string | null
          external_name?: string | null
          firm_id?: string | null
          graded_at?: string | null
          id?: string
          last_visited_block_id?: string | null
          notes?: string | null
          public_link_id?: string | null
          score?: number | null
          score_breakdown_json?: Json | null
          status?: Database["public"]["Enums"]["organizer_deployment_status"]
          submitted_at?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["organizer_target_type"]
          template_id: string
          template_version: number
          updated_at?: string
        }
        Update: {
          anon_session_token?: string | null
          assigned_by?: string | null
          assignee_profile_id?: string | null
          campaign_id?: string | null
          created_at?: string
          display_mode_override?:
            | Database["public"]["Enums"]["organizer_display_mode"]
            | null
          due_at?: string | null
          external_company?: string | null
          external_email?: string | null
          external_name?: string | null
          firm_id?: string | null
          graded_at?: string | null
          id?: string
          last_visited_block_id?: string | null
          notes?: string | null
          public_link_id?: string | null
          score?: number | null
          score_breakdown_json?: Json | null
          status?: Database["public"]["Enums"]["organizer_deployment_status"]
          submitted_at?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["organizer_target_type"]
          template_id?: string
          template_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_deployments_public_link_id_fkey"
            columns: ["public_link_id"]
            isOneToOne: false
            referencedRelation: "organizer_public_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_deployments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_public_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          firm_id: string | null
          id: string
          label: string | null
          max_submissions: number | null
          password_hash: string | null
          require_identity: boolean
          revoked_at: string | null
          submission_count: number
          template_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          firm_id?: string | null
          id?: string
          label?: string | null
          max_submissions?: number | null
          password_hash?: string | null
          require_identity?: boolean
          revoked_at?: string | null
          submission_count?: number
          template_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          firm_id?: string | null
          id?: string
          label?: string | null
          max_submissions?: number | null
          password_hash?: string | null
          require_identity?: boolean
          revoked_at?: string | null
          submission_count?: number
          template_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizer_public_links_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "organizer_public_links_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_public_links_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_response_history: {
        Row: {
          block_id: string
          changed_at: string
          changed_by: string | null
          deployment_id: string
          id: string
          new_value_json: Json | null
          previous_value_json: Json | null
        }
        Insert: {
          block_id: string
          changed_at?: string
          changed_by?: string | null
          deployment_id: string
          id?: string
          new_value_json?: Json | null
          previous_value_json?: Json | null
        }
        Update: {
          block_id?: string
          changed_at?: string
          changed_by?: string | null
          deployment_id?: string
          id?: string
          new_value_json?: Json | null
          previous_value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_response_history_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "organizer_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_response_history_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_responses: {
        Row: {
          answered_at: string
          answered_by: string | null
          block_id: string
          created_at: string
          deployment_id: string
          id: string
          is_skipped: boolean
          updated_at: string
          value_json: Json | null
        }
        Insert: {
          answered_at?: string
          answered_by?: string | null
          block_id: string
          created_at?: string
          deployment_id: string
          id?: string
          is_skipped?: boolean
          updated_at?: string
          value_json?: Json | null
        }
        Update: {
          answered_at?: string
          answered_by?: string | null
          block_id?: string
          created_at?: string
          deployment_id?: string
          id?: string
          is_skipped?: boolean
          updated_at?: string
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_responses_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "organizer_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_responses_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_review_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["organizer_review_action"]
          actor_id: string
          created_at: string
          deployment_id: string
          id: string
          notes: string | null
          snapshot_json: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["organizer_review_action"]
          actor_id: string
          created_at?: string
          deployment_id: string
          id?: string
          notes?: string | null
          snapshot_json?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["organizer_review_action"]
          actor_id?: string
          created_at?: string
          deployment_id?: string
          id?: string
          notes?: string | null
          snapshot_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_review_audit_log_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_template_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string | null
          snapshot_json: Json
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          snapshot_json: Json
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          snapshot_json?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organizer_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizer_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_mode: Database["public"]["Enums"]["organizer_display_mode"]
          firm_id: string | null
          id: string
          is_exam: boolean
          name: string
          parent_template_id: string | null
          passing_score: number | null
          purpose: Database["public"]["Enums"]["organizer_purpose"]
          status: Database["public"]["Enums"]["organizer_template_status"]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_mode?: Database["public"]["Enums"]["organizer_display_mode"]
          firm_id?: string | null
          id?: string
          is_exam?: boolean
          name: string
          parent_template_id?: string | null
          passing_score?: number | null
          purpose?: Database["public"]["Enums"]["organizer_purpose"]
          status?: Database["public"]["Enums"]["organizer_template_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_mode?: Database["public"]["Enums"]["organizer_display_mode"]
          firm_id?: string | null
          id?: string
          is_exam?: boolean
          name?: string
          parent_template_id?: string | null
          passing_score?: number | null
          purpose?: Database["public"]["Enums"]["organizer_purpose"]
          status?: Database["public"]["Enums"]["organizer_template_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "organizer_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "organizer_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_challenges: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          destination: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          destination: string
          expires_at: string
          id?: string
          purpose: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          destination?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      page_perf_events: {
        Row: {
          created_at: string
          fcp_ms: number | null
          id: string
          load_ms: number | null
          query_ms: number | null
          render_ms: number | null
          route: string
          ttfb_ms: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fcp_ms?: number | null
          id?: string
          load_ms?: number | null
          query_ms?: number | null
          render_ms?: number | null
          route: string
          ttfb_ms?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fcp_ms?: number | null
          id?: string
          load_ms?: number | null
          query_ms?: number | null
          render_ms?: number | null
          route?: string
          ttfb_ms?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payroll_entries: {
        Row: {
          absent_days: number
          cl_days: number
          computed_at: string
          earnings_breakdown: Json
          el_days: number
          employee_id: string
          gross_earnings: number
          half_days: number
          holiday_days: number
          id: string
          is_locked: boolean
          lop_deduction_days: number
          lwp_days: number
          net_pay: number
          other_deductions: Json
          override_notes: string | null
          paid_days: number
          pf_employee: number
          pf_employer: number
          present_days: number
          pt_amount: number
          run_id: string
          salary_structure_id: string | null
          sl_days: number
          tds_amount: number
          total_deductions: number
          total_working_days: number
          updated_at: string
          week_off_days: number
        }
        Insert: {
          absent_days?: number
          cl_days?: number
          computed_at?: string
          earnings_breakdown?: Json
          el_days?: number
          employee_id: string
          gross_earnings?: number
          half_days?: number
          holiday_days?: number
          id?: string
          is_locked?: boolean
          lop_deduction_days?: number
          lwp_days?: number
          net_pay?: number
          other_deductions?: Json
          override_notes?: string | null
          paid_days?: number
          pf_employee?: number
          pf_employer?: number
          present_days?: number
          pt_amount?: number
          run_id: string
          salary_structure_id?: string | null
          sl_days?: number
          tds_amount?: number
          total_deductions?: number
          total_working_days?: number
          updated_at?: string
          week_off_days?: number
        }
        Update: {
          absent_days?: number
          cl_days?: number
          computed_at?: string
          earnings_breakdown?: Json
          el_days?: number
          employee_id?: string
          gross_earnings?: number
          half_days?: number
          holiday_days?: number
          id?: string
          is_locked?: boolean
          lop_deduction_days?: number
          lwp_days?: number
          net_pay?: number
          other_deductions?: Json
          override_notes?: string | null
          paid_days?: number
          pf_employee?: number
          pf_employer?: number
          present_days?: number
          pt_amount?: number
          run_id?: string
          salary_structure_id?: string | null
          sl_days?: number
          tds_amount?: number
          total_deductions?: number
          total_working_days?: number
          updated_at?: string
          week_off_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_salary_structure_id_fkey"
            columns: ["salary_structure_id"]
            isOneToOne: false
            referencedRelation: "payroll_salary_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_holidays: {
        Row: {
          created_at: string
          created_by: string
          festival_dates: Json
          festival_day: number | null
          festival_month: number | null
          holiday_date: string | null
          id: string
          is_festival: boolean
          is_optional: boolean
          is_recurring: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          festival_dates?: Json
          festival_day?: number | null
          festival_month?: number | null
          holiday_date?: string | null
          id?: string
          is_festival?: boolean
          is_optional?: boolean
          is_recurring?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          festival_dates?: Json
          festival_day?: number | null
          festival_month?: number | null
          holiday_date?: string | null
          id?: string
          is_festival?: boolean
          is_optional?: boolean
          is_recurring?: boolean
          name?: string
        }
        Relationships: []
      }
      payroll_leave_balances: {
        Row: {
          accrued: number
          adjusted: number
          balance_year: number
          closing_balance: number | null
          consumed: number
          employee_id: string
          id: string
          leave_category: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          accrued?: number
          adjusted?: number
          balance_year: number
          closing_balance?: number | null
          consumed?: number
          employee_id: string
          id?: string
          leave_category: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          accrued?: number
          adjusted?: number
          balance_year?: number
          closing_balance?: number | null
          consumed?: number
          employee_id?: string
          id?: string
          leave_category?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_leave_policies: {
        Row: {
          cl_carry_forward_max: number
          cl_opening_balance: number
          cl_quota: number
          created_at: string
          created_by: string
          el_carry_forward_max: number
          el_opening_balance: number
          el_quota: number
          employee_id: string
          id: string
          leave_type_map: Json
          policy_year: number
          sl_carry_forward_max: number
          sl_opening_balance: number
          sl_quota: number
          updated_at: string
        }
        Insert: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          created_by: string
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          employee_id: string
          id?: string
          leave_type_map?: Json
          policy_year: number
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          updated_at?: string
        }
        Update: {
          cl_carry_forward_max?: number
          cl_opening_balance?: number
          cl_quota?: number
          created_at?: string
          created_by?: string
          el_carry_forward_max?: number
          el_opening_balance?: number
          el_quota?: number
          employee_id?: string
          id?: string
          leave_type_map?: Json
          policy_year?: number
          sl_carry_forward_max?: number
          sl_opening_balance?: number
          sl_quota?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_leave_policies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          computed_at: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          pay_period_month: number
          pay_period_year: number
          status: Database["public"]["Enums"]["payroll_run_status"]
          total_working_days: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          computed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_period_month: number
          pay_period_year: number
          status?: Database["public"]["Enums"]["payroll_run_status"]
          total_working_days?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          computed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pay_period_month?: number
          pay_period_year?: number
          status?: Database["public"]["Enums"]["payroll_run_status"]
          total_working_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_salary_structures: {
        Row: {
          basic_monthly: number
          created_at: string
          created_by: string
          ctc_monthly: number
          effective_from: string
          effective_to: string | null
          employee_id: string
          hra_monthly: number
          id: string
          notes: string | null
          other_components: Json
          pf_applicable: boolean
          pt_applicable: boolean
          ta_monthly: number
          tds_monthly: number
          updated_at: string
        }
        Insert: {
          basic_monthly?: number
          created_at?: string
          created_by: string
          ctc_monthly?: number
          effective_from: string
          effective_to?: string | null
          employee_id: string
          hra_monthly?: number
          id?: string
          notes?: string | null
          other_components?: Json
          pf_applicable?: boolean
          pt_applicable?: boolean
          ta_monthly?: number
          tds_monthly?: number
          updated_at?: string
        }
        Update: {
          basic_monthly?: number
          created_at?: string
          created_by?: string
          ctc_monthly?: number
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          hra_monthly?: number
          id?: string
          notes?: string | null
          other_components?: Json
          pf_applicable?: boolean
          pt_applicable?: boolean
          ta_monthly?: number
          tds_monthly?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_template_fields: {
        Row: {
          config_json: Json
          created_at: string
          field_type: Database["public"]["Enums"]["pdf_field_type"]
          id: string
          is_visible: boolean
          label: string | null
          order_index: number
          parent_id: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          field_type: Database["public"]["Enums"]["pdf_field_type"]
          id?: string
          is_visible?: boolean
          label?: string | null
          order_index?: number
          parent_id?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          field_type?: Database["public"]["Enums"]["pdf_field_type"]
          id?: string
          is_visible?: boolean
          label?: string | null
          order_index?: number
          parent_id?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_template_fields_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pdf_template_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pdf_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          doc_type: Database["public"]["Enums"]["pdf_doc_type"]
          firm_id: string | null
          font_family: string
          id: string
          is_global: boolean
          logo_storage_path: string | null
          margin_bottom: number
          margin_left: number
          margin_right: number
          margin_top: number
          name: string
          orientation: string
          page_size: string
          parent_template_id: string | null
          primary_color: string
          secondary_color: string
          status: Database["public"]["Enums"]["pdf_template_status"]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          doc_type: Database["public"]["Enums"]["pdf_doc_type"]
          firm_id?: string | null
          font_family?: string
          id?: string
          is_global?: boolean
          logo_storage_path?: string | null
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          name: string
          orientation?: string
          page_size?: string
          parent_template_id?: string | null
          primary_color?: string
          secondary_color?: string
          status?: Database["public"]["Enums"]["pdf_template_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          doc_type?: Database["public"]["Enums"]["pdf_doc_type"]
          firm_id?: string | null
          font_family?: string
          id?: string
          is_global?: boolean
          logo_storage_path?: string | null
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          name?: string
          orientation?: string
          page_size?: string
          parent_template_id?: string | null
          primary_color?: string
          secondary_color?: string
          status?: Database["public"]["Enums"]["pdf_template_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdf_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "pdf_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "pdf_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_reminders: {
        Row: {
          body: string
          body_rich: Json | null
          color: string | null
          completed_at: string | null
          created_at: string
          external_sender_name: string | null
          id: string
          priority: string
          recurrence: string | null
          remind_at: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          body_rich?: Json | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          external_sender_name?: string | null
          id?: string
          priority?: string
          recurrence?: string | null
          remind_at?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          body_rich?: Json | null
          color?: string | null
          completed_at?: string | null
          created_at?: string
          external_sender_name?: string | null
          id?: string
          priority?: string
          recurrence?: string | null
          remind_at?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      productivity_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          project_id: string | null
          started_at: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          project_id?: string | null
          started_at?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          project_id?: string | null
          started_at?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productivity_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productivity_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aadhar_number: string | null
          active_session_id: string | null
          attendance_settings_id: string | null
          avatar_url: string | null
          birth_date: string | null
          comm_auto_archive_days: number
          comm_auto_archive_enabled: boolean
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          department: string | null
          email: string | null
          employee_id: string | null
          employment_type: string | null
          firm_id: string | null
          first_name: string | null
          full_name: string | null
          holiday_calendar_year: number | null
          id: string
          join_date: string | null
          last_invite_sent_at: string | null
          last_name: string | null
          onenote_notebook_id: string | null
          onenote_notebook_url: string | null
          pan_number: string | null
          phone: string | null
          portal_enabled: boolean
          position: Database["public"]["Enums"]["position_type"]
          position_title: string | null
          provisioned_via: string
          reports_to: string | null
          separation_type: string | null
          specialty: string | null
          status: string | null
          status_effective_date: string | null
          weekly_capacity_hours: number
        }
        Insert: {
          aadhar_number?: string | null
          active_session_id?: string | null
          attendance_settings_id?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          comm_auto_archive_days?: number
          comm_auto_archive_enabled?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          employment_type?: string | null
          firm_id?: string | null
          first_name?: string | null
          full_name?: string | null
          holiday_calendar_year?: number | null
          id: string
          join_date?: string | null
          last_invite_sent_at?: string | null
          last_name?: string | null
          onenote_notebook_id?: string | null
          onenote_notebook_url?: string | null
          pan_number?: string | null
          phone?: string | null
          portal_enabled?: boolean
          position?: Database["public"]["Enums"]["position_type"]
          position_title?: string | null
          provisioned_via?: string
          reports_to?: string | null
          separation_type?: string | null
          specialty?: string | null
          status?: string | null
          status_effective_date?: string | null
          weekly_capacity_hours?: number
        }
        Update: {
          aadhar_number?: string | null
          active_session_id?: string | null
          attendance_settings_id?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          comm_auto_archive_days?: number
          comm_auto_archive_enabled?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          employment_type?: string | null
          firm_id?: string | null
          first_name?: string | null
          full_name?: string | null
          holiday_calendar_year?: number | null
          id?: string
          join_date?: string | null
          last_invite_sent_at?: string | null
          last_name?: string | null
          onenote_notebook_id?: string | null
          onenote_notebook_url?: string | null
          pan_number?: string | null
          phone?: string | null
          portal_enabled?: boolean
          position?: Database["public"]["Enums"]["position_type"]
          position_title?: string | null
          provisioned_via?: string
          reports_to?: string | null
          separation_type?: string | null
          specialty?: string | null
          status?: string | null
          status_effective_date?: string | null
          weekly_capacity_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_attendance_settings_id_fkey"
            columns: ["attendance_settings_id"]
            isOneToOne: false
            referencedRelation: "company_hr_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_firm_fk"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "profiles_firm_fk"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_hierarchy_history: {
        Row: {
          changed_at: string
          changed_by: string
          employee_id: string
          id: string
          new_manager_id: string | null
          old_manager_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          employee_id: string
          id?: string
          new_manager_id?: string | null
          old_manager_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          employee_id?: string
          id?: string
          new_manager_id?: string | null
          old_manager_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hierarchy_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_hierarchy_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_hierarchy_history_new_manager_id_fkey"
            columns: ["new_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_hierarchy_history_old_manager_id_fkey"
            columns: ["old_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_custom_field_defs: {
        Row: {
          created_at: string
          enabled: boolean
          field_type: string
          id: string
          key: string
          label: string
          options: Json
          project_id: string
          required: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json
          project_id: string
          required?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json
          project_id?: string
          required?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_custom_field_defs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_custom_field_values: {
        Row: {
          field_def_id: string
          id: string
          task_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          field_def_id: string
          id?: string
          task_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          field_def_id?: string
          id?: string
          task_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_custom_field_values_field_def_id_fkey"
            columns: ["field_def_id"]
            isOneToOne: false
            referencedRelation: "project_custom_field_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_custom_field_values_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_difficulty_levels: {
        Row: {
          color: string | null
          created_at: string
          enabled: boolean
          icon: string | null
          id: string
          is_archived: boolean
          key: string
          label: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          is_archived?: boolean
          key: string
          label: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          is_archived?: boolean
          key?: string
          label?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_difficulty_levels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_feature_toggles: {
        Row: {
          audit_trail_enabled: boolean
          discussion_enabled: boolean
          files_enabled: boolean
          links_enabled: boolean
          notes_enabled: boolean
          open_points_enabled: boolean
          project_id: string
          skip_entity_hierarchy: boolean
          timesheet_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audit_trail_enabled?: boolean
          discussion_enabled?: boolean
          files_enabled?: boolean
          links_enabled?: boolean
          notes_enabled?: boolean
          open_points_enabled?: boolean
          project_id: string
          skip_entity_hierarchy?: boolean
          timesheet_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audit_trail_enabled?: boolean
          discussion_enabled?: boolean
          files_enabled?: boolean
          links_enabled?: boolean
          notes_enabled?: boolean
          open_points_enabled?: boolean
          project_id?: string
          skip_entity_hierarchy?: boolean
          timesheet_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_feature_toggles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_file_categories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_file_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_file_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_file_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_billable: boolean
          is_terminal: boolean
          key: string
          label: string
          primary_state: string
          project_id: string
          revrec_label: string | null
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_billable?: boolean
          is_terminal?: boolean
          key: string
          label: string
          primary_state?: string
          project_id: string
          revrec_label?: string | null
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_billable?: boolean
          is_terminal?: boolean
          key?: string
          label?: string
          primary_state?: string
          project_id?: string
          revrec_label?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_pipeline_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pricing_fixed_assignments: {
        Row: {
          billing_cadence: string
          created_at: string
          custom_day: number | null
          difficulty_level_id: string | null
          employee_id: string
          flat_amount: number
          id: string
          last_generated_for: string | null
          period_id: string
          updated_at: string
        }
        Insert: {
          billing_cadence: string
          created_at?: string
          custom_day?: number | null
          difficulty_level_id?: string | null
          employee_id: string
          flat_amount: number
          id?: string
          last_generated_for?: string | null
          period_id: string
          updated_at?: string
        }
        Update: {
          billing_cadence?: string
          created_at?: string
          custom_day?: number | null
          difficulty_level_id?: string | null
          employee_id?: string
          flat_amount?: number
          id?: string
          last_generated_for?: string | null
          period_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_pricing_fixed_assignments_difficulty_level_id_fkey"
            columns: ["difficulty_level_id"]
            isOneToOne: false
            referencedRelation: "project_difficulty_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_fixed_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_fixed_assignments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "project_pricing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pricing_matrix_rates: {
        Row: {
          amount: number
          created_at: string
          difficulty_level_id: string
          id: string
          period_id: string
          return_type_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          difficulty_level_id: string
          id?: string
          period_id: string
          return_type_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          difficulty_level_id?: string
          id?: string
          period_id?: string
          return_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_pricing_matrix_rates_difficulty_level_id_fkey"
            columns: ["difficulty_level_id"]
            isOneToOne: false
            referencedRelation: "project_difficulty_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_matrix_rates_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "project_pricing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_matrix_rates_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "project_return_types"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pricing_periods: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          ends_on: string | null
          id: string
          label: string | null
          model: Database["public"]["Enums"]["pricing_model_kind"]
          notes: string | null
          project_id: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          ends_on?: string | null
          id?: string
          label?: string | null
          model: Database["public"]["Enums"]["pricing_model_kind"]
          notes?: string | null
          project_id: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          ends_on?: string | null
          id?: string
          label?: string | null
          model?: Database["public"]["Enums"]["pricing_model_kind"]
          notes?: string | null
          project_id?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_pricing_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pricing_rules: {
        Row: {
          amount: number
          created_at: string
          currency: string
          enabled: boolean
          id: string
          label: string
          pricing_model: string
          project_id: string
          return_type_id: string | null
          sort_order: number
          task_type_key: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          label: string
          pricing_model: string
          project_id: string
          return_type_id?: string | null
          sort_order?: number
          task_type_key?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          label?: string
          pricing_model?: string
          project_id?: string
          return_type_id?: string | null
          sort_order?: number
          task_type_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_pricing_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_pricing_rules_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "project_return_types"
            referencedColumns: ["id"]
          },
        ]
      }
      project_return_types: {
        Row: {
          code: string
          created_at: string
          enabled: boolean
          id: string
          is_archived: boolean
          label: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_archived?: boolean
          label: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_archived?: boolean
          label?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_return_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_counters: {
        Row: {
          next_seq: number
          project_id: string
        }
        Insert: {
          next_seq?: number
          project_id: string
        }
        Update: {
          next_seq?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_task_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_options: {
        Row: {
          allowed_priorities: string[]
          allowed_statuses: string[]
          allowed_task_types: string[]
          archived_priorities: string[]
          archived_statuses: string[]
          created_at: string
          default_assignee_id: string | null
          default_due_hours: number
          default_priority: string | null
          default_reviewer_id: string | null
          default_status: string | null
          default_task_type_id: string | null
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_priorities?: string[]
          allowed_statuses?: string[]
          allowed_task_types?: string[]
          archived_priorities?: string[]
          archived_statuses?: string[]
          created_at?: string
          default_assignee_id?: string | null
          default_due_hours?: number
          default_priority?: string | null
          default_reviewer_id?: string | null
          default_status?: string | null
          default_task_type_id?: string | null
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_priorities?: string[]
          allowed_statuses?: string[]
          allowed_task_types?: string[]
          archived_priorities?: string[]
          archived_statuses?: string[]
          created_at?: string
          default_assignee_id?: string | null
          default_due_hours?: number
          default_priority?: string | null
          default_reviewer_id?: string | null
          default_status?: string | null
          default_task_type_id?: string | null
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_task_options_default_task_type_id_fkey"
            columns: ["default_task_type_id"]
            isOneToOne: false
            referencedRelation: "project_return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_options_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_urgency_levels: {
        Row: {
          color: string | null
          created_at: string
          enabled: boolean
          icon: string | null
          id: string
          is_archived: boolean
          key: string
          label: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          is_archived?: boolean
          key: string
          label: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          is_archived?: boolean
          key?: string
          label?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_urgency_levels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          firm_id: string
          id: string
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
          sharepoint_delta_link: string | null
          sharepoint_delta_token: string | null
          sharepoint_drive_id: string | null
          sharepoint_initial_sync_done: boolean | null
          sharepoint_last_synced_at: string | null
          sharepoint_library_url: string | null
          sharepoint_list_id: string | null
          sharepoint_site_id: string | null
          sharepoint_subscription_expires_at: string | null
          sharepoint_subscription_id: string | null
          slug: string
          software: Database["public"]["Enums"]["software_type"][]
          sp_list_id_audit: string | null
          sp_list_id_documents: string | null
          sp_list_id_messages: string | null
          sp_list_id_tasks: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          firm_id: string
          id?: string
          name: string
          project_type?: Database["public"]["Enums"]["project_type"]
          sharepoint_delta_link?: string | null
          sharepoint_delta_token?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_initial_sync_done?: boolean | null
          sharepoint_last_synced_at?: string | null
          sharepoint_library_url?: string | null
          sharepoint_list_id?: string | null
          sharepoint_site_id?: string | null
          sharepoint_subscription_expires_at?: string | null
          sharepoint_subscription_id?: string | null
          slug: string
          software?: Database["public"]["Enums"]["software_type"][]
          sp_list_id_audit?: string | null
          sp_list_id_documents?: string | null
          sp_list_id_messages?: string | null
          sp_list_id_tasks?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          firm_id?: string
          id?: string
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          sharepoint_delta_link?: string | null
          sharepoint_delta_token?: string | null
          sharepoint_drive_id?: string | null
          sharepoint_initial_sync_done?: boolean | null
          sharepoint_last_synced_at?: string | null
          sharepoint_library_url?: string | null
          sharepoint_list_id?: string | null
          sharepoint_site_id?: string | null
          sharepoint_subscription_expires_at?: string | null
          sharepoint_subscription_id?: string | null
          slug?: string
          software?: Database["public"]["Enums"]["software_type"][]
          sp_list_id_audit?: string | null
          sp_list_id_documents?: string | null
          sp_list_id_messages?: string | null
          sp_list_id_tasks?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          created_at: string
          firm_id: string | null
          id: string
          label: string
          scope_kind: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          firm_id?: string | null
          id?: string
          label: string
          scope_kind?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          firm_id?: string | null
          id?: string
          label?: string
          scope_kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "quick_replies_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_public_tokens: {
        Row: {
          created_at: string
          id: string
          label: string | null
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      reminder_shares: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          reminder_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          reminder_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          reminder_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_shares_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "personal_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_drill_log: {
        Row: {
          created_at: string
          drill_date: string
          evidence_url: string | null
          id: string
          notes: string | null
          outcome: string
          performed_by: string
          rpo_minutes: number | null
          rto_minutes: number | null
          scope: string
        }
        Insert: {
          created_at?: string
          drill_date?: string
          evidence_url?: string | null
          id?: string
          notes?: string | null
          outcome: string
          performed_by: string
          rpo_minutes?: number | null
          rto_minutes?: number | null
          scope: string
        }
        Update: {
          created_at?: string
          drill_date?: string
          evidence_url?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          performed_by?: string
          rpo_minutes?: number | null
          rto_minutes?: number | null
          scope?: string
        }
        Relationships: []
      }
      role_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      role_subrole_capabilities: {
        Row: {
          allowed: boolean
          module_key: string
          subrole_id: string
        }
        Insert: {
          allowed: boolean
          module_key: string
          subrole_id: string
        }
        Update: {
          allowed?: boolean
          module_key?: string
          subrole_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_subrole_capabilities_subrole_id_fkey"
            columns: ["subrole_id"]
            isOneToOne: false
            referencedRelation: "role_subroles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_subroles: {
        Row: {
          base_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          base_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          base_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          applied_at: string
          applied_by: string | null
          applied_by_email: string | null
          category: string
          created_at: string
          details: string | null
          id: string
          migration_file: string | null
          summary: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          applied_by_email?: string | null
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          migration_file?: string | null
          summary: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          applied_by_email?: string | null
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          migration_file?: string | null
          summary?: string
        }
        Relationships: []
      }
      sensitive_action_log: {
        Row: {
          action: string
          actor_id: string
          details: Json | null
          id: string
          ip: unknown
          occurred_at: string
          target_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          details?: Json | null
          id?: string
          ip?: unknown
          occurred_at?: string
          target_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          details?: Json | null
          id?: string
          ip?: unknown
          occurred_at?: string
          target_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      sharepoint_sync_jobs: {
        Row: {
          attempts: number
          correlation_id: string | null
          created_at: string
          firm_id: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          correlation_id?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          correlation_id?: string | null
          created_at?: string
          firm_id?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharepoint_sync_jobs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "sharepoint_sync_jobs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      sharepoint_upload_sessions: {
        Row: {
          bytes_uploaded: number
          created_at: string
          expires_at: string
          file_name: string
          file_size: number
          id: string
          node_id: string | null
          sp_upload_url: string
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes_uploaded?: number
          created_at?: string
          expires_at: string
          file_name: string
          file_size: number
          id?: string
          node_id?: string | null
          sp_upload_url: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bytes_uploaded?: number
          created_at?: string
          expires_at?: string
          file_name?: string
          file_size?: number
          id?: string
          node_id?: string | null
          sp_upload_url?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharepoint_upload_sessions_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "document_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sharepoint_upload_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          firm_id: string | null
          id: string
          is_internal: boolean
          project_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          is_internal?: boolean
          project_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          firm_id?: string | null
          id?: string
          is_internal?: boolean
          project_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_compensation: {
        Row: {
          hourly_rate: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          hourly_rate?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          hourly_rate?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_action_item_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          item_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          item_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_action_item_assignees_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "task_action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      task_action_item_events: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          event: string
          id: string
          item_id: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event: string
          id?: string
          item_id: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event?: string
          id?: string
          item_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_action_item_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "task_action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      task_action_items: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_at: string | null
          id: string
          is_client_visible: boolean
          kind: string
          sort_order: number
          start_at: string
          status: string
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_at?: string | null
          id?: string
          is_client_visible?: boolean
          kind?: string
          sort_order?: number
          start_at?: string
          status?: string
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_at?: string | null
          id?: string
          is_client_visible?: boolean
          kind?: string
          sort_order?: number
          start_at?: string
          status?: string
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_action_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string
          role: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachment_categories: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          attachment_id: string
          category_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          attachment_id: string
          category_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          attachment_id?: string
          category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachment_categories_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "task_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachment_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "project_file_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          archived_at: string | null
          categorisation_started_at: string | null
          categorisation_status: string | null
          category_id: string | null
          client_visible_override: boolean | null
          confidence_score: number | null
          created_at: string
          description: string | null
          detection_method: string | null
          doc_type: string | null
          filename: string
          folder_path: string
          id: string
          is_client_visible: boolean
          is_shared: boolean
          mapped_category: string | null
          message_id: string | null
          mime_type: string | null
          shared_at: string | null
          shared_by: string | null
          size_bytes: number | null
          source: string
          storage_path: string
          tags: string[]
          task_id: string
          uploader_id: string | null
        }
        Insert: {
          archived_at?: string | null
          categorisation_started_at?: string | null
          categorisation_status?: string | null
          category_id?: string | null
          client_visible_override?: boolean | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          detection_method?: string | null
          doc_type?: string | null
          filename: string
          folder_path?: string
          id?: string
          is_client_visible?: boolean
          is_shared?: boolean
          mapped_category?: string | null
          message_id?: string | null
          mime_type?: string | null
          shared_at?: string | null
          shared_by?: string | null
          size_bytes?: number | null
          source?: string
          storage_path: string
          tags?: string[]
          task_id: string
          uploader_id?: string | null
        }
        Update: {
          archived_at?: string | null
          categorisation_started_at?: string | null
          categorisation_status?: string | null
          category_id?: string | null
          client_visible_override?: boolean | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          detection_method?: string | null
          doc_type?: string | null
          filename?: string
          folder_path?: string
          id?: string
          is_client_visible?: boolean
          is_shared?: boolean
          mapped_category?: string | null
          message_id?: string | null
          mime_type?: string | null
          shared_at?: string | null
          shared_by?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string
          tags?: string[]
          task_id?: string
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "project_file_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_billable_events: {
        Row: {
          cadence_period_date: string | null
          completed_at: string
          computed_amount: number
          created_at: string
          currency_snapshot: string
          deferred_at: string | null
          deferred_by: string | null
          deferred_reason: string | null
          difficulty_id_snapshot: string | null
          effective_minutes_snapshot: number | null
          final_amount: number | null
          fixed_assignment_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          override_amount: number | null
          pricing_model_snapshot: Database["public"]["Enums"]["pricing_model_kind"]
          pricing_period_id: string
          project_id: string
          rate_snapshot: number | null
          return_type_id_snapshot: string | null
          source: Database["public"]["Enums"]["billable_event_source"]
          stage_completion_id: string | null
          stage_id: string | null
          status: Database["public"]["Enums"]["billable_event_status"]
          task_id: string | null
          time_log_id: string | null
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
        }
        Insert: {
          cadence_period_date?: string | null
          completed_at?: string
          computed_amount?: number
          created_at?: string
          currency_snapshot: string
          deferred_at?: string | null
          deferred_by?: string | null
          deferred_reason?: string | null
          difficulty_id_snapshot?: string | null
          effective_minutes_snapshot?: number | null
          final_amount?: number | null
          fixed_assignment_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          override_amount?: number | null
          pricing_model_snapshot: Database["public"]["Enums"]["pricing_model_kind"]
          pricing_period_id: string
          project_id: string
          rate_snapshot?: number | null
          return_type_id_snapshot?: string | null
          source: Database["public"]["Enums"]["billable_event_source"]
          stage_completion_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["billable_event_status"]
          task_id?: string | null
          time_log_id?: string | null
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Update: {
          cadence_period_date?: string | null
          completed_at?: string
          computed_amount?: number
          created_at?: string
          currency_snapshot?: string
          deferred_at?: string | null
          deferred_by?: string | null
          deferred_reason?: string | null
          difficulty_id_snapshot?: string | null
          effective_minutes_snapshot?: number | null
          final_amount?: number | null
          fixed_assignment_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          override_amount?: number | null
          pricing_model_snapshot?: Database["public"]["Enums"]["pricing_model_kind"]
          pricing_period_id?: string
          project_id?: string
          rate_snapshot?: number | null
          return_type_id_snapshot?: string | null
          source?: Database["public"]["Enums"]["billable_event_source"]
          stage_completion_id?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["billable_event_status"]
          task_id?: string | null
          time_log_id?: string | null
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_billable_events_deferred_by_fkey"
            columns: ["deferred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_fixed_assignment_id_fkey"
            columns: ["fixed_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_pricing_fixed_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_pricing_period_id_fkey"
            columns: ["pricing_period_id"]
            isOneToOne: false
            referencedRelation: "project_pricing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_stage_completion_id_fkey"
            columns: ["stage_completion_id"]
            isOneToOne: false
            referencedRelation: "task_stage_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_billable_events_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_document_events: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          event_type: string
          id: string
          node_id: string
          node_kind: string
          node_label: string | null
          occurred_at: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          event_type: string
          id?: string
          node_id: string
          node_kind: string
          node_label?: string | null
          occurred_at?: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          event_type?: string
          id?: string
          node_id?: string
          node_kind?: string
          node_label?: string | null
          occurred_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_document_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_document_folders: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          is_client_visible: boolean
          is_system: boolean
          path: string
          task_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_client_visible?: boolean
          is_system?: boolean
          path: string
          task_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_client_visible?: boolean
          is_system?: boolean
          path?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_document_folders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_file_annotation_replies: {
        Row: {
          annotation_id: string
          author_id: string | null
          body: string
          created_at: string
          id: string
        }
        Insert: {
          annotation_id: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          annotation_id?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_file_annotation_replies_annotation_id_fkey"
            columns: ["annotation_id"]
            isOneToOne: false
            referencedRelation: "task_file_annotations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_file_annotations: {
        Row: {
          author_id: string | null
          body: string
          color: string
          created_at: string
          file_id: string
          geometry: Json
          id: string
          is_client_visible: boolean
          kind: string
          page: number
          resolved_at: string | null
          resolved_by: string | null
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          color?: string
          created_at?: string
          file_id: string
          geometry: Json
          id?: string
          is_client_visible?: boolean
          kind: string
          page?: number
          resolved_at?: string | null
          resolved_by?: string | null
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          color?: string
          created_at?: string
          file_id?: string
          geometry?: Json
          id?: string
          is_client_visible?: boolean
          kind?: string
          page?: number
          resolved_at?: string | null
          resolved_by?: string | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_file_annotations_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "task_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_file_annotations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_folder_metadata: {
        Row: {
          completion_date: string | null
          created_at: string
          difficulty_level: string | null
          due_date: string | null
          metadata_hash: string | null
          sp_list_item_id: string | null
          stage: string | null
          stage_head: string | null
          sync_error: string | null
          sync_status: string
          synced_at: string | null
          task_id: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          completion_date?: string | null
          created_at?: string
          difficulty_level?: string | null
          due_date?: string | null
          metadata_hash?: string | null
          sp_list_item_id?: string | null
          stage?: string | null
          stage_head?: string | null
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          task_id: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          completion_date?: string | null
          created_at?: string
          difficulty_level?: string | null
          due_date?: string | null
          metadata_hash?: string | null
          sp_list_item_id?: string | null
          stage?: string | null
          stage_head?: string | null
          sync_error?: string | null
          sync_status?: string
          synced_at?: string | null
          task_id?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_folder_metadata_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_folder_nodes: {
        Row: {
          created_at: string | null
          folder_name: string
          id: string
          sp_item_id: string
          sp_web_url: string | null
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          folder_name: string
          id?: string
          sp_item_id: string
          sp_web_url?: string | null
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          folder_name?: string
          id?: string
          sp_item_id?: string
          sp_web_url?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_folder_nodes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_links: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          link_type: Database["public"]["Enums"]["link_type"]
          task_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          link_type?: Database["public"]["Enums"]["link_type"]
          task_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          link_type?: Database["public"]["Enums"]["link_type"]
          task_id?: string
          url?: string
        }
        Relationships: []
      }
      task_messages: {
        Row: {
          author_id: string
          body: string
          client_msg_id: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_client_visible: boolean
          is_pinned: boolean
          pinned_at: string | null
          reply_to_message_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          client_msg_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_client_visible?: boolean
          is_pinned?: boolean
          pinned_at?: string | null
          reply_to_message_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          client_msg_id?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_client_visible?: boolean
          is_pinned?: boolean
          pinned_at?: string | null
          reply_to_message_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_my_day: {
        Row: {
          added_at: string
          day: string
          id: string
          removed_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          day?: string
          id?: string
          removed_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          day?: string
          id?: string
          removed_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_my_day_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          task_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          task_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          task_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_permissions: {
        Row: {
          can_change_status: boolean
          can_edit_fields: boolean
          can_edit_time: boolean
          can_manage_attachments: boolean
          can_manage_subtasks: boolean
          can_view: boolean
          created_at: string
          granted_by: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_change_status?: boolean
          can_edit_fields?: boolean
          can_edit_time?: boolean
          can_manage_attachments?: boolean
          can_manage_subtasks?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_change_status?: boolean
          can_edit_fields?: boolean
          can_edit_time?: boolean
          can_manage_attachments?: boolean
          can_manage_subtasks?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_permissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_stage_completions: {
        Row: {
          actor_id: string | null
          completed_at: string
          id: string
          note: string | null
          stage_id: string
          task_id: string
          ticked_yes: boolean
        }
        Insert: {
          actor_id?: string | null
          completed_at?: string
          id?: string
          note?: string | null
          stage_id: string
          task_id: string
          ticked_yes: boolean
        }
        Update: {
          actor_id?: string | null
          completed_at?: string
          id?: string
          note?: string | null
          stage_id?: string
          task_id?: string
          ticked_yes?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "task_stage_completions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_completions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtask_events: {
        Row: {
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          event: string
          id: string
          subtask_id: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event: string
          id?: string
          subtask_id: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event?: string
          id?: string
          subtask_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtask_events_subtask_id_fkey"
            columns: ["subtask_id"]
            isOneToOne: false
            referencedRelation: "task_subtasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtasks: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_done: boolean
          sort_order: number
          status: Database["public"]["Enums"]["subtask_status"]
          task_id: string
          title: string
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          sort_order?: number
          status?: Database["public"]["Enums"]["subtask_status"]
          task_id: string
          title: string
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          sort_order?: number
          status?: Database["public"]["Enums"]["subtask_status"]
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template_folders: {
        Row: {
          firm_id: string | null
          folder_name: string
          id: string
          sort_order: number | null
          task_type_id: string | null
        }
        Insert: {
          firm_id?: string | null
          folder_name: string
          id?: string
          sort_order?: number | null
          task_type_id?: string | null
        }
        Update: {
          firm_id?: string | null
          folder_name?: string
          id?: string
          sort_order?: number | null
          task_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_template_folders_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "task_template_folders_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      task_user_order: {
        Row: {
          id: string
          sort_order: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          sort_order?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          sort_order?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_user_order_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_views: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          scope: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          owner_id: string
          scope?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_watchers: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          completed_at: string | null
          complexity: Database["public"]["Enums"]["task_complexity"]
          created_at: string
          created_by: string | null
          description: string | null
          difficulty_level_id: string | null
          direct_client_id: string | null
          display_id: string | null
          due_date: string | null
          entity_id: string | null
          fixed_fee: number | null
          id: string
          period: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_stage_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          ready_for_review_at: string | null
          return_type_id: string | null
          reviewer_id: string | null
          sharepoint_folder_id: string | null
          sharepoint_folder_path: string | null
          sharepoint_url: string | null
          slug: string
          software: Database["public"]["Enums"]["tax_software"] | null
          sort_order: number | null
          source_organizer_deployment_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          stream: string
          task_type_id: string | null
          tax_year: number | null
          template: Database["public"]["Enums"]["template_type"] | null
          title: string
          urgency_level_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          complexity?: Database["public"]["Enums"]["task_complexity"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level_id?: string | null
          direct_client_id?: string | null
          display_id?: string | null
          due_date?: string | null
          entity_id?: string | null
          fixed_fee?: number | null
          id?: string
          period?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_stage_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          ready_for_review_at?: string | null
          return_type_id?: string | null
          reviewer_id?: string | null
          sharepoint_folder_id?: string | null
          sharepoint_folder_path?: string | null
          sharepoint_url?: string | null
          slug: string
          software?: Database["public"]["Enums"]["tax_software"] | null
          sort_order?: number | null
          source_organizer_deployment_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          stream?: string
          task_type_id?: string | null
          tax_year?: number | null
          template?: Database["public"]["Enums"]["template_type"] | null
          title: string
          urgency_level_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          complexity?: Database["public"]["Enums"]["task_complexity"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_level_id?: string | null
          direct_client_id?: string | null
          display_id?: string | null
          due_date?: string | null
          entity_id?: string | null
          fixed_fee?: number | null
          id?: string
          period?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          pipeline_stage_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          ready_for_review_at?: string | null
          return_type_id?: string | null
          reviewer_id?: string | null
          sharepoint_folder_id?: string | null
          sharepoint_folder_path?: string | null
          sharepoint_url?: string | null
          slug?: string
          software?: Database["public"]["Enums"]["tax_software"] | null
          sort_order?: number | null
          source_organizer_deployment_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          stream?: string
          task_type_id?: string | null
          tax_year?: number | null
          template?: Database["public"]["Enums"]["template_type"] | null
          title?: string
          urgency_level_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_difficulty_level_id_fkey"
            columns: ["difficulty_level_id"]
            isOneToOne: false
            referencedRelation: "project_difficulty_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_direct_client_id_fkey"
            columns: ["direct_client_id"]
            isOneToOne: false
            referencedRelation: "direct_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "client_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "project_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_return_type_id_fkey"
            columns: ["return_type_id"]
            isOneToOne: false
            referencedRelation: "project_return_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_organizer_deployment_id_fkey"
            columns: ["source_organizer_deployment_id"]
            isOneToOne: false
            referencedRelation: "organizer_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "direct_client_task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_urgency_level_id_fkey"
            columns: ["urgency_level_id"]
            isOneToOne: false
            referencedRelation: "project_urgency_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      template_checklist_items: {
        Row: {
          description: string | null
          id: string
          kind: string | null
          sort_order: number
          template: Database["public"]["Enums"]["template_type"] | null
          title: string
          workflow_template_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          kind?: string | null
          sort_order?: number
          template?: Database["public"]["Enums"]["template_type"] | null
          title: string
          workflow_template_id: string
        }
        Update: {
          description?: string | null
          id?: string
          kind?: string | null
          sort_order?: number
          template?: Database["public"]["Enums"]["template_type"] | null
          title?: string
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_checklist_items_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_notification_prefs: {
        Row: {
          id: string
          level: string
          muted_until: string | null
          thread_id: string
          thread_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          level?: string
          muted_until?: string | null
          thread_id: string
          thread_kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          level?: string
          muted_until?: string | null
          thread_id?: string
          thread_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      time_log_audit: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          bulk_op_id: string | null
          created_at: string
          fields: string[]
          id: string
          time_log_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          bulk_op_id?: string | null
          created_at?: string
          fields?: string[]
          id?: string
          time_log_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          bulk_op_id?: string | null
          created_at?: string
          fields?: string[]
          id?: string
          time_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_log_audit_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      time_logs: {
        Row: {
          billable: boolean
          break_minutes: number
          created_at: string
          duration_minutes: number | null
          effective_edited_at: string | null
          effective_edited_by: string | null
          effective_minutes: number | null
          effective_override: number | null
          ended_at: string | null
          id: string
          note: string | null
          started_at: string
          subtask_id: string | null
          task_id: string
          timer_group_id: string | null
          timer_group_size: number
          user_id: string
        }
        Insert: {
          billable?: boolean
          break_minutes?: number
          created_at?: string
          duration_minutes?: number | null
          effective_edited_at?: string | null
          effective_edited_by?: string | null
          effective_minutes?: number | null
          effective_override?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at: string
          subtask_id?: string | null
          task_id: string
          timer_group_id?: string | null
          timer_group_size?: number
          user_id: string
        }
        Update: {
          billable?: boolean
          break_minutes?: number
          created_at?: string
          duration_minutes?: number | null
          effective_edited_at?: string | null
          effective_edited_by?: string | null
          effective_minutes?: number | null
          effective_override?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          subtask_id?: string | null
          task_id?: string
          timer_group_id?: string | null
          timer_group_size?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_logs_subtask_id_fkey"
            columns: ["subtask_id"]
            isOneToOne: false
            referencedRelation: "task_subtasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_email_attachments: {
        Row: {
          created_at: string
          email_id: string
          filename: string | null
          id: string
          inline_cid: string | null
          mime_type: string | null
          provider_attachment_id: string
          saved_document_id: string | null
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          email_id: string
          filename?: string | null
          id?: string
          inline_cid?: string | null
          mime_type?: string | null
          provider_attachment_id: string
          saved_document_id?: string | null
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          email_id?: string
          filename?: string | null
          id?: string
          inline_cid?: string | null
          mime_type?: string | null
          provider_attachment_id?: string
          saved_document_id?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "tracked_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_email_threads: {
        Row: {
          account_id: string
          created_at: string
          folder: string
          has_attachments: boolean
          id: string
          is_flagged: boolean
          last_message_at: string | null
          linked_count: number
          message_count: number
          participants: Json
          provider_thread_id: string
          snippet: string | null
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          folder?: string
          has_attachments?: boolean
          id?: string
          is_flagged?: boolean
          last_message_at?: string | null
          linked_count?: number
          message_count?: number
          participants?: Json
          provider_thread_id: string
          snippet?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          folder?: string
          has_attachments?: boolean
          id?: string
          is_flagged?: boolean
          last_message_at?: string | null
          linked_count?: number
          message_count?: number
          participants?: Json
          provider_thread_id?: string
          snippet?: string | null
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_email_threads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_emails: {
        Row: {
          account_id: string
          bcc_addresses: Json
          body_html: string | null
          body_text: string | null
          cc_addresses: Json
          created_at: string
          from_address: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          in_reply_to: string | null
          is_draft: boolean
          is_read: boolean
          provider_message_id: string
          raw_headers: Json
          sent_at: string | null
          subject: string | null
          thread_id: string
          to_addresses: Json
        }
        Insert: {
          account_id: string
          bcc_addresses?: Json
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json
          created_at?: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          is_draft?: boolean
          is_read?: boolean
          provider_message_id: string
          raw_headers?: Json
          sent_at?: string | null
          subject?: string | null
          thread_id: string
          to_addresses?: Json
        }
        Update: {
          account_id?: string
          bcc_addresses?: Json
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json
          created_at?: string
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          is_draft?: boolean
          is_read?: boolean
          provider_message_id?: string
          raw_headers?: Json
          sent_at?: string | null
          subject?: string | null
          thread_id?: string
          to_addresses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tracked_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_emails_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "tracked_email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      training_assignments: {
        Row: {
          assigned_by: string | null
          certificate_url: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          employee_id: string
          id: string
          notes: string | null
          score: number | null
          status: Database["public"]["Enums"]["training_status"]
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          certificate_url?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["training_status"]
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          certificate_url?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["training_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["training_category"]
          cpe_credits: number | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_hours: number | null
          id: string
          provider: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: Database["public"]["Enums"]["training_category"]
          cpe_credits?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          provider?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["training_category"]
          cpe_credits?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          provider?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_notes: {
        Row: {
          content: Json | null
          course_id: string | null
          created_at: string
          employee_id: string
          id: string
          sharepoint_item_id: string | null
          updated_at: string
        }
        Insert: {
          content?: Json | null
          course_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          sharepoint_item_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: Json | null
          course_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          sharepoint_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_path_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          due_date: string | null
          employee_id: string
          id: string
          path_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          id?: string
          path_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          path_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_path_assignments_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      training_path_items: {
        Row: {
          course_id: string
          created_at: string
          id: string
          path_id: string
          position: number
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          path_id: string
          position?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          path_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_path_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_path_items_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "training_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      training_paths: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          firm_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          firm_id: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          firm_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_paths_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "training_paths_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_client_prefs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          pinned: boolean
          sort_index: number
          stream: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          sort_index?: number
          stream: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          sort_index?: number
          stream?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          device_id: string
          first_seen_at: string
          id: string
          label: string | null
          last_chosen_at: string | null
          last_ip: unknown
          last_seen_at: string
          revoked_at: string | null
          revoked_reason: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_id: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_chosen_at?: string | null
          last_ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_id?: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_chosen_at?: string | null
          last_ip?: unknown
          last_seen_at?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_hub_permissions: {
        Row: {
          allowed: boolean
          module_key: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          allowed?: boolean
          module_key: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          allowed?: boolean
          module_key?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_otp_channels: {
        Row: {
          channel: string
          created_at: string
          destination: string
          id: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          destination: string
          id?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          destination?: string
          id?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          subrole_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          subrole_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          subrole_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_subrole_id_fkey"
            columns: ["subrole_id"]
            isOneToOne: false
            referencedRelation: "role_subroles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ui_prefs: {
        Row: {
          scope: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          scope: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          scope?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      whatsapp_notification_prefs: {
        Row: {
          enabled: boolean
          notify_on_assigned: boolean
          notify_on_commented: boolean
          notify_on_due_soon: boolean
          notify_on_status: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          notify_on_assigned?: boolean
          notify_on_commented?: boolean
          notify_on_due_soon?: boolean
          notify_on_status?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          notify_on_assigned?: boolean
          notify_on_commented?: boolean
          notify_on_due_soon?: boolean
          notify_on_status?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_notification_queue: {
        Row: {
          actor_name: string | null
          created_at: string
          error: string | null
          extra: Json | null
          id: string
          notification_type: string
          sent_at: string | null
          task_id: string | null
          task_title: string | null
          user_id: string
        }
        Insert: {
          actor_name?: string | null
          created_at?: string
          error?: string | null
          extra?: Json | null
          id?: string
          notification_type: string
          sent_at?: string | null
          task_id?: string | null
          task_title?: string | null
          user_id: string
        }
        Update: {
          actor_name?: string | null
          created_at?: string
          error?: string | null
          extra?: Json | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          task_id?: string | null
          task_title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notification_queue_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_firms: {
        Row: {
          firm_id: string
          template_id: string
        }
        Insert: {
          firm_id: string
          template_id: string
        }
        Update: {
          firm_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_firms_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_health"
            referencedColumns: ["firm_id"]
          },
          {
            foreignKeyName: "workflow_template_firms_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_firms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_projects: {
        Row: {
          project_id: string
          template_id: string
        }
        Insert: {
          project_id: string
          template_id: string
        }
        Update: {
          project_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          category: string
          created_by: string | null
          description: string | null
          email_body: string | null
          email_subject: string | null
          id: string
          is_system: boolean
          name: string
          project_types: string[]
          slug: string | null
          sort_order: number
          template: Database["public"]["Enums"]["template_type"] | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_by?: string | null
          description?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_system?: boolean
          name: string
          project_types?: string[]
          slug?: string | null
          sort_order?: number
          template?: Database["public"]["Enums"]["template_type"] | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_by?: string | null
          description?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_system?: boolean
          name?: string
          project_types?: string[]
          slug?: string | null
          sort_order?: number
          template?: Database["public"]["Enums"]["template_type"] | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      firm_health: {
        Row: {
          completed_count: number | null
          completion_pct: number | null
          firm_id: string | null
          firm_name: string | null
          project_count: number | null
          task_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      bulk_update_time_logs: {
        Args: {
          p_break_minutes?: number
          p_bulk_op_id: string
          p_effective_override?: number
          p_ids: string[]
          p_note_mode?: string
          p_note_value?: string
          p_set_break?: boolean
          p_set_effective?: boolean
        }
        Returns: {
          bulk_op_id: string
          updated_count: number
        }[]
      }
      can_manage_esign: { Args: { _firm_id: string }; Returns: boolean }
      can_manage_esign_envelope: {
        Args: { _envelope_id: string }
        Returns: boolean
      }
      can_manage_organizer: { Args: { _user_id: string }; Returns: boolean }
      can_view_deployment: {
        Args: { _deployment_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_esign_id_doc: {
        Args: { _envelope_id: string }
        Returns: boolean
      }
      claim_device_slot: {
        Args: {
          _device_id: string
          _ip?: unknown
          _label?: string
          _user_agent?: string
        }
        Returns: Json
      }
      clear_unread_override: {
        Args: { _scope: string; _target_id: string }
        Returns: undefined
      }
      create_chat_thread: {
        Args: { _kind: string; _member_ids: string[]; _name?: string }
        Returns: string
      }
      current_client_firm_id: { Args: never; Returns: string }
      current_user_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_user_firm_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      ensure_entity_for_firm_client: {
        Args: { _client_id: string; _project_id: string }
        Returns: string
      }
      ensure_project_default_entity: {
        Args: { _project_id: string }
        Returns: string
      }
      firm_member_can: {
        Args: { _capability: string; _firm_id: string }
        Returns: boolean
      }
      generate_direct_client_code: {
        Args: { _display_name: string }
        Returns: string
      }
      generate_fixed_person_cadence: {
        Args: { p_today?: string }
        Returns: number
      }
      get_org_tree: {
        Args: never
        Returns: {
          avatar_url: string
          department: string
          depth: number
          email: string
          full_name: string
          id: string
          path: string[]
          position_title: string
          reports_to: string
          status: string
        }[]
      }
      get_project_file_stats: {
        Args: { p_firm_id?: string }
        Returns: {
          project_id: string
          project_name: string
          sharepoint_drive_id: string
          sharepoint_file_count: number
          supabase_file_count: number
        }[]
      }
      get_public_reminder_owner: {
        Args: { p_token: string }
        Returns: {
          label: string
          owner_name: string
        }[]
      }
      get_thread_pref: {
        Args: { _kind: string; _thread_id: string }
        Returns: {
          level: string
          muted_until: string
        }[]
      }
      has_capability: {
        Args: { _capability: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_device: { Args: { _device_id: string }; Returns: Json }
      inbox_summary: {
        Args: { _scope?: string }
        Returns: {
          archived: boolean
          archived_at: string
          archived_auto: boolean
          assignee_id: string
          avatar_url: string
          avatar_user_id: string
          created_at: string
          firm_id: string
          firm_name: string
          id: string
          kind: string
          last_message_at: string
          last_message_preview: string
          notification_level: string
          pipeline_stage: string
          reviewer_id: string
          snoozed_until: string
          subtitle: string
          title: string
          unread: number
        }[]
      }
      increment_public_link_submission: {
        Args: { link_id: string }
        Returns: undefined
      }
      is_auth_rate_limited: {
        Args: {
          _identifier: string
          _kind: string
          _max_failures?: number
          _window_minutes?: number
        }
        Returns: boolean
      }
      is_chat_thread_member: { Args: { _thread_id: string }; Returns: boolean }
      is_internal_user_id: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_trusted_device: { Args: { _device_id: string }; Returns: boolean }
      log_access: {
        Args: { _reason?: string; _resource_id: string; _resource_type: string }
        Returns: undefined
      }
      lookup_invitation: { Args: { _token: string }; Returns: Json }
      mark_device_chosen: { Args: { _device_id: string }; Returns: undefined }
      mark_unread: {
        Args: { _scope: string; _target_id: string }
        Returns: undefined
      }
      mfa_enforcement_status: { Args: never; Returns: Json }
      mfa_required_coverage: { Args: never; Returns: Json }
      pick_unique_slug: {
        Args: {
          p_candidates: string[]
          p_scope_col: string
          p_scope_val: string
          p_table: unknown
        }
        Returns: string
      }
      portal_billable_time_summary: {
        Args: never
        Returns: {
          entry_count: number
          project_code: string
          project_id: string
          project_name: string
          task_id: string
          task_title: string
          total_minutes: number
        }[]
      }
      presence_heartbeat: { Args: { _status?: string }; Returns: undefined }
      project_effective_currency: {
        Args: { _project_id: string }
        Returns: string
      }
      prune_audit_log: { Args: never; Returns: number }
      record_auth_attempt: {
        Args: {
          _identifier: string
          _ip?: unknown
          _kind: string
          _success: boolean
          _ua?: string
        }
        Returns: undefined
      }
      record_message_seen: {
        Args: { _message_id: string; _scope: string }
        Returns: undefined
      }
      record_sensitive_action: {
        Args: {
          _action: string
          _details?: Json
          _ip?: unknown
          _target_id?: string
          _ua?: string
        }
        Returns: undefined
      }
      refresh_task_attachment_visibility: {
        Args: { _folder_path: string; _task_id: string }
        Returns: undefined
      }
      register_trusted_device: {
        Args: {
          _days?: number
          _device_id: string
          _ip?: unknown
          _label?: string
          _ua?: string
        }
        Returns: undefined
      }
      renumber_subtask_sort_order: {
        Args: { _task_id: string }
        Returns: undefined
      }
      resolve_active_pricing_period: {
        Args: { at: string; p_project: string }
        Returns: string
      }
      restore_all_chat_archives: { Args: never; Returns: number }
      revoke_and_claim_device: {
        Args: {
          _claim_device_id: string
          _ip?: unknown
          _label?: string
          _revoke_device_id: string
          _user_agent?: string
        }
        Returns: Json
      }
      revoke_other_devices: {
        Args: { _keep_device_id: string }
        Returns: number
      }
      revoke_user_sessions: { Args: { _user_id: string }; Returns: number }
      rpc_update_gemini_daily_rollup: {
        Args: {
          p_calls: number
          p_cost: number
          p_errors: number
          p_input_tokens: number
          p_model: string
          p_org_id: string
          p_output_tokens: number
          p_tier: string
        }
        Returns: undefined
      }
      run_chat_auto_archive: { Args: never; Returns: number }
      set_notification_pref: {
        Args: { _level: string; _scope: string; _target_id: string }
        Returns: undefined
      }
      set_thread_pref: {
        Args: {
          _kind: string
          _level: string
          _muted_until?: string
          _thread_id: string
        }
        Returns: undefined
      }
      slugify: { Args: { p: string }; Returns: string }
      snooze_thread: {
        Args: { _scope: string; _target_id: string; _until: string }
        Returns: undefined
      }
      stop_timer_group: { Args: { _group_id: string }; Returns: number }
      submit_public_reminder: {
        Args: {
          p_body: string
          p_body_rich: Json
          p_remind_at: string
          p_sender_name: string
          p_token: string
        }
        Returns: string
      }
      table_row_estimate: { Args: { p_table: unknown }; Returns: number }
      task_capability: {
        Args: { _capability: string; _task_id: string }
        Returns: boolean
      }
      toggle_chat_archive: {
        Args: { _kind: string; _target_id: string }
        Returns: boolean
      }
      toggle_reaction: {
        Args: { _emoji: string; _message_id: string; _scope: string }
        Returns: boolean
      }
      toggle_star: {
        Args: { _message_id: string; _scope: string }
        Returns: boolean
      }
      undo_bulk_op: { Args: { p_bulk_op_id: string }; Returns: number }
      unsnooze_thread: {
        Args: { _scope: string; _target_id: string }
        Returns: undefined
      }
      user_can_access_firm: { Args: { _firm_id: string }; Returns: boolean }
      user_can_view_thread: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_note_share: {
        Args: { _note_id: string; _require_edit?: boolean }
        Returns: boolean
      }
      user_has_reminder_share: {
        Args: { p_reminder_id: string }
        Returns: boolean
      }
      user_has_verified_mfa: { Args: { _user_id: string }; Returns: boolean }
      user_owns_note: { Args: { _note_id: string }; Returns: boolean }
      user_owns_reminder: { Args: { p_reminder_id: string }; Returns: boolean }
      user_requires_mfa: { Args: { _user_id: string }; Returns: boolean }
      validate_split_distribution: {
        Args: { splits: Json; total: number }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "employee"
        | "client"
        | "super_admin"
        | "finance_manager"
        | "hr_manager"
      asset_category:
        | "laptop"
        | "desktop"
        | "monitor"
        | "phone"
        | "tablet"
        | "peripheral"
        | "furniture"
        | "software_license"
        | "other"
      asset_status: "in_stock" | "assigned" | "in_repair" | "retired" | "lost"
      attendance_status:
        | "present"
        | "absent"
        | "late"
        | "half_day"
        | "remote"
        | "holiday"
      bank_feed_status: "pending" | "posted" | "excluded"
      billable_event_source:
        | "stage_completion"
        | "time_log"
        | "fixed_person_cadence"
        | "tbd_manual"
      billable_event_status:
        | "ready"
        | "deferred"
        | "invoiced"
        | "recalled"
        | "superseded"
      book_tag: "both" | "tax_only" | "actual_only"
      budget_journal_status: "draft" | "posted" | "archived"
      budget_line_entity_type: "customer" | "employee" | "vendor" | "none"
      budget_line_sub_type: "client_revenue" | "payroll" | "expense"
      budget_reporting_book: "both" | "tax_only" | "actual_only"
      campaign_channel:
        | "email"
        | "social"
        | "events"
        | "content"
        | "referral"
        | "paid"
        | "seo"
        | "other"
      campaign_status: "planned" | "in_progress" | "live" | "done" | "cancelled"
      coa_account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "petty_cash"
        | "cash_bank"
        | "payroll"
      contract_doc_format: "docx" | "pdf"
      contract_template_status: "draft" | "published" | "archived"
      contract_type: "nda" | "sla" | "other"
      direct_client_type: "individual" | "business"
      entity_type: "individual" | "business"
      esign_auth_method: "email_link" | "sms_otp" | "access_code"
      esign_envelope_status:
        | "draft"
        | "sent"
        | "in_progress"
        | "completed"
        | "declined"
        | "voided"
        | "expired"
      esign_event:
        | "envelope_created"
        | "envelope_sent"
        | "envelope_voided"
        | "envelope_expired"
        | "envelope_completed"
        | "recipient_notified"
        | "recipient_reminded"
        | "auth_challenged"
        | "auth_passed"
        | "auth_failed"
        | "consent_accepted"
        | "document_viewed"
        | "field_filled"
        | "signature_applied"
        | "recipient_completed"
        | "recipient_declined"
        | "certificate_generated"
        | "verification_scanned"
        | "reminder_sent"
        | "project_updated"
      esign_field_type:
        | "signature"
        | "initials"
        | "text"
        | "checkbox"
        | "radio"
        | "date_signed"
        | "name"
        | "email"
        | "company"
        | "title"
        | "attachment"
        | "signer_id_document"
      esign_recipient_role: "signer" | "approver" | "viewer" | "cc"
      esign_recipient_status:
        | "pending"
        | "notified"
        | "viewed"
        | "consented"
        | "authenticated"
        | "completed"
        | "declined"
      esign_routing_mode: "parallel" | "sequential"
      esign_target_kind: "direct_client" | "cpa" | "hr"
      invoice_line_source:
        | "time_log"
        | "task"
        | "manual"
        | "billable_event"
        | "fixed_person_retainer"
        | "tbd_manual"
      invoice_status: "draft" | "sent" | "partial" | "paid" | "void"
      invoice_type: "invoice" | "proforma"
      journal_source:
        | "manual"
        | "invoice"
        | "payment"
        | "petty_cash"
        | "receipt"
        | "payroll"
        | "bank"
      key_status: "available" | "checked_out" | "lost" | "retired"
      key_type: "key" | "card" | "fob" | "code"
      lead_activity_type:
        | "note"
        | "call"
        | "email"
        | "meeting"
        | "proposal"
        | "other"
      lead_source:
        | "referral"
        | "website"
        | "cold_outreach"
        | "event"
        | "partner"
        | "other"
      lead_stage:
        | "new"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type:
        | "vacation"
        | "sick"
        | "personal"
        | "unpaid"
        | "bereavement"
        | "other"
      link_type: "knowledge_hub" | "sharepoint" | "client_portal" | "other"
      marketing_asset_type:
        | "case_study"
        | "collateral"
        | "blog_post"
        | "template"
        | "image"
        | "video"
        | "link"
        | "other"
      message_scope: "firm" | "task"
      organizer_block_type:
        | "section"
        | "subsection"
        | "info"
        | "short_text"
        | "long_text"
        | "number"
        | "currency"
        | "yes_no"
        | "single_choice"
        | "multi_choice"
        | "date"
        | "date_range"
        | "file_upload"
        | "signature"
        | "address"
        | "table"
        | "divider"
        | "attachment_request"
        | "rating"
        | "matrix"
        | "rich_text"
        | "multi_file"
        | "calculated"
      organizer_deployment_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "under_review"
        | "graded"
        | "returned"
        | "cancelled"
      organizer_display_mode: "card" | "page"
      organizer_purpose:
        | "tax"
        | "hr_exam"
        | "onboarding"
        | "learning_quiz"
        | "generic"
      organizer_review_action:
        | "graded"
        | "returned"
        | "reopened"
        | "note_updated"
        | "score_overridden"
      organizer_target_type:
        | "client_entity"
        | "profile"
        | "task"
        | "project"
        | "course"
        | "firm"
        | "direct_client"
      organizer_template_status: "draft" | "published" | "archived"
      payroll_run_status:
        | "draft"
        | "processing"
        | "approved"
        | "paid"
        | "cancelled"
      pdf_doc_type:
        | "invoice"
        | "proforma"
        | "salary_slip"
        | "financial_report"
        | "bank_recon"
        | "petty_cash_recon"
      pdf_field_type:
        | "section"
        | "logo"
        | "static_text"
        | "placeholder"
        | "divider"
        | "spacer"
        | "line_items_table"
        | "totals_block"
        | "earnings_deductions_table"
        | "report_table"
        | "signature_block"
        | "payment_details"
        | "notes_block"
      pdf_template_status: "draft" | "published" | "archived"
      petty_cash_direction: "in" | "out"
      petty_cash_entry_type: "issuance" | "top_up" | "refund" | "adjustment"
      petty_cash_recon_status: "draft" | "submitted" | "approved" | "rejected"
      pipeline_stage:
        | "handover_received"
        | "in_prep"
        | "internal_qc"
        | "waiting_cpa"
        | "ready_for_delivery"
        | "final_signoff"
      position_type:
        | "partner"
        | "manager"
        | "senior"
        | "staff"
        | "reviewer"
        | "preparer"
        | "client_contact"
        | "other"
      pricing_model_kind:
        | "pay_per_task"
        | "effective_hours"
        | "fixed_person"
        | "tbd"
      project_type:
        | "accounting"
        | "tax_preparation"
        | "sales_tax"
        | "company_formation"
        | "payroll_processing"
        | "other"
        | "auditing"
      software_type:
        | "lacerte"
        | "drake"
        | "cch_axcess"
        | "ultratax"
        | "proconnect"
        | "other"
      subtask_status: "todo" | "in_progress" | "done"
      task_complexity: "a_hard" | "b_medium" | "c_easy"
      task_priority: "low" | "medium" | "high"
      task_status:
        | "draft"
        | "in_progress"
        | "review"
        | "waiting_client"
        | "complete"
      tax_software:
        | "lacerte"
        | "drake"
        | "cch_axcess"
        | "ultratax"
        | "proconnect"
        | "other"
      template_type:
        | "form_1065"
        | "form_1120s"
        | "form_1120"
        | "form_1040"
        | "none"
      ticket_category:
        | "it_support"
        | "facilities"
        | "hr"
        | "suggestion"
        | "other"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      training_category:
        | "compliance"
        | "technical"
        | "soft_skills"
        | "onboarding"
        | "other"
      training_status:
        | "assigned"
        | "in_progress"
        | "completed"
        | "overdue"
        | "waived"
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
      app_role: [
        "admin",
        "employee",
        "client",
        "super_admin",
        "finance_manager",
        "hr_manager",
      ],
      asset_category: [
        "laptop",
        "desktop",
        "monitor",
        "phone",
        "tablet",
        "peripheral",
        "furniture",
        "software_license",
        "other",
      ],
      asset_status: ["in_stock", "assigned", "in_repair", "retired", "lost"],
      attendance_status: [
        "present",
        "absent",
        "late",
        "half_day",
        "remote",
        "holiday",
      ],
      bank_feed_status: ["pending", "posted", "excluded"],
      billable_event_source: [
        "stage_completion",
        "time_log",
        "fixed_person_cadence",
        "tbd_manual",
      ],
      billable_event_status: [
        "ready",
        "deferred",
        "invoiced",
        "recalled",
        "superseded",
      ],
      book_tag: ["both", "tax_only", "actual_only"],
      budget_journal_status: ["draft", "posted", "archived"],
      budget_line_entity_type: ["customer", "employee", "vendor", "none"],
      budget_line_sub_type: ["client_revenue", "payroll", "expense"],
      budget_reporting_book: ["both", "tax_only", "actual_only"],
      campaign_channel: [
        "email",
        "social",
        "events",
        "content",
        "referral",
        "paid",
        "seo",
        "other",
      ],
      campaign_status: ["planned", "in_progress", "live", "done", "cancelled"],
      coa_account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "petty_cash",
        "cash_bank",
        "payroll",
      ],
      contract_doc_format: ["docx", "pdf"],
      contract_template_status: ["draft", "published", "archived"],
      contract_type: ["nda", "sla", "other"],
      direct_client_type: ["individual", "business"],
      entity_type: ["individual", "business"],
      esign_auth_method: ["email_link", "sms_otp", "access_code"],
      esign_envelope_status: [
        "draft",
        "sent",
        "in_progress",
        "completed",
        "declined",
        "voided",
        "expired",
      ],
      esign_event: [
        "envelope_created",
        "envelope_sent",
        "envelope_voided",
        "envelope_expired",
        "envelope_completed",
        "recipient_notified",
        "recipient_reminded",
        "auth_challenged",
        "auth_passed",
        "auth_failed",
        "consent_accepted",
        "document_viewed",
        "field_filled",
        "signature_applied",
        "recipient_completed",
        "recipient_declined",
        "certificate_generated",
        "verification_scanned",
        "reminder_sent",
        "project_updated",
      ],
      esign_field_type: [
        "signature",
        "initials",
        "text",
        "checkbox",
        "radio",
        "date_signed",
        "name",
        "email",
        "company",
        "title",
        "attachment",
        "signer_id_document",
      ],
      esign_recipient_role: ["signer", "approver", "viewer", "cc"],
      esign_recipient_status: [
        "pending",
        "notified",
        "viewed",
        "consented",
        "authenticated",
        "completed",
        "declined",
      ],
      esign_routing_mode: ["parallel", "sequential"],
      esign_target_kind: ["direct_client", "cpa", "hr"],
      invoice_line_source: [
        "time_log",
        "task",
        "manual",
        "billable_event",
        "fixed_person_retainer",
        "tbd_manual",
      ],
      invoice_status: ["draft", "sent", "partial", "paid", "void"],
      invoice_type: ["invoice", "proforma"],
      journal_source: [
        "manual",
        "invoice",
        "payment",
        "petty_cash",
        "receipt",
        "payroll",
        "bank",
      ],
      key_status: ["available", "checked_out", "lost", "retired"],
      key_type: ["key", "card", "fob", "code"],
      lead_activity_type: [
        "note",
        "call",
        "email",
        "meeting",
        "proposal",
        "other",
      ],
      lead_source: [
        "referral",
        "website",
        "cold_outreach",
        "event",
        "partner",
        "other",
      ],
      lead_stage: [
        "new",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: [
        "vacation",
        "sick",
        "personal",
        "unpaid",
        "bereavement",
        "other",
      ],
      link_type: ["knowledge_hub", "sharepoint", "client_portal", "other"],
      marketing_asset_type: [
        "case_study",
        "collateral",
        "blog_post",
        "template",
        "image",
        "video",
        "link",
        "other",
      ],
      message_scope: ["firm", "task"],
      organizer_block_type: [
        "section",
        "subsection",
        "info",
        "short_text",
        "long_text",
        "number",
        "currency",
        "yes_no",
        "single_choice",
        "multi_choice",
        "date",
        "date_range",
        "file_upload",
        "signature",
        "address",
        "table",
        "divider",
        "attachment_request",
        "rating",
        "matrix",
        "rich_text",
        "multi_file",
        "calculated",
      ],
      organizer_deployment_status: [
        "not_started",
        "in_progress",
        "submitted",
        "under_review",
        "graded",
        "returned",
        "cancelled",
      ],
      organizer_display_mode: ["card", "page"],
      organizer_purpose: [
        "tax",
        "hr_exam",
        "onboarding",
        "learning_quiz",
        "generic",
      ],
      organizer_review_action: [
        "graded",
        "returned",
        "reopened",
        "note_updated",
        "score_overridden",
      ],
      organizer_target_type: [
        "client_entity",
        "profile",
        "task",
        "project",
        "course",
        "firm",
        "direct_client",
      ],
      organizer_template_status: ["draft", "published", "archived"],
      payroll_run_status: [
        "draft",
        "processing",
        "approved",
        "paid",
        "cancelled",
      ],
      pdf_doc_type: [
        "invoice",
        "proforma",
        "salary_slip",
        "financial_report",
        "bank_recon",
        "petty_cash_recon",
      ],
      pdf_field_type: [
        "section",
        "logo",
        "static_text",
        "placeholder",
        "divider",
        "spacer",
        "line_items_table",
        "totals_block",
        "earnings_deductions_table",
        "report_table",
        "signature_block",
        "payment_details",
        "notes_block",
      ],
      pdf_template_status: ["draft", "published", "archived"],
      petty_cash_direction: ["in", "out"],
      petty_cash_entry_type: ["issuance", "top_up", "refund", "adjustment"],
      petty_cash_recon_status: ["draft", "submitted", "approved", "rejected"],
      pipeline_stage: [
        "handover_received",
        "in_prep",
        "internal_qc",
        "waiting_cpa",
        "ready_for_delivery",
        "final_signoff",
      ],
      position_type: [
        "partner",
        "manager",
        "senior",
        "staff",
        "reviewer",
        "preparer",
        "client_contact",
        "other",
      ],
      pricing_model_kind: [
        "pay_per_task",
        "effective_hours",
        "fixed_person",
        "tbd",
      ],
      project_type: [
        "accounting",
        "tax_preparation",
        "sales_tax",
        "company_formation",
        "payroll_processing",
        "other",
        "auditing",
      ],
      software_type: [
        "lacerte",
        "drake",
        "cch_axcess",
        "ultratax",
        "proconnect",
        "other",
      ],
      subtask_status: ["todo", "in_progress", "done"],
      task_complexity: ["a_hard", "b_medium", "c_easy"],
      task_priority: ["low", "medium", "high"],
      task_status: [
        "draft",
        "in_progress",
        "review",
        "waiting_client",
        "complete",
      ],
      tax_software: [
        "lacerte",
        "drake",
        "cch_axcess",
        "ultratax",
        "proconnect",
        "other",
      ],
      template_type: [
        "form_1065",
        "form_1120s",
        "form_1120",
        "form_1040",
        "none",
      ],
      ticket_category: [
        "it_support",
        "facilities",
        "hr",
        "suggestion",
        "other",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      training_category: [
        "compliance",
        "technical",
        "soft_skills",
        "onboarding",
        "other",
      ],
      training_status: [
        "assigned",
        "in_progress",
        "completed",
        "overdue",
        "waived",
      ],
    },
  },
} as const
