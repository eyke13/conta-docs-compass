// Filtro de operador compartilhado entre telas: padrão = operador cujo nome bate com o usuário logado
// (se tiver carteira), senão "TODOS". Gestor sempre "TODOS". Escolha vale para todas as telas até sair.
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ehGestor, ehVisitante, nomeAcesso } from "./acesso";
import { chaveNome } from "./extratos";

export const CHAVE_FILTRO_OP = "filtroOperador";
const ouvintes = new Set<() => void>();
const ler = () => (typeof window === "undefined" ? "" : localStorage.getItem(CHAVE_FILTRO_OP) ?? "");
function gravar(v: string) { localStorage.setItem(CHAVE_FILTRO_OP, v); ouvintes.forEach((f) => f()); }
export function limparFiltroOperador() { if (typeof window !== "undefined") localStorage.removeItem(CHAVE_FILTRO_OP); ouvintes.forEach((f) => f()); }

async function calcularPadrao(): Promise<string> {
  if (ehGestor() || ehVisitante()) return "TODOS";
  const alvo = chaveNome(nomeAcesso());
  if (!alvo) return "TODOS";
  const { data } = await supabase.from("operadores").select("id,nome");
  const iguais = (data ?? []).filter((o) => chaveNome(o.nome ?? "") === alvo);
  if (iguais.length !== 1) return "TODOS";
  const id = iguais[0]!.id;
  const [d, c] = await Promise.all([
    supabase.from("demandas").select("id", { count: "exact", head: true }).eq("operador_id", id),
    supabase.from("cobrancas").select("id", { count: "exact", head: true }).eq("operador_id", id),
  ]);
  return (d.count ?? 0) + (c.count ?? 0) > 0 ? id : "TODOS";
}

/** Retorna [valor, alterar, pronto, voltarAoPadrao]. */
export function useFiltroOperador() {
  const salvo = useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, ler, () => "");
  const q = useQuery({ queryKey: ["filtro-operador-padrao", nomeAcesso(), ehGestor()], queryFn: calcularPadrao, staleTime: Infinity });
  const padrao = q.data ?? "TODOS";
  const valor = salvo || padrao;
  return [valor, gravar, !!salvo || !q.isLoading, () => gravar(padrao)] as const;
}
