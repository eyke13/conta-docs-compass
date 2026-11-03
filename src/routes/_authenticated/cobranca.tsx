import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FiltroRecebido, SEM_DATA, passaPeriodo, rotuloPeriodo, type PeriodoRecebido } from "@/components/filtroRecebido";
import { useFiltroOperador } from "@/lib/filtroOperador";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, History, Info, Lock, LockOpen, MessageCircle, MoreHorizontal, Phone, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Carregando } from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { ehGestor, podeOperar, usuarioId } from "@/lib/acesso";
import { CompetenciaNaoAberta } from "@/components/extratos";
import { cn } from "@/lib/utils";
import { AlertaPeculiaridade, DESTAQUE_PEC, usePeculiaridadesRealtime, useResumoPeculiaridades } from "@/components/alertaPeculiaridade";
import { Badge } from "@/components/ui/badge";
import { AvisoGrupo, FiltroGrupoSelect } from "@/components/grupos";
import { ordenarPorGrupo, passaFiltroGrupo, useGruposSituacao } from "@/lib/grupos";
import { COR_BANCO, ROTULO_BANCO, type StatusBanco, REGIMES, ROT_REGIME, autorAtual, fmtDataHora, registrar, rotuloComp } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/cobranca")({
  head: () => ({ meta: [{ title: "Cobrança de Documentação — Controle Operacional Contábil" }, { name: "description", content: "Acompanhamento mensal da cobrança de documentação por empresa." }, { property: "og:title", content: "Cobrança de Documentação — Controle Operacional Contábil" }, { property: "og:description", content: "Acompanhamento mensal da cobrança de documentação por empresa." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { status?: StatusDoc; operador?: string; talento?: string; grupo?: string; recebidoDe?: string; recebidoAte?: string } => {
    const dia = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const de = s["recebidoDe"] === SEM_DATA || dia(s["recebidoDe"]) ? (s["recebidoDe"] as string) : undefined;
    return {
      ...(typeof s["status"] === "string" && ["PENDENTE", "AGUARDANDO", "RECEBIDO"].includes(s["status"]) ? { status: s["status"] as StatusDoc } : {}),
      ...(typeof s["operador"] === "string" && s["operador"] ? { operador: s["operador"] } : {}),
      ...(typeof s["talento"] === "string" && s["talento"] ? { talento: s["talento"] } : {}),
      ...(typeof s["grupo"] === "string" && s["grupo"] ? { grupo: s["grupo"] } : {}),
      ...(de ? { recebidoDe: de } : {}),
      ...(de && de !== SEM_DATA && dia(s["recebidoAte"]) ? { recebidoAte: s["recebidoAte"] as string } : {}),
    };
  },
  component: Cobranca,
});

type StatusDoc = "PENDENTE" | "AGUARDANDO" | "RECEBIDO";
type Canal = "WHATSAPP" | "LIGACAO";
const ROT_CANAL: Record<Canal, string> = { WHATSAPP: "WhatsApp", LIGACAO: "ligação" };
const ROT: Record<StatusDoc, string> = { PENDENTE: "Pendente", AGUARDANDO: "Aguardando Envio", RECEBIDO: "Recebido" };
const COR: Record<StatusDoc, string> = { PENDENTE: "bg-muted text-muted-foreground", AGUARDANDO: "bg-warning/15 text-warning", RECEBIDO: "bg-success/15 text-success" };

interface Linha {
  id: string; empresa_id: string; status: StatusDoc; comentario: string | null; movimentado_em: string | null; movimentado_por: string | null;
  nome: string; talento: string | null; regime: string | null; prioridade: number | null; operador_id: string | null; operador_nome: string | null; otimizza: boolean; obs: Obs[];
  bloqueada: boolean; bloqueada_em: string | null; bloqueada_por: string | null;
  contatos: { whats: number; lig: number };
}

type Obs = { id: string; tipo: string; banco_nome: string; status: StatusBanco; comentario: string | null; atualizado_por: string | null; atualizado_em: string | null };

async function carregar(competencia: string): Promise<Linha[]> {
  const { data: emps, error } = await supabase.from("empresas").select("id,nome,talento_doc,regime,prioridade,tem_otimizza").eq("cobranca", true).order("nome").limit(5000);
  if (error) throw error;
  const { data: atuais } = await supabase.from("cobrancas").select("empresa_id").eq("competencia", competencia).limit(5000);
  const tem = new Set((atuais ?? []).map((x) => x.empresa_id));
  const faltam = (emps ?? []).filter((e) => !tem.has(e.id));
  if (faltam.length && podeOperar()) {
    // Abertura no banco: operador do padrinho na célula, senão o de menor carga da célula
    const { error: e2 } = await supabase.rpc("abrir_cobranca", { p_competencia: competencia });
    if (e2) throw e2;
  }
  const [{ data: cs, error: e3 }, { data: ops }, { data: ct }] = await Promise.all([
    supabase.from("cobrancas").select("*").eq("competencia", competencia).limit(5000),
    supabase.from("operadores").select("id,nome"),
    supabase.from("cobranca_contatos").select("empresa_id,canal").eq("competencia", competencia).limit(20000),
  ]);
  if (e3) throw e3;
  // Observações do Controle: lidas direto dos itens de Bancos/Cartões (erro ou comentário), sem copiar dados
  const { data: exs, error: e4 } = await supabase.from("extratos").select("id,empresa_id,tipo,banco_nome,status,comentario,atualizado_por,atualizado_em")
    .eq("competencia", competencia).in("tipo", ["BANCO", "CARTAO"]).or("status.eq.ERRO,comentario.neq.").limit(20000);
  if (e4) throw e4;
  const obsEmp = new Map<string, Obs[]>();
  for (const x of exs ?? []) {
    if (x.status !== "ERRO" && !(x.comentario ?? "").trim()) continue;
    const arr = obsEmp.get(x.empresa_id) ?? []; arr.push({ ...x, status: x.status as StatusBanco }); obsEmp.set(x.empresa_id, arr);
  }
  for (const a of obsEmp.values()) a.sort((p, q) => Number(q.status === "ERRO") - Number(p.status === "ERRO") || p.banco_nome.localeCompare(q.banco_nome, "pt-BR"));
  const nomeOp = new Map((ops ?? []).map((o) => [o.id, o.nome]));
  const porEmp = new Map((emps ?? []).map((e) => [e.id, e]));
  const contEmp = new Map<string, { whats: number; lig: number }>();
  for (const k of ct ?? []) {
    const v = contEmp.get(k.empresa_id) ?? { whats: 0, lig: 0 };
    if (k.canal === "WHATSAPP") v.whats++; else v.lig++;
    contEmp.set(k.empresa_id, v);
  }
  return (cs ?? []).filter((c) => porEmp.has(c.empresa_id)).map((c) => {
    const e = porEmp.get(c.empresa_id)!;
    return { ...c, status: c.status as StatusDoc, nome: e.nome, talento: e.talento_doc, regime: e.regime, prioridade: e.prioridade, operador_id: c.operador_id, operador_nome: c.operador_id ? nomeOp.get(c.operador_id) ?? null : null, otimizza: !!e.tem_otimizza, obs: obsEmp.get(c.empresa_id) ?? [], contatos: contEmp.get(c.empresa_id) ?? { whats: 0, lig: 0 } };
  }).sort((a, b) => {
    if (a.bloqueada !== b.bloqueada) return a.bloqueada ? -1 : 1;
    if (!a.talento !== !b.talento) return a.talento ? -1 : 1;
    const t = (a.talento ?? "").localeCompare(b.talento ?? "", "pt-BR", { sensitivity: "base" });
    return t || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

function Cobranca() {
  const { competencia } = useCompetencia();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["cobranca", competencia], queryFn: () => carregar(competencia) });
  const sp = Route.useSearch();
  const [aba, setAba] = useState<StatusDoc>(sp.status ?? "PENDENTE");
  const [busca, setBusca] = useState("");
  const [talento, setTalento] = useState(sp.talento ?? "TODOS");
  const [regime, setRegime] = useState("TODOS");
  const [prio, setPrio] = useState("TODAS");
  const [bloqF, setBloqF] = useState("TODOS");
  const [confBloq, setConfBloq] = useState<Linha | null>(null);
  const [confCanal, setConfCanal] = useState<{ linha: Linha; status: StatusDoc } | null>(null);
  const [confContato, setConfContato] = useState<Linha | null>(null);
  const [opSel, setOpF, opPronto] = useFiltroOperador();
  // Filtros vindos do Dashboard pela URL
  useEffect(() => {
    if (sp.status) setAba(sp.status);
    if (sp.talento) setTalento(sp.talento);
    if (sp.operador) setOpF(sp.operador);
  }, [sp.status, sp.talento, sp.operador]); // eslint-disable-line react-hooks/exhaustive-deps
  const opF = opSel === "TODOS" || opSel === "SEM" || (data ?? []).some((l) => l.operador_id === opSel) ? opSel : "TODOS";
  const [hist, setHist] = useState<Linha | null>(null);
  const pode = podeOperar();
  usePeculiaridadesRealtime();
  const { data: pecRes } = useResumoPeculiaridades();
  const eu = usuarioId();
  const linhas = data ?? [];
  const talentos = useMemo(() => [...new Set(linhas.map((l) => l.talento).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })), [linhas]);
  const navigate = useNavigate({ from: "/cobranca" });
  const periodo: PeriodoRecebido = { de: sp.recebidoDe, ate: sp.recebidoAte };
  const setPeriodo = (p: PeriodoRecebido) => navigate({ search: (prev) => { const { recebidoDe: _d, recebidoAte: _a, ...resto } = prev; return { ...resto, ...(p.de ? { recebidoDe: p.de } : {}), ...(p.de && p.de !== SEM_DATA && p.ate ? { recebidoAte: p.ate } : {}) }; }, replace: true });
  const rotPer = aba === "RECEBIDO" ? rotuloPeriodo(periodo) : null;
  const sufixoPer = rotPer ? (rotPer === "sem data" ? " · recebidas sem data" : ` · recebidas ${/^\d/.test(rotPer) ? (rotPer.includes(" a ") ? "de " : "em ") : ""}${rotPer}`) : "";
  const { data: grp } = useGruposSituacao(competencia, "COBRANCA");
  const grupoF = sp.grupo ?? "TODOS";
  const setGrupoF = (v: string) => navigate({ search: (prev) => { const { grupo: _g, ...resto } = prev; return v === "TODOS" ? resto : { ...resto, grupo: v }; }, replace: true });
  const filtradas0 = linhas.filter((l) => passaFiltroGrupo(grupoF, l.empresa_id, grp?.porEmpresa, eu) && l.status === aba && (!busca || l.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (talento === "TODOS" || (talento === "SEM" ? !l.talento : l.talento === talento)) && (regime === "TODOS" || l.regime === regime) &&
    (prio === "TODAS" || (prio === "SEM" ? !l.prioridade : String(l.prioridade) === prio)) &&
    (bloqF === "TODOS" || (bloqF === "SIM") === l.bloqueada) &&
    (aba !== "RECEBIDO" || passaPeriodo(l.movimentado_em, periodo)) &&
    (opF === "TODOS" || (opF === "SEM" ? !l.operador_id : l.operador_id === opF)));
  const filtradas = ordenarPorGrupo(filtradas0, (l) => `${l.bloqueada}|${l.talento ?? ""}`, (l) => l.nome, (l) => l.empresa_id, grp?.porEmpresa);
  const gDe = (i: number) => { const l = filtradas[i]; return l ? grp?.porEmpresa.get(l.empresa_id)?.id : undefined; };
  const mesmoSeg = (i: number, j: number) => !!filtradas[i] && !!filtradas[j] && filtradas[i]!.talento === filtradas[j]!.talento && filtradas[i]!.bloqueada === filtradas[j]!.bloqueada;
  const tamBloco = (i: number) => { let n = 0; const g = gDe(i); for (let j = i; g && gDe(j) === g && mesmoSeg(i, j); j++) n++; return n; };
  const inicioBloco = (i: number) => { let j = i; while (j > 0 && gDe(j - 1) === gDe(i) && mesmoSeg(j - 1, i)) j--; return j; };
  const noBloco = (i: number) => { const g = gDe(i); return !!g && ((gDe(i - 1) === g && mesmoSeg(i, i - 1)) || (gDe(i + 1) === g && mesmoSeg(i, i + 1))); };
  const opsLista = [...new Map(linhas.filter((l) => l.operador_id).map((l) => [l.operador_id!, l.operador_nome ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  async function mudarStatus(l: Linha, s: StatusDoc, canal?: Canal) {
    if (s === l.status) return;
    if (s === "RECEBIDO" && !canal) { setConfCanal({ linha: l, status: s }); return; }
    const autor = await autorAtual();
    const args: { p_cobranca_id: string; p_status: StatusDoc; p_autor: string; p_operador_id: string; p_canal?: string } =
      { p_cobranca_id: l.id, p_status: s, p_autor: autor, p_operador_id: (usuarioId() || null) as string };
    if (canal) args.p_canal = canal;
    const { data: r, error } = await supabase.rpc("mudar_status_cobranca", args);
    if (error) { toast.error(error.message); return; }
    const res = r as { foco_alterado?: boolean; talento?: string } | null;
    if (res?.foco_alterado) toast.info(`Seu padrinho em foco agora é ${res.talento}.`);
    toast.success(`${l.nome}: ${ROT[s]}.`);
    qc.invalidateQueries({ queryKey: ["dash-cob"] });
    qc.invalidateQueries({ queryKey: ["cobranca"] });
  }
  async function salvarComentario(l: Linha, txt: string) {
    if ((l.comentario ?? "") === txt) return;
    const { error } = await supabase.from("cobrancas").update({ comentario: txt || null }).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ competencia, empresa_id: l.empresa_id, empresa_nome: l.nome, tipo: null, acao: "COMENTÁRIO COBRANÇA", detalhe: txt || "(removido)" });
    toast.success("Comentário salvo."); qc.invalidateQueries({ queryKey: ["cobranca"] });
  }

  async function registrarContato(l: Linha, canal: Canal) {
    setConfContato(null);
    const autor = await autorAtual();
    const { error } = await supabase.rpc("registrar_contato_cobranca", { p_cobranca_id: l.id, p_canal: canal, p_autor: autor, p_operador_id: (usuarioId() || null) as string });
    if (error) { toast.error(error.message); return; }
    toast.success(`${l.nome}: contato por ${ROT_CANAL[canal]} registrado.`);
    qc.invalidateQueries({ queryKey: ["cobranca"] });
  }

  async function alternarBloqueio(l: Linha) {
    setConfBloq(null);
    const autor = await autorAtual();
    const dados = l.bloqueada ? { bloqueada: false, bloqueada_em: null, bloqueada_por: null } : { bloqueada: true, bloqueada_em: new Date().toISOString(), bloqueada_por: autor };
    const { error } = await supabase.from("cobrancas").update(dados).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ competencia, empresa_id: l.empresa_id, empresa_nome: l.nome, tipo: null, operador_nome: l.operador_nome, acao: l.bloqueada ? "BLOQUEIO REMOVIDO" : "SERVIÇOS BLOQUEADOS", detalhe: l.bloqueada ? "Cobrança: empresa desbloqueada" : "Cobrança: empresa marcada com serviços bloqueados" });
    toast.success(`${l.nome}: ${l.bloqueada ? "bloqueio removido" : "marcada com serviços bloqueados"}.`);
    qc.invalidateQueries({ queryKey: ["cobranca"] });
  }

  if (isLoading || !opPronto) return <Carregando />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!pode && !linhas.length) return <CompetenciaNaoAberta />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Cobrança de Documentação</h1>
          <p className="text-sm text-muted-foreground">{rotuloComp(competencia)} · independente de Bancos e Cartões</p></div>
        {ehGestor() && <Button variant="outline" asChild><Link to="/importacao" search={{ area: "DOC" }}><FileSpreadsheet className="h-4 w-4" />Importar planilha</Link></Button>}
      </div>
      {!linhas.length ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">Nenhuma empresa na cobrança. O Gestor importa a planilha EMPRESA | TALENTO | REGIME em Importação Excel → Cobrança de Documentação.</p>
      ) : <>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROT) as StatusDoc[]).map((s) => (
            <button key={s} onClick={() => setAba(s)} className={cn("min-w-36 rounded-xl border bg-card px-4 py-2.5 text-left text-sm shadow-sm transition hover:border-primary/40", aba === s && "border-primary ring-1 ring-primary")}>
              <div className="text-xs text-muted-foreground">{ROT[s]}</div><div className="text-lg font-semibold tabular-nums">{linhas.filter((l) => l.status === s).length}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Pesquisar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <Select value={talento} onValueChange={setTalento}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os talentos</SelectItem>{talentos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}<SelectItem value="SEM">Sem padrinho</SelectItem></SelectContent></Select>
          <Select value={regime} onValueChange={setRegime}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Regime: Todos</SelectItem>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent></Select>
          <Select value={prio} onValueChange={setPrio}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Prioridade: Todas</SelectItem>{[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}<SelectItem value="SEM">Sem prioridade</SelectItem></SelectContent></Select>
          <Select value={bloqF} onValueChange={setBloqF}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Serviços: Todos</SelectItem><SelectItem value="SIM">Serviços bloqueados</SelectItem><SelectItem value="NAO">Serviços liberados</SelectItem></SelectContent></Select>
          <Select value={opF} onValueChange={setOpF}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os operadores</SelectItem>{opsLista.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}<SelectItem value="SEM">Sem operador</SelectItem></SelectContent></Select>
          <FiltroGrupoSelect valor={grupoF} onChange={setGrupoF} grupos={grp?.grupos ?? []} />
          {aba === "RECEBIDO" && <FiltroRecebido valor={periodo} onChange={setPeriodo} />}
          <span className="ml-auto text-sm text-muted-foreground">{filtradas.length} empresas{sufixoPer}</span>
        </div>
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1fr)_170px_150px_minmax(0,1fr)_72px] gap-3 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Empresa</span><span>Status</span><span>Última movimentação</span><span>Comentário</span><span />
          </div>
          {filtradas.map((l, i) => (
            <Fragment key={l.id}>
            {(i === 0 || filtradas[i - 1]!.talento !== l.talento || filtradas[i - 1]!.bloqueada !== l.bloqueada) && (
              <div className="flex items-center justify-between bg-muted/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{l.bloqueada && "Bloqueadas · "}{l.talento ?? "Sem padrinho"}</span>
                <span className="tabular-nums">{filtradas.filter((x) => x.talento === l.talento && x.bloqueada === l.bloqueada).length} empresa(s){sufixoPer}</span>
              </div>
            )}
            {gDe(i) && !(gDe(i - 1) === gDe(i) && mesmoSeg(i, i - 1)) && tamBloco(i) > 1 && (
              <AvisoGrupo variante="faixa" qtd={tamBloco(i)} g={grp?.porEmpresa.get(l.empresa_id)} empresaId={l.empresa_id} operadorId={l.operador_id} eu={eu} />
            )}
            <div key={l.id} className={cn("grid items-center gap-3 px-4 py-2 md:grid-cols-[minmax(0,1fr)_170px_150px_minmax(0,1fr)_72px]", noBloco(i) && (grp?.porEmpresa.get(l.empresa_id)?.dividido ? "border-l-4 border-l-warning" : "border-l-4 border-l-info"), l.bloqueada && "border-l-4 border-l-warning bg-warning/5", !l.bloqueada && eu && l.operador_id === eu && pecRes?.has(l.empresa_id) && DESTAQUE_PEC)}>
              <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium" title={l.nome}>{l.nome}</span><AlertaPeculiaridade empresaId={l.empresa_id} nome={l.nome} responsavel={!!eu && l.operador_id === eu} />{l.bloqueada && <Lock className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Empresa com serviços bloqueados" />}</div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"><span>Talento: {l.talento ?? "—"}</span><span>Regime: {l.regime ? ROT_REGIME[l.regime] : "—"}</span>{grp?.porEmpresa.get(l.empresa_id) && (!noBloco(i) || filtradas[inicioBloco(i)]!.operador_id !== l.operador_id) && <span className="flex min-w-0 max-w-full"><AvisoGrupo variante="pill" g={grp.porEmpresa.get(l.empresa_id)} empresaId={l.empresa_id} operadorId={l.operador_id} eu={eu} /></span>}<span>Operador: {l.operador_nome ?? "—"}</span>{l.prioridade && <span className="font-medium">Prioridade {l.prioridade}</span>}{(l.contatos.whats + l.contatos.lig > 0) && <span className="inline-flex items-center gap-2 font-medium"><span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{l.contatos.lig}</span><span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{l.contatos.whats}</span></span>}</div>
                {l.otimizza && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"><Info className="h-3.5 w-3.5" />Temos acesso com o Otimizza — NÃO COBRAR EXTRATOS BANCÁRIOS.</div>}</div>
              {pode ? <Select value={l.status} onValueChange={(v) => mudarStatus(l, v as StatusDoc)}>
                <SelectTrigger className={cn("h-8 border-transparent text-xs font-medium", COR[l.status])}><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(ROT) as StatusDoc[]).map((s) => <SelectItem key={s} value={s}>{ROT[s]}</SelectItem>)}</SelectContent>
              </Select> : <Badge variant="outline" className={cn("w-fit border-transparent text-xs font-medium", COR[l.status])}>{ROT[l.status]}</Badge>}
              <div className="text-xs tabular-nums text-muted-foreground">{fmtDataHora(l.movimentado_em)}{l.movimentado_por && <><br />{l.movimentado_por}</>}</div>
              {!pode ? <p className="text-sm text-muted-foreground">{l.comentario || "—"}</p> : <Textarea key={l.comentario ?? ""} defaultValue={l.comentario ?? ""} rows={1} placeholder="Comentário" className="min-h-8 text-sm" onBlur={(e) => salvarComentario(l, e.target.value.trim())} />}
              <div className="flex items-center"><Button size="icon" variant="ghost" title="Movimentações anteriores" onClick={() => setHist(l)}><History className="h-4 w-4" /></Button>
                {pode && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações" title="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setConfContato(l)}><MessageCircle className="h-4 w-4" />Registrar contato</DropdownMenuItem><DropdownMenuItem onClick={() => setConfBloq(l)}>{l.bloqueada ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{l.bloqueada ? "Remover bloqueio" : "Serviços bloqueados"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
              {l.bloqueada && (
                <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs md:col-span-5">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <div><span className="font-semibold text-warning">SERVIÇOS BLOQUEADOS</span> — Esta empresa está com os serviços bloqueados. Consulte se ela já está com serviços liberados.
                    <span className="text-muted-foreground"> Marcado por {l.bloqueada_por ?? "—"} em {fmtDataHora(l.bloqueada_em)}.</span></div>
                </div>
              )}
              {l.obs.length > 0 && (
                <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs md:col-span-5">
                  <div className="mb-1 font-semibold text-muted-foreground">Observações do Controle</div>
                  <ul className="space-y-1">
                    {l.obs.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-muted-foreground">{o.tipo === "CARTAO" ? "Cartão" : "Banco"}</span>·
                        <span className="font-medium">{o.banco_nome}</span>·
                        <Badge variant="outline" className={cn("border-transparent font-medium", COR_BANCO[o.status])}>{ROTULO_BANCO[o.status]}</Badge>
                        {o.comentario?.trim() && <>·<span>"{o.comentario.trim()}"</span></>}
                        {(o.atualizado_por || o.atualizado_em) && <>·<span className="tabular-nums text-muted-foreground">{[o.atualizado_por, o.atualizado_em && fmtDataHora(o.atualizado_em)].filter(Boolean).join(", ")}</span></>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            </Fragment>
          ))}
          {!filtradas.length && (rotPer ? <div className="flex flex-wrap items-center gap-3 p-6 text-sm text-muted-foreground">Nenhuma empresa recebida neste período.<Button size="sm" variant="outline" onClick={() => setPeriodo({})}>Limpar data</Button></div> : opF !== "TODOS" && linhas.length ? <div className="flex flex-wrap items-center gap-3 p-6 text-sm text-muted-foreground">Nenhuma empresa vinculada a este operador.<Button size="sm" variant="outline" onClick={() => setOpF("TODOS")}>Ver todas as empresas</Button></div> : <p className="p-6 text-sm text-muted-foreground">Nenhuma empresa nesta aba com esses filtros.</p>)}
        </div>
      </>}
      <AlertDialog open={!!confBloq} onOpenChange={(o) => !o && setConfBloq(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confBloq?.bloqueada ? "Remover bloqueio?" : "Serviços bloqueados"}</AlertDialogTitle>
            <AlertDialogDescription>{confBloq?.bloqueada ? `A empresa ${confBloq.nome} volta ao fluxo normal. O histórico manterá o registro do bloqueio.` : "Esta empresa está com os serviços bloqueados. Deseja marcá-la como bloqueada? O status da cobrança não muda."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => confBloq && alternarBloqueio(confBloq)}>{confBloq?.bloqueada ? "Remover bloqueio" : "Marcar como bloqueada"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!confContato} onOpenChange={(v) => !v && setConfContato(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar contato — {confContato?.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Por qual canal você falou com esta empresa? O registro fica no histórico e alimenta o relatório em slide.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => confContato && registrarContato(confContato, "WHATSAPP")}><MessageCircle className="size-4" />WhatsApp</Button>
            <Button variant="outline" onClick={() => confContato && registrarContato(confContato, "LIGACAO")}><Phone className="size-4" />Ligação</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confCanal} onOpenChange={(v) => !v && setConfCanal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Canal do contato — {confCanal?.linha.nome}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Para registrar o recebimento é obrigatório informar o canal do contato desta cobrança.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { const c = confCanal; setConfCanal(null); if (c) mudarStatus(c.linha, c.status, "WHATSAPP"); }}><MessageCircle className="size-4" />WhatsApp</Button>
            <Button variant="outline" onClick={() => { const c = confCanal; setConfCanal(null); if (c) mudarStatus(c.linha, c.status, "LIGACAO"); }}><Phone className="size-4" />Ligação</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!hist} onOpenChange={(v) => !v && setHist(null)}>
        <DialogContent><DialogHeader><DialogTitle>Movimentações — {hist?.nome}</DialogTitle></DialogHeader>{hist && <Movimentos empresaId={hist.empresa_id} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function Movimentos({ empresaId }: { empresaId: string }) {
  const { data } = useQuery({ queryKey: ["cobranca-mov", empresaId], queryFn: async () => (await supabase.from("cobranca_movimentos").select("*").eq("empresa_id", empresaId).order("criado_em", { ascending: false }).limit(200)).data ?? [] });
  if (!data) return <Carregando />;
  if (!data.length) return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;
  return (
    <div className="max-h-96 divide-y overflow-y-auto text-sm">
      {data.map((m) => <div key={m.id} className="flex justify-between gap-3 py-2"><span>{rotuloComp(m.competencia)}: {ROT[m.de as StatusDoc] ?? "—"} → <b>{ROT[m.para as StatusDoc] ?? m.para}</b></span><span className="text-right text-xs text-muted-foreground">{fmtDataHora(m.criado_em)}<br />{m.autor}</span></div>)}
    </div>
  );
}
