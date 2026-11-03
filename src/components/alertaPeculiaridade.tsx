import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDataHora } from "@/lib/extratos";
import { cn } from "@/lib/utils";

export const CATS_PEC = { FINANCEIRO: "Financeiro e Acessos", RELACIONAMENTO: "Relacionamento e Contatos" } as const;

export interface ResumoPec { chave: string; empresa_ids: string[]; total: number; financeiro: number; relacionamento: number; visitante: number; ultima: string | null }

export const QK_RESUMO_PEC = ["pec-resumo"] as const;

/** Resumo por empresa (nome normalizado), indexado por empresa_id. Uma única chamada, sem corte de linhas. */
export function useResumoPeculiaridades() {
  return useQuery({
    queryKey: QK_RESUMO_PEC,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("peculiaridades_por_empresa" as never);
      if (error) throw error;
      const m = new Map<string, ResumoPec>();
      for (const r of (data ?? []) as ResumoPec[]) for (const id of r.empresa_ids) m.set(id, r);
      return m;
    },
  });
}

/** Chamar uma vez por tela: qualquer mudança em peculiaridades atualiza o resumo sem recarregar. */
export function usePeculiaridadesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`pec-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "peculiaridades" }, () => {
        qc.invalidateQueries({ queryKey: QK_RESUMO_PEC });
        qc.invalidateQueries({ queryKey: ["pec-detalhe"] });
        qc.invalidateQueries({ queryKey: ["peculiaridades"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

/** Classes de destaque da linha para o operador responsável. */
export const DESTAQUE_PEC = "border-l-4 border-l-warning bg-warning/10";

export function AlertaPeculiaridade({ empresaId, nome, responsavel = false, estatico = false }: { empresaId: string; nome: string; responsavel?: boolean; estatico?: boolean }) {
  const { data } = useResumoPeculiaridades();
  const [aberto, setAberto] = useState(false);
  const r = data?.get(empresaId);
  if (!r || !r.total) return null;
  const cats = [r.financeiro && CATS_PEC.FINANCEIRO, r.relacionamento && CATS_PEC.RELACIONAMENTO].filter(Boolean).join(" · ");
  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`Ver peculiaridades da empresa (${r.total})`}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAberto(true); }}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-warning ring-1 ring-warning/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning",
                estatico ? "bg-warning/10" : "pec-pulso")}>
              <AlertTriangle className="h-3.5 w-3.5" />{r.total}
            </button>
          </TooltipTrigger>
          <TooltipContent>{cats}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {responsavel && <Badge variant="outline" className="shrink-0 border-warning/50 bg-warning/10 text-[10px] font-semibold text-warning">Peculiaridade</Badge>}
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl" onClick={(e) => e.stopPropagation()}>
          <SheetHeader>
            <SheetTitle>{nome}</SheetTitle>
            <SheetDescription>Peculiaridades — leia antes de operar esta empresa</SheetDescription>
          </SheetHeader>
          {aberto && <Detalhe ids={r.empresa_ids} responsavel={responsavel} />}
          <SheetFooter className="mt-4">
            <Button asChild><Link to="/peculiaridades" search={{ empresa: empresaId }}>Abrir em Peculiaridades</Link></Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Detalhe({ ids, responsavel }: { ids: string[]; responsavel: boolean }) {
  const { data } = useQuery({
    queryKey: ["pec-detalhe", ids.join(",")],
    queryFn: async () => {
      const [p, e] = await Promise.all([
        supabase.from("peculiaridades").select("*").in("empresa_id", ids).order("criado_em", { ascending: false }),
        supabase.from("empresas").select("tem_otimizza").in("id", ids),
      ]);
      if (p.error) throw p.error;
      return { pecs: p.data ?? [], otimizza: (e.data ?? []).some((x) => x.tem_otimizza) };
    },
  });
  if (!data) return <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>;
  return (
    <div className="mt-4 space-y-4">
      {responsavel && <div className="rounded-md border border-warning/40 bg-warning/15 px-3 py-2 text-sm font-medium text-warning">Você é o responsável por esta empresa. Estas informações são importantes para o seu trabalho.</div>}
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Info className="h-4 w-4 text-primary" /><span className="font-semibold">TEM OTIMIZZA?</span><span>{data.otimizza ? "Sim" : "Não"}</span></div>
      {(Object.keys(CATS_PEC) as (keyof typeof CATS_PEC)[]).map((c) => {
        const itens = data.pecs.filter((p) => p.categoria === c);
        return (
          <section key={c}>
            <h3 className="mb-2 text-sm font-semibold">{CATS_PEC[c]} <span className="font-normal text-muted-foreground">({itens.length})</span></h3>
            <div className="space-y-2">
              {itens.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-3">
                  <p className="whitespace-pre-wrap text-sm">{p.descricao}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {p.origem === "VISITANTE" && <Badge variant="outline" className="mr-1.5 border-transparent bg-accent text-accent-foreground">Visitante</Badge>}
                    Por {p.criado_por ?? "—"} em {fmtDataHora(p.criado_em)}{p.atualizado_em && ` · editada por ${p.atualizado_por ?? "—"} em ${fmtDataHora(p.atualizado_em)}`}
                  </div>
                </div>
              ))}
              {!itens.length && <p className="text-sm text-muted-foreground">Nenhuma registrada.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
