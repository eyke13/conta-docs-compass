// Conciliações Financeiras: histórico permanente por empresa, independente da competência do app.
import { supabase } from "@/integrations/supabase/client";
import { exigirOperar } from "@/lib/acesso";
import { situacaoCompetencia } from "@/lib/progressoConciliacao";

export type StatusConc = "EM_ANDAMENTO" | "CONCLUIDA" | "REABERTA";
export type Conciliacao = {
  id: string; empresa_id: string; empresa_nome: string; empresa_chave: string;
  operador_id: string | null; operador_nome: string; comp_inicio: string; comp_fim: string;
  status: StatusConc; assumida_em: string; assumida_por: string | null;
  concluida_em: string | null; concluida_por: string | null;
  reaberta_em: string | null; reaberta_por: string | null; reaberta_motivo: string | null;
  meses_conciliados: Record<string, boolean>; versao: number;
  alteracoes: AlteracaoConciliacao[];
};
export type AlteracaoConciliacao = { id: string; conciliacao_id: string; competencia: string; conciliado: boolean; status_de: string; status_para: string; autor: string; criado_em: string };
export type SituacaoMes = "CONCILIADO" | "ANDAMENTO" | "PENDENTE";

/** "2026-07" → índice mensal contínuo (para comparar e somar meses). */
export const idx = (c: string) => Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1;
export const deIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = []; for (let i = idx(ini); i <= idx(fim); i++) out.push(deIdx(i)); return out;
}
export const qtdMeses = (c: Pick<Conciliacao, "comp_inicio" | "comp_fim">) => idx(c.comp_fim) - idx(c.comp_inicio) + 1;
/** Conciliações que ocupam meses (reabertas liberam o período, mas continuam no histórico). */
export const ativas = (l: Conciliacao[]) => l.filter((c) => c.status !== "REABERTA");

/** Situação de cada mês ocupado de uma empresa, com a demanda correspondente. */
export function mapaMeses(l: Conciliacao[]) {
  const m = new Map<string, { sit: SituacaoMes; c: Conciliacao }>();
  for (const c of ativas(l)) for (const mes of mesesEntre(c.comp_inicio, c.comp_fim))
    m.set(mes, { sit: situacaoCompetencia(c, mes), c });
  return m;
}

/** Demandas que conflitam com o período pedido. */
export function conflitos(l: Conciliacao[], ini: string, fim: string) {
  return ativas(l).filter((c) => idx(c.comp_inicio) <= idx(fim) && idx(c.comp_fim) >= idx(ini));
}

/** Blocos contínuos de meses livres dentro do período pedido (alternativa ao conflito). */
export function blocosLivres(l: Conciliacao[], ini: string, fim: string): [string, string][] {
  const ocup = mapaMeses(l); const out: [string, string][] = []; let a: string | null = null; let ult = "";
  for (const mes of mesesEntre(ini, fim)) {
    if (ocup.has(mes)) { if (a) out.push([a, ult]); a = null; } else { if (!a) a = mes; ult = mes; }
  }
  if (a) out.push([a, ult]);
  return out;
}

/** Meses pendentes da empresa: lacunas entre a 1ª competência conciliada e a competência de referência. */
export function mesesPendentes(l: Conciliacao[], ate: string): string[] {
  const at = ativas(l); if (!at.length) return [];
  const ini = at.map((c) => c.comp_inicio).sort()[0];
  if (!ini || idx(ini) > idx(ate)) return [];
  const ocup = mapaMeses(l);
  return mesesEntre(ini, ate).filter((m) => !ocup.has(m));
}

export async function carregarConciliacoes(): Promise<Conciliacao[]> {
  // Sem filtro de competência: o histórico inteiro sempre carrega.
  const { data, error } = await supabase.from("conciliacoes").select("*, conciliacao_alteracoes(*)").order("mes_inicio");
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, meses_conciliados: c.meses_conciliados as Record<string, boolean>, alteracoes: c.conciliacao_alteracoes })) as Conciliacao[];
}
export async function assumirConciliacao(empresaId: string, ini: string, fim: string, operadorId: string, autor: string) {
  exigirOperar();
  const { error } = await supabase.rpc("assumir_conciliacao", { p_empresa_id: empresaId, p_inicio: ini, p_fim: fim, p_operador_id: operadorId, p_autor: autor });
  if (error) throw new Error(error.message);
}
export async function finalizarConciliacao(id: string, operadorId: string, autor: string) {
  exigirOperar();
  const { error } = await supabase.rpc("finalizar_conciliacao", { p_id: id, p_operador_id: operadorId, p_autor: autor });
  if (error) throw new Error(error.message);
}
export async function marcarMesConciliacao(c: Conciliacao, mes: string, operadorId: string) {
  exigirOperar();
  const { error } = await supabase.rpc("marcar_mes_conciliacao", { p_id: c.id, p_competencia: mes, p_conciliado: c.meses_conciliados[mes] !== true, p_versao: c.versao, p_operador_id: operadorId });
  if (error) throw new Error(error.message);
}
export async function reabrirConciliacao(id: string, motivo: string, autor: string, operadorId: string) {
  exigirOperar();
  const { error } = await supabase.rpc("reabrir_conciliacao", { p_id: id, p_motivo: motivo, p_autor: autor, p_operador_id: operadorId });
  if (error) throw new Error(error.message);
}
