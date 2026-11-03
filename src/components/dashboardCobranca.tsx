// Dashboard da Cobrança: painel "Padrinho em foco" + aba Cobrança. Só lê (resumo_cobranca/evolucao_cobranca); nunca abre competência.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Clock, FileCheck2, Inbox, Repeat, Search, Star, UserX, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Carregando } from "@/components/extratos";
import { ehGestor, usuarioId } from "@/lib/acesso";
import { autorAtual, chaveNome } from "@/lib/extratos";
import { cn } from "@/lib/utils";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const cmpNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
/** Ordem alfabética pelo nome do padrinho, "Sem padrinho" (null) por último. */
const cmpTal = (a: string | null, b: string | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : cmpNome(a, b));

type Res = { operador_id: string | null; talento: string | null; total: number; pendente: number; aguardando: number; recebido: number };
type Foco = { operador_id: string; talento: string; origem: string; empresa_nome: string | null; atualizado_em: string };
type Op = { id: string; nome: string; ativo: boolean };
type Soma = { total: number; pendente: number; aguardando: number; recebido: number };
const zero = (): Soma => ({ total: 0, pendente: 0, aguardando: 0, recebido: 0 });
const somar = (a: Soma, r: Soma) => { a.total += r.total; a.pendente += r.pendente; a.aguardando += r.aguardando; a.recebido += r.recebido; return a; };

function hora(s: string) {
  const d = new Date(s); const hoje = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("pt-BR", hoje ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function useDadosCobrancaDash(competencia: string) {
  const qc = useQueryClient();
  const resumo = useQuery({ queryKey: ["dash-cob", "resumo", competencia], queryFn: async () => {
    const { data, error } = await supabase.rpc("resumo_cobranca", { p_competencia: competencia }); if (error) throw error; return (data ?? []) as Res[];
  } });
  const focos = useQuery({ queryKey: ["dash-cob", "foco"], queryFn: async () => {
    const { data, error } = await supabase.from("operador_foco").select("operador_id,talento,origem,empresa_nome,atualizado_em"); if (error) throw error; return (data ?? []) as Foco[];
  } });
  const ops = useQuery({ queryKey: ["dash-cob", "ops"], queryFn: async () => {
    const { data, error } = await supabase.from("operadores").select("id,nome,ativo"); if (error) throw error; return (data ?? []) as Op[];
  } });
  const evol = useQuery({ queryKey: ["dash-cob", "evol", competencia], queryFn: async () => {
    const { data, error } = await supabase.rpc("evolucao_cobranca", { p_competencia: competencia }); if (error) throw error; return (data ?? []) as { dia: string; n: number }[];
  } });
  useEffect(() => {
    const inv = () => qc.invalidateQueries({ queryKey: ["dash-cob"] });
    const ch = supabase.channel(`dash-cob-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "operador_foco" }, inv)
      .on("postgres_changes", { event: "*", schema: "public", table: "cobrancas" }, inv)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  return { resumo: resumo.data ?? [], focos: focos.data ?? [], ops: ops.data ?? [], evol: evol.data ?? [], isLoading: resumo.isLoading || focos.isLoading || ops.isLoading, erro: resumo.error ?? focos.error };
}

type Dados = ReturnType<typeof useDadosCobrancaDash>;

function CobLink({ op, tal, status, children, className }: { op: string | null; tal?: string | null | undefined; status?: "PENDENTE" | "AGUARDANDO" | "RECEBIDO"; children: React.ReactNode; className?: string }) {
  return (
    <Link to="/cobranca" search={{ operador: op ?? "SEM", ...(tal !== undefined ? { talento: tal ?? "SEM" } : {}), ...(status ? { status } : {}) }} className={cn("tabular-nums hover:underline", className)}>{children}</Link>
  );
}

export function PainelFoco({ d }: { d: Dados }) {
  const qc = useQueryClient();
  const [trocar, setTrocar] = useState<Op | null>(null);
  const meu = usuarioId(); const gestor = ehGestor();
  const focoDe = useMemo(() => new Map(d.focos.map((f) => [f.operador_id, f])), [d.focos]);
  const comCarteira = useMemo(() => new Set(d.resumo.filter((r) => r.operador_id).map((r) => r.operador_id!)), [d.resumo]);
  const ops = d.ops.filter((o) => o.ativo || focoDe.has(o.id) || comCarteira.has(o.id)).sort((a, b) => cmpNome(a.nome, b.nome));

  async function salvar(op: Op, talento: string | null) {
    const { error } = await supabase.rpc("definir_foco", { p_operador_id: op.id, p_talento: talento as string, p_autor: await autorAtual() });
    if (error) { toast.error(error.message); return; }
    toast.success(talento ? `Padrinho em foco: ${talento}.` : "Foco removido.");
    setTrocar(null); qc.invalidateQueries({ queryKey: ["dash-cob"] });
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Star className="h-4 w-4 text-primary" />Padrinho em foco</h2>
      <p className="mb-4 text-xs text-muted-foreground">Em qual padrinho cada operador está trabalhando agora. Atualiza sozinho.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ops.map((o) => {
          const f = focoDe.get(o.id);
          const s = f ? d.resumo.filter((r) => r.operador_id === o.id && r.talento && chaveNome(r.talento) === chaveNome(f.talento)).reduce(somar, zero()) : zero();
          const p = pct(s.recebido, s.total); const eu = o.id === meu;
          return (
            <div key={o.id} className={cn("rounded-xl border p-4", eu && "border-primary ring-1 ring-primary bg-primary/5")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-semibold">{o.nome}{eu && <span className="ml-1.5 text-xs font-normal text-primary">(você)</span>}</div>
                  {f ? <CobLink op={o.id} tal={f.talento} className="block truncate text-sm font-medium text-primary">{f.talento}</CobLink> : <div className="text-sm text-muted-foreground">Sem foco definido</div>}
                </div>
              </div>
              {f && <div className="mt-1 truncate text-xs text-muted-foreground" title={f.empresa_nome ?? undefined}>{f.origem === "MANUAL" ? "manual" : "automático"} · {hora(f.atualizado_em)}{f.origem !== "MANUAL" && f.empresa_nome ? ` · movimentou ${f.empresa_nome}` : ""}</div>}
              {f && <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${p}%` }} /></div>
                <div className="mt-1.5 text-xs tabular-nums text-muted-foreground">Recebido <b className="text-foreground">{s.recebido}</b> de {s.total} · Aguardando {s.aguardando} · Pendente {s.pendente}</div>
              </>}
              {(gestor || eu) && <Button size="sm" variant="outline" className="mt-3 h-7 w-full text-xs" onClick={() => setTrocar(o)}><Repeat className="mr-1 h-3 w-3" />Trocar padrinho</Button>}
            </div>
          );
        })}
      </div>
      <TrocarPadrinho op={trocar} d={d} atual={trocar ? focoDe.get(trocar.id)?.talento ?? null : null} onClose={() => setTrocar(null)} onSalvar={salvar} />
    </section>
  );
}

function TrocarPadrinho({ op, d, atual, onClose, onSalvar }: { op: Op | null; d: Dados; atual: string | null; onClose: () => void; onSalvar: (op: Op, t: string | null) => void }) {
  const [busca, setBusca] = useState("");
  useEffect(() => { setBusca(""); }, [op]);
  const daCarteira = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of d.resumo) if (op && r.operador_id === op.id && r.talento) m.set(r.talento, (m.get(r.talento) ?? 0) + r.pendente);
    return [...m.entries()].sort((a, b) => cmpTal(a[0], b[0]));
  }, [d.resumo, op]);
  const outros = useMemo(() => {
    const meus = new Set(daCarteira.map(([t]) => chaveNome(t)));
    return [...new Map(d.resumo.filter((r) => r.talento && !meus.has(chaveNome(r.talento))).map((r) => [chaveNome(r.talento!), r.talento!])).values()].sort(cmpTal);
  }, [d.resumo, daCarteira]);
  const ok = (t: string) => !busca || chaveNome(t).includes(chaveNome(busca));
  const item = (t: string | null, extra?: string) => (
    <button key={t ?? "__sem"} onClick={() => op && onSalvar(op, t)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted", (t && atual && chaveNome(t) === chaveNome(atual)) && "bg-primary/10 font-semibold")}>
      <span className={cn(!t && "text-muted-foreground")}>{t ?? "Sem foco"}</span>{extra && <span className="text-xs tabular-nums text-muted-foreground">{extra}</span>}
    </button>
  );
  return (
    <Dialog open={!!op} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Trocar padrinho — {op?.nome}</DialogTitle></DialogHeader>
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar padrinho" className="pl-8" /></div>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          <div><div className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Na carteira</div>
            {daCarteira.filter(([t]) => ok(t)).map(([t, n]) => item(t, `${n} pendentes`))}
            {daCarteira.length === 0 && <p className="px-3 text-xs text-muted-foreground">Nenhum padrinho na carteira desta competência.</p>}</div>
          <div><div className="px-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">Outros padrinhos</div>{outros.filter(ok).map((t) => item(t))}</div>
          <div className="border-t pt-2">{item(null)}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AbaCobranca({ d }: { d: Dados }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const nomeOp = useMemo(() => new Map(d.ops.map((o) => [o.id, o.nome])), [d.ops]);
  const focoDe = useMemo(() => new Map(d.focos.map((f) => [f.operador_id, f.talento])), [d.focos]);
  const geral = d.resumo.reduce((a, r) => somar(a, r), zero());
  const semOp = d.resumo.filter((r) => !r.operador_id).reduce((s, r) => s + r.total, 0);
  const carteiras = useMemo(() => {
    const m = new Map<string | null, { soma: Soma; tal: Map<string, { nome: string | null; soma: Soma }> }>();
    for (const r of d.resumo) {
      const c = m.get(r.operador_id) ?? { soma: zero(), tal: new Map() }; somar(c.soma, r);
      const k = r.talento ? chaveNome(r.talento) : "__sem";
      const t = c.tal.get(k) ?? { nome: r.talento, soma: zero() }; somar(t.soma, r); c.tal.set(k, t); m.set(r.operador_id, c);
    }
    return [...m.entries()].map(([id, c]) => ({ id, nome: id ? nomeOp.get(id) ?? "—" : "Sem operador", soma: c.soma, tal: [...c.tal.values()].sort((a, b) => cmpTal(a.nome, b.nome)) }))
      .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : cmpNome(a.nome, b.nome)));
  }, [d.resumo, nomeOp]);
  const evolucao = useMemo(() => { let acc = 0; return d.evol.map((e) => { acc += e.n; return { dia: `${e.dia.slice(8, 10)}/${e.dia.slice(5, 7)}`, n: e.n, acc, pct: pct(acc, geral.total) }; }); }, [d.evol, geral.total]);

  if (d.isLoading) return <Carregando />;
  if (d.erro) return <p className="text-sm text-destructive">{(d.erro as Error).message}</p>;
  const cards = [
    { t: "Empresas na cobrança", v: geral.total, i: Building2, c: "text-primary bg-primary/10" },
    { t: "Pendente", v: geral.pendente, i: Clock, c: "text-muted-foreground bg-muted" },
    { t: "Aguardando Envio", v: geral.aguardando, i: Inbox, c: "text-warning bg-warning/10" },
    { t: "Recebido", v: geral.recebido, i: FileCheck2, c: "text-success bg-success/10", s: `${pct(geral.recebido, geral.total)}%` },
    { t: "Sem operador", v: semOp, i: UserX, c: "text-destructive bg-destructive/10" },
  ];
  const linha = (key: string, rotulo: React.ReactNode, s: Soma, op: string | null, tal: string | null | undefined, foco?: string | null, sub?: boolean, onToggle?: () => void, open?: boolean) => (
    <tr key={key} className={cn("border-t", sub ? "bg-muted/30 text-sm" : "font-medium")}>
      <td className={cn("py-2 pr-2", sub && "pl-8")}>
        {onToggle ? <button onClick={onToggle} className="flex items-center gap-1">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{rotulo}</button> : rotulo}
      </td>
      <td className="px-2 text-right"><CobLink op={op} tal={tal}>{s.total}</CobLink></td>
      <td className="px-2 text-right"><CobLink op={op} tal={tal} status="PENDENTE">{s.pendente}</CobLink></td>
      <td className="px-2 text-right"><CobLink op={op} tal={tal} status="AGUARDANDO" className="text-warning">{s.aguardando}</CobLink></td>
      <td className="px-2 text-right"><CobLink op={op} tal={tal} status="RECEBIDO" className="text-success">{s.recebido}</CobLink></td>
      <td className="px-2 text-right tabular-nums">{pct(s.recebido, s.total)}%</td>
      <td className="pl-2 text-sm">{foco === undefined ? "" : foco ?? <span className="text-muted-foreground">—</span>}</td>
    </tr>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.t} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className={cn("mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg", c.c)}><c.i className="h-4 w-4" /></div>
            <div className="text-2xl font-bold tabular-nums">{c.v}{c.s && <span className="ml-1.5 text-sm font-medium text-muted-foreground">{c.s}</span>}</div>
            <div className="text-xs text-muted-foreground">{c.t}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="overflow-x-auto rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-1 font-semibold">Carteiras por operador</h2>
          <p className="mb-3 text-xs text-muted-foreground">Clique no operador para ver os padrinhos. Os números abrem a Cobrança já filtrada.</p>
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2">Operador / padrinho</th><th className="px-2 text-right">Empresas</th><th className="px-2 text-right">Pendente</th><th className="px-2 text-right">Aguardando</th><th className="px-2 text-right">Recebido</th><th className="px-2 text-right">% receb.</th><th className="pl-2">Padrinho em foco</th></tr></thead>
            <tbody>
              {carteiras.map((c) => {
                const k = c.id ?? "__sem"; const open = aberto.has(k); const foco = c.id ? focoDe.get(c.id) ?? null : undefined;
                const toggle = () => setAberto((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
                return [linha(k, c.nome, c.soma, c.id, undefined, foco, false, toggle, open),
                  ...(open ? c.tal.map((t) => linha(`${k}-${t.nome ?? "__sem"}`, <span className="flex items-center gap-1">{t.nome ?? <span className="text-muted-foreground">Sem padrinho</span>}{foco && t.nome && chaveNome(foco) === chaveNome(t.nome) && <Star className="h-3 w-3 fill-primary text-primary" aria-label="Em foco" />}</span>, t.soma, c.id, t.nome, undefined, true)) : [])];
              })}
              {carteiras.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma empresa na cobrança.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Evolução diária</h2>
          <p className="mb-4 text-xs text-muted-foreground">Recebidos acumulados em cada dia.</p>
          {evolucao.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p> : (
            <ol className="relative space-y-3 border-l-2 border-muted pl-5">
              {evolucao.map((e) => (
                <li key={e.dia} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card bg-success" />
                  <div className="flex items-baseline justify-between"><span className="text-sm font-medium">{e.dia}</span><span className="text-lg font-bold tabular-nums text-success">{e.acc} <span className="text-xs text-muted-foreground">({e.pct}%)</span></span></div>
                  <div className="text-xs text-muted-foreground">+{e.n} recebidos no dia</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
