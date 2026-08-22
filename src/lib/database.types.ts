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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_domains: {
        Row: {
          account_id: string
          added_by: string | null
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          account_id: string
          added_by?: string | null
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          account_id?: string
          added_by?: string | null
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_domains_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_domains_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string | null
          created_at: string
          deleted_at: string | null
          hq_address_line1: string | null
          hq_address_line2: string | null
          hq_city: string | null
          hq_postal_code: string | null
          hq_state: string | null
          id: string
          import_batch_id: string | null
          name: string
          notes: string | null
          owner_id: string | null
          primary_contact_id: string | null
          secondary_owner_id: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          deleted_at?: string | null
          hq_address_line1?: string | null
          hq_address_line2?: string | null
          hq_city?: string | null
          hq_postal_code?: string | null
          hq_state?: string | null
          id?: string
          import_batch_id?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          secondary_owner_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          account_type?: string | null
          created_at?: string
          deleted_at?: string | null
          hq_address_line1?: string | null
          hq_address_line2?: string | null
          hq_city?: string | null
          hq_postal_code?: string | null
          hq_state?: string | null
          id?: string
          import_batch_id?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          secondary_owner_id?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_primary_contact_fk"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          activity_type_id: string
          body: string | null
          building_id: string | null
          contact_id: string | null
          created_at: string
          employee_id: string | null
          external_id: string | null
          id: string
          import_batch_id: string | null
          logged_by: string | null
          occurred_at: string
          opportunity_id: string | null
          source: Database["public"]["Enums"]["activity_source"]
          subject: string
        }
        Insert: {
          account_id?: string | null
          activity_type_id: string
          body?: string | null
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          employee_id?: string | null
          external_id?: string | null
          id?: string
          import_batch_id?: string | null
          logged_by?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          subject: string
        }
        Update: {
          account_id?: string | null
          activity_type_id?: string
          body?: string | null
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          employee_id?: string | null
          external_id?: string | null
          id?: string
          import_batch_id?: string | null
          logged_by?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "activities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "activities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "activities_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_weighted_pipeline"
            referencedColumns: ["opportunity_id"]
          },
        ]
      }
      activity_types: {
        Row: {
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      attachments: {
        Row: {
          account_id: string | null
          activity_id: string | null
          building_id: string | null
          caption: string | null
          created_at: string
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          mime_type: string | null
          project_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          account_id?: string | null
          activity_id?: string | null
          building_id?: string | null
          caption?: string | null
          created_at?: string
          file_name: string
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
          mime_type?: string | null
          project_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string | null
          activity_id?: string | null
          building_id?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
          mime_type?: string | null
          project_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "attachments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "attachments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "attachments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "attachments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "attachments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at: string
          changed_by: string | null
          id: number
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      building_contract_periods: {
        Row: {
          annual_value: number | null
          building_id: string
          change_reason: Database["public"]["Enums"]["contract_change_reason"]
          created_at: string
          created_by: string | null
          effective_date: string
          end_date: string | null
          id: string
          import_batch_id: string | null
          monthly_value: number
          notes: string | null
        }
        Insert: {
          annual_value?: number | null
          building_id: string
          change_reason?: Database["public"]["Enums"]["contract_change_reason"]
          created_at?: string
          created_by?: string | null
          effective_date: string
          end_date?: string | null
          id?: string
          import_batch_id?: string | null
          monthly_value: number
          notes?: string | null
        }
        Update: {
          annual_value?: number | null
          building_id?: string
          change_reason?: Database["public"]["Enums"]["contract_change_reason"]
          created_at?: string
          created_by?: string | null
          effective_date?: string
          end_date?: string | null
          id?: string
          import_batch_id?: string | null
          monthly_value?: number
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_contract_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_contract_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_contract_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_contract_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_contract_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_contract_periods_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      building_services: {
        Row: {
          building_id: string
          frequency: string | null
          id: string
          notes: string | null
          service_type_id: string
        }
        Insert: {
          building_id: string
          frequency?: string | null
          id?: string
          notes?: string | null
          service_type_id: string
        }
        Update: {
          building_id?: string
          frequency?: string | null
          id?: string
          notes?: string | null
          service_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_services_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_services_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_services_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_services_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "building_services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          account_id: string
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          day_porter: boolean
          day_porter_days_per_week: number | null
          day_porter_hours_per_day: number | null
          deleted_at: string | null
          entity: Database["public"]["Enums"]["operating_entity"]
          floors: number | null
          health_score: Database["public"]["Enums"]["health_score"] | null
          id: string
          import_batch_id: string | null
          inspectqa_site_id: string | null
          loss_reason_id: string | null
          lost_date: string | null
          lost_to_competitor_id: string | null
          name: string
          night_days_per_week: number | null
          night_hours_per_night: number | null
          owner_id: string | null
          postal_code: string | null
          property_type_id: string | null
          scope_notes: string | null
          secondary_owner_id: string | null
          site_id: string | null
          square_footage: number | null
          state: string | null
          status: Database["public"]["Enums"]["building_status"]
          tenancy: Database["public"]["Enums"]["building_tenancy"] | null
          updated_at: string
          weekend_hours_per_week: number | null
          weekend_service: boolean
        }
        Insert: {
          account_id: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          day_porter?: boolean
          day_porter_days_per_week?: number | null
          day_porter_hours_per_day?: number | null
          deleted_at?: string | null
          entity?: Database["public"]["Enums"]["operating_entity"]
          floors?: number | null
          health_score?: Database["public"]["Enums"]["health_score"] | null
          id?: string
          import_batch_id?: string | null
          inspectqa_site_id?: string | null
          loss_reason_id?: string | null
          lost_date?: string | null
          lost_to_competitor_id?: string | null
          name: string
          night_days_per_week?: number | null
          night_hours_per_night?: number | null
          owner_id?: string | null
          postal_code?: string | null
          property_type_id?: string | null
          scope_notes?: string | null
          secondary_owner_id?: string | null
          site_id?: string | null
          square_footage?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["building_status"]
          tenancy?: Database["public"]["Enums"]["building_tenancy"] | null
          updated_at?: string
          weekend_hours_per_week?: number | null
          weekend_service?: boolean
        }
        Update: {
          account_id?: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          day_porter?: boolean
          day_porter_days_per_week?: number | null
          day_porter_hours_per_day?: number | null
          deleted_at?: string | null
          entity?: Database["public"]["Enums"]["operating_entity"]
          floors?: number | null
          health_score?: Database["public"]["Enums"]["health_score"] | null
          id?: string
          import_batch_id?: string | null
          inspectqa_site_id?: string | null
          loss_reason_id?: string | null
          lost_date?: string | null
          lost_to_competitor_id?: string | null
          name?: string
          night_days_per_week?: number | null
          night_hours_per_night?: number | null
          owner_id?: string | null
          postal_code?: string | null
          property_type_id?: string | null
          scope_notes?: string | null
          secondary_owner_id?: string | null
          site_id?: string | null
          square_footage?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["building_status"]
          tenancy?: Database["public"]["Enums"]["building_tenancy"] | null
          updated_at?: string
          weekend_hours_per_week?: number | null
          weekend_service?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_loss_reason_id_fkey"
            columns: ["loss_reason_id"]
            isOneToOne: false
            referencedRelation: "loss_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_lost_to_competitor_id_fkey"
            columns: ["lost_to_competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_lost_to_competitor_id_fkey"
            columns: ["lost_to_competitor_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["competitor_id"]
          },
          {
            foreignKeyName: "buildings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["property_type_id"]
          },
          {
            foreignKeyName: "buildings_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_contracts"
            referencedColumns: ["site_id"]
          },
        ]
      }
      competitors: {
        Row: {
          id: string
          is_active: boolean
          name: string
          notes: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      contact_buildings: {
        Row: {
          building_id: string
          contact_id: string
          is_primary: boolean
          role_at_building: string | null
        }
        Insert: {
          building_id: string
          contact_id: string
          is_primary?: boolean
          role_at_building?: string | null
        }
        Update: {
          building_id?: string
          contact_id?: string
          is_primary?: boolean
          role_at_building?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "contact_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "contact_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "contact_buildings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_role: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          import_batch_id: string | null
          last_name: string
          mobile: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_role?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_role?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          last_name?: string
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "contacts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_assignment_rates: {
        Row: {
          assignment_id: string
          bill_rate: number | null
          pay_rate: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignment_id: string
          bill_rate?: number | null
          pay_rate?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignment_id?: string
          bill_rate?: number | null
          pay_rate?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_assignment_rates_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "employee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignment_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_assignments: {
        Row: {
          building_id: string
          created_at: string
          employee_id: string
          end_date: string | null
          end_reason: string | null
          id: string
          import_batch_id: string | null
          role: Database["public"]["Enums"]["assignment_role"] | null
          scheduled_hours_per_week: number | null
          shift: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          employee_id: string
          end_date?: string | null
          end_reason?: string | null
          id?: string
          import_batch_id?: string | null
          role?: Database["public"]["Enums"]["assignment_role"] | null
          scheduled_hours_per_week?: number | null
          shift?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          employee_id?: string
          end_date?: string | null
          end_reason?: string | null
          id?: string
          import_batch_id?: string | null
          role?: Database["public"]["Enums"]["assignment_role"] | null
          scheduled_hours_per_week?: number | null
          shift?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_assignments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_compensation: {
        Row: {
          base_pay_rate: number | null
          employee_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_pay_rate?: number | null
          employee_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_pay_rate?: number | null
          employee_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_compensation_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_compensation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          employment_type: string | null
          end_date: string | null
          first_name: string
          id: string
          import_batch_id: string | null
          last_name: string
          paychex_employee_id: string | null
          phone: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["employee_status"]
          supervisor_id: string | null
          termination_reason: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employment_type?: string | null
          end_date?: string | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          last_name?: string
          paychex_employee_id?: string | null
          phone?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          supervisor_id?: string | null
          termination_reason?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          employment_type?: string | null
          end_date?: string | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          last_name?: string
          paychex_employee_id?: string | null
          phone?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          supervisor_id?: string | null
          termination_reason?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      import_batches: {
        Row: {
          committed_at: string | null
          created_at: string
          file_name: string | null
          id: string
          imported_by: string | null
          mapping: Json
          row_count: number
          source_tab: string
          status: Database["public"]["Enums"]["import_status"]
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          mapping?: Json
          row_count?: number
          source_tab: string
          status?: Database["public"]["Enums"]["import_status"]
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          mapping?: Json
          row_count?: number
          source_tab?: string
          status?: Database["public"]["Enums"]["import_status"]
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_field_changes: {
        Row: {
          batch_id: string
          column_name: string
          created_at: string
          id: number
          new_value: Json
          old_value: Json
          record_id: string
          table_name: string
        }
        Insert: {
          batch_id: string
          column_name: string
          created_at?: string
          id?: never
          new_value: Json
          old_value: Json
          record_id: string
          table_name: string
        }
        Update: {
          batch_id?: string
          column_name?: string
          created_at?: string
          id?: never
          new_value?: Json
          old_value?: Json
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_field_changes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row_errors: {
        Row: {
          batch_id: string
          created_at: string
          error: string
          id: string
          raw_row: Json | null
          row_number: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          error: string
          id?: string
          raw_row?: Json | null
          row_number: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          error?: string
          id?: string
          raw_row?: Json | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_row_errors_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          activities_created: number
          already_seen: number
          ambiguous: number
          errors: string[]
          finished_at: string | null
          id: string
          ingested: number
          next_steps_created: number
          next_steps_updated: number
          next_steps_vanished: number
          ok: boolean | null
          ran_for_ms: number | null
          seen: number
          sources: string[]
          started_at: string
          stopped_early: boolean
          suggestions_written: number
          truncated: string[]
          unknown_senders: number
          unmatched: number
        }
        Insert: {
          activities_created?: number
          already_seen?: number
          ambiguous?: number
          errors?: string[]
          finished_at?: string | null
          id?: string
          ingested?: number
          next_steps_created?: number
          next_steps_updated?: number
          next_steps_vanished?: number
          ok?: boolean | null
          ran_for_ms?: number | null
          seen?: number
          sources?: string[]
          started_at?: string
          stopped_early?: boolean
          suggestions_written?: number
          truncated?: string[]
          unknown_senders?: number
          unmatched?: number
        }
        Update: {
          activities_created?: number
          already_seen?: number
          ambiguous?: number
          errors?: string[]
          finished_at?: string | null
          id?: string
          ingested?: number
          next_steps_created?: number
          next_steps_updated?: number
          next_steps_vanished?: number
          ok?: boolean | null
          ran_for_ms?: number | null
          seen?: number
          sources?: string[]
          started_at?: string
          stopped_early?: boolean
          suggestions_written?: number
          truncated?: string[]
          unknown_senders?: number
          unmatched?: number
        }
        Relationships: []
      }
      ingest_suggestions: {
        Row: {
          applied_batch_id: string | null
          confidence: Database["public"]["Enums"]["match_confidence"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          dedupe_key: string
          expires_at: string | null
          id: string
          ingested_item_id: string | null
          kind: Database["public"]["Enums"]["suggestion_kind"]
          payload: Json
          quote: string | null
          quote_end: number | null
          quote_start: number | null
          rationale: string
          status: Database["public"]["Enums"]["suggestion_status"]
          subject_id: string | null
          subject_table: string
        }
        Insert: {
          applied_batch_id?: string | null
          confidence: Database["public"]["Enums"]["match_confidence"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dedupe_key: string
          expires_at?: string | null
          id?: string
          ingested_item_id?: string | null
          kind: Database["public"]["Enums"]["suggestion_kind"]
          payload: Json
          quote?: string | null
          quote_end?: number | null
          quote_start?: number | null
          rationale: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          subject_id?: string | null
          subject_table: string
        }
        Update: {
          applied_batch_id?: string | null
          confidence?: Database["public"]["Enums"]["match_confidence"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dedupe_key?: string
          expires_at?: string | null
          id?: string
          ingested_item_id?: string | null
          kind?: Database["public"]["Enums"]["suggestion_kind"]
          payload?: Json
          quote?: string | null
          quote_end?: number | null
          quote_start?: number | null
          rationale?: string
          status?: Database["public"]["Enums"]["suggestion_status"]
          subject_id?: string | null
          subject_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_suggestions_applied_batch_id_fkey"
            columns: ["applied_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_suggestions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_suggestions_ingested_item_id_fkey"
            columns: ["ingested_item_id"]
            isOneToOne: false
            referencedRelation: "ingested_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_items: {
        Row: {
          activity_id: string | null
          direction: string | null
          external_id: string
          first_missed_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          mailbox_id: string | null
          matched_by: Database["public"]["Enums"]["match_confidence"] | null
          matched_on: string | null
          missed_sightings: number
          next_step_id: string | null
          occurred_at: string
          participants: Json
          snippet: string | null
          source: Database["public"]["Enums"]["activity_source"]
          status: Database["public"]["Enums"]["ingest_item_status"]
          subject: string
          thread_key: string | null
        }
        Insert: {
          activity_id?: string | null
          direction?: string | null
          external_id: string
          first_missed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mailbox_id?: string | null
          matched_by?: Database["public"]["Enums"]["match_confidence"] | null
          matched_on?: string | null
          missed_sightings?: number
          next_step_id?: string | null
          occurred_at: string
          participants?: Json
          snippet?: string | null
          source: Database["public"]["Enums"]["activity_source"]
          status?: Database["public"]["Enums"]["ingest_item_status"]
          subject?: string
          thread_key?: string | null
        }
        Update: {
          activity_id?: string | null
          direction?: string | null
          external_id?: string
          first_missed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          mailbox_id?: string | null
          matched_by?: Database["public"]["Enums"]["match_confidence"] | null
          matched_on?: string | null
          missed_sightings?: number
          next_step_id?: string | null
          occurred_at?: string
          participants?: Json
          snippet?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          status?: Database["public"]["Enums"]["ingest_item_status"]
          subject?: string
          thread_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingested_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingested_items_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingested_items_next_step_id_fkey"
            columns: ["next_step_id"]
            isOneToOne: false
            referencedRelation: "next_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          area_breakdown: Json | null
          building_id: string | null
          grade: string | null
          id: string
          inspected_at: string | null
          inspector_name: string | null
          inspectqa_id: string
          inspectqa_site_id: string | null
          report_url: string | null
          score: number | null
          synced_at: string
        }
        Insert: {
          area_breakdown?: Json | null
          building_id?: string | null
          grade?: string | null
          id?: string
          inspected_at?: string | null
          inspector_name?: string | null
          inspectqa_id: string
          inspectqa_site_id?: string | null
          report_url?: string | null
          score?: number | null
          synced_at?: string
        }
        Update: {
          area_breakdown?: Json | null
          building_id?: string | null
          grade?: string | null
          id?: string
          inspected_at?: string | null
          inspector_name?: string | null
          inspectqa_id?: string
          inspectqa_site_id?: string | null
          report_url?: string | null
          score?: number | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "inspections_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "inspections_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
        ]
      }
      inspectqa_site_map: {
        Row: {
          building_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          inspectqa_site_id: string
          site_name_raw: string | null
        }
        Insert: {
          building_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          inspectqa_site_id: string
          site_name_raw?: string | null
        }
        Update: {
          building_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          inspectqa_site_id?: string
          site_name_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspectqa_site_map_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspectqa_site_map_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "inspectqa_site_map_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "inspectqa_site_map_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "inspectqa_site_map_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      loss_reasons: {
        Row: {
          applies_to: Database["public"]["Enums"]["loss_reason_scope"]
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["loss_reason_scope"]
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["loss_reason_scope"]
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      match_aliases: {
        Row: {
          account_id: string | null
          added_by: string | null
          alias: string
          building_id: string | null
          created_at: string
          id: string
          note: string | null
          opportunity_id: string | null
        }
        Insert: {
          account_id?: string | null
          added_by?: string | null
          alias: string
          building_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          opportunity_id?: string | null
        }
        Update: {
          account_id?: string | null
          added_by?: string | null
          alias?: string
          building_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          opportunity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "match_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "match_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "match_aliases_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_aliases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_aliases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "match_aliases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "match_aliases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "match_aliases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_aliases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "match_aliases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_weighted_pipeline"
            referencedColumns: ["opportunity_id"]
          },
        ]
      }
      next_steps: {
        Row: {
          account_id: string | null
          activity_id: string | null
          all_day: boolean
          building_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          detail: string | null
          due_at: string | null
          employee_id: string | null
          external_id: string | null
          id: string
          import_batch_id: string | null
          opportunity_id: string | null
          origin: Database["public"]["Enums"]["next_step_origin"]
          owner_id: string | null
          source: Database["public"]["Enums"]["activity_source"]
          status: Database["public"]["Enums"]["next_step_status"]
          title: string
          updated_at: string
          vanished_at: string | null
          vanished_reason: string | null
        }
        Insert: {
          account_id?: string | null
          activity_id?: string | null
          all_day?: boolean
          building_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_at?: string | null
          employee_id?: string | null
          external_id?: string | null
          id?: string
          import_batch_id?: string | null
          opportunity_id?: string | null
          origin?: Database["public"]["Enums"]["next_step_origin"]
          owner_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          status?: Database["public"]["Enums"]["next_step_status"]
          title: string
          updated_at?: string
          vanished_at?: string | null
          vanished_reason?: string | null
        }
        Update: {
          account_id?: string | null
          activity_id?: string | null
          all_day?: boolean
          building_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_at?: string | null
          employee_id?: string | null
          external_id?: string | null
          id?: string
          import_batch_id?: string | null
          opportunity_id?: string | null
          origin?: Database["public"]["Enums"]["next_step_origin"]
          owner_id?: string | null
          source?: Database["public"]["Enums"]["activity_source"]
          status?: Database["public"]["Enums"]["next_step_status"]
          title?: string
          updated_at?: string
          vanished_at?: string | null
          vanished_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "next_steps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "next_steps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "next_steps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "next_steps_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "next_steps_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "next_steps_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "next_steps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "next_steps_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_steps_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "next_steps_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_weighted_pipeline"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "next_steps_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string | null
          actual_close_date: string | null
          address_line1: string | null
          address_line2: string | null
          annual_value: number | null
          building_id: string | null
          city: string | null
          competitor_id: string | null
          created_at: string
          current_staff_count: number | null
          deleted_at: string | null
          entity: Database["public"]["Enums"]["operating_entity"]
          expected_close_date: string | null
          id: string
          import_batch_id: string | null
          incumbent_provider: string | null
          lead_source_id: string | null
          loss_reason_id: string | null
          monthly_value: number | null
          name: string
          opened_on: string | null
          owner_id: string | null
          postal_code: string | null
          property_type_id: string | null
          scope_notes: string | null
          secondary_owner_id: string | null
          square_footage: number | null
          stage_id: string
          state: string | null
          updated_at: string
          win_notes: string | null
          win_reason_id: string | null
        }
        Insert: {
          account_id?: string | null
          actual_close_date?: string | null
          address_line1?: string | null
          address_line2?: string | null
          annual_value?: number | null
          building_id?: string | null
          city?: string | null
          competitor_id?: string | null
          created_at?: string
          current_staff_count?: number | null
          deleted_at?: string | null
          entity?: Database["public"]["Enums"]["operating_entity"]
          expected_close_date?: string | null
          id?: string
          import_batch_id?: string | null
          incumbent_provider?: string | null
          lead_source_id?: string | null
          loss_reason_id?: string | null
          monthly_value?: number | null
          name: string
          opened_on?: string | null
          owner_id?: string | null
          postal_code?: string | null
          property_type_id?: string | null
          scope_notes?: string | null
          secondary_owner_id?: string | null
          square_footage?: number | null
          stage_id: string
          state?: string | null
          updated_at?: string
          win_notes?: string | null
          win_reason_id?: string | null
        }
        Update: {
          account_id?: string | null
          actual_close_date?: string | null
          address_line1?: string | null
          address_line2?: string | null
          annual_value?: number | null
          building_id?: string | null
          city?: string | null
          competitor_id?: string | null
          created_at?: string
          current_staff_count?: number | null
          deleted_at?: string | null
          entity?: Database["public"]["Enums"]["operating_entity"]
          expected_close_date?: string | null
          id?: string
          import_batch_id?: string | null
          incumbent_provider?: string | null
          lead_source_id?: string | null
          loss_reason_id?: string | null
          monthly_value?: number | null
          name?: string
          opened_on?: string | null
          owner_id?: string | null
          postal_code?: string | null
          property_type_id?: string | null
          scope_notes?: string | null
          secondary_owner_id?: string | null
          square_footage?: number | null
          stage_id?: string
          state?: string | null
          updated_at?: string
          win_notes?: string | null
          win_reason_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["competitor_id"]
          },
          {
            foreignKeyName: "opportunities_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_loss_reason_id_fkey"
            columns: ["loss_reason_id"]
            isOneToOne: false
            referencedRelation: "loss_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["property_type_id"]
          },
          {
            foreignKeyName: "opportunities_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_funnel"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunities_win_reason_id_fkey"
            columns: ["win_reason_id"]
            isOneToOne: false
            referencedRelation: "win_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_events: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          id: string
          opportunity_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          opportunity_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          opportunity_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_funnel"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_weighted_pipeline"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_funnel"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          probability: number
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          probability?: number
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          probability?: number
          sort_order?: number
        }
        Relationships: []
      }
      profile_email_aliases: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          note: string | null
          profile_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          note?: string | null
          profile_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          note?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_email_aliases_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_email_aliases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_service: boolean
          role: Database["public"]["Enums"]["user_role"]
          sees_rates: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          is_service?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          sees_rates?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_service?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          sees_rates?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      project_employees: {
        Row: {
          employee_id: string
          hours: number | null
          project_id: string
        }
        Insert: {
          employee_id: string
          hours?: number | null
          project_id: string
        }
        Update: {
          employee_id?: string
          hours?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "project_employees_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_types: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          building_id: string
          completed_date: string | null
          created_at: string
          deleted_at: string | null
          id: string
          import_batch_id: string | null
          invoiced_amount: number | null
          name: string | null
          notes: string | null
          project_type_id: string | null
          quoted_amount: number | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          building_id: string
          completed_date?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          import_batch_id?: string | null
          invoiced_amount?: number | null
          name?: string | null
          notes?: string | null
          project_type_id?: string | null
          quoted_amount?: number | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          building_id?: string
          completed_date?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          import_batch_id?: string | null
          invoiced_amount?: number | null
          name?: string | null
          notes?: string | null
          project_type_id?: string | null
          quoted_amount?: number | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "projects_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "projects_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "projects_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      property_types: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_types: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      sites: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          floors: number | null
          id: string
          name: string
          notes: string | null
          postal_code: string | null
          square_footage: number | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          floors?: number | null
          id?: string
          name: string
          notes?: string | null
          postal_code?: string | null
          square_footage?: number | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          floors?: number | null
          id?: string
          name?: string
          notes?: string | null
          postal_code?: string | null
          square_footage?: number | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staffing_report_lines: {
        Row: {
          building_id: string | null
          building_name_raw: string | null
          created_at: string
          employee_id: string | null
          employee_name_raw: string | null
          hours: number | null
          id: string
          line_status: Database["public"]["Enums"]["staffing_line_status"]
          notes: string | null
          staffing_report_id: string
        }
        Insert: {
          building_id?: string | null
          building_name_raw?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name_raw?: string | null
          hours?: number | null
          id?: string
          line_status?: Database["public"]["Enums"]["staffing_line_status"]
          notes?: string | null
          staffing_report_id: string
        }
        Update: {
          building_id?: string | null
          building_name_raw?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name_raw?: string | null
          hours?: number | null
          id?: string
          line_status?: Database["public"]["Enums"]["staffing_line_status"]
          notes?: string | null
          staffing_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_report_lines_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_report_lines_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "staffing_report_lines_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "staffing_report_lines_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "staffing_report_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_report_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_staff_movement"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "staffing_report_lines_staffing_report_id_fkey"
            columns: ["staffing_report_id"]
            isOneToOne: false
            referencedRelation: "staffing_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_reports: {
        Row: {
          created_at: string
          id: string
          parse_status: Database["public"]["Enums"]["parse_status"]
          raw_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          submitted_by: string | null
          updated_at: string
          week_ending: string
        }
        Insert: {
          created_at?: string
          id?: string
          parse_status?: Database["public"]["Enums"]["parse_status"]
          raw_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          submitted_by?: string | null
          updated_at?: string
          week_ending: string
        }
        Update: {
          created_at?: string
          id?: string
          parse_status?: Database["public"]["Enums"]["parse_status"]
          raw_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          submitted_by?: string | null
          updated_at?: string
          week_ending?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_reports_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      win_reasons: {
        Row: {
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          building_id: string | null
          completed_at: string | null
          created_at_source: string | null
          description: string | null
          id: string
          inspectqa_id: string
          inspectqa_site_id: string | null
          priority: string | null
          status: string | null
          synced_at: string
        }
        Insert: {
          building_id?: string | null
          completed_at?: string | null
          created_at_source?: string | null
          description?: string | null
          id?: string
          inspectqa_id: string
          inspectqa_site_id?: string | null
          priority?: string | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          building_id?: string | null
          completed_at?: string | null
          created_at_source?: string | null
          description?: string | null
          id?: string
          inspectqa_id?: string
          inspectqa_site_id?: string | null
          priority?: string | null
          status?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "work_orders_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "work_orders_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
        ]
      }
    }
    Views: {
      v_account_mrr_by_month: {
        Row: {
          account_id: string | null
          account_name: string | null
          month: string | null
          mrr: number | null
        }
        Relationships: []
      }
      v_account_mrr_change: {
        Row: {
          account_id: string | null
          account_name: string | null
          building_count: number | null
          change_12m: number | null
          change_3m: number | null
          change_6m: number | null
          mrr_12m: number | null
          mrr_3m: number | null
          mrr_6m: number | null
          mrr_now: number | null
        }
        Relationships: []
      }
      v_alias_candidates: {
        Row: {
          account_id: string | null
          alias: string | null
          building_id: string | null
          kind: string | null
          label: string | null
          opportunity_id: string | null
        }
        Relationships: []
      }
      v_building_current_value: {
        Row: {
          account_id: string | null
          annual_value: number | null
          building_id: string | null
          contract_end_date: string | null
          effective_date: string | null
          entity: Database["public"]["Enums"]["operating_entity"] | null
          health_score: Database["public"]["Enums"]["health_score"] | null
          monthly_value: number | null
          name: string | null
          owner_id: string | null
          property_type_id: string | null
          square_footage: number | null
          status: Database["public"]["Enums"]["building_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["property_type_id"]
          },
        ]
      }
      v_building_health_mrr: {
        Row: {
          account_count: number | null
          building_count: number | null
          buildings_with_value: number | null
          health_score: Database["public"]["Enums"]["health_score"] | null
          mrr: number | null
        }
        Relationships: []
      }
      v_building_hours: {
        Row: {
          account_id: string | null
          annual_hours: number | null
          building_id: string | null
          monthly_hours: number | null
          weekly_hours: number | null
        }
        Insert: {
          account_id?: string | null
          annual_hours?: never
          building_id?: string | null
          monthly_hours?: never
          weekly_hours?: never
        }
        Update: {
          account_id?: string | null
          annual_hours?: never
          building_id?: string | null
          monthly_hours?: never
          weekly_hours?: never
        }
        Relationships: [
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_building_labor_margin: {
        Row: {
          account_id: string | null
          building_id: string | null
          scheduled_hours_per_week: number | null
          weekly_billed: number | null
          weekly_cost: number | null
          weekly_margin: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
        ]
      }
      v_building_mrr_by_month: {
        Row: {
          account_id: string | null
          building_id: string | null
          entity: Database["public"]["Enums"]["operating_entity"] | null
          month: string | null
          monthly_value: number | null
          property_type_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["property_type_id"]
          },
        ]
      }
      v_building_scheduled_hours: {
        Row: {
          building_id: string | null
          day_porters: number | null
          lead_cleaners: number | null
          night_cleaners: number | null
          scheduled_weekly_hours: number | null
          staff_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
        ]
      }
      v_domain_candidates: {
        Row: {
          account_id: string | null
          account_name: string | null
          contact_count: number | null
          domain: string | null
        }
        Relationships: []
      }
      v_gap_census: {
        Row: {
          field: string | null
          label: string | null
          missing: number | null
          scope: string | null
          sort_order: number | null
          total: number | null
        }
        Relationships: []
      }
      v_mrr_by_month: {
        Row: {
          account_count: number | null
          building_count: number | null
          month: string | null
          mrr: number | null
        }
        Relationships: []
      }
      v_mrr_coverage: {
        Row: {
          accounts_total: number | null
          accounts_with_value: number | null
          buildings_total: number | null
          buildings_with_value: number | null
          mrr: number | null
        }
        Relationships: []
      }
      v_mrr_waterfall: {
        Row: {
          churn: number | null
          contraction: number | null
          ending_mrr: number | null
          entity: Database["public"]["Enums"]["operating_entity"] | null
          expansion: number | null
          month: string | null
          new_business: number | null
        }
        Relationships: []
      }
      v_opportunity_outcomes: {
        Row: {
          account_id: string | null
          actual_close_date: string | null
          annual_value: number | null
          building_id: string | null
          closed_month: string | null
          competitor: string | null
          competitor_id: string | null
          days_to_close: number | null
          entity: Database["public"]["Enums"]["operating_entity"] | null
          incumbent_provider: string | null
          lead_source: string | null
          loss_reason: string | null
          loss_reason_id: string | null
          monthly_value: number | null
          name: string | null
          opened_on: string | null
          opportunity_id: string | null
          owner_id: string | null
          property_type: string | null
          property_type_id: string | null
          stage_id: string | null
          stage_name: string | null
          win_notes: string | null
          win_reason: string | null
          win_reason_id: string | null
          won: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_opportunity_stage_durations: {
        Row: {
          days_in_stage: number | null
          entered_at: string | null
          is_current: boolean | null
          left_at: string | null
          opportunity_id: string | null
          stage_event_id: string | null
          stage_id: string | null
          stage_name: string | null
          stage_sort_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "v_weighted_pipeline"
            referencedColumns: ["opportunity_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_opportunity_outcomes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "opportunity_stage_events_to_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "v_pipeline_funnel"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      v_opportunity_win_rate: {
        Row: {
          closed: number | null
          closed_without_date: number | null
          closed_without_value: number | null
          lost: number | null
          lost_annual: number | null
          win_rate: number | null
          won: number | null
          won_annual: number | null
        }
        Relationships: []
      }
      v_pipeline_coverage: {
        Row: {
          open_annual: number | null
          open_deals: number | null
          open_deals_priced: number | null
          open_monthly: number | null
          weighted_annual: number | null
        }
        Relationships: []
      }
      v_pipeline_funnel: {
        Row: {
          annual_value: number | null
          deal_count: number | null
          deals_without_value: number | null
          is_active: boolean | null
          is_lost: boolean | null
          is_open: boolean | null
          is_won: boolean | null
          monthly_value: number | null
          next_expected_close: string | null
          probability: number | null
          stage_id: string | null
          stage_name: string | null
          stage_sort_order: number | null
          weighted_annual_value: number | null
        }
        Relationships: []
      }
      v_quiet_accounts: {
        Row: {
          account_id: string | null
          account_name: string | null
          days_quiet: number | null
          has_open_deal: boolean | null
          last_activity: string | null
          monthly_value: number | null
          owner_id: string | null
          secondary_owner_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_secondary_owner_id_fkey"
            columns: ["secondary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_site_contracts: {
        Row: {
          account_count: number | null
          address_line1: string | null
          city: string | null
          contract_count: number | null
          landlord_contracts: number | null
          monthly_value: number | null
          site_id: string | null
          site_name: string | null
          square_footage: number | null
          tenant_contracts: number | null
        }
        Relationships: []
      }
      v_staff_movement: {
        Row: {
          employee_id: string | null
          end_reason: string | null
          first_name: string | null
          from_building_id: string | null
          last_name: string | null
          moved_on: string | null
          started_on: string | null
          to_building_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["from_building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["to_building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["from_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["to_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_current_value"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["from_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["to_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_hours"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["from_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "employee_assignments_building_id_fkey"
            columns: ["to_building_id"]
            isOneToOne: false
            referencedRelation: "v_building_mrr_by_month"
            referencedColumns: ["building_id"]
          },
        ]
      }
      v_weighted_pipeline: {
        Row: {
          account_id: string | null
          annual_value: number | null
          entity: Database["public"]["Enums"]["operating_entity"] | null
          expected_close_date: string | null
          monthly_value: number | null
          name: string | null
          opportunity_id: string | null
          owner_id: string | null
          probability: number | null
          stage_name: string | null
          stage_sort_order: number | null
          weighted_annual_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_by_month"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_mrr_change"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_quiet_accounts"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_gap_fill: {
        Args: {
          p_batch_id: string
          p_record_id: string
          p_table: string
          p_values: Json
        }
        Returns: number
      }
      can_see_rates: { Args: never; Returns: boolean }
      close_building_contract: {
        Args: { p_building_id: string; p_lost_date?: string }
        Returns: undefined
      }
      convert_opportunity_to_building: {
        Args: {
          p_account_id?: string
          p_account_name?: string
          p_building_name?: string
          p_effective_date?: string
          p_monthly_value?: number
          p_opportunity_id: string
        }
        Returns: string
      }
      correct_open_contract_value: {
        Args: {
          p_building_id: string
          p_monthly_value: number
          p_notes?: string
        }
        Returns: string
      }
      fill_building_contract_value: {
        Args: {
          p_building_id: string
          p_effective_date: string
          p_import_batch_id: string
          p_monthly_value: number
        }
        Returns: string
      }
      gap_fill_allows: {
        Args: { p_column: string; p_table: string }
        Returns: boolean
      }
      gap_fill_column_type: {
        Args: { p_column: string; p_table: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      is_public_email_domain: { Args: { p_domain: string }; Returns: boolean }
      move_contract_periods_to_building: {
        Args: { p_from_building: string; p_to_building: string }
        Returns: number
      }
      normalise_alias: { Args: { p_text: string }; Returns: string }
      rollback_field_changes: { Args: { p_batch_id: string }; Returns: Json }
      search_records: {
        Args: { kinds?: string[]; max_rows?: number; term: string }
        Returns: {
          id: string
          kind: string
          label: string
          score: number
          sublabel: string
        }[]
      }
      set_building_monthly_value: {
        Args: {
          p_building_id: string
          p_effective_date?: string
          p_monthly_value: number
          p_notes?: string
          p_reason?: Database["public"]["Enums"]["contract_change_reason"]
        }
        Returns: string
      }
    }
    Enums: {
      account_status: "prospect" | "active" | "former"
      activity_source:
        | "manual"
        | "granola"
        | "gmail"
        | "outlook"
        | "imessage"
        | "google_calendar"
        | "outlook_calendar"
        | "cowork"
        | "phone"
        | "system"
      assignment_role:
        | "day_porter"
        | "night_cleaner"
        | "lead_cleaner"
        | "supervisor"
        | "other"
      attachment_kind: "before" | "after" | "document" | "photo"
      audit_action: "insert" | "update" | "delete"
      building_status: "pending" | "active" | "lost"
      building_tenancy: "landlord" | "tenant"
      contract_change_reason:
        | "initial"
        | "increase"
        | "decrease"
        | "scope_add"
        | "scope_reduction"
        | "lost"
      employee_status: "active" | "terminated" | "leave"
      health_score: "healthy" | "needs_attention" | "at_risk"
      import_status: "draft" | "previewed" | "committed" | "rolled_back"
      ingest_item_status: "new" | "linked" | "needs_review" | "ignored"
      loss_reason_scope: "building" | "opportunity" | "both"
      match_confidence: "exact" | "domain" | "inferred"
      next_step_origin: "calendar" | "commitment" | "manual"
      next_step_status: "open" | "done" | "dismissed"
      operating_entity: "beales" | "afs"
      parse_status: "pending" | "parsed" | "needs_review" | "approved"
      project_status:
        | "quoted"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "invoiced"
      staffing_line_status: "unmatched" | "matched" | "ignored"
      suggestion_kind:
        | "link_activity"
        | "create_contact"
        | "field_value"
        | "next_step"
      suggestion_status: "open" | "accepted" | "rejected" | "superseded"
      user_role: "admin" | "leadership" | "field"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["prospect", "active", "former"],
      activity_source: [
        "manual",
        "granola",
        "gmail",
        "outlook",
        "imessage",
        "google_calendar",
        "outlook_calendar",
        "cowork",
        "phone",
        "system",
      ],
      assignment_role: [
        "day_porter",
        "night_cleaner",
        "lead_cleaner",
        "supervisor",
        "other",
      ],
      attachment_kind: ["before", "after", "document", "photo"],
      audit_action: ["insert", "update", "delete"],
      building_status: ["pending", "active", "lost"],
      building_tenancy: ["landlord", "tenant"],
      contract_change_reason: [
        "initial",
        "increase",
        "decrease",
        "scope_add",
        "scope_reduction",
        "lost",
      ],
      employee_status: ["active", "terminated", "leave"],
      health_score: ["healthy", "needs_attention", "at_risk"],
      import_status: ["draft", "previewed", "committed", "rolled_back"],
      ingest_item_status: ["new", "linked", "needs_review", "ignored"],
      loss_reason_scope: ["building", "opportunity", "both"],
      match_confidence: ["exact", "domain", "inferred"],
      next_step_origin: ["calendar", "commitment", "manual"],
      next_step_status: ["open", "done", "dismissed"],
      operating_entity: ["beales", "afs"],
      parse_status: ["pending", "parsed", "needs_review", "approved"],
      project_status: [
        "quoted",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "invoiced",
      ],
      staffing_line_status: ["unmatched", "matched", "ignored"],
      suggestion_kind: [
        "link_activity",
        "create_contact",
        "field_value",
        "next_step",
      ],
      suggestion_status: ["open", "accepted", "rejected", "superseded"],
      user_role: ["admin", "leadership", "field"],
    },
  },
} as const
