import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, ChevronLeft, ChevronRight, History, Search, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { progressoConciliacao, situacaoCompetencia } from "@/lib/progressoConciliacao";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Carregando } from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { COMPETENCIA_INICIAL, autorAtual, chaveNome, fmtDataHora, rotuloComp } from "@/lib/extratos";
import { cn } from "@/lib/utils";
import {
  type Conciliacao, ativas, assumirConciliacao, blocosLivres, carregarConciliacoes, conflitos, marcarMesConciliacao,
  idx, mapaMeses, mesesEntre, mesesPendentes, qtdMeses, reabrirConciliacao,
} from "@/lib/conciliacoes";

export const Route = createFileRoute("/_authenticated/conciliacoes")({
  head: () => ({ meta: [
    { title: "Conciliações Financeiras — Controle Operacional Contábil" },
    { name: "description", content: "Assuma, acompanhe e finalize conciliações financeiras com linha do tempo permanente por empresa." },
    { property: "og:title", content: "Conciliações Financeiras" },
    { property: "og:description", content: "Linha do tempo permanente das conciliações por empresa." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Conciliacoes,
});

type Emp = { id: string; nome: string; chave: string };
type StatusEmp = "DISPONIVEL" | "ANDAMENTO" | "CONCLUIDA";
const ROT_STATUS: Record<StatusEmp, string> = { DISPONIVEL: "Disponível", ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída" };
const COR_STATUS: Record<StatusEmp, string> = {
  DISPONIVEL: "border-transparent bg-muted text-muted-foreground",
  ANDAMENTO: "border-transparent bg-accent text-accent-foreground",
  CONCLUIDA: "border-transparent bg-primary text-primary-foreground",
};
const periodo = (c: Pick<Conciliacao, "comp_inicio" | "comp_fim">) => c.comp_inicio === c.comp_fim ? rotuloComp(c.comp_inicio) : `${rotuloComp(c.comp_inicio)} a ${rotuloComp(c.comp_fim)}`;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function useDados() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel("conciliacoes-mensais").on("postgres_changes", { event: "*", schema: "public", table: "conciliacoes" }, () => { qc.invalidateQueries({ queryKey: ["conciliacoes"] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);
  return useQuery({
    queryKey: ["conciliacoes"],
    refetchInterval: 30000,
    queryFn: async () => {
      const [e, c] = await Promise.all([
        supabase.from("empresas").select("id,nome").order("criado_em"),
        carregarConciliacoes(),
      ]);
      if (e.error) throw e.error;
      // Uma linha por empresa (homônimas de áreas diferentes são a mesma empresa)
      const vistos = new Map<string, Emp>();
      for (const x of e.data ?? []) { const k = chaveNome(x.nome); if (!vistos.has(k)) vistos.set(k, { id: x.id, nome: x.nome, chave: k }); }
      const porChave = new Map<string, Conciliacao[]>();
      for (const x of c) porChave.set(x.empresa_chave, [...(porChave.get(x.empresa_chave) ?? []), x]);
      return { empresas: [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" })), concs: c, porChave };
    },
  });
}

function statusEmp(l: Conciliacao[]): StatusEmp {
  const a = ativas(l);
  if (a.some((c) => c.status === "EM_ANDAMENTO")) return "ANDAMENTO";
  if (a.some((c) => c.status === "CONCLUIDA")) return "CONCLUIDA";
  return "DISPONIVEL";
}

function Conciliacoes() {
  const { data, isLoading } = useDados();
  const [aba, setAba] = useState("empresas");
  const [hist, setHist] = useState<Emp | null>(null);
  if (isLoading || !data) return <Carregando />;
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Conciliações Financeiras</h1>
        <p className="text-sm text-muted-foreground">Histórico permanente: não depende da competência escolhida no topo.</p></div>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList><TabsTrigger value="empresas">Empresas</TabsTrigger><TabsTrigger value="dashboard">Dashboard</TabsTrigger></TabsList>
        <TabsContent value="empresas"><ListaEmpresas dados={data} onHist={setHist} /></TabsContent>
        <TabsContent value="dashboard"><Dashboard dados={data} onHist={(id) => setHist(data.empresas.find((e) => e.chave === id) ?? null)} /></TabsContent>
      </Tabs>
      <Sheet open={!!hist} onOpenChange={(v) => !v && setHist(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>{hist?.nome}</SheetTitle></SheetHeader>
          {hist && <LinhaDoTempo key={hist.chave} lista={data.porChave.get(hist.chave) ?? []} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Dados = NonNullable<ReturnType<typeof useDados>["data"]>;

function ListaEmpresas({ dados, onHist }: { dados: Dados; onHist: (e: Emp) => void }) {
  const { podeOperar } = Route.useRouteContext();
  const { competencia } = useCompetencia();
  const [busca, setBusca] = useState("");
  const [op, setOp] = useState("TODOS");
  const [st, setSt] = useState<"TODOS" | StatusEmp>("TODOS");
  const [pend, setPend] = useState("TODOS");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [assumir, setAssumir] = useState<Emp | null>(null);
  const operadores = useMemo(() => [...new Set(dados.concs.map((c) => c.operador_nome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [dados]);

  const linhas = dados.empresas.map((e) => {
    const l = dados.porChave.get(e.chave) ?? [];
    return { e, l, status: statusEmp(l), andamento: ativas(l).filter((c) => c.status === "EM_ANDAMENTO"), concluidas: l.filter((c) => c.status === "CONCLUIDA"), pendentes: mesesPendentes(l, competencia) };
  });
  const lista = linhas.filter(({ e, l, status, pendentes }) => {
    if (busca && !norm(e.nome).includes(norm(busca))) return false;
    if (st !== "TODOS" && status !== st) return false;
    if (op !== "TODOS" && !ativas(l).some((c) => c.operador_nome === op)) return false;
    if (pend === "COM" && !pendentes.length) return false;
    if (pend === "SEM" && (pendentes.length || !ativas(l).length)) return false;
    if (pend === "NUNCA" && ativas(l).length) return false;
    if (de || ate) { const a = de || "0000-01", b = ate || "9999-12"; if (!ativas(l).some((c) => c.comp_inicio <= b && c.comp_fim >= a)) return false; }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Empresa ou código" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <Select value={st} onValueChange={(v) => setSt(v as typeof st)}><SelectTrigger className="w-full sm:w-44" aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Status: Todos</SelectItem>{(Object.keys(ROT_STATUS) as StatusEmp[]).map((k) => <SelectItem key={k} value={k}>{ROT_STATUS[k]}</SelectItem>)}</SelectContent></Select>
        <Select value={op} onValueChange={setOp}><SelectTrigger className="w-full sm:w-48" aria-label="Operador"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Operador: Todos</SelectItem>{operadores.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
        <Select value={pend} onValueChange={setPend}><SelectTrigger className="w-full sm:w-56" aria-label="Períodos"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="TODOS">Períodos: Todos</SelectItem><SelectItem value="COM">Com meses pendentes</SelectItem><SelectItem value="SEM">Em dia até {rotuloComp(competencia)}</SelectItem><SelectItem value="NUNCA">Nunca conciliadas</SelectItem></SelectContent></Select>
        <div className="flex items-center gap-1 text-sm text-muted-foreground"><span>De</span><Input type="month" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} /><span>até</span><Input type="month" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} />
          {(de || ate) && <Button variant="ghost" size="sm" onClick={() => { setDe(""); setAte(""); }}>Limpar</Button>}</div>
        <span className="ml-auto text-sm text-muted-foreground">{lista.length} empresa(s)</span>
      </div>
      <p className="text-xs text-muted-foreground">Meses pendentes = lacunas desde a primeira competência conciliada da empresa até {rotuloComp(competencia)}.</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {lista.map(({ e, status, andamento, concluidas, pendentes }) => (
          <div key={e.chave} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 items-center gap-2"><span className="truncate font-medium" title={e.nome}>{e.nome}</span><Badge variant="outline" className={COR_STATUS[status]}>{ROT_STATUS[status]}</Badge></div>
              {andamento.map((c) => (
                <div key={c.id} className="text-xs text-foreground">Em andamento: <b>{periodo(c)}</b> · {progressoConciliacao(c).conciliados}/{qtdMeses(c)} meses · {progressoConciliacao(c).percentual.toLocaleString("pt-BR")}% · {c.operador_nome} · assumida em {fmtDataHora(c.assumida_em)}</div>
              ))}
              {concluidas.length > 0 && <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">Conciliado:{concluidas.slice(-4).map((c) => <span key={c.id} className="rounded bg-primary/10 px-1.5 text-primary" title={`${c.operador_nome} · concluída em ${fmtDataHora(c.concluida_em)}`}>{periodo(c)}</span>)}{concluidas.length > 4 && <span>+{concluidas.length - 4}</span>}
                <span>· última conclusão {fmtDataHora(concluidas.map((c) => c.concluida_em ?? "").sort().at(-1) ?? null)}</span></div>}
              {pendentes.length > 0 && <div className="text-xs text-destructive">{pendentes.length} mês(es) pendente(s)</div>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {podeOperar && <Button size="sm" variant="outline" onClick={() => setAssumir(e)}><CalendarRange className="h-4 w-4" />Assumir conciliação</Button>}
              <Button size="sm" variant="ghost" onClick={() => onHist(e)}><History className="h-4 w-4" />Ver histórico</Button>
            </div>
          </div>
        ))}
        {!lista.length && <p className="p-6 text-sm text-muted-foreground">Nenhuma empresa com esses filtros.</p>}
      </div>
      {assumir && <AssumirDialog emp={assumir} lista={dados.porChave.get(assumir.chave) ?? []} onClose={() => setAssumir(null)} />}

    </div>
  );
}

function AssumirDialog({ emp, lista, onClose }: { emp: Emp; lista: Conciliacao[]; onClose: () => void }) {
  const { usuarioId: meuId, nome } = Route.useRouteContext();
  const { competencia } = useCompetencia();
  const qc = useQueryClient();
  const [ini, setIni] = useState(competencia);
  const [fim, setFim] = useState(competencia);
  const [salvando, setSalvando] = useState(false);
  const valido = /^\d{4}-\d{2}$/.test(ini) && /^\d{4}-\d{2}$/.test(fim);
  const invertido = valido && idx(fim) < idx(ini);
  const conf = valido && !invertido ? conflitos(lista, ini, fim) : [];
  const livres = conf.length ? blocosLivres(lista, ini, fim) : [];
  const feitas = ativas(lista).sort((a, b) => a.comp_inicio.localeCompare(b.comp_inicio));
  async function salvar(a = ini, b = fim) {
    if (a < COMPETENCIA_INICIAL) { toast.error("A primeira competência válida é 07/2026."); return; }
    setSalvando(true);
    try { await assumirConciliacao(emp.id, a, b, meuId, await autorAtual()); toast.success(`Conciliação de ${periodo({ comp_inicio: a, comp_fim: b })} assumida.`); qc.invalidateQueries({ queryKey: ["conciliacoes"] }); onClose(); }
    catch (e) { toast.error((e as Error).message); qc.invalidateQueries({ queryKey: ["conciliacoes"] }); }
    setSalvando(false);
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Assumir conciliação</DialogTitle><DialogDescription>{emp.nome}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">Operador responsável: <b>{nome}</b></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="ci">Competência inicial</Label><Input id="ci" type="month" min={COMPETENCIA_INICIAL} value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="cf">Competência final</Label><Input id="cf" type="month" min={COMPETENCIA_INICIAL} value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          {valido && !invertido && <p className="text-xs text-muted-foreground">{periodo({ comp_inicio: ini, comp_fim: fim })} · {mesesEntre(ini, fim).length} mês(es)</p>}
          {invertido && <p className="text-sm text-destructive">A competência final não pode ser anterior à inicial.</p>}
          <div className="rounded-lg border p-3 text-sm">
            <div className="mb-1 font-medium">Períodos já registrados</div>
            {feitas.length ? <ul className="space-y-0.5 text-xs">{feitas.map((c) => <li key={c.id}>{periodo(c)} — {c.status === "CONCLUIDA" ? `conciliado por ${c.operador_nome} em ${fmtDataHora(c.concluida_em)}` : `em andamento com ${c.operador_nome}`}</li>)}</ul> : <p className="text-xs text-muted-foreground">Nenhuma conciliação registrada para esta empresa.</p>}
          </div>
          {conf.length > 0 && <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive">Este período se sobrepõe a:</div>
            <ul className="text-xs">{conf.map((c) => <li key={c.id}>{periodo(c)} — {c.status === "CONCLUIDA" ? "já conciliado" : "em andamento"} por {c.operador_nome}</li>)}</ul>
            {livres.length ? <div className="flex flex-wrap items-center gap-2 text-xs"><span>Assumir só os meses livres:</span>{livres.map(([a, b]) => <Button key={a} size="sm" variant="outline" disabled={salvando} onClick={() => salvar(a, b)}>{periodo({ comp_inicio: a, comp_fim: b })}</Button>)}</div>
              : <p className="text-xs">Nenhum mês livre neste período.</p>}
          </div>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!valido || invertido || conf.length > 0 || salvando} onClick={() => salvar()}>Confirmar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COR_MES = { CONCILIADO: "bg-primary text-primary-foreground", ANDAMENTO: "bg-accent text-accent-foreground ring-1 ring-accent-foreground/30", PENDENTE: "bg-destructive/10 text-destructive", VAZIO: "bg-muted text-muted-foreground" } as const;
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function LinhaDoTempo({ lista }: { lista: Conciliacao[] }) {
  const { gestor, usuarioId: meuId, podeOperar } = Route.useRouteContext();
  const { competencia } = useCompetencia();
  const qc = useQueryClient();
  const mapa = mapaMeses(lista);
  const pend = new Set(mesesPendentes(lista, competencia));
  const anos = [...new Set([...lista.flatMap((c) => [c.comp_inicio, c.comp_fim]).map((c) => Number(c.slice(0, 4))), Number(competencia.slice(0, 4))])].sort();
  const [ano, setAno] = useState(() => { const a = ativas(lista).at(-1); return a ? Number(a.comp_fim.slice(0, 4)) : Number(competencia.slice(0, 4)); });
  const [sel, setSel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function clicarMes(mes: string) {
    setSel(mes);
    const c = mapa.get(mes)?.c;
    if (!c || salvando || !podeOperar || (c.operador_id !== meuId && !gestor)) return;
    setSalvando(true);
    try {
      await marcarMesConciliacao(c, mes, meuId);
      await qc.invalidateQueries({ queryKey: ["conciliacoes"] });
    } catch (e) {
      toast.error((e as Error).message);
      await qc.invalidateQueries({ queryKey: ["conciliacoes"] });
    } finally { setSalvando(false); }
  }
  const [reabrir, setReabrir] = useState<Conciliacao | null>(null);
  const [motivo, setMotivo] = useState("");
  const selC = sel ? mapa.get(sel)?.c : undefined;
  const todas = [...lista].sort((a, b) => b.comp_inicio.localeCompare(a.comp_inicio) || b.assumida_em.localeCompare(a.assumida_em));
  async function confirmarReabrir() {
    if (!reabrir) return;
    try { await reabrirConciliacao(reabrir.id, motivo, await autorAtual(), meuId); toast.success("Período reaberto; o registro anterior continua no histórico."); qc.invalidateQueries({ queryKey: ["conciliacoes"] }); setReabrir(null); setMotivo(""); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button size="icon" variant="ghost" aria-label="Ano anterior" onClick={() => setAno(ano - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-semibold tabular-nums">{ano}</span>
        <Button size="icon" variant="ghost" aria-label="Próximo ano" onClick={() => setAno(ano + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {MESES_CURTOS.map((m, i) => {
          const c = `${ano}-${String(i + 1).padStart(2, "0")}`;
          const s = mapa.get(c)?.sit ?? (pend.has(c) ? "PENDENTE" : "VAZIO");
          return <Button key={c} variant="ghost" disabled={salvando} aria-label={`${rotuloComp(c)}: ${s === "CONCILIADO" ? "Conciliado" : s === "ANDAMENTO" ? "Em conciliação" : s === "PENDENTE" ? "Pendente" : "Sem registro"}`} aria-pressed={s === "CONCILIADO"} onClick={() => clicarMes(c)} className={cn("h-8 rounded-md px-2 text-xs font-medium hover:opacity-80", COR_MES[s], sel === c && "outline outline-2 outline-offset-1 outline-ring")}>{m}</Button>;
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><i className={cn("h-3 w-3 rounded", COR_MES.CONCILIADO)} />Conciliado</span>
        <span className="flex items-center gap-1"><i className={cn("h-3 w-3 rounded", COR_MES.ANDAMENTO)} />Em conciliação</span>
        <span className="flex items-center gap-1"><i className={cn("h-3 w-3 rounded", COR_MES.PENDENTE)} />Pendente</span>
        <span className="flex items-center gap-1"><i className={cn("h-3 w-3 rounded", COR_MES.VAZIO)} />Sem registro</span>
      </div>
      {anos.length > 1 && <div className="flex flex-wrap gap-1 text-xs">{anos.map((a) => <Button key={a} size="sm" variant={a === ano ? "secondary" : "ghost"} onClick={() => setAno(a)}>{a}</Button>)}</div>}
      {sel && <div className="rounded-lg border p-3 text-sm">
        <div className="font-medium">{rotuloComp(sel)}</div>
        {selC ? <div className="text-xs text-muted-foreground">{situacaoCompetencia(selC, sel) === "CONCILIADO" ? "Conciliado" : "Em conciliação"} na demanda {periodo(selC)} ({qtdMeses(selC)} mês(es)) · {selC.operador_nome} · assumida em {fmtDataHora(selC.assumida_em)}{selC.concluida_em && ` · concluída em ${fmtDataHora(selC.concluida_em)} por ${selC.concluida_por ?? "—"}`}</div>
          : <div className="text-xs text-muted-foreground">{pend.has(sel) ? "Pendente de conciliação." : "Nenhuma conciliação registrada."}</div>}
      </div>}
      <div>
        <div className="mb-2 text-sm font-medium">Todas as demandas ({todas.length})</div>
        <div className="space-y-2">
          {todas.map((c) => (
            <div key={c.id} className={cn("rounded-lg border p-3 text-xs", c.status === "REABERTA" && "opacity-70")}>
              <div className="flex items-center gap-2"><b className="text-sm">{periodo(c)}</b>
                <Badge variant="outline" className={c.status === "CONCLUIDA" ? COR_STATUS.CONCLUIDA : c.status === "EM_ANDAMENTO" ? COR_STATUS.ANDAMENTO : ""}>{c.status === "CONCLUIDA" ? "Concluída" : c.status === "EM_ANDAMENTO" ? "Em andamento" : "Reaberta"}</Badge>
                {gestor && podeOperar && c.status === "CONCLUIDA" && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setReabrir(c)}><Undo2 className="h-3.5 w-3.5" />Reabrir</Button>}</div>
              <div className="mt-1 text-muted-foreground">Responsável: {c.operador_nome} · assumida em {fmtDataHora(c.assumida_em)}{c.concluida_em && ` · concluída em ${fmtDataHora(c.concluida_em)} por ${c.concluida_por ?? "—"}`}</div>
              <ProgressoDemanda c={c} />
              {c.status === "REABERTA" && <div className="mt-1 text-muted-foreground">Reaberta em {fmtDataHora(c.reaberta_em)} por {c.reaberta_por}: {c.reaberta_motivo}</div>}
            </div>
          ))}
          {!todas.length && <p className="text-xs text-muted-foreground">Nenhuma conciliação registrada.</p>}
        </div>
      </div>
      {lista.some((c) => c.alteracoes.length > 0) && <section className="space-y-2">
        <h3 className="text-sm font-medium">Alterações mensais</h3>
        {[...lista.flatMap((c) => c.alteracoes)].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map((a) => <div key={a.id} className="border-b pb-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{rotuloComp(a.competencia)} · {a.conciliado ? "Conciliado" : "Em conciliação"}</span>
          <div>{a.autor} · {fmtDataHora(a.criado_em)}{a.status_de !== a.status_para && (a.status_para === "CONCLUIDA" ? " · Demanda concluída" : " · Demanda retomada")}</div>
        </div>)}
      </section>}
      <Dialog open={!!reabrir} onOpenChange={(v) => !v && setReabrir(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reabrir conciliação</DialogTitle><DialogDescription>{reabrir && periodo(reabrir)}. O registro continua no histórico como "Reaberta" e os meses ficam livres para nova demanda.</DialogDescription></DialogHeader>
          <Label htmlFor="mot">Justificativa</Label><Textarea id="mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter><Button variant="ghost" onClick={() => setReabrir(null)}>Cancelar</Button><Button disabled={!motivo.trim()} onClick={confirmarReabrir}>Reabrir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgressoDemanda({ c }: { c: Conciliacao }) {
  const p = progressoConciliacao(c);
  return <div className="mt-2 space-y-1">
    <div className="flex flex-wrap justify-between gap-1 text-xs"><span>{p.conciliados}/{p.total} meses conciliados · {p.andamento} em conciliação</span><b className="tabular-nums">{p.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</b></div>
    <Progress value={p.percentual} aria-label={`Progresso de ${c.empresa_nome}`} />
  </div>;
}

function Dashboard({ dados, onHist }: { dados: Dados; onHist: (chave: string) => void }) {
  const { competencia } = useCompetencia();
  const [busca, setBusca] = useState("");
  const at = ativas(dados.concs);
  const concluidas = at.filter((c) => c.status === "CONCLUIDA");
  const andamento = at.filter((c) => c.status === "EM_ANDAMENTO");
  const meses = at.reduce((s, c) => s + progressoConciliacao(c).conciliados, 0);
  const mesesAndamento = at.reduce((s, c) => s + progressoConciliacao(c).andamento, 0);
  const comAndamento = new Set(andamento.map((c) => c.empresa_chave));
  const disponiveis = dados.empresas.filter((e) => !comAndamento.has(e.chave)).length;
  const comPend = dados.empresas.filter((e) => mesesPendentes(dados.porChave.get(e.chave) ?? [], competencia).length > 0).length;
  const porOp = new Map<string, { d: number; m: number; a: number }>();
  for (const c of at) { const x = porOp.get(c.operador_nome) ?? { d: 0, m: 0, a: 0 }; x.m += progressoConciliacao(c).conciliados; if (c.status === "CONCLUIDA") { x.d++; } else x.a++; porOp.set(c.operador_nome, x); }
  const porComp = new Map<string, number>();
  for (const c of at) for (const m of mesesEntre(c.comp_inicio, c.comp_fim)) if (c.meses_conciliados[m] === true) porComp.set(m, (porComp.get(m) ?? 0) + 1);
  const q = norm(busca);
  const tabela = concluidas.filter((c) => !q || norm(`${c.empresa_nome} ${c.operador_nome} ${periodo(c)} ${fmtDataHora(c.concluida_em)}`).includes(q))
    .sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? ""));
  const cards: [string, number][] = [["Empresas cadastradas", dados.empresas.length], ["Em andamento", andamento.length], ["Concluídas", concluidas.length], ["Meses conciliados", meses], ["Meses em conciliação", mesesAndamento], ["Empresas disponíveis", disponiveis], ["Empresas com meses pendentes", comPend]];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([t, v]) => <div key={t} className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{t}</div><div className="text-2xl font-semibold tabular-nums">{v}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-2 font-medium">Por operador</div>
          <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="text-left">Operador</th><th className="text-right">Concluídas</th><th className="text-right">Meses</th><th className="text-right">Em andamento</th></tr></thead>
            <tbody>{[...porOp].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([n, x]) => <tr key={n} className="border-t"><td className="py-1">{n}</td><td className="text-right tabular-nums">{x.d}</td><td className="text-right tabular-nums">{x.m}</td><td className="text-right tabular-nums">{x.a}</td></tr>)}</tbody></table>
          {!porOp.size && <p className="text-xs text-muted-foreground">Sem registros ainda.</p>}</div>
        <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-2 font-medium">Empresas conciliadas por competência</div>
          <div className="max-h-64 space-y-1 overflow-y-auto">{[...porComp].sort((a, b) => b[0].localeCompare(a[0])).map(([m, n]) => (
            <div key={m} className="flex items-center gap-2 text-sm"><span className="w-28 shrink-0">{rotuloComp(m)}</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(n / Math.max(...porComp.values())) * 100}%` }} /></div><span className="w-8 text-right tabular-nums">{n}</span></div>))}
            {!porComp.size && <p className="text-xs text-muted-foreground">Sem registros ainda.</p>}</div></div>
      </div>
      <section className="space-y-3">
        <h2 className="font-medium">Progresso das demandas em andamento</h2>
        {andamento.map((c) => <div key={c.id} className="rounded-lg border bg-card p-3">
          <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => onHist(c.empresa_chave)}>{c.empresa_nome}</Button>
          <div className="text-xs text-muted-foreground">{periodo(c)} · {c.operador_nome}</div><ProgressoDemanda c={c} />
        </div>)}
        {!andamento.length && <p className="text-sm text-muted-foreground">Nenhuma demanda em andamento.</p>}
      </section>
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-4"><div className="font-medium">Conciliações concluídas</div>
          <div className="relative ml-auto w-full sm:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Empresa, operador, período ou data" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-left">Empresa</th><th className="px-4 text-left">Período conciliado</th><th className="px-4 text-left">Operador responsável</th><th className="px-4 text-left">Data de conclusão</th><th className="px-4 text-left">Status</th></tr></thead>
          <tbody>{tabela.map((c) => <tr key={c.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => onHist(c.empresa_chave)}><td className="px-4 py-2">{c.empresa_nome}</td><td className="px-4">{periodo(c)}</td><td className="px-4">{c.operador_nome}</td><td className="px-4">{fmtDataHora(c.concluida_em)}</td><td className="px-4">Concluída</td></tr>)}</tbody></table>
          {!tabela.length && <p className="p-6 text-sm text-muted-foreground">Nenhuma conciliação concluída encontrada.</p>}</div>
      </div>
    </div>
  );
}
