import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertaPeculiaridade, usePeculiaridadesRealtime } from "@/components/alertaPeculiaridade";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Carregando } from "@/components/extratos";
import { cn } from "@/lib/utils";
import { REGIMES, ROT_REGIME, autorAtual, chaveNome, fmtDataHora, registrar } from "@/lib/extratos";

export const Route = createFileRoute("/_authenticated/peculiaridades")({
  head: () => ({ meta: [{ title: "Peculiaridades — Controle Operacional Contábil" }, { name: "description", content: "Informações específicas de cada empresa, para toda a equipe." }, { property: "og:title", content: "Peculiaridades — Controle Operacional Contábil" }, { property: "og:description", content: "Informações específicas de cada empresa, para toda a equipe." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { empresa?: string; filtro?: FiltroPec } => ({
    ...(typeof s["empresa"] === "string" && s["empresa"] ? { empresa: s["empresa"] } : {}),
    ...(typeof s["filtro"] === "string" && s["filtro"] in FILTROS && s["filtro"] !== "TODAS" ? { filtro: s["filtro"] as FiltroPec } : {}),
  }),
  component: Peculiaridades,
});

const FILTROS = { TODAS: "Todas as empresas", COM: "Com peculiaridades", SEM: "Sem peculiaridades", FINANCEIRO: "Com Financeiro e Acessos", RELACIONAMENTO: "Com Relacionamento e Contatos", VISITANTE: "Incluídas por visitante" } as const;
type FiltroPec = keyof typeof FILTROS;

const CATS = { FINANCEIRO: "Financeiro e Acessos", RELACIONAMENTO: "Relacionamento e Contatos" } as const;
type Cat = keyof typeof CATS;

interface Emp { id: string; nome: string; regime: string | null; prioridade: number | null; talentos: string[]; inativa: boolean; otimizza: boolean }
interface Pec { origem?: string; id: string; empresa_id: string; categoria: string; descricao: string; criado_por: string | null; criado_em: string; atualizado_por: string | null; atualizado_em: string | null }

function Peculiaridades() {
  const qc = useQueryClient();
  const { visitante } = Route.useRouteContext();
  const { data, isLoading } = useQuery({
    queryKey: ["peculiaridades", visitante],
    queryFn: async () => {
      const [e, p] = await Promise.all([
        supabase.from("empresas").select("id,nome,regime,prioridade,talento_banco,talento_cartao,talento_doc,inativa_banco,inativa_cartao,cobranca,tem_otimizza").order("nome").limit(5000),
        supabase.from("peculiaridades").select("*").order("criado_em", { ascending: false }).limit(20000),
      ]);
      if (e.error) throw e.error;
      // Uma linha por empresa (nome normalizado), mesmo presente em várias áreas
      const vistos = new Map<string, Emp>();
      const chaves = new Map<string, string>();
      const ids = new Map<string, string[]>();
      for (const x of e.data ?? []) {
        const k = chaveNome(x.nome);
        chaves.set(x.id, k);
        if (vistos.has(k)) { const rep = vistos.get(k)!.id; ids.set(rep, [...(ids.get(rep) ?? []), x.id]); continue; }
        ids.set(x.id, [x.id]);
        vistos.set(k, { id: x.id, nome: x.nome, regime: x.regime, prioridade: x.prioridade, talentos: [...new Set([x.talento_banco, x.talento_cartao, x.talento_doc].filter((t): t is string => !!t))], inativa: x.inativa_banco && x.inativa_cartao && !x.cobranca, otimizza: !!x.tem_otimizza });
      }
      return { empresas: [...vistos.values()], pecs: (p.data ?? []) as Pec[], chaves, ids };
    },
  });
  const [busca, setBusca] = useState("");
  const [talento, setTalento] = useState("TODOS");
  const [regime, setRegime] = useState("TODOS");
  const [prio, setPrio] = useState("TODAS");
  const [aberta, setAberta] = useState<Emp | null>(null);
  usePeculiaridadesRealtime();
  const sp = Route.useSearch();
  const nav = Route.useNavigate();
  const filtro: FiltroPec = sp.filtro ?? "TODAS";
  const setFiltro = (v: string) => nav({ search: ({ filtro: _f, ...o }) => (v === "TODAS" ? o : { ...o, filtro: v as FiltroPec }), replace: true });
  const empresas = data?.empresas ?? [];
  const pecs = data?.pecs ?? [];
  // Peculiaridades por nome normalizado: empresas homônimas em áreas diferentes compartilham
  const chaveDe = useMemo(() => data?.chaves ?? new Map<string, string>(), [data]);
  const pecsPorChave = useMemo(() => { const m = new Map<string, Pec[]>(); for (const p of pecs) { const k = chaveDe.get(p.empresa_id) ?? p.empresa_id; m.set(k, [...(m.get(k) ?? []), p]); } return m; }, [pecs, chaveDe]);
  const pecsDe = (e: Emp) => pecsPorChave.get(chaveNome(e.nome)) ?? [];
  useEffect(() => { if (sp.empresa && empresas.length && !aberta) { const e = empresas.find((x) => x.id === sp.empresa) ?? empresas.find((x) => (data?.ids.get(x.id) ?? []).includes(sp.empresa!)); if (e) setAberta(e); } }, [sp.empresa, empresas]); // eslint-disable-line react-hooks/exhaustive-deps
  const talentos = useMemo(() => [...new Set(empresas.flatMap((e) => e.talentos))].sort(), [empresas]);
  const lista = empresas.filter((e) => (!busca || e.nome.toLowerCase().includes(busca.toLowerCase())) &&
    (talento === "TODOS" || e.talentos.includes(talento)) && (regime === "TODOS" || e.regime === regime) &&
    (prio === "TODAS" || (prio === "SEM" ? !e.prioridade : String(e.prioridade) === prio)) && passaFiltro(e));
  function passaFiltro(e: Emp) {
    const ps = pecsDe(e);
    switch (filtro) {
      case "COM": return ps.length > 0;
      case "SEM": return ps.length === 0;
      case "FINANCEIRO": case "RELACIONAMENTO": return ps.some((p) => p.categoria === filtro);
      case "VISITANTE": return ps.some((p) => p.origem === "VISITANTE");
      default: return true;
    }
  }
  const comPec = lista.filter((e) => pecsDe(e).length > 0).length;

  if (isLoading) return <Carregando />;
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Peculiaridades</h1><p className="text-sm text-muted-foreground">Informações permanentes de cada empresa, válidas em todas as competências.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Pesquisar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <Select value={talento} onValueChange={setTalento}><SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos os talentos</SelectItem>{talentos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
        <Select value={regime} onValueChange={setRegime}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Regime: Todos</SelectItem>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent></Select>
        <Select value={prio} onValueChange={setPrio}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Prioridade: Todas</SelectItem>{[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}<SelectItem value="SEM">Sem prioridade</SelectItem></SelectContent></Select>
        <Select value={filtro} onValueChange={setFiltro}><SelectTrigger className="w-full sm:w-60" aria-label="Peculiaridades"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(FILTROS) as FiltroPec[]).map((k) => <SelectItem key={k} value={k}>{FILTROS[k]}</SelectItem>)}</SelectContent></Select>
        <span className="ml-auto text-sm text-muted-foreground">{comPec} de {lista.length} empresas com peculiaridades</span>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {lista.map((e) => (
          <div key={e.id} role="button" tabIndex={0} onClick={() => setAberta(e)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setAberta(e); } }} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40", e.inativa && "opacity-60")}>
            <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5 font-medium"><span className="truncate">{e.nome}</span><AlertaPeculiaridade empresaId={e.id} nome={e.nome} estatico />{e.inativa && <Badge variant="outline" className="ml-2">inativa</Badge>}{e.otimizza && <Badge variant="outline" className="ml-2 border-transparent bg-primary/10 text-primary">Otimizza</Badge>}</div>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>Talento: {e.talentos.join(", ") || "—"}</span><span>Regime: {e.regime ? ROT_REGIME[e.regime] : "—"}</span>{e.prioridade && <span className="font-medium">Prioridade {e.prioridade}</span>}</div></div>
            {<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pecsDe(e).length} peculiaridade(s)</span>}
          </div>
        ))}
        {!lista.length && <p className="p-6 text-sm text-muted-foreground">Nenhuma empresa com esses filtros.</p>}
      </div>
      <Sheet open={!!aberta} onOpenChange={(v) => { if (!v) { setAberta(null); if (sp.empresa) nav({ search: ({ empresa: _e, ...o }) => o, replace: true }); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>{aberta?.nome}</SheetTitle></SheetHeader>
          {aberta && <Painel visitante={!!visitante} key={aberta.id} emp={{ ...aberta, otimizza: empresas.find((x) => x.id === aberta.id)?.otimizza ?? aberta.otimizza }} pecs={pecsDe(aberta)} onMudou={() => { qc.invalidateQueries({ queryKey: ["peculiaridades"] }); qc.invalidateQueries({ queryKey: ["pec-resumo"] }); qc.invalidateQueries({ queryKey: ["cobranca"] }); }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Painel({ emp, pecs, onMudou, visitante }: { emp: Emp; pecs: Pec[]; onMudou: () => void; visitante: boolean }) {
  const [editando, setEditando] = useState<Pec | "nova" | null>(null);
  const [cat, setCat] = useState<Cat>("FINANCEIRO");
  const [desc, setDesc] = useState("");
  const abrir = (p: Pec | "nova") => { setEditando(p); setCat(p === "nova" ? "FINANCEIRO" : (p.categoria as Cat)); setDesc(p === "nova" ? "" : p.descricao); };
  async function salvar() {
    if (!desc.trim()) { toast.error("Descreva a peculiaridade."); return; }
    if (visitante) {
      // Visitante só inclui, pela função própria (o banco recusa qualquer outra gravação)
      const { error } = await supabase.rpc("incluir_peculiaridade_visitante", { p_empresa_id: emp.id, p_categoria: cat, p_descricao: desc.trim(), p_autor: localStorage.getItem("visitanteNome") ?? "" });
      if (error) { toast.error(error.message); return; }
      toast.success(`Peculiaridade incluída para ${emp.nome}.`); setEditando(null); onMudou(); return;
    }
    const autor = await autorAtual();
    const r = editando === "nova"
      ? await supabase.from("peculiaridades").insert({ empresa_id: emp.id, categoria: cat, descricao: desc.trim(), criado_por: autor })
      : await supabase.from("peculiaridades").update({ categoria: cat, descricao: desc.trim(), atualizado_por: autor, atualizado_em: new Date().toISOString() }).eq("id", (editando as Pec).id);
    if (r.error) { toast.error(r.error.message); return; }
    await registrar({ empresa_id: emp.id, empresa_nome: emp.nome, tipo: null, acao: editando === "nova" ? "PECULIARIDADE INCLUÍDA" : "PECULIARIDADE EDITADA", detalhe: `${CATS[cat]}: ${desc.trim().slice(0, 200)}` });
    toast.success("Peculiaridade salva."); setEditando(null); onMudou();
  }
  async function excluir(p: Pec) {
    if (!confirm("Excluir esta peculiaridade?")) return;
    const { error } = await supabase.from("peculiaridades").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ empresa_id: emp.id, empresa_nome: emp.nome, tipo: null, acao: "PECULIARIDADE EXCLUÍDA", detalhe: `${CATS[p.categoria as Cat] ?? p.categoria}: ${p.descricao.slice(0, 200)}` });
    toast.success("Peculiaridade excluída."); onMudou();
  }
  async function alternarOtimizza(v: boolean) {
    const { error } = await supabase.from("empresas").update({ tem_otimizza: v }).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ empresa_id: emp.id, empresa_nome: emp.nome, tipo: null, acao: "OTIMIZZA ALTERADO", detalhe: v ? "Não → Sim" : "Sim → Não" });
    toast.success(v ? "Marcada: tem Otimizza." : "Desmarcada: não tem Otimizza."); onMudou();
  }
  return (
    <div className="mt-4 space-y-4">
      <label className="flex items-start gap-3 rounded-xl border p-3">
        <Checkbox className="mt-0.5" checked={emp.otimizza} disabled={visitante} onCheckedChange={(c) => alternarOtimizza(c === true)} />
        <div><div className="text-sm font-semibold">TEM OTIMIZZA?</div><p className="text-xs text-muted-foreground">Marcada: a Cobrança de Documentação mostra "Temos acesso com o Otimizza — NÃO COBRAR EXTRATOS BANCÁRIOS". Desmarcada: não tem.</p></div>
      </label>
      {editando ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div><Label>Categoria</Label><Select value={cat} onValueChange={(v) => setCat(v as Cat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Descrição</Label><Textarea rows={5} maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={cat === "FINANCEIRO" ? "Bancos e contas, relatórios, aplicações, acessos, particularidades de extratos…" : "Contato, telefone, quem envia documentos, como cobrar…"} /></div>
          <div className="flex gap-2"><Button onClick={salvar}>Salvar</Button><Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button></div>
        </div>
      ) : <Button onClick={() => abrir("nova")}><Plus className="h-4 w-4" />Adicionar peculiaridade</Button>}
      {(Object.keys(CATS) as Cat[]).map((c) => {
        const itens = pecs.filter((p) => p.categoria === c);
        return (
          <section key={c}>
            <h3 className="mb-2 text-sm font-semibold">{CATS[c]} <span className="font-normal text-muted-foreground">({itens.length})</span></h3>
            <div className="space-y-2">
              {itens.map((p) => (
                <div key={p.id} className="rounded-lg border bg-card p-3">
                  <p className="whitespace-pre-wrap text-sm">{p.descricao}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex-1">{p.origem === "VISITANTE" && <Badge variant="outline" className="mr-1.5 border-transparent bg-accent text-accent-foreground">Visitante</Badge>}Por {p.criado_por ?? "—"} em {fmtDataHora(p.criado_em)}{p.atualizado_em && ` · editada por ${p.atualizado_por ?? "—"} em ${fmtDataHora(p.atualizado_em)}`}</span>
                    {!visitante && <><Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => abrir(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => excluir(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></>}
                  </div>
                </div>
              ))}
              {!itens.length && <p className="text-sm text-muted-foreground">Nenhuma registrada.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

