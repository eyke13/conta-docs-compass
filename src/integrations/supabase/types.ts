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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bancos: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          nome: string
          tipo?: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "bancos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_contatos: {
        Row: {
          autor: string
          autor_operador_id: string | null
          canal: string
          cobranca_id: string
          competencia: string
          criado_em: string
          empresa_id: string
          id: string
        }
        Insert: {
          autor: string
          autor_operador_id?: string | null
          canal: string
          cobranca_id: string
          competencia: string
          criado_em?: string
          empresa_id: string
          id?: string
        }
        Update: {
          autor?: string
          autor_operador_id?: string | null
          canal?: string
          cobranca_id?: string
          competencia?: string
          criado_em?: string
          empresa_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_contatos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_movimentos: {
        Row: {
          autor: string | null
          cobranca_id: string
          competencia: string
          criado_em: string
          de: string | null
          empresa_id: string
          id: string
          para: string
        }
        Insert: {
          autor?: string | null
          cobranca_id: string
          competencia: string
          criado_em?: string
          de?: string | null
          empresa_id: string
          id?: string
          para: string
        }
        Update: {
          autor?: string | null
          cobranca_id?: string
          competencia?: string
          criado_em?: string
          de?: string | null
          empresa_id?: string
          id?: string
          para?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_movimentos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          atribuido_em: string | null
          atribuido_por: string | null
          bloqueada: boolean
          bloqueada_em: string | null
          bloqueada_por: string | null
          comentario: string | null
          competencia: string
          criado_em: string
          empresa_id: string
          id: string
          movimentado_em: string | null
          movimentado_por: string | null
          operador_id: string | null
          status: string
        }
        Insert: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          bloqueada?: boolean
          bloqueada_em?: string | null
          bloqueada_por?: string | null
          comentario?: string | null
          competencia: string
          criado_em?: string
          empresa_id: string
          id?: string
          movimentado_em?: string | null
          movimentado_por?: string | null
          operador_id?: string | null
          status?: string
        }
        Update: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          bloqueada?: boolean
          bloqueada_em?: string | null
          bloqueada_por?: string | null
          comentario?: string | null
          competencia?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          movimentado_em?: string | null
          movimentado_por?: string | null
          operador_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacao_alteracoes: {
        Row: {
          autor: string
          autor_operador_id: string
          competencia: string
          conciliacao_id: string
          conciliado: boolean
          criado_em: string
          id: string
          status_de: string
          status_para: string
        }
        Insert: {
          autor: string
          autor_operador_id: string
          competencia: string
          conciliacao_id: string
          conciliado: boolean
          criado_em?: string
          id?: string
          status_de: string
          status_para: string
        }
        Update: {
          autor?: string
          autor_operador_id?: string
          competencia?: string
          conciliacao_id?: string
          conciliado?: boolean
          criado_em?: string
          id?: string
          status_de?: string
          status_para?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_alteracoes_conciliacao_id_fkey"
            columns: ["conciliacao_id"]
            isOneToOne: false
            referencedRelation: "conciliacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacoes: {
        Row: {
          assumida_em: string
          assumida_por: string | null
          comp_fim: string
          comp_inicio: string
          concluida_em: string | null
          concluida_por: string | null
          concluida_por_id: string | null
          empresa_chave: string
          empresa_id: string
          empresa_nome: string
          id: string
          mes_fim: string
          mes_inicio: string
          meses_conciliados: Json
          operador_id: string | null
          operador_nome: string
          reaberta_em: string | null
          reaberta_motivo: string | null
          reaberta_por: string | null
          status: string
          versao: number
        }
        Insert: {
          assumida_em?: string
          assumida_por?: string | null
          comp_fim: string
          comp_inicio: string
          concluida_em?: string | null
          concluida_por?: string | null
          concluida_por_id?: string | null
          empresa_chave: string
          empresa_id: string
          empresa_nome: string
          id?: string
          mes_fim: string
          mes_inicio: string
          meses_conciliados?: Json
          operador_id?: string | null
          operador_nome: string
          reaberta_em?: string | null
          reaberta_motivo?: string | null
          reaberta_por?: string | null
          status?: string
          versao?: number
        }
        Update: {
          assumida_em?: string
          assumida_por?: string | null
          comp_fim?: string
          comp_inicio?: string
          concluida_em?: string | null
          concluida_por?: string | null
          concluida_por_id?: string | null
          empresa_chave?: string
          empresa_id?: string
          empresa_nome?: string
          id?: string
          mes_fim?: string
          mes_inicio?: string
          meses_conciliados?: Json
          operador_id?: string | null
          operador_nome?: string
          reaberta_em?: string | null
          reaberta_motivo?: string | null
          reaberta_por?: string | null
          status?: string
          versao?: number
        }
        Relationships: []
      }
      demandas: {
        Row: {
          atribuido_em: string | null
          atribuido_por: string | null
          bloqueada: boolean
          bloqueada_em: string | null
          bloqueada_por: string | null
          competencia: string
          concluida: boolean
          concluida_em: string | null
          concluida_por: string | null
          empresa_id: string
          empresa_nome: string
          id: string
          operador_id: string | null
          tipo: string
        }
        Insert: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          bloqueada?: boolean
          bloqueada_em?: string | null
          bloqueada_por?: string | null
          competencia: string
          concluida?: boolean
          concluida_em?: string | null
          concluida_por?: string | null
          empresa_id: string
          empresa_nome: string
          id?: string
          operador_id?: string | null
          tipo?: string
        }
        Update: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          bloqueada?: boolean
          bloqueada_em?: string | null
          bloqueada_por?: string | null
          competencia?: string
          concluida?: boolean
          concluida_em?: string | null
          concluida_por?: string | null
          empresa_id?: string
          empresa_nome?: string
          id?: string
          operador_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cobranca: boolean
          criado_em: string
          demo: boolean
          id: string
          inativa_banco: boolean
          inativa_cartao: boolean
          nome: string
          prioridade: number | null
          regime: string | null
          talento_banco: string | null
          talento_cartao: string | null
          talento_doc: string | null
          tem_otimizza: boolean
        }
        Insert: {
          cobranca?: boolean
          criado_em?: string
          demo?: boolean
          id?: string
          inativa_banco?: boolean
          inativa_cartao?: boolean
          nome: string
          prioridade?: number | null
          regime?: string | null
          talento_banco?: string | null
          talento_cartao?: string | null
          talento_doc?: string | null
          tem_otimizza?: boolean
        }
        Update: {
          cobranca?: boolean
          criado_em?: string
          demo?: boolean
          id?: string
          inativa_banco?: boolean
          inativa_cartao?: boolean
          nome?: string
          prioridade?: number | null
          regime?: string | null
          talento_banco?: string | null
          talento_cartao?: string | null
          talento_doc?: string | null
          tem_otimizza?: boolean
        }
        Relationships: []
      }
      extratos: {
        Row: {
          atualizado_em: string | null
          atualizado_por: string | null
          banco_id: string | null
          banco_nome: string
          comentario: string | null
          competencia: string
          concluido_em: string | null
          empresa_id: string
          id: string
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          banco_id?: string | null
          banco_nome: string
          comentario?: string | null
          competencia: string
          concluido_em?: string | null
          empresa_id: string
          id?: string
          status?: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          banco_id?: string | null
          banco_nome?: string
          comentario?: string | null
          competencia?: string
          concluido_em?: string | null
          empresa_id?: string
          id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "extratos_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_empresas: {
        Row: {
          apelido: string | null
          atualizado_em: string
          atualizado_por: string | null
          codigo: number
          grupo_id: string
          nome_fantasia: string | null
          razao_social: string | null
        }
        Insert: {
          apelido?: string | null
          atualizado_em?: string
          atualizado_por?: string | null
          codigo: number
          grupo_id: string
          nome_fantasia?: string | null
          razao_social?: string | null
        }
        Update: {
          apelido?: string | null
          atualizado_em?: string
          atualizado_por?: string | null
          codigo?: number
          grupo_id?: string
          nome_fantasia?: string | null
          razao_social?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_empresas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos: {
        Row: {
          atualizado_em: string
          chave: string
          criado_em: string
          id: string
          ignorar: boolean
          nome: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          criado_em?: string
          id?: string
          ignorar?: boolean
          nome: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          criado_em?: string
          id?: string
          ignorar?: boolean
          nome?: string
        }
        Relationships: []
      }
      historico: {
        Row: {
          acao: string
          autor: string | null
          autor_operador_id: string | null
          banco_nome: string | null
          competencia: string | null
          criado_em: string
          detalhe: string | null
          empresa_id: string | null
          empresa_nome: string | null
          id: string
          operador_nome: string | null
          tipo: string | null
        }
        Insert: {
          acao: string
          autor?: string | null
          autor_operador_id?: string | null
          banco_nome?: string | null
          competencia?: string | null
          criado_em?: string
          detalhe?: string | null
          empresa_id?: string | null
          empresa_nome?: string | null
          id?: string
          operador_nome?: string | null
          tipo?: string | null
        }
        Update: {
          acao?: string
          autor?: string | null
          autor_operador_id?: string | null
          banco_nome?: string | null
          competencia?: string | null
          criado_em?: string
          detalhe?: string | null
          empresa_id?: string | null
          empresa_nome?: string | null
          id?: string
          operador_nome?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      operador_foco: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          competencia: string | null
          empresa_id: string | null
          empresa_nome: string | null
          operador_id: string
          origem: string
          talento: string
          talento_chave: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          competencia?: string | null
          empresa_id?: string | null
          empresa_nome?: string | null
          operador_id: string
          origem: string
          talento: string
          talento_chave: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          competencia?: string | null
          empresa_id?: string | null
          empresa_nome?: string | null
          operador_id?: string
          origem?: string
          talento?: string
          talento_chave?: string
        }
        Relationships: [
          {
            foreignKeyName: "operador_foco_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: true
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
        ]
      }
      operadores: {
        Row: {
          ativo: boolean
          cargo: string
          criado_em: string
          demo: boolean
          id: string
          nome: string
          setor: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          criado_em?: string
          demo?: boolean
          id?: string
          nome: string
          setor?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string
          criado_em?: string
          demo?: boolean
          id?: string
          nome?: string
          setor?: string | null
        }
        Relationships: []
      }
      peculiaridades: {
        Row: {
          atualizado_em: string | null
          atualizado_por: string | null
          categoria: string
          criado_em: string
          criado_por: string | null
          descricao: string
          empresa_id: string
          id: string
          origem: string
        }
        Insert: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          categoria: string
          criado_em?: string
          criado_por?: string | null
          descricao: string
          empresa_id: string
          id?: string
          origem?: string
        }
        Update: {
          atualizado_em?: string | null
          atualizado_por?: string | null
          categoria?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          empresa_id?: string
          id?: string
          origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "peculiaridades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abrir_cobranca: { Args: { p_competencia: string }; Returns: Json }
      abrir_cobranca_interno: { Args: { p_competencia: string }; Returns: Json }
      abrir_competencia_mensal: { Args: never; Returns: Json }
      assumir_conciliacao: {
        Args: {
          p_autor: string
          p_empresa_id: string
          p_fim: string
          p_inicio: string
          p_operador_id: string
        }
        Returns: string
      }
      atribuir_operador_cobranca: {
        Args: {
          p_autor: string
          p_competencia: string
          p_empresa_ids: string[]
          p_operador_id: string
        }
        Returns: string[]
      }
      celula_regime: { Args: { p_regime: string }; Returns: string }
      chave_nome: { Args: { s: string }; Returns: string }
      codigo_empresa: { Args: { nome: string }; Returns: number }
      dados_relatorios: { Args: { p_competencia: string }; Returns: Json }
      definir_foco: {
        Args: { p_autor: string; p_operador_id: string; p_talento: string }
        Returns: undefined
      }
      eh_equipe: { Args: { _user_id: string }; Returns: boolean }
      evolucao_cobranca: {
        Args: { p_competencia: string }
        Returns: {
          dia: string
          n: number
        }[]
      }
      excluir_todos_dados: { Args: never; Returns: undefined }
      finalizar_conciliacao: {
        Args: { p_autor: string; p_id: string; p_operador_id: string }
        Returns: undefined
      }
      grupos_situacao: {
        Args: { p_celula: string; p_competencia: string }
        Returns: {
          codigo: number
          empresa_id: string
          empresa_nome: string
          grupo_id: string
          grupo_nome: string
          operador_id: string
          operador_nome: string
          status: string
          talento: string
          tipo: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_grupos: {
        Args: {
          p_autor: string
          p_autor_id: string
          p_grupos: Json
          p_itens: Json
        }
        Returns: Json
      }
      importar_planilha: {
        Args: {
          p_autor: string
          p_autor_id?: string
          p_competencia: string
          p_itens: Json
          p_modo?: string
          p_origem: string
          p_tipo: string
        }
        Returns: Json
      }
      incluir_peculiaridade_visitante: {
        Args: {
          p_autor: string
          p_categoria: string
          p_descricao: string
          p_empresa_id: string
        }
        Returns: string
      }
      marcar_mes_conciliacao: {
        Args: {
          p_competencia: string
          p_conciliado: boolean
          p_id: string
          p_operador_id: string
          p_versao: number
        }
        Returns: undefined
      }
      mudar_status_cobranca: {
        Args: {
          p_autor: string
          p_canal?: string
          p_cobranca_id: string
          p_operador_id: string
          p_status: string
        }
        Returns: Json
      }
      papel_atual: { Args: never; Returns: string }
      peculiaridades_por_empresa: {
        Args: never
        Returns: {
          chave: string
          empresa_ids: string[]
          financeiro: number
          relacionamento: number
          total: number
          ultima: string
          visitante: number
        }[]
      }
      reabrir_conciliacao: {
        Args: {
          p_autor: string
          p_id: string
          p_motivo: string
          p_operador_id: string
        }
        Returns: undefined
      }
      registrar_contato_cobranca: {
        Args: {
          p_autor: string
          p_canal: string
          p_cobranca_id: string
          p_operador_id: string
        }
        Returns: undefined
      }
      resumo_cobranca: {
        Args: { p_competencia: string }
        Returns: {
          aguardando: number
          operador_id: string
          pendente: number
          recebido: number
          talento: string
          total: number
        }[]
      }
      unidade_cob: {
        Args: { p_id: string; p_regime: string; p_talento: string }
        Returns: string
      }
      unidades_divididas: {
        Args: { p_competencia: string }
        Returns: {
          celula: string
          empresas: number
          operador_id: string
          talento: string
          unidade: string
        }[]
      }
    }
    Enums: {
      app_role: "gestor" | "usuario" | "visitante"
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
      app_role: ["gestor", "usuario", "visitante"],
    },
  },
} as const
