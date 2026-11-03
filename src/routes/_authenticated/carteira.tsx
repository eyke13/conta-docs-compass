import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { ArrowRightLeft, Shuffle, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Carregando, useInvalidar } from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { CarteiraCobranca } from "@/components/carteiraCobranca";
import { ehGestor } from "@/lib/acesso";
import { cn } from "@/lib/utils";
import { usuarioId } from "@/lib/acesso";
import { AlertaPeculiaridade, DESTAQUE_PEC, usePeculiaridadesRealtime, useResumoPeculiaridades } from "@/components/alertaPeculiaridade";
import { REGIMES, ROT_REGIME, SETORES, atribuirEmpresas, carregarCarteiraBC, carregarCarteiraCob, type EmpresaLinha, gruposPorTalento, planejarDistribuicao, registrar, rotuloComp, setorDoGrupo } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({ meta: [{ title: "Carteira de Operadores — Controle Operacional Contábil" }, { name: "description", content: "Distribuição, transferência e ranking das carteiras dos operadores." }, { property: "og:title", content: "Carteira de Operadores — Controle Operacional Contábil" }, { property: "og:description", content: "Distribuição, transferência e ranking das carteiras dos operadores." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Carteira,
});

const SEM = "__sem__";

function Carteira() {
  const { competencia } = useCompetencia();
  const [celula, setCelula] = useState<"BC" | "COB">("BC");
  const cob = celula === "COB";
  const { data, isLoading } = useQuery({
    queryKey: ["carteira", celula, competencia],
    queryFn: async (): Promise<{ linhas: (EmpresaLinha & { nBancos?: number; nCartoes?: number })[]; operadores: import("@/lib/extratos").Operador[]; divergentes?: number }> =>
      cob ? carregarCarteiraCob(competencia) : carregarCarteiraBC(competencia),
  });
  const tipo = cob ? "COBRANCA" as const : "AMBOS" as const;
  const R = { itens: cob ? "Empresas na cobrança" : "Bancos + Cartões" };
  const histTipo = null;
  const [fBusca, setFBusca] = useState(""); const [fTal, setFTal] = useState("TODOS"); const [fOp, setFOp] = useState("TODOS");
  const [fPrio, setFPrio] = useState("TODAS"); const [fReg, setFReg] = useState("TODOS");
  const trocarCelula = (c: "BC" | "COB") => { setCelula(c); setOrigem(""); setSel(new Set()); setDestino(""); setRegRed("TODOS"); setDestRed(null); setGrpRed(null); setFTal("TODOS"); setFOp("TODOS"); setFReg("TODOS"); };
  const gestor = ehGestor();
  usePeculiaridadesRealtime();
  const { data: pecRes } = useResumoPeculiaridades();
  const eu = usuarioId();
  const invalidar = useInvalidar();
  const [origem, setOrigem] = useState<string>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [confTransf, setConfTransf] = useState(false);
  const [confRedist, setConfRedist] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [regRed, setRegRed] = useState("TODOS");
  const [destRed, setDestRed] = useState<Set<string> | null>(null);
  const [grpRed, setGrpRed] = useState<Set<string> | null>(null);

  const linhas = data?.linhas ?? [];
  const operadores = data?.operadores ?? [];
  const ativos = operadores.filter((o) => o.ativo);
  const grupos = useMemo(() => gruposPorTalento(linhas), [linhas]);

  const ranking = useMemo(() => operadores.map((o) => {
    const ls = linhas.filter((l) => l.operador_id === o.id);
    return {
      op: o, empresas: ls.length, itens: ls.reduce((s, l) => s + l.total, 0), peso: ls.reduce((s, l) => s + l.peso, 0),
      nB: ls.reduce((s, l) => s + (l.nBancos ?? 0), 0), nC: ls.reduce((s, l) => s + (l.nCartoes ?? 0), 0),
      talentos: new Set(ls.map((l) => l.talento ?? `E:${l.empresa_id}`)).size,
    };
  }).sort((a, b) => b.peso - a.peso || a.op.nome.localeCompare(b.op.nome, "pt-BR")), [operadores, linhas]);
  const semOp = linhas.filter((l) => !l.operador_id);
  const pesoMax = Math.max(1, ...ranking.map((r) => r.peso));

  const gruposOrigem = grupos.filter((g) => g.empresas.some((e) => (origem === SEM ? !e.operador_id : e.operador_id === origem)));
  const empresasSel = gruposOrigem.filter((g) => sel.has(g.chave)).flatMap((g) => g.empresas);
  // Setor exigido pelas empresas selecionadas na transferência
  const setoresSel = new Set(gruposOrigem.filter((g) => sel.has(g.chave)).map(setorDoGrupo));
  const destinosTransf = ativos.filter((o) => o.id !== origem && (!cob || [...setoresSel].every((st) => st && st !== "MISTO" && o.setor === st)));

  // Redistribuição: grupos do regime escolhido, operadores de destino escolhidos
  // Regime é aplicado empresa a empresa: o talento só agrupa as empresas do regime escolhido
  const gruposReg = useMemo(() => (!cob || regRed === "TODOS") ? grupos : gruposPorTalento(linhas.filter((l) => l.regime === regRed)), [cob, regRed, grupos, linhas]);
  const grpAtivos = grpRed ? gruposReg.filter((g) => grpRed.has(g.chave)) : gruposReg;
  const setoresReg = new Set(gruposReg.map(setorDoGrupo));
  const elegiveisRed = cob ? ativos.filter((o) => o.setor && setoresReg.has(o.setor as never)) : ativos;
  const destinosRed = destRed ? elegiveisRed.filter((o) => destRed.has(o.id)) : elegiveisRed;
  const planoRed = useMemo(() => {
    const fora = new Set(grpAtivos.flatMap((g) => g.empresas.map((e) => e.empresa_id)));
    const carga = new Map<string, number>();
    for (const l of linhas) if (!fora.has(l.empresa_id) && l.operador_id) carga.set(l.operador_id, (carga.get(l.operador_id) ?? 0) + l.peso);
    const inicial = new Map(carga);
    const r = planejarDistribuicao(grpAtivos, destinosRed, carga, cob);
    return { ...r, inicial };
  }, [grpAtivos, destinosRed, linhas, cob]);

  const nomeOp = (id: string) => operadores.find((o) => o.id === id)?.nome ?? "Sem operador";

  async function transferir() {
    setOcupado(true);
    try {
      await atribuirEmpresas(empresasSel.map((e) => e.empresa_id), destino, competencia, tipo);
      await registrar({ competencia, tipo: histTipo, operador_nome: nomeOp(destino), acao: "CARTEIRA TRANSFERIDA",
        detalhe: `${cob ? "Cobrança" : "Banco | Cartões"}: ${empresasSel.length} empresas de ${origem === SEM ? "Sem operador" : nomeOp(origem)} → ${nomeOp(destino)}` });
      toast.success(`${empresasSel.length} empresas transferidas para ${nomeOp(destino)}.`);
      setSel(new Set()); invalidar();
    } catch (e) { toast.error((e as Error).message); }
    setOcupado(false); setConfTransf(false);
  }

  async function redistribuir() {
    setOcupado(true);
    try {
      const { plano } = planoRed;
      const porOp = new Map<string, string[]>();
      for (const g of grpAtivos) {
        const op = plano.get(g.chave);
        if (!op) continue;
        const arr = porOp.get(op) ?? [];
        arr.push(...g.empresas.filter((e) => e.operador_id !== op).map((e) => e.empresa_id));
        porOp.set(op, arr);
      }
      let mudou = 0;
      for (const [op, ids] of porOp) { await atribuirEmpresas(ids, op, competencia, tipo); mudou += ids.length; }
      await registrar({ competencia, tipo: histTipo, acao: "CARTEIRAS REDISTRIBUÍDAS", detalhe: `${cob ? `Cobrança · Regime ${regRed === "TODOS" ? "Todos" : ROT_REGIME[regRed]}` : "Banco | Cartões"}: ${plano.size} grupos entre ${destinosRed.length} operadores; ${mudou} empresas mudaram de operador${planoRed.semDestino.length ? `; ${planoRed.semDestino.length} grupos sem operador compatível` : ""}` });
      toast.success(`Carteiras redistribuídas. ${mudou} empresas mudaram de operador.`);
      invalidar();
    } catch (e) { toast.error((e as Error).message); }
    setOcupado(false); setConfRedist(false);
  }

  const talentosF = [...new Set(linhas.map((l) => l.talento).filter((t): t is string => !!t))].sort();
  const listaF = linhas.filter((l) => (!fBusca || l.empresa_nome.toLowerCase().includes(fBusca.toLowerCase())) && (fTal === "TODOS" || l.talento === fTal) &&
    (fOp === "TODOS" || (fOp === SEM ? !l.operador_id : l.operador_id === fOp)) && (fPrio === "TODAS" || (fPrio === "SEM" ? !l.prioridade : String(l.prioridade) === fPrio)) &&
    (fReg === "TODOS" || l.regime === fReg));

  const seletor = (
    <div className="inline-flex rounded-lg border bg-muted p-0.5" role="tablist" aria-label="Célula operacional">
      {([["BC", "BANCO | CARTÕES"], ["COB", "COBRANÇA"]] as const).map(([k, t]) => (
        <button key={k} role="tab" aria-selected={celula === k} onClick={() => trocarCelula(k)}
          className={cn("rounded-md px-4 py-1.5 text-sm font-semibold tracking-wide transition-colors", celula === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{t}</button>
      ))}
    </div>
  );
  const cabecalho = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carteira de Operadores</h1>
        <p className="text-sm text-muted-foreground">{rotuloComp(competencia)} · {cob ? "carga = número de empresas · um operador por padrinho em cada célula (Simples / Real/Presumido)" : "peso = bancos + cartões · a empresa inteira fica com um só operador · sem trava de setor"} · prioridade não interfere na distribuição</p>
      </div>
      {seletor}
    </div>
  );
  if (isLoading) return <div className="space-y-6">{cabecalho}<Carregando /></div>;
  if (!linhas.length) return <div className="space-y-6">{cabecalho}<p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">Nenhuma empresa nesta célula em {rotuloComp(competencia)}.</p></div>;
  if (cob) return <div className="space-y-6">{cabecalho}<CarteiraCobranca competencia={competencia} linhas={linhas} operadores={operadores} gestor={gestor} /></div>;

  return (
    <div className="space-y-6">
      {cabecalho}
      {!cob && !!data?.divergentes && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{data.divergentes} empresa(s) estão com operadores diferentes em Bancos e Cartões. Transferir ou redistribuir essas empresas unifica o operador nas duas áreas.</p>}

      {gestor && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Shuffle className="h-4 w-4 text-primary" />Redistribuir carteiras</h2>
          <p className="mb-4 text-sm text-muted-foreground">{cob ? "Empresas do Simples vão para a Célula Simples; Real e Presumido para a Célula Real/Presumido. Cada talento fica com um único operador e o peso é equilibrado." : "Bancos e Cartões são redistribuídos juntos, entre qualquer operador ativo (sem trava de setor). Cada empresa leva seus bancos e cartões; cada talento fica com um único operador; o peso (bancos + cartões) é equilibrado."}</p>
          <div className={cn("grid gap-4", cob ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {cob && <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">1. Regime das empresas</div>
              <Select value={regRed} onValueChange={(v) => { setRegRed(v); setDestRed(null); setGrpRed(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TODOS">Todos</SelectItem>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{cob ? "2" : "1"}. Operadores que podem receber ({destinosRed.length})</div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                {elegiveisRed.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={destinosRed.some((d) => d.id === o.id)} onCheckedChange={(c) => setDestRed(() => { const n = new Set(destinosRed.map((d) => d.id)); c ? n.add(o.id) : n.delete(o.id); return n; })} />
                    {o.nome}{cob && <span className="text-xs text-muted-foreground">{SETORES[o.setor as keyof typeof SETORES]}</span>}
                  </label>
                ))}
                {!elegiveisRed.length && <p className="text-xs text-warning">{cob ? "Nenhum operador ativo com setor compatível. Defina o setor em Cadastros → Responsáveis." : "Nenhum operador ativo."}</p>}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{cob ? "3" : "2"}. Grupos a redistribuir ({grpAtivos.length} de {gruposReg.length})</div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={grpAtivos.length === gruposReg.length && gruposReg.length > 0} onCheckedChange={(c) => setGrpRed(c ? null : new Set())} />Todos</label>
                {gruposReg.map((g) => (
                  <label key={g.chave} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={grpAtivos.includes(g)} onCheckedChange={(c) => setGrpRed(() => { const n = new Set(grpAtivos.map((x) => x.chave)); c ? n.add(g.chave) : n.delete(g.chave); return n; })} />
                    <span className="truncate">{g.talento ? `Talento ${g.talento}` : g.empresas[0]?.empresa_nome}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">peso {g.peso}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <Button className="mt-4" onClick={() => setConfRedist(true)} disabled={!grpAtivos.length || !destinosRed.length || ocupado}>Ver resumo e redistribuir</Button>
        </section>
      )}

      <section className="rounded-xl border bg-card shadow-sm p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-primary" />Ranking por peso da carteira</h2>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10">#</TableHead><TableHead>Operador</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Talentos</TableHead><TableHead className="text-right">Empresas</TableHead>
            {!cob && <><TableHead className="text-right">Bancos</TableHead><TableHead className="text-right">Cartões</TableHead></>}<TableHead className="w-[28%]">Peso total</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {ranking.map((r, i) => (
              <TableRow key={r.op.id} className={cn(!r.op.ativo && "opacity-60")}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{r.op.nome}<span className="ml-1 text-xs text-muted-foreground">{r.op.cargo}</span></TableCell>
                <TableCell><Badge variant="outline" className={cn("border-transparent", r.op.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{r.op.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell className="text-right">{r.talentos}</TableCell>
                <TableCell className="text-right">{r.empresas}</TableCell>
                {!cob && <><TableCell className="text-right tabular-nums">{r.nB}</TableCell><TableCell className="text-right tabular-nums">{r.nC}</TableCell></>}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.peso / pesoMax) * 100}%` }} /></div>
                    <span className="w-8 text-right font-semibold">{r.peso}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {semOp.length > 0 && (
              <TableRow><TableCell /><TableCell className="font-medium text-warning">Sem operador</TableCell><TableCell /><TableCell /><TableCell className="text-right">{semOp.length}</TableCell>
                {!cob && <><TableCell className="text-right">{semOp.reduce((s, l) => s + (l.nBancos ?? 0), 0)}</TableCell><TableCell className="text-right">{semOp.reduce((s, l) => s + (l.nCartoes ?? 0), 0)}</TableCell></>}<TableCell className="font-semibold">{semOp.reduce((s, l) => s + l.peso, 0)}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Empresas da carteira <span className="font-normal text-muted-foreground">({listaF.length})</span></h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input className="w-full sm:w-56" placeholder="Pesquisar empresa" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
          <Select value={fTal} onValueChange={setFTal}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os talentos</SelectItem>{talentosF.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={fOp} onValueChange={setFOp}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os operadores</SelectItem><SelectItem value={SEM}>Sem operador</SelectItem>{operadores.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select>
          {<Select value={fReg} onValueChange={setFReg}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Regime: Todos</SelectItem>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent></Select>}
          <Select value={fPrio} onValueChange={setFPrio}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Prioridade: Todas</SelectItem>{[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}<SelectItem value="SEM">Sem prioridade</SelectItem></SelectContent></Select>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Talento</TableHead>{cob && <><TableHead>Regime</TableHead><TableHead>Setor</TableHead></>}<TableHead>Operador</TableHead>{!cob && <><TableHead className="text-right">Bancos</TableHead><TableHead className="text-right">Cartões</TableHead></>}<TableHead className="text-right">Peso</TableHead></TableRow></TableHeader>
            <TableBody>
              {listaF.map((l) => (
                <TableRow key={l.empresa_id} className={cn(eu && l.operador_id === eu && pecRes?.has(l.empresa_id) && DESTAQUE_PEC)}>
                  <TableCell className="font-medium"><span className="inline-flex flex-wrap items-center gap-1.5">{l.empresa_nome}<AlertaPeculiaridade empresaId={l.empresa_id} nome={l.empresa_nome} responsavel={!!eu && l.operador_id === eu} /></span>{l.prioridade && <span className="ml-2 text-xs text-muted-foreground">P{l.prioridade}</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.talento ?? "—"}</TableCell>
                  {cob && <><TableCell className="text-sm">{l.regime ? ROT_REGIME[l.regime] : "—"}</TableCell><TableCell className="text-xs text-muted-foreground">{(() => { const st = l.regime === "SIMPLES" ? "SIMPLES" : l.regime ? "REAL_PRESUMIDO" : null; return st ? SETORES[st] : "—"; })()}</TableCell></>}
                  <TableCell className={cn("text-sm", !l.operador_id && "text-warning")}>{l.operador?.nome ?? "Sem operador"}</TableCell>
                  {!cob && <><TableCell className="text-right tabular-nums">{l.nBancos ?? 0}</TableCell><TableCell className="text-right tabular-nums">{l.nCartoes ?? 0}</TableCell></>}
                  <TableCell className="text-right font-semibold tabular-nums">{l.peso}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {gestor ? (
        <section className="rounded-xl border bg-card shadow-sm p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-4 w-4 text-primary" />Transferir empresas</h2>
          <p className="mb-4 text-sm text-muted-foreground">Empresas do mesmo talento são transferidas juntas{cob ? ", respeitando o setor do regime" : ", cada uma com todos os seus bancos e cartões"}. Só muda o operador, de {rotuloComp(competencia)} em diante; status, comentários e histórico são mantidos.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={origem} onValueChange={(v) => { setOrigem(v); setSel(new Set()); }}>
              <SelectTrigger className="w-60"><SelectValue placeholder="Operador de origem" /></SelectTrigger>
              <SelectContent>
                {semOp.length > 0 && <SelectItem value={SEM}>Sem operador</SelectItem>}
                {ranking.filter((r) => r.empresas).map((r) => <SelectItem key={r.op.id} value={r.op.id}>{r.op.nome} ({r.empresas})</SelectItem>)}
              </SelectContent>
            </Select>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger className="w-60"><SelectValue placeholder="Operador de destino (ativo)" /></SelectTrigger>
              <SelectContent>{destinosTransf.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}{!destinosTransf.length && <div className="p-2 text-xs text-muted-foreground">{cob ? "Nenhum operador ativo do setor compatível com as empresas marcadas." : "Nenhum outro operador ativo."}</div>}</SelectContent>
            </Select>
            <Button disabled={!empresasSel.length || !destino || destino === origem || !destinosTransf.some((o) => o.id === destino) || ocupado} onClick={() => setConfTransf(true)}>
              Transferir {empresasSel.length ? `${empresasSel.length} empresas` : ""}
            </Button>
          </div>
          {origem && (
            <div className="mt-4 overflow-hidden rounded-lg border">
              <label className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm font-medium">
                <Checkbox checked={gruposOrigem.length > 0 && sel.size === gruposOrigem.length}
                  onCheckedChange={(c) => setSel(c ? new Set(gruposOrigem.map((g) => g.chave)) : new Set())} />Selecionar todas
              </label>
              <div className="max-h-96 divide-y overflow-y-auto">
                {gruposOrigem.map((g) => (
                  <label key={g.chave} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                    <Checkbox className="mt-0.5" checked={sel.has(g.chave)}
                      onCheckedChange={(c) => setSel((s) => { const n = new Set(s); c ? n.add(g.chave) : n.delete(g.chave); return n; })} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{g.talento ? <>Talento {g.talento}</> : g.empresas[0]?.empresa_nome}</div>
                      {g.talento && <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">{g.empresas.map((e, i) => <span key={e.empresa_id} className="inline-flex items-center gap-1">{i > 0 && "· "}{e.empresa_nome}<AlertaPeculiaridade empresaId={e.empresa_id} nome={e.empresa_nome} /></span>)}</div>}
                    </div>
                    <span className="text-xs text-muted-foreground">{g.empresas.length} emp. · peso {g.peso}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground"><Users className="h-4 w-4" />Transferências e redistribuição são feitas pelo Gestor.</p>
      )}

      <AlertDialog open={confTransf} onOpenChange={setConfTransf}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar transferência</AlertDialogTitle>
            <AlertDialogDescription>{empresasSel.length} empresas (peso {empresasSel.reduce((s, e) => s + e.peso, 0)}) passarão de {origem === SEM ? "Sem operador" : nomeOp(origem)} para {nomeOp(destino)}, a partir de {rotuloComp(competencia)}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={transferir}>Transferir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confRedist} onOpenChange={setConfRedist}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Redistribuir carteiras?</AlertDialogTitle>
            <AlertDialogDescription>Resumo da distribuição ({R.itens}), de {rotuloComp(competencia)} em diante. Status, comentários e histórico não mudam.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {destinosRed.map((o) => {
              const gs = grpAtivos.filter((g) => planoRed.plano.get(g.chave) === o.id);
              return <div key={o.id} className="flex justify-between gap-2 border-b py-1"><span className="font-medium">{o.nome}</span><span className="tabular-nums text-muted-foreground">+{gs.reduce((s, g) => s + g.empresas.length, 0)} empresas · peso {planoRed.inicial.get(o.id) ?? 0} → {planoRed.carga.get(o.id) ?? 0}</span></div>;
            })}
            {planoRed.semDestino.length > 0 && <p className="pt-2 text-warning">{planoRed.semDestino.length} grupo(s) não serão movidos: nenhum operador escolhido é compatível{cob ? " com o setor (ou o talento mistura Simples com Real/Presumido)" : ""}: {planoRed.semDestino.map((g) => g.talento ?? g.empresas[0]?.empresa_nome).join(", ")}.</p>}
          </div>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={redistribuir}>Redistribuir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
