import { createFileRoute } from "@tanstack/react-router";
import { useFiltroOperador } from "@/lib/filtroOperador";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usuarioId } from "@/lib/acesso";
import { AvisoGrupo, FiltroGrupoSelect } from "@/components/grupos";
import { ordenarPorGrupo, passaFiltroGrupo, useGruposSituacao } from "@/lib/grupos";
import {
  Carregando, MenuAcoesEmpresa, ConcluirEmpresaButton, ComentarioBanco, CompetenciaVazia, StatusBancoSelect, StatusEmpresaBadge, useDadosCompetencia,
} from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { ItensComErro } from "@/components/itensComErro";
import { REGIMES, ROT_REGIME, ROT_TIPO, ROTULO_EMPRESA, fmtDataHora, type StatusEmpresa } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/controle")({
  validateSearch: (s: Record<string, unknown>): { empresa?: string; grupo?: string; aba?: string } => ({
    ...(typeof s["empresa"] === "string" ? { empresa: s["empresa"] as string } : {}),
    ...(typeof s["grupo"] === "string" && s["grupo"] ? { grupo: s["grupo"] as string } : {}),
    ...(typeof s["aba"] === "string" && s["aba"] === "BC" ? { aba: "BC" as const } : {}),
  }),
  head: () => ({ meta: [{ title: "Controle — Controle Operacional Contábil" }, { name: "description", content: "Acompanhamento das empresas e bancos da competência." }, { property: "og:title", content: "Controle — Controle Operacional Contábil" }, { property: "og:description", content: "Acompanhamento das empresas e bancos da competência." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Controle,
});

type Visao = "TODAS" | StatusEmpresa;

const ABAS = [{ v: "DEMANDAS", t: "Demandas" }, { v: "BC", t: "Banco | Cartão" }] as const;
function Abas({ aba, setAba }: { aba: string; setAba: (v: string) => void }) {
  return (
    <div role="tablist" aria-label="Abas do Operador" className="inline-flex rounded-xl border bg-card p-1 text-sm shadow-sm">
      {ABAS.map((a) => (
        <button key={a.v} role="tab" aria-selected={aba === a.v} onClick={() => setAba(a.v)}
          className={cn("rounded-lg px-4 py-1.5 font-medium transition", aba === a.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {a.t}
        </button>
      ))}
    </div>
  );
}

function Controle() {
  const { empresa, grupo: grupoUrl, aba: abaUrl } = Route.useSearch();
  const navigate = Route.useNavigate();
  const grupoF = grupoUrl ?? "TODOS";
  const setGrupoF = (v: string) => navigate({ search: (prev) => { const { grupo: _g, ...resto } = prev; return v === "TODOS" ? resto : { ...resto, grupo: v }; }, replace: true });
  const aba = abaUrl === "BC" ? "BC" : "DEMANDAS";
  const setAba = (v: string) => navigate({ search: (prev) => { const { aba: _a, ...resto } = prev; return v === "BC" ? { ...resto, aba: "BC" as const } : resto; }, replace: true });
  const eu = usuarioId();
  const { data, isLoading } = useDadosCompetencia();
  const { tipo, competencia } = useCompetencia();
  const { data: grp } = useGruposSituacao(competencia, "BC", tipo);
  const R = ROT_TIPO[tipo];
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<Visao>("PENDENTE");
  const [respSel, setResp, opPronto] = useFiltroOperador();
  const resp = respSel === "TODOS" || respSel === "SEM" || (data?.linhas ?? []).some((l) => l.operador_id === respSel) ? respSel : "TODOS";
  const [talento, setTalento] = useState("TODOS");
  const [regime, setRegime] = useState("TODOS");
  const [prioridade, setPrioridade] = useState("TODAS");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (empresa) {
      setAbertas(new Set([empresa]));
      setTimeout(() => document.getElementById(`emp-${empresa}`)?.scrollIntoView({ block: "center" }), 200);
    }
  }, [empresa, data]);

  const linhas = data?.linhas ?? [];
  const filtradas = useMemo(() => ordenarPorGrupo(linhas.filter((l) => passaFiltroGrupo(grupoF, l.empresa_id, grp?.porEmpresa, eu) &&
    (!busca || l.empresa_nome.toLowerCase().includes(busca.toLowerCase())) &&
    (visao === "TODAS" || l.status === visao) &&
    (resp === "TODOS" || (resp === "SEM" ? !l.operador_id : l.operador_id === resp)) &&
    (talento === "TODOS" || (talento === "SEM" ? !l.talento : l.talento === talento)) &&
    (regime === "TODOS" || l.regime === regime) &&
    (prioridade === "TODAS" || (prioridade === "SEM" ? !l.prioridade : String(l.prioridade) === prioridade))
  ).sort((a, b) => Number(b.bloqueada) - Number(a.bloqueada) || Number(!a.talento) - Number(!b.talento) || (a.talento ?? "").localeCompare(b.talento ?? "", "pt-BR", { sensitivity: "base" })),
    (l) => `${l.bloqueada}|${l.talento ?? ""}`, (l) => l.empresa_nome, (l) => l.empresa_id, grp?.porEmpresa), [linhas, busca, visao, resp, talento, regime, prioridade, grupoF, grp, eu]);
  const gDe = (i: number) => { const l = filtradas[i]; return l ? grp?.porEmpresa.get(l.empresa_id)?.id : undefined; };
  const mesmoSeg = (i: number, j: number) => !!filtradas[i] && !!filtradas[j] && filtradas[i]!.talento === filtradas[j]!.talento && filtradas[i]!.bloqueada === filtradas[j]!.bloqueada;
  const tamBloco = (i: number) => { let n = 0; const g = gDe(i); for (let j = i; g && gDe(j) === g && mesmoSeg(i, j); j++) n++; return n; };
  const inicioBloco = (i: number) => { let j = i; while (j > 0 && gDe(j - 1) === gDe(i) && mesmoSeg(j - 1, i)) j--; return j; };
  const noBloco = (i: number) => { const g = gDe(i); return !!g && ((gDe(i - 1) === g && mesmoSeg(i, i - 1)) || (gDe(i + 1) === g && mesmoSeg(i, i + 1))); };
  const talentos = useMemo(() => [...new Set(linhas.map((l) => l.talento).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas]);

  if (aba === "BC") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-semibold tracking-tight">Banco | Cartão</h1><p className="text-sm text-muted-foreground">Itens com erro de acesso nas duas áreas, na competência.</p></div>
          <Abas aba={aba} setAba={setAba} />
        </div>
        <ItensComErro />
      </div>
    );
  }
  if (isLoading || !opPronto) return <Carregando />;
  if (!linhas.length) return <CompetenciaVazia />;

  const cont = (s: StatusEmpresa) => linhas.filter((l) => l.status === s).length;
  const visoes: { v: Visao; n: number }[] = [
    { v: "PENDENTE", n: cont("PENDENTE") }, { v: "CONCLUIDA", n: cont("CONCLUIDA") }, { v: "TODAS", n: linhas.length },
  ];
  const toggle = (id: string) => setAbertas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{R.area}</h1><p className="text-sm text-muted-foreground">Acompanhe cada empresa e seus {R.itens.toLowerCase()} na competência.</p></div>
        <Abas aba={aba} setAba={setAba} />
      </div>
      <div className="flex flex-wrap gap-2">
        {visoes.map(({ v, n }) => (
          <button key={v} onClick={() => setVisao(v)}
            className={cn("min-w-28 rounded-xl border bg-card px-4 py-2.5 text-left text-sm shadow-sm transition hover:border-primary/40", visao === v && "border-primary ring-1 ring-primary")}>
            <div className="text-xs text-muted-foreground">{v === "TODAS" ? "Todas" : ROTULO_EMPRESA[v]}</div>
            <div className="text-lg font-semibold">{n}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Pesquisar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={resp} onValueChange={setResp}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os operadores</SelectItem>
            <SelectItem value="SEM">Sem operador</SelectItem>
            {data!.operadores.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={talento} onValueChange={setTalento}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os talentos</SelectItem>
            <SelectItem value="SEM">Sem talento</SelectItem>
            {talentos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={regime} onValueChange={setRegime}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Regime"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Regime: Todos</SelectItem>
            {REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioridade} onValueChange={setPrioridade}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Prioridade"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Prioridade: Todas</SelectItem>
            {[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}
            <SelectItem value="SEM">Sem prioridade</SelectItem>
          </SelectContent>
        </Select>
        <FiltroGrupoSelect valor={grupoF} onChange={setGrupoF} grupos={grp?.grupos ?? []} />
        <span className="ml-auto whitespace-nowrap text-sm text-muted-foreground">{filtradas.length} de {linhas.length} empresas</span>
      </div>

      <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {filtradas.map((l, i) => {
          const aberta = abertas.has(l.empresa_id);
          return (
            <div key={l.id} id={`emp-${l.empresa_id}`} className={cn("group", noBloco(i) && (grp?.porEmpresa.get(l.empresa_id)?.dividido ? "border-l-4 border-l-warning" : "border-l-4 border-l-info"), l.bloqueada && "border-l-4 border-l-warning bg-warning/5")}>
              {gDe(i) && !(gDe(i - 1) === gDe(i) && mesmoSeg(i, i - 1)) && tamBloco(i) > 1 && (
                <div className="-ml-1"><AvisoGrupo variante="faixa" qtd={tamBloco(i)} g={grp?.porEmpresa.get(l.empresa_id)} empresaId={l.empresa_id} operadorId={l.operador_id} eu={eu} /></div>
              )}
              <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 md:grid-cols-[24px_minmax(0,1fr)_200px_70px_180px]">
                <div role="button" tabIndex={0} onClick={() => toggle(l.empresa_id)} onKeyDown={(e) => { if (e.key === "Enter") toggle(l.empresa_id); }} className="col-span-2 flex min-w-0 cursor-pointer items-center gap-2 text-left">
                  <span className="grid h-6 w-6 shrink-0 place-items-center">
                    {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2"><span className="truncate font-medium" title={l.empresa_nome}>{l.empresa_nome}</span>
                      {l.bloqueada && <Lock className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Empresa com serviços bloqueados" />}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="truncate" title="Talento: responsável pela empresa">Talento: <span className="font-medium text-foreground/80">{l.talento ?? "—"}</span></span>
                      {l.regime && <span>Regime: {ROT_REGIME[l.regime as keyof typeof ROT_REGIME]}</span>}
                      {grp?.porEmpresa.get(l.empresa_id) && (!noBloco(i) || filtradas[inicioBloco(i)]!.operador_id !== l.operador_id) && <span onClick={(e) => e.stopPropagation()} className="flex min-w-0 max-w-full"><AvisoGrupo variante="pill" g={grp.porEmpresa.get(l.empresa_id)} empresaId={l.empresa_id} operadorId={l.operador_id} eu={eu} /></span>}
                    </span>
                  </span>
                </div>
                <div className="col-span-3 col-start-2 row-start-2 flex items-center gap-3 md:col-span-1 md:col-start-auto md:row-start-auto">
                  <span title="Operador: responsável pela execução da demanda" className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-xs font-semibold", l.operador ? "border-primary/30 bg-primary/10 text-primary" : "border-warning/40 bg-warning/10 text-warning")}>
                    <UserRound className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.operador?.nome ?? "Sem operador"}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground md:hidden">Peso <span className="font-semibold text-foreground">{l.peso}</span></span>
                </div>
                <span className="hidden text-center text-sm tabular-nums md:block"><span className="text-xs text-muted-foreground">Peso </span><span className="font-semibold">{l.peso}</span></span>
                <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-60 sm:group-hover:opacity-100">
                  {!l.bloqueada && <ConcluirEmpresaButton linha={l} />}
                  <MenuAcoesEmpresa linha={l} />
                </div>
              </div>
              {l.bloqueada && (
                <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs md:ml-10">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  <div><span className="font-semibold text-warning">SERVIÇOS BLOQUEADOS</span> — Esta empresa está com os serviços bloqueados. Consulte se ela já está com serviços liberados.
                    <span className="text-muted-foreground"> Concluída automaticamente · marcado por {l.bloqueada_por ?? "—"} em {fmtDataHora(l.bloqueada_em)}.</span></div>
                </div>
              )}
              {aberta && (
                <div className="space-y-2 bg-muted/40 px-4 py-3 md:pl-10">
                  {l.bancos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum {R.item.toLowerCase()} vinculado. Adicione em Cadastros.</p>}
                  {l.bancos.map((b) => (
                    <div key={b.id} className="grid items-start gap-2 rounded-lg border bg-card p-2 md:grid-cols-[160px_150px_1fr_200px]">
                      <div className="pt-1.5 text-sm font-medium">{b.banco_nome}</div>
                      <StatusBancoSelect b={b} empresaNome={l.empresa_nome} />
                      <ComentarioBanco b={b} empresaNome={l.empresa_nome} />
                      <div className="pt-1 text-xs text-muted-foreground">{b.atualizado_por ?? "—"}<br />{fmtDataHora(b.atualizado_em)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhuma empresa com esses filtros.</p>}
      </div>
    </div>
  );
}
