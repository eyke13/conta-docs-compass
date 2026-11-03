import { ROT_TIPO } from "@/lib/extratos";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ehGestor } from "@/lib/acesso";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Carregando } from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { fmtDataHora, rotuloComp } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Histórico — Controle Operacional Contábil" }, { name: "description", content: "Registro de todas as operações realizadas." }, { property: "og:title", content: "Histórico — Controle Operacional Contábil" }, { property: "og:description", content: "Registro de todas as operações realizadas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: () => { if (!ehGestor()) throw redirect({ to: "/dashboard" }); },
  component: Historico,
});

function Historico() {
  const { competencia, tipo } = useCompetencia();
  const R = ROT_TIPO[tipo];
  const [todas, setTodas] = useState(false);
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["historico", tipo, todas ? "todas" : competencia],
    queryFn: async () => {
      let q = supabase.from("historico").select("*").or(`tipo.eq.${tipo},tipo.is.null`).order("criado_em", { ascending: false }).limit(1000);
      if (!todas) q = q.eq("competencia", competencia);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const b = busca.toLowerCase();
  const rows = (data ?? []).filter((h) => !b || [h.empresa_nome, h.banco_nome, h.operador_nome, h.acao, h.detalhe, h.autor].some((x) => x?.toLowerCase().includes(b)));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Histórico de Operações</h1>
      <div className="flex flex-wrap items-center gap-4">
        <Input className="max-w-sm" placeholder={`Buscar empresa, ${R.item.toLowerCase()}, operador, ação…`} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={todas} onCheckedChange={setTodas} />Todas as competências</label>
        <span className="text-sm text-muted-foreground">{todas ? "Todas" : rotuloComp(competencia)} · {rows.length} registros</span>
      </div>
      {isLoading ? <Carregando /> : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Competência</TableHead><TableHead>Ação</TableHead><TableHead>Empresa</TableHead><TableHead>{R.item}</TableHead><TableHead>Detalhe</TableHead><TableHead>Operador</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtDataHora(h.criado_em)}</TableCell>
                  <TableCell className="text-xs">{h.competencia ? rotuloComp(h.competencia) : "—"}</TableCell>
                  <TableCell className="text-xs font-medium">{h.acao}</TableCell>
                  <TableCell className="text-sm">{h.empresa_nome ?? "—"}</TableCell>
                  <TableCell className="text-sm">{h.banco_nome ?? "—"}</TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">{h.detalhe}</TableCell>
                  <TableCell className="text-xs">{h.autor}{h.autor_operador_id && <span className="block font-mono text-[10px] text-muted-foreground" title={h.autor_operador_id}>Cód. {h.autor_operador_id.slice(0, 8)}</span>}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum registro.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
