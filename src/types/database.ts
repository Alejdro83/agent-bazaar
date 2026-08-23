export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          seller_id: string;
          name: string;
          description: string;
          category: AgentCategory;
          subcategory: string | null;
          pricing_type: PricingType;
          pricing_value: number;
          pricing_currency: string;
          wallet_address: string;
          erc8004_id: string | null;
          erc8004_data: Json | null;
          onchain_tx_hash: string | null;
          status: AgentStatus;
          metadata: Json | null;
          avatar_url: string | null;
          total_hires: number;
          avg_rating: number;
          total_revenue: number;
          source: AgentSource;
          chain_id: number | null;
          is_testnet: boolean | null;
          external_agent_id: string | null;
          onchain_reputation: number | null;
          search_vector: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          seller_id: string;
          name: string;
          description: string;
          category: AgentCategory;
          subcategory?: string | null;
          pricing_type: PricingType;
          pricing_value: number;
          pricing_currency?: string;
          wallet_address: string;
          erc8004_id?: string | null;
          erc8004_data?: Json | null;
          onchain_tx_hash?: string | null;
          status?: AgentStatus;
          metadata?: Json | null;
          avatar_url?: string | null;
          total_hires?: number;
          avg_rating?: number;
          total_revenue?: number;
          source?: AgentSource;
          chain_id?: number | null;
          is_testnet?: boolean | null;
          external_agent_id?: string | null;
          onchain_reputation?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          seller_id?: string;
          name?: string;
          description?: string;
          category?: AgentCategory;
          subcategory?: string | null;
          pricing_type?: PricingType;
          pricing_value?: number;
          pricing_currency?: string;
          wallet_address?: string;
          erc8004_id?: string | null;
          erc8004_data?: Json | null;
          onchain_tx_hash?: string | null;
          status?: AgentStatus;
          metadata?: Json | null;
          avatar_url?: string | null;
          total_hires?: number;
          avg_rating?: number;
          total_revenue?: number;
          source?: AgentSource;
          chain_id?: number | null;
          is_testnet?: boolean | null;
          external_agent_id?: string | null;
          onchain_reputation?: number | null;
        };
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          agent_id: string;
          buyer_id: string;
          seller_id: string;
          status: ContractStatus;
          pricing_type: PricingType;
          pricing_value: number;
          pricing_currency: string;
          payment_tx_hash: string | null;
          altana_session_key: string | null;
          started_at: string | null;
          expires_at: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          agent_id: string;
          buyer_id: string;
          seller_id: string;
          status?: ContractStatus;
          pricing_type: PricingType;
          pricing_value: number;
          pricing_currency: string;
          payment_tx_hash?: string | null;
          altana_session_key?: string | null;
          started_at?: string | null;
          expires_at?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          agent_id?: string;
          buyer_id?: string;
          seller_id?: string;
          status?: ContractStatus;
          pricing_type?: PricingType;
          pricing_value?: number;
          pricing_currency?: string;
          payment_tx_hash?: string | null;
          altana_session_key?: string | null;
          started_at?: string | null;
          expires_at?: string | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          created_at: string;
          contract_id: string;
          agent_id: string;
          rater_id: string;
          score: number;
          comment: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          contract_id: string;
          agent_id: string;
          rater_id: string;
          score: number;
          comment?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          contract_id?: string;
          agent_id?: string;
          rater_id?: string;
          score?: number;
          comment?: string | null;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      search_embeddings: {
        Row: {
          id: string;
          created_at: string;
          agent_id: string;
          embedding: number[];
          content: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          agent_id: string;
          embedding: number[];
          content: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          agent_id?: string;
          embedding?: number[];
          content?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_agents: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
          category_filter: string | null;
        };
        Returns: {
          id: string;
          name: string;
          description: string;
          category: string;
          subcategory: string | null;
          pricing_type: string;
          pricing_value: number;
          pricing_currency: string;
          status: string;
          seller_id: string;
          total_hires: number;
          avg_rating: number;
          avatar_url: string | null;
          similarity: number;
        }[];
      };
      update_agent_stats: {
        Args: { p_agent_id: string };
        Returns: void;
      };
    };
    Enums: {
      agent_category: 'rebalancing' | 'grid_trading' | 'yield_optimisation' | 'health_factor';
      agent_status: 'draft' | 'active' | 'paused' | 'archived';
      contract_status: 'pending' | 'active' | 'completed' | 'cancelled' | 'expired';
      pricing_type: 'free' | 'fixed' | 'percentage';
      agent_source: 'user' | '8004scan';
    };
  };
}

export type AgentCategory = Database['public']['Enums']['agent_category'];
export type AgentStatus = Database['public']['Enums']['agent_status'];
export type ContractStatus = Database['public']['Enums']['contract_status'];
export type PricingType = Database['public']['Enums']['pricing_type'];
export type AgentSource = Database['public']['Enums']['agent_source'];

export type Agent = Database['public']['Tables']['agents']['Row'];
export type AgentInsert = Database['public']['Tables']['agents']['Insert'];
export type AgentUpdate = Database['public']['Tables']['agents']['Update'];

export type Contract = Database['public']['Tables']['contracts']['Row'];
export type ContractInsert = Database['public']['Tables']['contracts']['Insert'];
export type ContractUpdate = Database['public']['Tables']['contracts']['Update'];

export type Rating = Database['public']['Tables']['ratings']['Row'];
export type RatingInsert = Database['public']['Tables']['ratings']['Insert'];

export type SearchEmbedding = Database['public']['Tables']['search_embeddings']['Row'];