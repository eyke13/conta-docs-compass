import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, LockOpen, MoreHorizontal, RotateCcw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCompetencia } from "@/lib/competencia";
import { exigirOperar, usePodeOperar } from "@/lib/acesso";
import {
  COR_BANCO, COR_EMPRESA, ROTULO_BANCO, ROTULO_EMPRESA, ROT_TIPO, autorAtual, carregarCompetencia,
  fmtDataHora, registrar, rotuloComp, type EmpresaLinha, type Extrato, type StatusBanco, type StatusEmpresa,
} from "@/lib/extratos";

export function useDadosCompetencia(comp?: string) {
  const { competencia, tipo } = useCompetencia();
  const c = comp ?? competencia;
  return useQuery({ queryKey: ["competencia", c, tipo], queryFn: () => carregarCompetencia(c, tipo) });
}

/** Bancos e Cartões juntos (telas sem o filtro de área). */
export function useDadosAmbos() {
  const { competencia } = useCompetencia();
  return useQuery({ queryKey: ["competencia", competencia, "AMBOS"], queryFn: async () => {
    const [b, c] = await Promise.all([carregarCompetencia(competencia, "BANCO"), carregarCompetencia(competencia, "CARTAO")]);
    return { linhas: [...b.linhas, ...c.linhas], operadores: b.operadores };
  } });
}

export function useInvalidar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function StatusEmpresaBadge({ s }: { s: StatusEmpresa }) {
  return <Badge variant="outline" className={cn("border-transparent font-medium", COR_EMPRESA[s])}>{ROTULO_EMPRESA[s]}</Badge>;
}

export function Carregando() {
  return <div className="flex items-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
}

export function CompetenciaVazia() {
  const { tipo } = useCompetencia();
  if (!usePodeOperar()) return <CompetenciaNaoAberta />;
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <p className="font-medium">Nenhuma empresa com {ROT_TIPO[tipo].itens.toLowerCase()} cadastrados.</p>
      <p className="mt-1 text-sm text-muted-foreground">Importe a planilha uma vez: as empresas passam a aparecer em todas as competências seguintes.</p>
    </div>
  );
}

export function CompetenciaNaoAberta() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <p className="font-medium">Esta competência ainda não foi aberta pela equipe.</p>
      <p className="mt-1 text-sm text-muted-foreground">Os dados aparecem aqui assim que alguém da equipe abrir o mês.</p>
    </div>
  );
}

async function alternarConclusao(linha: EmpresaLinha, novo: boolean): Promise<boolean> {
  exigirOperar();
  const autor = await autorAtual();
  const { error } = await supabase.from("demandas").update({
    concluida: novo, concluida_em: novo ? new Date().toISOString() : null, concluida_por: novo ? autor : null,
  }).eq("id", linha.id);
  if (error) { toast.error(error.message); return false; }
  await registrar({ competencia: linha.competencia, empresa_id: linha.empresa_id, empresa_nome: linha.empresa_nome, tipo: linha.tipo,
    operador_nome: linha.operador?.nome ?? null, acao: novo ? "EMPRESA CONCLUÍDA" : "EMPRESA REABERTA", detalhe: novo ? "Pendente → Concluída" : "Concluída → Pendente" });
  toast.success(`${linha.empresa_nome}: ${novo ? "concluída" : "reaberta"}.`);
  return true;
}

export function ConcluirEmpresaButton({ linha }: { linha: EmpresaLinha }) {
  const invalidar = useInvalidar();
  const [salvando, setSalvando] = useState(false);
  const pode = usePodeOperar();
  if (!pode && !linha.concluida) return <span className="px-2 text-sm text-muted-foreground">Pendente</span>;
  if (linha.concluida) {
    return (
      <span className="inline-flex items-center gap-1 px-2 text-sm font-medium text-success"
        title={`Concluída por ${linha.concluida_por ?? "—"} em ${fmtDataHora(linha.concluida_em)}`}>
        <Check className="h-4 w-4" />Concluída
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={salvando} title="Marcar a empresa como concluída"
      onClick={async () => { setSalvando(true); if (await alternarConclusao(linha, true)) invalidar(); setSalvando(false); }}>
      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Concluir empresa
    </Button>
  );
}

export function MenuAcoesEmpresa({ linha }: { linha: EmpresaLinha }) {
  const invalidar = useInvalidar();
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const bloq = linha.bloqueada;
  const pode = usePodeOperar();
  async function reabrir() {
    setSalvando(true);
    if (await alternarConclusao(linha, false)) invalidar();
    setSalvando(false);
  }
  async function executar() {
    setSalvando(true);
    setConfirmando(false);
    const autor = await autorAtual();
    const agora = new Date().toISOString();
    const dados = bloq
      ? { bloqueada: false, bloqueada_em: null, bloqueada_por: null, concluida: false, concluida_em: null, concluida_por: null }
      : { bloqueada: true, bloqueada_em: agora, bloqueada_por: autor, concluida: true, concluida_em: agora, concluida_por: autor };
    const { error } = await supabase.from("demandas").update(dados).eq("id", linha.id);
    if (error) toast.error(error.message);
    else {
      await registrar({ competencia: linha.competencia, empresa_id: linha.empresa_id, empresa_nome: linha.empresa_nome, tipo: linha.tipo,
        operador_nome: linha.operador?.nome ?? null,
        acao: bloq ? "BLOQUEIO REMOVIDO" : "SERVIÇOS BLOQUEADOS",
        detalhe: bloq ? "Empresa desbloqueada (estava com serviços bloqueados) · Concluída → Pendente" : "Concluída automaticamente por bloqueio dos serviços" });
      toast.success(`${linha.empresa_nome}: ${bloq ? "bloqueio removido" : "marcada com serviços bloqueados"}.`);
      invalidar();
    }
    setSalvando(false);
  }
  if (!pode) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" disabled={salvando} className="h-8 w-8 shrink-0" aria-label="Mais ações" title="Mais ações">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {linha.concluida && !bloq && (
            <DropdownMenuItem onClick={reabrir} disabled={salvando}>
              <RotateCcw className="h-4 w-4" />Reabrir empresa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setConfirmando(true)} disabled={salvando}>
            {bloq ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {bloq ? "Remover bloqueio" : "Serviços bloqueados"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmando} onOpenChange={(o) => { if (!salvando) setConfirmando(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bloq ? "Remover bloqueio?" : "Serviços bloqueados"}</AlertDialogTitle>
            <AlertDialogDescription>
              {bloq ? `A empresa ${linha.empresa_nome} volta ao fluxo normal como Pendente. O histórico manterá o registro do bloqueio.`
                : `Esta empresa está com os serviços bloqueados. Deseja marcá-la como bloqueada e concluir esta empresa?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executar}>{bloq ? "Remover bloqueio" : "Marcar e concluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export async function alterarStatusBanco(b: Extrato, status: StatusBanco, empresaNome: string) {
  exigirOperar();
  const autor = await autorAtual();
  const agora = new Date().toISOString();
  const { error } = await supabase.from("extratos").update({
    status, atualizado_por: autor, atualizado_em: agora, concluido_em: status === "CONCLUIDO" ? agora : null,
  }).eq("id", b.id);
  if (error) throw error;
  await registrar({ competencia: b.competencia, empresa_id: b.empresa_id, empresa_nome: empresaNome, banco_nome: b.banco_nome,
    tipo: b.tipo, acao: "STATUS ALTERADO", detalhe: `${ROTULO_BANCO[b.status]} → ${ROTULO_BANCO[status]}` });
}

export function StatusBancoSelect({ b, empresaNome }: { b: Extrato; empresaNome: string }) {
  const invalidar = useInvalidar();
  if (!usePodeOperar()) return <Badge variant="outline" className={cn("border-transparent text-xs font-medium", COR_BANCO[b.status])}>{ROTULO_BANCO[b.status]}</Badge>;
  return (
    <Select value={b.status === "PENDENTE" ? "" : b.status} onValueChange={async (v) => {
      try { await alterarStatusBanco(b, v as StatusBanco, empresaNome); toast.success(`${b.banco_nome}: ${ROTULO_BANCO[v as StatusBanco]}`); invalidar(); }
      catch (e) { toast.error((e as Error).message); }
    }}>
      <SelectTrigger className={cn("h-8 w-36 border-transparent text-xs font-medium", COR_BANCO[b.status])}><SelectValue placeholder="Pendente" /></SelectTrigger>
      <SelectContent>
        {(["CONCLUIDO", "ERRO"] as StatusBanco[]).map((s) => <SelectItem key={s} value={s}>{ROTULO_BANCO[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ComentarioBanco({ b, empresaNome }: { b: Extrato; empresaNome: string }) {
  const [texto, setTexto] = useState(b.comentario ?? "");
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidar();
  useEffect(() => setTexto(b.comentario ?? ""), [b.comentario]);
  const pode = usePodeOperar();
  async function salvar() {
    if ((b.comentario ?? "") === texto.trim()) return;
    setSalvando(true);
    const autor = await autorAtual();
    const { error } = await supabase.from("extratos").update({ comentario: texto.trim() || null, atualizado_por: autor, atualizado_em: new Date().toISOString() }).eq("id", b.id);
    if (error) toast.error(error.message);
    else {
      await registrar({ competencia: b.competencia, empresa_id: b.empresa_id, empresa_nome: empresaNome, banco_nome: b.banco_nome,
        acao: "COMENTÁRIO", detalhe: `Anterior: "${b.comentario ?? ""}" → Novo: "${texto.trim()}"` });
      toast.success("Comentário salvo.");
      invalidar();
    }
    setSalvando(false);
  }
  if (!pode) return <p className="text-xs text-muted-foreground">{b.comentario || "—"}</p>;
  return (
    <div className="relative">
      <Textarea rows={1} value={texto} placeholder="Comentário (salva ao sair do campo)" onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
        className="min-h-8 resize-y py-1.5 text-xs" />
      {salvando && <Loader2 className="absolute right-2 top-2 h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

