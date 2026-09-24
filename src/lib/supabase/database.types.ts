export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_calls: {
        Row: {
          capability: string | null;
          created_at: string;
          draft_id: string | null;
          error_code: string | null;
          id: number;
          input_tokens: number | null;
          latency_ms: number | null;
          modality: string | null;
          model: string;
          name: string;
          outcome: string | null;
          output_tokens: number | null;
          prompt_template_version: string | null;
          provider: string;
          route: string | null;
          session_id: string | null;
          stage: string | null;
          user_id: string | null;
          voice_attempt_id: string | null;
        };
        Insert: {
          capability?: string | null;
          created_at?: string;
          draft_id?: string | null;
          error_code?: string | null;
          id?: never;
          input_tokens?: number | null;
          latency_ms?: number | null;
          modality?: string | null;
          model: string;
          name: string;
          outcome?: string | null;
          output_tokens?: number | null;
          prompt_template_version?: string | null;
          provider: string;
          route?: string | null;
          session_id?: string | null;
          stage?: string | null;
          user_id?: string | null;
          voice_attempt_id?: string | null;
        };
        Update: {
          capability?: string | null;
          created_at?: string;
          draft_id?: string | null;
          error_code?: string | null;
          id?: never;
          input_tokens?: number | null;
          latency_ms?: number | null;
          modality?: string | null;
          model?: string;
          name?: string;
          outcome?: string | null;
          output_tokens?: number | null;
          prompt_template_version?: string | null;
          provider?: string;
          route?: string | null;
          session_id?: string | null;
          stage?: string | null;
          user_id?: string | null;
          voice_attempt_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_calls_draft_owner_fk";
            columns: ["user_id", "draft_id"];
            isOneToOne: false;
            referencedRelation: "recipe_drafts";
            referencedColumns: ["user_id", "id"];
          },
          {
            foreignKeyName: "ai_calls_session_owner_fk";
            columns: ["user_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "cooking_sessions";
            referencedColumns: ["user_id", "id"];
          },
          {
            foreignKeyName: "ai_calls_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_calls_voice_owner_fk";
            columns: ["user_id", "voice_attempt_id"];
            isOneToOne: false;
            referencedRelation: "realtime_attempts";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      ai_usage_quota: {
        Row: {
          count: number;
          date: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          count?: number;
          date?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          count?: number;
          date?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_quota_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_checkpoints: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          object_path: string;
          session_id: string;
          step_index: number;
          user_id: string;
          verdict: Json;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          object_path: string;
          session_id: string;
          step_index: number;
          user_id: string;
          verdict: Json;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          object_path?: string;
          session_id?: string;
          step_index?: number;
          user_id?: string;
          verdict?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_checkpoints_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "cooking_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cooking_checkpoints_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cooking_sessions: {
        Row: {
          adjustments: Json;
          checkpoint_metadata: Json;
          completed_at: string | null;
          current_step: number;
          expires_at: string;
          id: string;
          recipe: Json;
          recipe_id: string | null;
          started_at: string;
          status: string;
          summary: Json | null;
          timer_state: Json;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          adjustments?: Json;
          checkpoint_metadata?: Json;
          completed_at?: string | null;
          current_step?: number;
          expires_at?: string;
          id?: string;
          recipe: Json;
          recipe_id?: string | null;
          started_at?: string;
          status?: string;
          summary?: Json | null;
          timer_state?: Json;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          adjustments?: Json;
          checkpoint_metadata?: Json;
          completed_at?: string | null;
          current_step?: number;
          expires_at?: string;
          id?: string;
          recipe?: Json;
          recipe_id?: string | null;
          started_at?: string;
          status?: string;
          summary?: Json | null;
          timer_state?: Json;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cooking_sessions_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cooking_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kitchen_items: {
        Row: {
          created_at: string;
          expires_on: string | null;
          icon: string | null;
          id: string;
          kind: string;
          name: string;
          quantity: string | null;
          source: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_on?: string | null;
          icon?: string | null;
          id?: string;
          kind: string;
          name: string;
          quantity?: string | null;
          source?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_on?: string | null;
          icon?: string | null;
          id?: string;
          kind?: string;
          name?: string;
          quantity?: string | null;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kitchen_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      kitchen_scans: {
        Row: {
          accepted: Json | null;
          candidates: Json;
          created_at: string;
          expires_at: string;
          failure_code: string | null;
          id: string;
          idempotency_key: string;
          object_path: string;
          object_sha256: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted?: Json | null;
          candidates?: Json;
          created_at?: string;
          expires_at?: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key: string;
          object_path: string;
          object_sha256?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted?: Json | null;
          candidates?: Json;
          created_at?: string;
          expires_at?: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key?: string;
          object_path?: string;
          object_sha256?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kitchen_scans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          allergies: string[];
          created_at: string;
          dietary_restrictions: string[];
          display_name: string | null;
          household_size: number;
          id: string;
          onboarded_at: string | null;
          skill_level: string;
          taste_preferences: Json;
          updated_at: string;
        };
        Insert: {
          allergies?: string[];
          created_at?: string;
          dietary_restrictions?: string[];
          display_name?: string | null;
          household_size?: number;
          id: string;
          onboarded_at?: string | null;
          skill_level?: string;
          taste_preferences?: Json;
          updated_at?: string;
        };
        Update: {
          allergies?: string[];
          created_at?: string;
          dietary_restrictions?: string[];
          display_name?: string | null;
          household_size?: number;
          id?: string;
          onboarded_at?: string | null;
          skill_level?: string;
          taste_preferences?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      realtime_attempts: {
        Row: {
          charged: boolean;
          connected_at: string | null;
          created_at: string;
          expires_at: string;
          fallback_from: string | null;
          fallback_used: boolean;
          id: string;
          provider: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          charged?: boolean;
          connected_at?: string | null;
          created_at?: string;
          expires_at: string;
          fallback_from?: string | null;
          fallback_used?: boolean;
          id: string;
          provider: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          charged?: boolean;
          connected_at?: string | null;
          created_at?: string;
          expires_at?: string;
          fallback_from?: string | null;
          fallback_used?: boolean;
          id?: string;
          provider?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "realtime_attempts_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "cooking_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "realtime_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_drafts: {
        Row: {
          accepted_recipe_id: string | null;
          canonical_recipe: Json | null;
          clarification_expires_at: string | null;
          created_at: string;
          expires_at: string;
          failure_code: string | null;
          id: string;
          idempotency_key: string;
          input_id: string | null;
          input_sha256: string | null;
          kind: string;
          quota_units: number;
          request: Json;
          restart_count: number;
          retry_count: number;
          status: string;
          tailoring_count: number;
          tailoring_idempotency_key: string | null;
          tailoring_intent: string | null;
          tailoring_source: Json | null;
          updated_at: string;
          user_id: string;
          verification: Json;
          workflow_attempt_id: string;
          workflow_run_id: string | null;
        };
        Insert: {
          accepted_recipe_id?: string | null;
          canonical_recipe?: Json | null;
          clarification_expires_at?: string | null;
          created_at?: string;
          expires_at?: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key: string;
          input_id?: string | null;
          input_sha256?: string | null;
          kind: string;
          quota_units?: number;
          request?: Json;
          restart_count?: number;
          retry_count?: number;
          status?: string;
          tailoring_count?: number;
          tailoring_idempotency_key?: string | null;
          tailoring_intent?: string | null;
          tailoring_source?: Json | null;
          updated_at?: string;
          user_id: string;
          verification?: Json;
          workflow_attempt_id?: string;
          workflow_run_id?: string | null;
        };
        Update: {
          accepted_recipe_id?: string | null;
          canonical_recipe?: Json | null;
          clarification_expires_at?: string | null;
          created_at?: string;
          expires_at?: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key?: string;
          input_id?: string | null;
          input_sha256?: string | null;
          kind?: string;
          quota_units?: number;
          request?: Json;
          restart_count?: number;
          retry_count?: number;
          status?: string;
          tailoring_count?: number;
          tailoring_idempotency_key?: string | null;
          tailoring_intent?: string | null;
          tailoring_source?: Json | null;
          updated_at?: string;
          user_id?: string;
          verification?: Json;
          workflow_attempt_id?: string;
          workflow_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_drafts_accepted_recipe_fkey";
            columns: ["accepted_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_drafts_input_id_fkey";
            columns: ["input_id"];
            isOneToOne: false;
            referencedRelation: "recipe_inputs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_feedback: {
        Row: {
          created_at: string;
          equipment_adjusted: string[];
          id: string;
          learned: Json;
          notes: string | null;
          perceived_difficulty: number | null;
          rating: number | null;
          recipe_id: string | null;
          scaled_servings: number | null;
          session_id: string | null;
          substitutions_made: string[];
          user_id: string;
          would_cook_again: boolean | null;
          would_make_again: boolean | null;
        };
        Insert: {
          created_at?: string;
          equipment_adjusted?: string[];
          id?: string;
          learned?: Json;
          notes?: string | null;
          perceived_difficulty?: number | null;
          rating?: number | null;
          recipe_id?: string | null;
          scaled_servings?: number | null;
          session_id?: string | null;
          substitutions_made?: string[];
          user_id: string;
          would_cook_again?: boolean | null;
          would_make_again?: boolean | null;
        };
        Update: {
          created_at?: string;
          equipment_adjusted?: string[];
          id?: string;
          learned?: Json;
          notes?: string | null;
          perceived_difficulty?: number | null;
          rating?: number | null;
          recipe_id?: string | null;
          scaled_servings?: number | null;
          session_id?: string | null;
          substitutions_made?: string[];
          user_id?: string;
          would_cook_again?: boolean | null;
          would_make_again?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_feedback_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_feedback_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "cooking_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_inputs: {
        Row: {
          consuming_draft_id: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          mime_type: string;
          object_path: string;
          sha256: string;
          size_bytes: number;
          user_id: string;
        };
        Insert: {
          consuming_draft_id?: string | null;
          created_at?: string;
          expires_at?: string;
          id: string;
          mime_type: string;
          object_path: string;
          sha256: string;
          size_bytes: number;
          user_id: string;
        };
        Update: {
          consuming_draft_id?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          mime_type?: string;
          object_path?: string;
          sha256?: string;
          size_bytes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_inputs_consuming_draft_fkey";
            columns: ["consuming_draft_id"];
            isOneToOne: false;
            referencedRelation: "recipe_drafts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_inputs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          accepted_draft_id: string | null;
          created_at: string;
          description: string;
          difficulty: string;
          equipment: string[];
          icon: string;
          id: string;
          image_tint: string;
          image_url: string | null;
          ingredients: string[];
          is_personalized: boolean;
          minutes: number;
          parent_recipe_id: string | null;
          servings: number;
          slug: string;
          source: string;
          source_url: string | null;
          steps: Json;
          tags: string[];
          title: string;
          user_id: string | null;
          why_good: string;
        };
        Insert: {
          accepted_draft_id?: string | null;
          created_at?: string;
          description?: string;
          difficulty?: string;
          equipment?: string[];
          icon?: string;
          id?: string;
          image_tint?: string;
          image_url?: string | null;
          ingredients?: string[];
          is_personalized?: boolean;
          minutes: number;
          parent_recipe_id?: string | null;
          servings?: number;
          slug: string;
          source?: string;
          source_url?: string | null;
          steps?: Json;
          tags?: string[];
          title: string;
          user_id?: string | null;
          why_good?: string;
        };
        Update: {
          accepted_draft_id?: string | null;
          created_at?: string;
          description?: string;
          difficulty?: string;
          equipment?: string[];
          icon?: string;
          id?: string;
          image_tint?: string;
          image_url?: string | null;
          ingredients?: string[];
          is_personalized?: boolean;
          minutes?: number;
          parent_recipe_id?: string | null;
          servings?: number;
          slug?: string;
          source?: string;
          source_url?: string | null;
          steps?: Json;
          tags?: string[];
          title?: string;
          user_id?: string | null;
          why_good?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_accepted_draft_id_fkey";
            columns: ["accepted_draft_id"];
            isOneToOne: true;
            referencedRelation: "recipe_drafts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_parent_recipe_id_fkey";
            columns: ["parent_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_recipes: {
        Row: {
          created_at: string;
          recipe_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          recipe_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          recipe_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_recipes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_recipes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      session_events: {
        Row: {
          created_at: string;
          expires_at: string;
          id: number;
          kind: string;
          payload: Json;
          session_id: string;
          step_index: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: never;
          kind: string;
          payload?: Json;
          session_id: string;
          step_index?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: never;
          kind?: string;
          payload?: Json;
          session_id?: string;
          step_index?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "cooking_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_recipe_draft: { Args: { draft_id: string }; Returns: string };
      accept_recipe_draft_legacy: {
        Args: { draft_id: string };
        Returns: string;
      };
      append_cooking_adjustment: {
        Args: {
          p_adjustment: Json;
          p_expected_version: number;
          p_session_id: string;
        };
        Returns: Json;
      };
      append_cooking_event: {
        Args: {
          p_expires_at?: string;
          p_kind: string;
          p_payload: Json;
          p_session_id: string;
          p_step_index: number;
        };
        Returns: boolean;
      };
      apply_cooking_adjustment_service: {
        Args: {
          p_adjustment: Json;
          p_expected_version: number;
          p_session_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      apply_kitchen_scan: {
        Args: { accepted: Json; scan_id: string };
        Returns: Json;
      };
      claim_realtime_attempt: {
        Args: {
          p_attempt_id: string;
          p_fallback_from: string;
          p_session_id: string;
        };
        Returns: string;
      };
      clarify_recipe_draft: {
        Args: { p_answer: string; p_draft_id: string };
        Returns: Json;
      };
      complete_cooking_session: {
        Args: { p_expected_version: number; p_session_id: string };
        Returns: Json;
      };
      consume_ai_usage: {
        Args: { p_limit: number; p_units: number; p_user_id: string };
        Returns: {
          allowed: boolean;
          total: number;
        }[];
      };
      create_recipe_draft: {
        Args: {
          p_idempotency_key: string;
          p_input_id: string;
          p_kind: string;
          p_request: Json;
        };
        Returns: Json;
      };
      increment_ai_usage: { Args: { p_user_id: string }; Returns: number };
      mark_realtime_attempt_connected: {
        Args: { p_attempt_id: string; p_session_id: string };
        Returns: boolean;
      };
      merge_kitchen_items: { Args: { p_items: Json }; Returns: Json };
      migrate_recipe_media_service: {
        Args: { p_image_url: string; p_recipe_id: string; p_steps: Json };
        Returns: boolean;
      };
      purge_expired_recipe_draft_service: {
        Args: { p_draft_id: string };
        Returns: boolean;
      };
      record_cooking_checkpoint: {
        Args: {
          p_object_path: string;
          p_session_id: string;
          p_step_index: number;
          p_verdict: Json;
        };
        Returns: string;
      };
      reject_recipe_draft: { Args: { p_draft_id: string }; Returns: boolean };
      save_cooking_feedback: {
        Args: {
          p_notes: string;
          p_perceived_difficulty: number;
          p_rating: number;
          p_session_id: string;
          p_would_make_again: boolean;
        };
        Returns: boolean;
      };
      start_cooking_session: { Args: { p_recipe_id: string }; Returns: Json };
      tailor_recipe_draft: {
        Args: {
          p_draft_id: string;
          p_idempotency_key: string;
          p_intent: string;
        };
        Returns: Json;
      };
      update_cooking_session_progress: {
        Args: {
          p_expected_version: number;
          p_session_id: string;
          p_step: number;
        };
        Returns: Json;
      };
      update_cooking_session_timer: {
        Args: {
          p_expected_version: number;
          p_session_id: string;
          p_timer: Json;
        };
        Returns: Json;
      };
      update_recipe_draft_workflow: {
        Args: {
          p_attempt_id: string;
          p_canonical_recipe?: Json;
          p_draft_id: string;
          p_failure_code?: string;
          p_retry_count?: number;
          p_status: string;
          p_verification?: Json;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
