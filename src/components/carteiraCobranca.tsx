import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Merge, Shuffle, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInvalidar } from "@/components/extratos";
import { cn } from "@/lib/utils";
import { usuarioId } from "@/lib/acesso";
import { AlertaPeculiaridade, DESTAQUE_PEC, usePeculiaridadesRealtime, useResumoPeculiaridades } from "@/components/alertaPeculiaridade";
import { SETORES, ROT_REGIME, atribuirEmpresas, registrar, rotuloComp, type EmpresaLinha, type Operador, type Setor } from "@/lib/extratos";
import {
  TOLERANCIA_DESEQUILIBRIO, cargaPorOp, dividida, elegiveis, equilibrar, nomeUnidade, propostaUnificacao, unidadesCob,
  type ModoRedist, type UnidadeCob,
} from "@/lib/carteiraCobranca";

const CELULAS: Setor[] = ["SIMPLES", "REAL_PRESUMIDO"];
const SEM = "__sem__";
const cmp = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

export function CarteiraCobranca({ competencia, linhas, operadores, gestor }: { competencia: string; linhas: EmpresaLinha[]; operadores: Operador[]; gestor: boolean }) {
  const invalidar = useInvalidar();
  const { unidades, semRegime } = useMemo(() => unidadesCob(linhas), [linhas]);
  const nomeOp = (id: string | null) => (id && operadores.find((o) => o.id === id)?.nome) || "Sem operador";
  usePeculiaridadesRealtime();
  const { data: pecRes } = useResumoPeculiaridades();
  const eu = usuarioId();
  const { data: divididasDb = [], refetch: refDiv } = useQuery({
    queryKey: ["unidades-divididas", competencia, linhas.length],
    queryFn: async () => { const { data, error } = await supabase.rpc("unidades_divididas", { p_competencia: competencia }); if (error) throw error; return data ?? []; },
  });
  const chavesDivididas = new Set(divididasDb.map((d) => d.unidade));
  const unDivididas = unidades.filter((u) => chavesDivididas.has(u.chave) || (dividida(u) && [...u.porOp.keys()].filter(Boolean).length > 1));

  const porCel = (c: Setor) => unidades.filter((u) => u.celula === c);
  const resumoCel = (c: Setor, participantes?: string[]) => {
    const us = porCel(c); const total = us.reduce((s, u) => s + u.n, 0);
    const eleg = participantes ?? elegiveis(operadores, c).map((o) => o.id);
    return { us, total, eleg, meta: eleg.length ? total / eleg.length : 0, carga: cargaPorOp(us) };
  };

  // ---------- Avisos ----------
  const avisos = CELULAS.flatMap((c) => {
    const r = resumoCel(c); const out: { cel: Setor; texto: string }[] = [];
    const fora = r.us.flatMap((u) => u.empresas).filter((e) => { const o = operadores.find((x) => x.id === e.operador_id); return !o || !o.ativo || o.setor !== c; }).length;
    if (fora) out.push({ cel: c, texto: `${fora} empresas estão com operador inativo, fora da célula ou sem operador` });
    for (const id of r.eleg) if (!r.carga.get(id)) out.push({ cel: c, texto: `${nomeOp(id)} está sem carteira na ${SETORES[c]}` });
    if (r.meta > 0 && r.eleg.some((id) => Math.abs((r.carga.get(id) ?? 0) - r.meta) > r.meta * TOLERANCIA_DESEQUILIBRIO)) out.push({ cel: c, texto: `Carteiras desequilibradas na ${SETORES[c]}` });
    return out;
  });

  // ---------- Redistribuição ----------
  const [redCel, setRedCel] = useState<Setor | null>(null);
  const [redPart, setRedPart] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<ModoRedist>("MINIMO");
  const [ocupado, setOcupado] = useState(false);
  const abrirRedist = (c: Setor) => { setRedCel(c); setRedPart(new Set(elegiveis(operadores, c).map((o) => o.id))); setModo("MINIMO"); };
  const previa = useMemo(() => {
    if (!redCel) return null;
    const us = porCel(redCel); const part = [...redPart];
    const r = equilibrar(us, part, modo);
    const antes = cargaPorOp(us);
    const mudam = us.filter((u) => r.plano.get(u.chave) && (r.plano.get(u.chave) !== u.atual || dividida(u)));
    const semDestino = us.filter((u) => !r.plano.get(u.chave));
    const nEmp = mudam.reduce((s, u) => s + u.empresas.filter((e) => e.operador_id !== r.plano.get(u.chave)).length, 0);
    return { ...r, antes, mudam, nEmp, semDestino, part };
  }, [redCel, redPart, modo, unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aplicarRedist() {
    if (!previa || !redCel) return;
    setOcupado(true);
    try {
      for (const u of previa.mudam) await atribuirEmpresas(u.empresas.map((e) => e.empresa_id), previa.plano.get(u.chave)!, competencia, "COBRANCA");
      const cargas = previa.part.map((id) => `${nomeOp(id)} ${previa.carga.get(id) ?? 0}`).join(", ");
      await registrar({ competencia, tipo: null, acao: "CARTEIRAS REDISTRIBUÍDAS",
        detalhe: `Cobrança · ${SETORES[redCel]} · ${modo === "MINIMO" ? "Equilibrar com o mínimo de trocas" : "Redistribuir do zero"} · ${previa.part.length} operadores · ${previa.nEmp} empresas movidas · carga final: ${cargas}` });
      toast.success(`Carteiras equilibradas. ${previa.nEmp} empresas mudaram de operador.`);
      setRedCel(null); invalidar(); refDiv();
    } catch (e) { toast.error((e as Error).message); }
    setOcupado(false);
  }

  // ---------- Unificação ----------
  const [unifAberto, setUnifAberto] = useState(false);
  const [unifEsc, setUnifEsc] = useState<Map<string, string>>(new Map());
  const abrirUnif = () => {
    const m = new Map<string, string>();
    for (const u of unDivididas) { const p = propostaUnificacao(u, cargaPorOp(porCel(u.celula)), operadores); if (p) m.set(u.chave, p); }
    setUnifEsc(m); setUnifAberto(true);
  };
  async function aplicarUnif() {
    setOcupado(true);
    try {
      let n = 0;
      for (const u of unDivididas) { const op = unifEsc.get(u.chave); if (!op) continue; await atribuirEmpresas(u.empresas.map((e) => e.empresa_id), op, competencia, "COBRANCA"); n++; }
      await registrar({ competencia, tipo: null, acao: "PADRINHOS UNIFICADOS", detalhe: `Cobrança: ${n} padrinhos ficaram com um único operador por célula: ${unDivididas.filter((u) => unifEsc.get(u.chave)).map((u) => `${nomeUnidade(u)} (${SETORES[u.celula]}) → ${nomeOp(unifEsc.get(u.chave)!)}`).join("; ")}` });
      toast.success(`${n} padrinhos unificados.`);
      setUnifAberto(false); invalidar(); refDiv();
    } catch (e) { toast.error((e as Error).message); }
    setOcupado(false);
  }

  // ---------- Transferência ----------
  const [tCel, setTCel] = useState<Setor>("REAL_PRESUMIDO");
  const [tOrig, setTOrig] = useState("");
  const [tSel, setTSel] = useState<Set<string>>(new Set());
  const [tDest, setTDest] = useState("");
  const [tConf, setTConf] = useState(false);
  const tUnids = porCel(tCel).filter((u) => tOrig && (tOrig === SEM ? u.porOp.has(null) : u.porOp.has(tOrig))).sort((a, b) => cmp(nomeUnidade(a), nomeUnidade(b)));
  const tEscolhidas = tUnids.filter((u) => tSel.has(u.chave));
  const tEmp = tEscolhidas.reduce((s, u) => s + u.n, 0);
  const tDestinos = elegiveis(operadores, tCel).filter((o) => o.id !== tOrig);
  const tRes = resumoCel(tCel);
  const tCargaDest = tRes.carga.get(tDest) ?? 0;
  const tGanho = tEscolhidas.reduce((s, u) => s + u.empresas.filter((e) => e.operador_id !== tDest).length, 0);
  async function transferir() {
    setOcupado(true);
    try {
      for (const u of tEscolhidas) await atribuirEmpresas(u.empresas.map((e) => e.empresa_id), tDest, competencia, "COBRANCA");
      await registrar({ competencia, tipo: null, operador_nome: nomeOp(tDest), acao: "CARTEIRA TRANSFERIDA",
        detalhe: `Cobrança · ${SETORES[tCel]}: ${tEscolhidas.map(nomeUnidade).join(", ")} (${tEmp} empresas) de ${tOrig === SEM ? "Sem operador" : nomeOp(tOrig)} → ${nomeOp(tDest)}` });
      toast.success(`${tEmp} empresas transferidas para ${nomeOp(tDest)}.`);
      setTSel(new Set()); setTConf(false); invalidar(); refDiv();
    } catch (e) { toast.error((e as Error).message); }
    setOcupado(false);
  }

  // ---------- Lista ----------
  const [fBusca, setFBusca] = useState(""); const [fOp, setFOp] = useState("TODOS"); const [fCel, setFCel] = useState("TODAS");
  const grupos = useMemo(() => {
    const lista = [...unidades.map((u) => ({ chave: u.chave, titulo: u.talento ?? "Sem padrinho", cel: SETORES[u.celula] as string, emp: u.empresas, celK: u.celula as string })),
      ...(semRegime.length ? [{ chave: "SEMREG", titulo: "Sem regime", cel: "sem célula", emp: semRegime, celK: "SEM" }] : [])];
    // Empresas sem padrinho da mesma célula ficam juntas sob "Sem padrinho"
    const m = new Map<string, (typeof lista)[number]>();
    for (const g of lista) {
      const k = g.titulo === "Sem padrinho" ? `SP|${g.celK}` : g.chave;
      const x = m.get(k); if (x) x.emp = [...x.emp, ...g.emp]; else m.set(k, { ...g, emp: [...g.emp] });
    }
    return [...m.values()].map((g) => ({ ...g, emp: g.emp.filter((e) => (!fBusca || e.empresa_nome.toLowerCase().includes(fBusca.toLowerCase())) && (fOp === "TODOS" || (fOp === SEM ? !e.operador_id : e.operador_id === fOp)) && (fCel === "TODAS" || g.celK === fCel)).sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome, "pt-BR", { numeric: true, sensitivity: "base" })) }))
      .filter((g) => g.emp.length)
      .sort((a, b) => { const sa = a.titulo === "Sem padrinho" || a.celK === "SEM", sb = b.titulo === "Sem padrinho" || b.celK === "SEM"; return sa !== sb ? (sa ? 1 : -1) : cmp(a.titulo, b.titulo) || cmp(a.cel, b.cel); });
  }, [unidades, semRegime, fBusca, fOp, fCel]);
  const nLista = grupos.reduce((s, g) => s + g.emp.length, 0);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">Cada padrinho tem um único operador dentro de cada célula (Simples e Real/Presumido). O mesmo padrinho pode ter operadores diferentes em células diferentes. Carga = número de empresas; a redistribuição busca a mesma quantidade de empresas para cada operador da célula.</p>

      {gestor && (avisos.length > 0 || unDivididas.length > 0 || semRegime.length > 0) && (
        <section className="space-y-2">
          {unDivididas.length > 0 && <Aviso texto={`${unDivididas.length} padrinhos estão com mais de um operador na mesma célula`} botao="Unificar" icone={<Merge className="h-4 w-4" />} onClick={abrirUnif} />}
          {avisos.map((a, i) => <Aviso key={i} texto={a.texto} botao="Equilibrar" icone={<Shuffle className="h-4 w-4" />} onClick={() => abrirRedist(a.cel)} />)}
          {semRegime.length > 0 && <Aviso texto={`Empresas sem regime (${semRegime.length}): ${semRegime.map((e) => e.empresa_nome).join(", ")}. Defina o regime em Cadastros para que entrem numa célula.`} />}
        </section>
      )}

      {gestor && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Shuffle className="h-4 w-4 text-primary" />Redistribuir carteiras</h2>
          <p className="mb-3 text-sm text-muted-foreground">A redistribuição é feita por célula. Use "Equilibrar com o mínimo de trocas" quando entra, sai ou muda de célula algum operador.</p>
          <div className="flex flex-wrap gap-2">{CELULAS.map((c) => <Button key={c} variant="outline" onClick={() => abrirRedist(c)}>Equilibrar {SETORES[c]}</Button>)}</div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-primary" />Carteira por operador</h2>
        <div className="space-y-6">
          {CELULAS.map((c) => {
            const r = resumoCel(c);
            const ids = [...new Set([...r.eleg, ...r.carga.keys()])];
            const linhasR = ids.map((id) => {
              const op = operadores.find((o) => o.id === id);
              const us = r.us.filter((u) => u.porOp.has(id));
              return { id, op, padrinhos: us.filter((u) => u.talento).length, empresas: r.carga.get(id) ?? 0 };
            }).sort((a, b) => b.empresas - a.empresas || cmp(a.op?.nome ?? "", b.op?.nome ?? ""));
            const semOp = r.us.reduce((s, u) => s + (u.porOp.get(null) ?? 0), 0);
            const max = Math.max(1, r.meta, ...linhasR.map((x) => x.empresas));
            return (
              <div key={c}>
                <h3 className="mb-2 text-sm font-semibold">{SETORES[c]} <span className="font-normal text-muted-foreground">· {r.total} empresas · meta {r.meta.toFixed(1)} por operador</span></h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Operador</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Padrinhos</TableHead><TableHead className="text-right">Empresas</TableHead><TableHead className="text-right">Meta / diferença</TableHead><TableHead className="w-[26%]">Carga</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {linhasR.map((x) => {
                      const d = x.empresas - r.meta; const fora = !x.op?.ativo || x.op?.setor !== c;
                      return (
                        <TableRow key={x.id} className={cn(fora && "opacity-60")}>
                          <TableCell className="font-medium">{x.op?.nome ?? "—"}{fora && <span className="ml-1 text-xs text-warning">{x.op?.ativo ? "fora da célula" : ""}</span>}</TableCell>
                          <TableCell><Badge variant="outline" className={cn("border-transparent", x.op?.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{x.op?.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{x.padrinhos}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{x.empresas}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", Math.abs(d) > r.meta * TOLERANCIA_DESEQUILIBRIO ? "text-warning" : "text-muted-foreground")}>{r.meta.toFixed(1)} / {d >= 0 ? "+" : ""}{d.toFixed(1)}</TableCell>
                          <TableCell><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(x.empresas / max) * 100}%` }} /></div></TableCell>
                        </TableRow>
                      );
                    })}
                    {semOp > 0 && <TableRow><TableCell className="font-medium text-warning">Sem operador</TableCell><TableCell /><TableCell /><TableCell className="text-right tabular-nums">{semOp}</TableCell><TableCell /><TableCell /></TableRow>}
                    {!linhasR.length && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Nenhum operador ativo com setor {SETORES[c]}. Defina o setor em Cadastros → Responsáveis.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Empresas da carteira <span className="font-normal text-muted-foreground">({nLista})</span></h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input className="w-full sm:w-56" placeholder="Pesquisar empresa" value={fBusca} onChange={(e) => setFBusca(e.target.value)} />
          <Select value={fOp} onValueChange={setFOp}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os operadores</SelectItem>{[...operadores].sort((a, b) => cmp(a.nome, b.nome)).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}<SelectItem value={SEM}>Sem operador</SelectItem></SelectContent></Select>
          <Select value={fCel} onValueChange={setFCel}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Todas as células</SelectItem>{CELULAS.map((c) => <SelectItem key={c} value={c}>{SETORES[c]}</SelectItem>)}<SelectItem value="SEM">Sem regime</SelectItem></SelectContent></Select>
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Regime</TableHead><TableHead>Operador</TableHead></TableRow></TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <Fragment key={g.chave}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50"><TableCell colSpan={3} className="py-1.5 text-sm font-semibold">{g.titulo} <span className="font-normal text-muted-foreground">· {g.cel} · {g.emp.length} empresas</span></TableCell></TableRow>
                  {g.emp.map((l) => (
                    <TableRow key={l.empresa_id} className={cn(eu && l.operador_id === eu && pecRes?.has(l.empresa_id) && DESTAQUE_PEC)}>
                      <TableCell className="font-medium"><span className="inline-flex flex-wrap items-center gap-1.5">{l.empresa_nome}<AlertaPeculiaridade empresaId={l.empresa_id} nome={l.empresa_nome} responsavel={!!eu && l.operador_id === eu} /></span></TableCell>
                      <TableCell className="text-sm">{l.regime ? ROT_REGIME[l.regime] : "—"}</TableCell>
                      <TableCell className={cn("text-sm", !l.operador_id && "text-warning")}>{nomeOp(l.operador_id)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {gestor ? (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-4 w-4 text-primary" />Transferir padrinhos</h2>
          <p className="mb-4 text-sm text-muted-foreground">Move o padrinho inteiro dentro da célula escolhida (inclusive empresas dele que estejam com outro operador), nunca as empresas dele na outra célula. Só muda o operador, de {rotuloComp(competencia)} em diante.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tCel} onValueChange={(v) => { setTCel(v as Setor); setTSel(new Set()); setTDest(""); }}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{CELULAS.map((c) => <SelectItem key={c} value={c}>{SETORES[c]}</SelectItem>)}</SelectContent></Select>
            <Select value={tOrig} onValueChange={(v) => { setTOrig(v); setTSel(new Set()); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Operador de origem" /></SelectTrigger>
              <SelectContent>
                {[...tRes.carga.keys()].sort((a, b) => cmp(nomeOp(a), nomeOp(b))).map((id) => <SelectItem key={id} value={id}>{nomeOp(id)} ({tRes.carga.get(id)})</SelectItem>)}
                {tRes.us.some((u) => u.porOp.has(null)) && <SelectItem value={SEM}>Sem operador</SelectItem>}
              </SelectContent>
            </Select>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <Select value={tDest} onValueChange={setTDest}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Operador de destino" /></SelectTrigger>
              <SelectContent>{tDestinos.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}{!tDestinos.length && <div className="p-2 text-xs text-muted-foreground">Nenhum operador ativo nesta célula.</div>}</SelectContent>
            </Select>
            <Button disabled={!tEscolhidas.length || !tDest || ocupado} onClick={() => setTConf(true)}>Transferir {tEscolhidas.length ? `${tEscolhidas.length} padrinho(s)` : ""}</Button>
          </div>
          {tOrig && (
            <div className="mt-4 max-h-96 divide-y overflow-y-auto rounded-lg border">
              {tUnids.map((u) => (
                <label key={u.chave} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                  <Checkbox className="mt-0.5" checked={tSel.has(u.chave)} onCheckedChange={(c) => setTSel((s) => { const n = new Set(s); c ? n.add(u.chave) : n.delete(u.chave); return n; })} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{u.talento ? `Padrinho ${u.talento}` : u.empresas[0]?.empresa_nome}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">{u.empresas.map((e, i) => <span key={e.empresa_id} className="inline-flex items-center gap-1">{i > 0 && "· "}{e.empresa_nome}<AlertaPeculiaridade empresaId={e.empresa_id} nome={e.empresa_nome} /></span>)}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{u.n} emp.{dividida(u) && " · dividido"}</span>
                </label>
              ))}
              {!tUnids.length && <p className="p-3 text-sm text-muted-foreground">Nenhum padrinho deste operador nesta célula.</p>}
            </div>
          )}
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground"><Users className="h-4 w-4" />Transferências e redistribuição são feitas pelo Gestor.</p>
      )}

      {/* Prévia da redistribuição */}
      <Dialog open={!!redCel} onOpenChange={(o) => !o && setRedCel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Equilibrar {redCel ? SETORES[redCel] : ""}</DialogTitle>
            <DialogDescription>Prévia de {rotuloComp(competencia)} em diante. Status, comentários e histórico das cobranças não mudam.</DialogDescription></DialogHeader>
          {redCel && previa && (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
              <div className="flex flex-wrap gap-2">
                {([["MINIMO", "Equilibrar com o mínimo de trocas"], ["ZERO", "Redistribuir do zero"]] as const).map(([k, t]) => <Button key={k} size="sm" variant={modo === k ? "default" : "outline"} onClick={() => setModo(k)}>{t}</Button>)}
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Operadores participantes</div>
                <div className="flex flex-wrap gap-3">
                  {elegiveis(operadores, redCel).map((o) => <label key={o.id} className="flex items-center gap-1.5"><Checkbox checked={redPart.has(o.id)} onCheckedChange={(c) => setRedPart((s) => { const n = new Set(s); c ? n.add(o.id) : n.delete(o.id); return n; })} />{o.nome}</label>)}
                  {!elegiveis(operadores, redCel).length && <span className="text-warning">Nenhum operador ativo nesta célula.</span>}
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Operador</TableHead><TableHead className="text-right">Carga atual → nova</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Diferença</TableHead></TableRow></TableHeader>
                <TableBody>
                  {[...new Set([...previa.part, ...previa.antes.keys()])].map((id) => { const novo = previa.carga.get(id) ?? 0; return (
                    <TableRow key={id}><TableCell>{nomeOp(id)}{!previa.part.includes(id) && <span className="ml-1 text-xs text-muted-foreground">(não participa)</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{previa.antes.get(id) ?? 0} → {novo}</TableCell>
                      <TableCell className="text-right tabular-nums">{previa.part.includes(id) ? previa.meta.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{previa.part.includes(id) ? `${novo - previa.meta >= 0 ? "+" : ""}${(novo - previa.meta).toFixed(1)}` : "—"}</TableCell></TableRow>); })}
                </TableBody>
              </Table>
              <div>
                <div className="mb-1 font-medium">{previa.mudam.length} padrinhos mudam · {previa.nEmp} empresas mudam de operador</div>
                <div className="divide-y rounded-lg border">
                  {previa.mudam.map((u) => <div key={u.chave} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span>{nomeUnidade(u)} <span className="text-muted-foreground">· {SETORES[u.celula]} · {u.n} emp.</span></span><span className="text-muted-foreground">{[...u.porOp.keys()].map(nomeOp).join(" + ")} → <span className="font-medium text-foreground">{nomeOp(previa.plano.get(u.chave)!)}</span></span>
                    <div className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">{u.empresas.map((e, i) => <span key={e.empresa_id} className="inline-flex items-center gap-1">{i > 0 && "· "}{e.empresa_nome}<AlertaPeculiaridade empresaId={e.empresa_id} nome={e.empresa_nome} /></span>)}</div></div>)}
                  {!previa.mudam.length && <p className="px-3 py-2 text-muted-foreground">Nenhuma mudança necessária.</p>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setRedCel(null)}>Cancelar</Button><Button disabled={ocupado || !previa?.mudam.length} onClick={aplicarRedist}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unificação */}
      <Dialog open={unifAberto} onOpenChange={setUnifAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Unificar padrinhos</DialogTitle><DialogDescription>Cada padrinho fica com um único operador na célula, de {rotuloComp(competencia)} em diante.</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border text-sm">
            {unDivididas.map((u) => (
              <div key={u.chave} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div><div className="font-medium">{nomeUnidade(u)} <span className="font-normal text-muted-foreground">· {SETORES[u.celula]}</span></div>
                  <div className="text-xs text-muted-foreground">{[...u.porOp.entries()].map(([op, n]) => `${nomeOp(op)} (${n})`).join(" · ")}</div></div>
                <Select value={unifEsc.get(u.chave) ?? ""} onValueChange={(v) => setUnifEsc((m) => new Map(m).set(u.chave, v))}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Escolher operador" /></SelectTrigger>
                  <SelectContent>{elegiveis(operadores, u.celula).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUnifAberto(false)}>Cancelar</Button><Button disabled={ocupado} onClick={aplicarUnif}>Unificar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação da transferência */}
      <Dialog open={tConf} onOpenChange={setTConf}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar transferência</DialogTitle><DialogDescription>{SETORES[tCel]}, de {rotuloComp(competencia)} em diante.</DialogDescription></DialogHeader>
          <div className="space-y-2 text-sm">
            {tEscolhidas.map((u) => <div key={u.chave} className="flex justify-between gap-2 border-b pb-1"><span className="font-medium">{nomeUnidade(u)} · {u.n} emp.</span><span className="text-muted-foreground">{[...u.porOp.keys()].map(nomeOp).join(" + ")} → {nomeOp(tDest)}</span></div>)}
            <p>Carga de {nomeOp(tDest)}: {tCargaDest} → {tCargaDest + tGanho} (meta {tRes.meta.toFixed(1)}, diferença {tCargaDest + tGanho - tRes.meta >= 0 ? "+" : ""}{(tCargaDest + tGanho - tRes.meta).toFixed(1)})</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTConf(false)}>Cancelar</Button><Button disabled={ocupado} onClick={transferir}>Transferir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Aviso({ texto, botao, icone, onClick }: { texto: string; botao?: string; icone?: React.ReactNode; onClick?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{texto}</span>
      {botao && <Button size="sm" variant="outline" onClick={onClick}>{icone}{botao}</Button>}
    </div>
  );
}
