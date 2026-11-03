import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Users, CheckCheck, AlertTriangle, ClipboardList, Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DialogRelatorioSlide } from "@/components/relatorioSlide";
import { exigirGestorRelatorios, relatoriosQuery } from "@/lib/relatoriosQuery";
import { MODULOS, SITUACOES, SEM_PENDENCIAS, montarRelatorio, type FiltrosRelatorio, type Modulo } from "@/lib/relatorios";
import { listaCompetencias, mesAtual, fmtDataHora, rotuloComp } from "@/lib/extratos";
import { blobExcel, entregarExcel } from "@/lib/relatoriosExcel";

function validar(s: Record<string, unknown>): FiltrosRelatorio {
  const comp = typeof s["comp"] === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(s["comp"]) && s["comp"] >= "2026-07" ? s["comp"] : mesAtual();
  return { comp, modulo: ["GERAL", "OPERADOR", "CONCILIACAO", "COBRANCA"].includes(String(s["modulo"])) ? s["modulo"] as Modulo : "GERAL",
    empresa: typeof s["empresa"] === "string" ? s["empresa"] : "", operador: typeof s["operador"] === "string" ? s["operador"] : "", talento: typeof s["talento"] === "string" ? s["talento"] : "",
    situacao: ["CONCLUIDA", "ANDAMENTO", "PENDENTE", "ERRO"].includes(String(s["situacao"])) ? String(s["situacao"]) : "TODAS" };
}
export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios gerenciais — Elite Contábil" }, { name: "description", content: "Indicadores gerenciais por competência, participação da equipe e exportação Excel da Elite Contábil." }, { property: "og:title", content: "Relatórios gerenciais — Elite Contábil" }, { property: "og:description", content: "Consolidação das demandas, conciliações e cobranças com dados reais e histórico." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: validar,
  loaderDeps: ({ search }) => ({ comp: search.comp }),
  beforeLoad: async () => { if (!await exigirGestorRelatorios()) throw redirect({ to: "/dashboard" }); },
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(relatoriosQuery(deps["comp"])),
  errorComponent: ({ error }) => <ErroRelatorio error={error} />,
  notFoundComponent: () => <p>Relatório não encontrado.</p>,
  component: Relatorios,
});
function ErroRelatorio({ error }: { error: unknown }) {
  return <div role="alert" className="space-y-3"><h1 className="text-xl font-semibold">Não foi possível carregar os relatórios</h1><p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p><Button onClick={() => window.location.reload()} variant="outline"><RefreshCw className="size-4" />Tentar novamente</Button></div>;
}
function Filtro({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <div className="min-w-0 space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span><Select value={value || "TODOS"} onValueChange={v => onChange(v === "TODOS" ? "" : v)}><SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}
function Relatorios() {
  const f = Route.useSearch(); const navigate = useNavigate({ from: Route.fullPath }); const router = useRouter();
  const { data: d } = useSuspenseQuery(relatoriosQuery(f.comp));
  const r = useMemo(() => montarRelatorio(d,f), [d,f]);
  const [aba, setAba] = useState("demandas");
  const [slideAberto, setSlideAberto] = useState(false);
  const mudar = (patch: Partial<FiltrosRelatorio>) => navigate({ search: prev => ({ ...prev, ...patch }) });
  const competencias = listaCompetencias([f.comp]).sort(); const anos = [...new Set(competencias.map(c => c.slice(0,4)))];
  const all = montarRelatorio(d, { ...f, empresa: "", operador: "", talento: "", situacao: "TODAS" }).rows;
  const ordenar = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base", numeric: true });
  const empresas = [...new Map(all.map(x => [x.empresaId, { value: x.empresaId, label: x.empresa }])).values()].sort(ordenar);
  const ops = d.operadores.map(o => ({ value: o.id, label: o.nome })).sort(ordenar);
  const talentos = [...new Set(all.map(x => x.talento).filter(Boolean))].map(t => ({ value: t, label: t })).sort(ordenar);
  const excel = useMemo(() => blobExcel(d,f), [d,f]);
  const percent = (v: number) => `${(v*100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const cards = [{ label: "Demandas registradas", valor: r.ind.total, icon: ClipboardList }, { label: "Concluídas", valor: r.ind.concluidas, detalhe: percent(r.ind.conclusao), icon: CheckCheck }, { label: "Em andamento", valor: r.ind.andamento, icon: RefreshCw }, { label: "Pendentes", valor: r.ind.pendentes, detalhe: percent(r.ind.percentualPendente), icon: ClipboardList }, { label: "Demandas com erro", valor: r.ind.comErros, detalhe: `${r.ind.erros} itens`, icon: AlertTriangle }, { label: "Participantes registrados", valor: r.participantes.length, detalhe: `${r.padrinhos.length} padrinhos ajudados`, icon: Users }];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Relatórios</h1><p className="mt-1 text-sm text-muted-foreground">{rotuloComp(f.comp)} · {MODULOS[f.modulo]} · {r.ind.empresas} empresas</p></div><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Atualizar relatórios" title="Atualizar relatórios" onClick={() => router.invalidate()}><RefreshCw className="size-4" /></Button><Button variant="outline" onClick={() => setSlideAberto(true)}><Presentation className="size-4" />Relatório em Slide</Button><Button onClick={() => { entregarExcel(excel, `Elite-Relatorio-${f.modulo}-${f.comp}.xlsx`).catch(() => toast.error("Não foi possível baixar o Excel.")); }}><Download className="size-4" />Exportar Excel</Button></div></div>
    <div className="grid gap-3 border-y py-4 sm:grid-cols-2 xl:grid-cols-4">
      <Filtro label="Tipo de relatório" value={f.modulo} options={Object.entries(MODULOS).map(([value,label]) => ({ value,label }))} onChange={v => mudar({ modulo: v as Modulo, talento: "", empresa: "" })} />
      <Filtro label="Ano" value={f.comp.slice(0,4)} options={anos.map(a => ({ value:a,label:a }))} onChange={v => { const c = competencias.find(c => c.startsWith(v) && c.endsWith(f.comp.slice(4))) ?? competencias.find(c => c.startsWith(v)); if(c) mudar({ comp:c }); }} />
      <Filtro label="Competência/mês" value={f.comp} options={competencias.filter(c => c.startsWith(f.comp.slice(0,4))).map(c => ({ value:c,label:rotuloComp(c) }))} onChange={v => mudar({ comp:v })} />
      <Filtro label="Situação" value={f.situacao} options={[{value:"TODAS",label:"Todas"}, ...Object.entries(SITUACOES).map(([value,label]) => ({ value,label })), {value:"ERRO",label:"Com erros"}]} onChange={v => mudar({ situacao:v })} />
      <Filtro label="Empresa" value={f.empresa} options={[{value:"TODOS",label:"Todas as empresas"}, ...empresas]} onChange={v => mudar({ empresa:v })} />
      <Filtro label="Responsável (operador)" value={f.operador} options={[{value:"TODOS",label:"Todos os responsáveis"},...ops]} onChange={v => mudar({ operador:v })} />
      <Filtro label="Talento / padrinho" value={f.talento} options={[{value:"TODOS",label:f.modulo === "CONCILIACAO" ? "Não se aplica" : "Todos os padrinhos"},...talentos]} onChange={v => mudar({ talento:v })} />
      <div className="flex items-end"><Button variant="ghost" onClick={() => mudar({ empresa:"",operador:"",talento:"",situacao:"TODAS" })}>Limpar filtros</Button></div>
    </div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">{cards.map(c => <div key={c.label} className="min-w-0 border-l-2 border-border pl-3"><div className="flex gap-2 text-muted-foreground"><c.icon className="size-4 shrink-0" /><span className="text-xs">{c.label}</span></div><p className="mt-2 text-3xl font-semibold tabular-nums">{c.valor}</p><p className="mt-1 min-h-4 text-xs text-muted-foreground">{c.detalhe}</p></div>)}</div>
    <section className="space-y-3 border-b pb-5"><h2 className="text-lg font-semibold">Resumo gerencial</h2><p className="text-sm leading-relaxed">{r.resumo}</p><div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>Primeira movimentação: {fmtDataHora(r.historico[0]?.criado_em ?? null)}</span><span>Última movimentação: {fmtDataHora(r.historico.at(-1)?.criado_em ?? null)}</span></div><p className="text-xs text-muted-foreground">Participação por autoria registrada; responsáveis e padrinhos refletem o cadastro atual. Conciliação considera a marcação do mês, sem criar demandas adicionais.</p></section>
    <div className="grid gap-5 lg:grid-cols-2"><section><h2 className="mb-3 text-sm font-semibold">Volume por módulo</h2>{r.volumeModulos.map(m => <div className="mb-3" key={m.Módulo}><div className="mb-1 flex justify-between text-sm"><span>{m.Módulo}</span><span className="tabular-nums">{m.total}</span></div><div className="h-2 bg-muted"><div className="h-full bg-primary" style={{ width: `${r.ind.total ? m.total/r.ind.total*100 : 0}%` }} /></div></div>)}</section><section><h2 className="mb-3 text-sm font-semibold">Padrinhos com atuação registrada · {r.padrinhos.length}</h2><p className="text-sm text-muted-foreground">{r.padrinhos.join(" · ") || "Nenhuma atuação identificada por padrinho neste recorte."}</p></section></div>
    <Tabs value={aba} onValueChange={setAba}><TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="demandas">Demandas</TabsTrigger><TabsTrigger value="equipe">Equipe</TabsTrigger><TabsTrigger value="pendencias">Pendências</TabsTrigger><TabsTrigger value="erros">Erros</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList></Tabs>
    {aba === "demandas" && <div className="overflow-x-auto border"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Módulo / área</TableHead><TableHead>Responsável</TableHead><TableHead>Padrinho</TableHead><TableHead>Situação</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader><TableBody>{r.rows.slice(0,100).map(x => <TableRow key={x.id}><TableCell className="min-w-48 font-medium">{x.empresa}</TableCell><TableCell>{MODULOS[x.modulo]}<span className="block text-xs text-muted-foreground">{x.area}</span></TableCell><TableCell>{x.operador}</TableCell><TableCell>{x.talento || "—"}</TableCell><TableCell><Badge variant={x.erros ? "destructive" : "outline"}>{SITUACOES[x.situacao]}{x.erros > 0 ? ` · ${x.erros} erro(s)` : ""}</Badge></TableCell><TableCell className="min-w-48 text-xs">{x.descricao}{x.bloqueada && <span className="block">Serviços bloqueados</span>}</TableCell></TableRow>)}</TableBody></Table></div>}
    {aba === "equipe" && <div className="space-y-5"><h2 className="text-sm font-semibold">Produtividade por responsável da carteira</h2><TabelaObjetos rows={r.produtividade} /><h2 className="text-sm font-semibold">Participação por autoria no histórico</h2><TabelaObjetos rows={r.participantes} /></div>}
    {aba === "pendencias" && (r.pendencias.length ? <TabelaObjetos rows={r.pendencias} /> : <p className="py-6 text-sm text-muted-foreground">{SEM_PENDENCIAS}</p>)}
    {aba === "erros" && <div className="space-y-4"><h2 className="text-sm font-semibold">Erros atuais · {r.erros.length}</h2><TabelaObjetos rows={r.erros} /><h2 className="text-sm font-semibold">Saídas de erro documentadas · {r.corrigidos.length}</h2><TabelaObjetos rows={r.corrigidos} /><p className="text-xs text-muted-foreground">A situação atual consta nos itens. Conciliação e Cobrança não registram divergências em campo próprio.</p></div>}
    {aba === "historico" && <div className="space-y-4"><TabelaObjetos rows={r.diaria} /><TabelaObjetos rows={r.historico.map(h => ({ Data:fmtDataHora(h.criado_em),Empresa:h.empresa_nome ?? "—",Ação:h.acao,Autor:h.autor ?? "—",Detalhe:h.detalhe ?? "—" }))} /></div>}
    {r.rows.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma demanda para os filtros selecionados.</p>}
    {r.rows.length > 100 && aba === "demandas" && <p className="text-xs text-muted-foreground">100 de {r.rows.length} demandas exibidas. Excel com todos os {r.rows.length} registros.</p>}
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet className="size-4" />{r.historico.length} movimentações · {r.participantes.length} participantes · {excel.size.toLocaleString("pt-BR")} bytes no Excel</div>
    <DialogRelatorioSlide d={d} comp={f.comp} open={slideAberto} onOpenChange={setSlideAberto} />
  </div>;
}
function TabelaObjetos({ rows }: { rows: Record<string, string | number | boolean | null>[] }) {
  const keys = Object.keys(rows[0] ?? {});
  if(!rows.length) return <p className="py-4 text-sm text-muted-foreground">Nenhum registro.</p>;
  return <div className="overflow-auto border"><Table><TableHeader><TableRow>{keys.map(k => <TableHead key={k}>{k}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(0,100).map((row,i) => <TableRow key={i}>{keys.map(k => <TableCell key={k} className="text-xs">{k === "Conclusão" && typeof row[k] === "number" ? `${(Number(row[k])*100).toFixed(1)}%` : String(row[k] ?? "Não registrado")}</TableCell>)}</TableRow>)}</TableBody></Table>{rows.length > 100 && <p className="p-3 text-xs text-muted-foreground">100 de {rows.length} registros exibidos. Todos incluídos no Excel.</p>}</div>;
}