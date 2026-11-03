import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DadosRelatorios } from "./relatorios";

export async function exigirGestorRelatorios() {
  const { data, error } = await supabase.rpc("papel_atual");
  if (error) throw new Error("Não foi possível verificar o acesso aos relatórios.");
  return data === "gestor";
}
export const relatoriosQuery = (comp: string) => queryOptions({
  queryKey: ["competencia", comp, "RELATORIOS"],
  queryFn: async (): Promise<DadosRelatorios> => {
    const { data, error } = await supabase.rpc("dados_relatorios", { p_competencia: comp });
    if (error) throw new Error(error.message);
    return data as unknown as DadosRelatorios;
  },
  staleTime: 0,
});