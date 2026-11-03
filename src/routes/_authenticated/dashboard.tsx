import logoAzul from "@/assets/elite-logo-azul.png.asset.json";
import { useCompetencia } from "@/lib/competencia";
import { rotuloComp } from "@/lib/extratos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaCobranca, PainelFoco, useDadosCobrancaDash } from "@/components/dashboardCobranca";
import { ROT_AMBOS } from "@/lib/extratos";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Clock, Layers, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Carregando, CompetenciaVazia, StatusEmpresaBadge, useDadosAmbos } from "@/components/extratos";
import { cn } from "@/lib/utils";
import type { EmpresaLinha, Operador } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Controle Operacional Contábil" }, { name: "description", content: "Padrinho em foco, cobrança de documentação, carteiras e evolução da competência." }, { property: "og:title", content: "Dashboard — Controle Operacional Contábil" }, { property: "og:description", content: "Padrinho em foco, cobrança de documentação, carteiras e evolução da competência." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});


const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function AbaBancosCartoes() {
  const { data, isLoading } = useDadosAmbos();
  const R = ROT_AMBOS;
  const [detalhe, setDetalhe] = useState<Operador | null>(null);
  const linhas = data?.linhas ?? [];

  const geral = useMemo(() => {
    const bancos = linhas.flatMap((l) => l.bancos);
    return {
      pend: linhas.filter((l) => l.status === "PENDENTE").length, concl: linhas.filter((l) => l.status === "CONCLUIDA").length,
      bancos: bancos.length, bConc: bancos.filter((b) => b.status === "CONCLUIDO").length,
      bPend: bancos.filter((b) => b.status === "PENDENTE").length, bErro: bancos.filter((b) => b.status === "ERRO").length,
    };
  }, [linhas]);

  const porOp = useMemo(() => (data?.operadores ?? []).map((o) => {
    const ls = linhas.filter((l) => l.operador_id === o.id);
    return {
      op: o, empresas: ls.length, concl: ls.filter((l) => l.status === "CONCLUIDA").length,
      itens: ls.reduce((s, l) => s + l.total, 0), itensConc: ls.reduce((s, l) => s + l.concluidos, 0),
      erros: ls.reduce((s, l) => s + l.erros, 0), peso: ls.reduce((s, l) => s + l.peso, 0),
    };
  }).filter((r) => r.empresas > 0 || r.op.ativo).sort((a, b) => a.op.nome.localeCompare(b.op.nome, "pt-BR")), [data, linhas]);

  // Percentual acumulado de itens concluídos por dia da competência.
  const evolucao = useMemo(() => {
    const total = linhas.reduce((s, l) => s + l.total, 0);
    const porDia = new Map<string, number>();
    for (const b of linhas.flatMap((l) => l.bancos)) if (b.status === "CONCLUIDO" && b.concluido_em) {
      const d = b.concluido_em.slice(0, 10);
      porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }
    let acc = 0;
    return [...porDia.keys()].sort().map((d) => {
      const dia = porDia.get(d)!; acc += dia;
      return { dia: `${d.slice(8, 10)}/${d.slice(5, 7)}`, n: dia, pct: pct(acc, total), ganho: pct(dia, total) };
    });
  }, [linhas]);

  if (isLoading) return <Carregando />;
  if (!linhas.length) return <CompetenciaVazia />;

  const cards = [
    { t: `${R.itens} vinculados`, v: geral.bancos, i: Layers, c: "text-primary bg-primary/10" },
    { t: `${R.itens} concluídos`, v: geral.bConc, i: CheckCircle2, c: "text-success bg-success/10", s: `${pct(geral.bConc, geral.bancos)}%` },
    { t: `${R.itens} pendentes`, v: geral.bPend, i: Clock, c: "text-warning bg-warning/10" },
    { t: "Erro de login / ocorrência", v: geral.bErro, i: AlertTriangle, c: "text-destructive bg-destructive/10" },
    { t: "Empresas concluídas", v: geral.concl, i: Building2, c: "text-success bg-success/10", s: `${pct(geral.concl, linhas.length)}%` },
    { t: "Empresas pendentes", v: geral.pend, i: ListChecks, c: "text-muted-foreground bg-muted" },
  ];
  const pesoTotal = porOp.reduce((s, r) => s + r.peso, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.t} className="rounded-xl border bg-card shadow-sm p-4 shadow-sm">
            <div className={cn("mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg", c.c)}><c.i className="h-4 w-4" /></div>
            <div className="text-2xl font-bold">{c.v}{c.s && <span className="ml-1.5 text-sm font-medium text-muted-foreground">{c.s}</span>}</div>
            <div className="text-xs text-muted-foreground">{c.t}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card shadow-sm p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Desempenho do operador</h2>
        <p className="mb-4 text-xs text-muted-foreground">Andamento individual de cada carteira. Clique para ver as empresas.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {porOp.map((r) => {
            const p = pct(r.itensConc, r.itens);
            return (
              <button key={r.op.id} onClick={() => setDetalhe(r.op)} className="rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/30">
                <div className="flex items-center justify-between"><span className="font-semibold">{r.op.nome}</span><span className="text-sm font-bold text-primary">{p}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${p}%` }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div><div className="text-base font-semibold text-foreground">{r.concl}/{r.empresas}</div>empresas</div>
                  <div><div className="text-base font-semibold text-foreground">{r.itensConc}/{r.itens}</div>{R.itens.toLowerCase()}</div>
                  <div><div className={cn("text-base font-semibold", r.erros ? "text-destructive" : "text-foreground")}>{r.erros}</div>com erro</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-sm p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Distribuição de demandas</h2>
          <div className="space-y-3">
            {porOp.map((r) => (
              <div key={r.op.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{r.op.nome}</span><span className="text-muted-foreground">{r.empresas} empresas · peso <b className="text-foreground">{r.peso}</b></span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-chart-1" style={{ width: `${pct(r.peso, pesoTotal)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-card shadow-sm p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Evolução diária</h2>
          <p className="mb-4 text-xs text-muted-foreground">% acumulado de {R.itens.toLowerCase()} concluídos em cada dia.</p>
          {evolucao.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma conclusão registrada ainda.</p> : (
            <ol className="relative space-y-3 border-l-2 border-muted pl-5">
              {evolucao.map((e) => (
                <li key={e.dia} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card bg-success" />
                  <div className="flex items-baseline justify-between"><span className="text-sm font-medium">{e.dia}</span><span className="text-lg font-bold text-success">{e.pct}%</span></div>
                  <div className="text-xs text-muted-foreground">+{e.n} concluídos no dia (+{e.ganho}%)</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <DetalheOperador op={detalhe} linhas={linhas} onClose={() => setDetalhe(null)} />
    </div>
  );
}

function DetalheOperador({ op, linhas, onClose }: { op: Operador | null; linhas: EmpresaLinha[]; onClose: () => void }) {
  const R = ROT_AMBOS;
  const ls = linhas.filter((l) => l.operador_id === op?.id);
  return (
    <Dialog open={!!op} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{op?.nome} — {op?.cargo}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="text-right">{R.itens}</TableHead><TableHead className="text-right">Concluídos</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {ls.map((l) => (
                <TableRow key={l.id}>
                  <TableCell><Link to="/controle" search={{ empresa: l.empresa_id }} className="text-primary hover:underline">{l.empresa_nome}</Link></TableCell>
                  <TableCell className="text-right">{l.total}</TableCell><TableCell className="text-right">{l.concluidos}</TableCell><TableCell><StatusEmpresaBadge s={l.status} /></TableCell>
                </TableRow>
              ))}
              {ls.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem empresas nesta competência.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Dashboard() {
  const { competencia } = useCompetencia();
  const d = useDadosCobrancaDash(competencia);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><img src={logoAzul.url} alt="Elite" className="hidden h-9 w-auto object-contain md:block dark:hidden" /><div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="text-sm text-muted-foreground">Indicadores de {rotuloComp(competencia)}.</p></div></div>
      {d.isLoading ? <Carregando /> : <PainelFoco d={d} />}
      <Tabs defaultValue="cobranca">
        <TabsList><TabsTrigger value="cobranca">Cobrança de Documentação</TabsTrigger><TabsTrigger value="bancos">Bancos e Cartões</TabsTrigger></TabsList>
        <TabsContent value="cobranca" className="mt-4"><AbaCobranca d={d} /></TabsContent>
        <TabsContent value="bancos" className="mt-4"><AbaBancosCartoes /></TabsContent>
      </Tabs>
    </div>
  );
}
