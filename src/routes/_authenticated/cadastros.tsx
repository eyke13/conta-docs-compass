import { GruposCadastro } from "@/components/gruposCadastro";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ehGestor } from "@/lib/acesso";
import { podeOperar } from "@/lib/acesso";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInvalidar } from "@/components/extratos";
import { TipoLocal, useCompetencia } from "@/lib/competencia";
import { REGIMES, ROT_REGIME, SETORES, ROT_TIPO, cadastrarEmpresaComBancos, mesAtual, registrar, autorAtual, rotuloComp, type Operador, type Tipo } from "@/lib/extratos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cadastros")({
  head: () => ({ meta: [{ title: "Cadastros — Controle Operacional Contábil" }, { name: "description", content: "Empresas, bancos e operadores." }, { property: "og:title", content: "Cadastros — Controle Operacional Contábil" }, { property: "og:description", content: "Empresas, bancos e operadores." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Cadastros,
});

function Cadastros() {
  const gestor = ehGestor();
  const [tipo, setTipoLocal] = useState<Tipo>("BANCO");
  const seletorItem = (
    <div className="mb-3 flex items-center gap-2 text-sm"><span className="text-muted-foreground">Tipo de item:</span>
      <div className="inline-flex rounded-lg border bg-muted p-0.5">
        {(["BANCO", "CARTAO"] as const).map((t) => <button key={t} onClick={() => setTipoLocal(t)} className={cn("rounded-md px-3 py-1 text-sm font-medium", tipo === t ? "bg-card shadow-sm" : "text-muted-foreground")}>{ROT_TIPO[t].item}</button>)}
      </div>
    </div>
  );
  if (!gestor) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Cadastros</h1>
      <Operadores />
    </div>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Cadastros</h1>
      <Tabs defaultValue="empresa">
        <TabsList className="h-auto max-w-full flex-wrap justify-start"><TabsTrigger value="empresa">Nova empresa</TabsTrigger><TabsTrigger value="grupos">Grupos</TabsTrigger><TabsTrigger value="banco">Editar empresas, bancos e cartões</TabsTrigger><TabsTrigger value="ops">Responsáveis</TabsTrigger><TabsTrigger value="dados">Dados</TabsTrigger></TabsList>
        <TabsContent value="empresa">{seletorItem}<TipoLocal tipo={tipo}><NovaEmpresa /></TipoLocal></TabsContent>
        <TabsContent value="banco">{seletorItem}<TipoLocal tipo={tipo}><AdicionarBanco /></TipoLocal></TabsContent>
        <TabsContent value="ops"><Operadores /></TabsContent>
        <TabsContent value="grupos"><GruposCadastro /></TabsContent>
        <TabsContent value="dados"><Dados /></TabsContent>
      </Tabs>
    </div>
  );
}

function NovaEmpresa() {
  const [nome, setNome] = useState("");
  const [banco, setBanco] = useState("");
  const [bancos, setBancos] = useState<string[]>([]);
  const [regime, setRegime] = useState("REAL");
  const [prio, setPrio] = useState("SEM");
  const invalidar = useInvalidar();
  const { tipo } = useCompetencia();
  const R = ROT_TIPO[tipo];
  const add = () => {
    const b = banco.trim();
    if (!b) return;
    if (bancos.some((x) => x.toUpperCase() === b.toUpperCase())) { toast.error(`${R.item} já incluído.`); return; }
    setBancos([...bancos, b]); setBanco("");
  };
  async function salvar() {
    if (!nome.trim()) { toast.error("Informe o nome da empresa."); return; }
    try {
      const r = await cadastrarEmpresaComBancos(nome, bancos, mesAtual(), "cadastro manual", tipo, undefined, regime, prio === "SEM" ? null : Number(prio));
      if (!r.nova) toast.info(`Empresa já existia; ${R.itens.toLowerCase()} novos foram adicionados.`);
      else toast.success(`Empresa cadastrada em ${rotuloComp(mesAtual())}.`);
      setNome(""); setBancos([]); setRegime("REAL"); invalidar();
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="max-w-lg space-y-4 rounded-xl border bg-card shadow-sm p-5">
      <div><Label>Nome da empresa</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="EMPRESA ABC LTDA" /></div>
      <div>
        <Label>Regime</Label>
        <Select value={regime} onValueChange={setRegime}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Prioridade</Label>
        <Select value={prio} onValueChange={setPrio}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="SEM">Sem prioridade</SelectItem>{[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>{R.itens} vinculados</Label>
        <div className="flex gap-2"><Input value={banco} onChange={(e) => setBanco(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder={`Ex.: ${R.exemplo}`} /><Button variant="outline" onClick={add}><Plus className="h-4 w-4" />Adicionar {R.item.toLowerCase()}</Button></div>
        <div className="mt-2 flex flex-wrap gap-2">
          {bancos.map((b) => <Badge key={b} variant="secondary" className="gap-1">{b}<button onClick={() => setBancos(bancos.filter((x) => x !== b))} aria-label={`Remover ${b}`}><X className="h-3 w-3" /></button></Badge>)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">A empresa entra na competência atual ({rotuloComp(mesAtual())}) com todos os {R.itens.toLowerCase()} Pendentes. Pode salvar sem {R.itens.toLowerCase()}.</p>
      <div className="flex gap-2"><Button onClick={salvar}>Salvar empresa</Button><Button variant="ghost" onClick={() => { setNome(""); setBancos([]); setRegime("REAL"); }}>Cancelar</Button></div>
    </div>
  );
}

function AdicionarBanco() {
  const [busca, setBusca] = useState("");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [novo, setNovo] = useState("");
  const invalidar = useInvalidar();
  const { tipo } = useCompetencia();
  const R = ROT_TIPO[tipo];
  const { data: empresas, refetch: refetchEmp } = useQuery({ queryKey: ["empresas"], queryFn: async () => (await supabase.from("empresas").select("id,nome,regime,prioridade").order("nome").limit(5000)).data ?? [] });
  const { data: bancos, refetch } = useQuery({
    queryKey: ["bancos", empresaId, tipo], enabled: !!empresaId,
    queryFn: async () => (await supabase.from("bancos").select("id,nome").eq("empresa_id", empresaId!).eq("tipo", tipo).order("nome")).data ?? [],
  });
  const emp = empresas?.find((e) => e.id === empresaId);
  async function adicionar() {
    if (!emp || !novo.trim()) return;
    if (bancos?.some((b) => b.nome.toUpperCase() === novo.trim().toUpperCase())) { toast.error(`Este ${R.item.toLowerCase()} já está vinculado à empresa.`); return; }
    try {
      await cadastrarEmpresaComBancos(emp.nome, [novo], mesAtual(), "inclusão manual", tipo);
      toast.success(`${novo.trim()} vinculado a ${emp.nome}.`);
      setNovo(""); refetch(); invalidar();
    } catch (e) { toast.error((e as Error).message); }
  }
  const [nomeEdit, setNomeEdit] = useState("");
  async function renomear() {
    const n = nomeEdit.trim().toUpperCase();
    if (!emp || !n || n === emp.nome) return;
    const { error } = await supabase.from("empresas").update({ nome: n }).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("demandas").update({ empresa_nome: n }).eq("empresa_id", emp.id).eq("competencia", mesAtual());
    await registrar({ empresa_id: emp.id, empresa_nome: n, tipo: null, acao: "EMPRESA EDITADA", detalhe: `${emp.nome} → ${n}` });
    toast.success("Empresa atualizada."); refetchEmp(); invalidar();
  }
  async function removerBanco(b: { id: string; nome: string }) {
    if (!emp || !confirm(`Remover ${b.nome} de ${emp.nome}?`)) return;
    await supabase.from("extratos").delete().eq("banco_id", b.id).eq("competencia", mesAtual()).eq("status", "PENDENTE");
    await supabase.from("extratos").update({ banco_id: null }).eq("banco_id", b.id);
    const { error } = await supabase.from("bancos").delete().eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ empresa_id: emp.id, empresa_nome: emp.nome, banco_nome: b.nome, acao: `${R.item.toUpperCase()} REMOVIDO` });
    toast.success(`${b.nome} removido.`); refetch(); invalidar();
  }
  async function salvarCampo(campo: "regime" | "prioridade", valor: string) {
    if (!emp) return;
    const v = valor === "SEM" ? null : campo === "prioridade" ? Number(valor) : valor;
    const antes = emp[campo];
    if (antes === v) return;
    const { error } = await supabase.from("empresas").update(campo === "regime" ? { regime: v as string | null } : { prioridade: v as number | null }).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    const rot = (x: unknown) => (x == null ? "—" : campo === "regime" ? ROT_REGIME[String(x)] ?? String(x) : `Prioridade ${x}`);
    await registrar({ empresa_id: emp.id, empresa_nome: emp.nome, tipo: null, acao: campo === "regime" ? "REGIME ALTERADO" : "PRIORIDADE ALTERADA", detalhe: `${rot(antes)} → ${rot(v)} (cadastro manual)` });
    toast.success(campo === "regime" ? "Regime atualizado em todo o sistema." : "Prioridade atualizada."); refetchEmp(); invalidar();
  }
  const lista = (empresas ?? []).filter((e) => e.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 30);
  return (
    <div className="grid max-w-4xl gap-4 md:grid-cols-2">
      <div className="space-y-2 rounded-xl border bg-card shadow-sm p-4">
        <Input placeholder="Pesquisar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="max-h-80 overflow-y-auto">
          {lista.map((e) => <button key={e.id} onClick={() => { setEmpresaId(e.id); setNomeEdit(e.nome); }} className={`block w-full rounded px-2 py-1.5 text-left text-sm ${e.id === empresaId ? "bg-accent font-medium" : "hover:bg-muted"}`}>{e.nome}</button>)}
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card shadow-sm p-4">
        {!emp ? <p className="text-sm text-muted-foreground">Selecione uma empresa.</p> : <>
          <div className="flex gap-2"><Input value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)} /><Button variant="outline" onClick={renomear}>Salvar nome</Button></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Regime</Label><Select value={emp.regime ?? "SEM"} onValueChange={(v) => salvarCampo("regime", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEM">Sem regime</SelectItem>{REGIMES.map((r) => <SelectItem key={r} value={r}>{ROT_REGIME[r]}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Prioridade</Label><Select value={emp.prioridade ? String(emp.prioridade) : "SEM"} onValueChange={(v) => salvarCampo("prioridade", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEM">Sem prioridade</SelectItem>{[1, 2, 3].map((p) => <SelectItem key={p} value={String(p)}>Prioridade {p}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><div className="mb-1 text-xs text-muted-foreground">{R.itens} existentes</div><div className="flex flex-wrap gap-1">{bancos?.map((b) => <Badge key={b.id} variant="secondary" className="gap-1">{b.nome}<button title={`Remover ${R.item.toLowerCase()}`} onClick={() => removerBanco(b)} className="ml-0.5 hover:text-destructive">×</button></Badge>)}{bancos?.length === 0 && <span className="text-sm text-muted-foreground">Nenhum</span>}</div></div>
          <div className="flex gap-2"><Input placeholder={`Novo ${R.item.toLowerCase()}`} value={novo} onChange={(e) => setNovo(e.target.value)} /><Button onClick={adicionar}>Adicionar {R.item.toLowerCase()}</Button></div>
          <p className="text-xs text-muted-foreground">Entra em {rotuloComp(mesAtual())} como Pendente; meses anteriores não mudam.</p>
        </>}
      </div>
    </div>
  );
}

function Operadores() {
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("Estagiário");
  const [setor, setSetor] = useState("SEM");
  const gestor = ehGestor();
  const pode = podeOperar();
  const invalidar = useInvalidar();
  const { data, refetch } = useQuery({ queryKey: ["operadores"], queryFn: async () => ((await supabase.from("operadores").select("*").order("nome")).data ?? []) as Operador[] });
  async function salvar() {
    if (!nome.trim()) return;
    if (data?.some((o) => o.nome.toLowerCase() === nome.trim().toLowerCase())) { toast.error("Já existe um operador com esse nome."); return; }
    const { error } = await supabase.from("operadores").insert({ nome: nome.trim(), cargo, setor: setor === "SEM" ? null : setor });
    if (error) { toast.error(error.message); return; }
    await registrar({ tipo: null, acao: "OPERADOR CADASTRADO", operador_nome: nome.trim(), detalhe: cargo });
    toast.success("Operador cadastrado."); setNome(""); refetch(); invalidar();
  }
  async function mudarSetor(o: Operador, v: string) {
    const novo = v === "SEM" ? null : v;
    const { error } = await supabase.from("operadores").update({ setor: novo }).eq("id", o.id);
    if (error) { toast.error(error.message); return; }
    await registrar({ tipo: null, acao: "SETOR ALTERADO", operador_nome: o.nome, detalhe: `${o.setor ? SETORES[o.setor as keyof typeof SETORES] : "—"} → ${novo ? SETORES[novo as keyof typeof SETORES] : "—"}` });
    refetch(); invalidar();
  }
  async function alternar(o: Operador) {
    await supabase.from("operadores").update({ ativo: !o.ativo }).eq("id", o.id);
    await registrar({ tipo: null, acao: o.ativo ? "OPERADOR DESATIVADO" : "OPERADOR ATIVADO", operador_nome: o.nome });
    refetch(); invalidar();
  }
  const [excluindo, setExcluindo] = useState<Operador | null>(null);
  const [destino, setDestino] = useState("NENHUM");
  async function excluir() {
    const o = excluindo; if (!o) return;
    const novo = destino === "NENHUM" ? null : destino;
    const { count } = await supabase.from("demandas").select("id", { count: "exact", head: true }).eq("operador_id", o.id);
    const r1 = await supabase.from("demandas").update({ operador_id: novo, atribuido_em: new Date().toISOString(), atribuido_por: await autorAtual() }).eq("operador_id", o.id);
    if (r1.error) { toast.error(r1.error.message); return; }
    const r2 = await supabase.from("operadores").delete().eq("id", o.id);
    if (r2.error) { toast.error(r2.error.message); return; }
    const nomeDest = data?.find((x) => x.id === novo)?.nome;
    await registrar({ tipo: null, acao: "OPERADOR EXCLUÍDO", operador_nome: o.nome, detalhe: `${count ?? 0} demandas ${nomeDest ? `transferidas para ${nomeDest}` : "deixadas sem operador"}` });
    toast.success(`Operador ${o.nome} excluído.`); setExcluindo(null); setDestino("NENHUM"); refetch(); invalidar();
  }
  return (
    <div className="max-w-3xl space-y-4">
      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir o operador {excluindo?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>A exclusão afeta a distribuição das empresas atribuídas a ele, em Bancos e Cartões. Escolha o destino dessas empresas. Empresas, itens, talentos, status, comentários e histórico são mantidos; só o cadastro do operador é removido.</AlertDialogDescription></AlertDialogHeader>
          <div><Label>Destino das empresas</Label>
            <Select value={destino} onValueChange={setDestino}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="NENHUM">Deixar sem operador responsável</SelectItem>
              {data?.filter((x) => x.ativo && x.id !== excluindo?.id).map((x) => <SelectItem key={x.id} value={x.id}>Transferir para {x.nome}</SelectItem>)}
            </SelectContent></Select>
            <p className="mt-1 text-xs text-muted-foreground">Todas as empresas vão juntas para o mesmo destino, então nenhum talento fica dividido.</p></div>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir operador</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {pode && <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card shadow-sm p-4">
        <div className="flex-1"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div><Label>Cargo</Label><Select value={cargo} onValueChange={setCargo}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Estagiário">Estagiário</SelectItem><SelectItem value="Auxiliar">Auxiliar</SelectItem><SelectItem value="Analista">Analista</SelectItem></SelectContent></Select></div>
        <div><Label>Setor</Label><Select value={setor} onValueChange={setSetor}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEM">Sem setor</SelectItem>{Object.entries(SETORES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
        <Button onClick={salvar}><Plus className="h-4 w-4" />Cadastrar</Button>
      </div>}
      <div className="divide-y rounded-xl border bg-card">
        {data?.map((o) => (
          <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
            <div><span className="font-medium">{o.nome}</span> <span className="text-sm text-muted-foreground">— {o.cargo}</span>{o.demo && <Badge variant="outline" className="ml-2">demo</Badge>}</div>
            <div className="flex items-center gap-2"><Select value={o.setor ?? "SEM"} onValueChange={(v) => mudarSetor(o, v)} disabled={!gestor}><SelectTrigger className="h-8 w-48 text-xs" aria-label="Setor"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEM">Sem setor</SelectItem>{Object.entries(SETORES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            {!pode ? <span className="text-sm text-muted-foreground">{o.ativo ? "Ativo" : "Inativo"}</span> : <label className="flex items-center gap-2 text-sm">{o.ativo ? "Ativo" : "Inativo"}<Switch checked={o.ativo} onCheckedChange={() => alternar(o)} /><Button size="icon" variant="ghost" title="Excluir operador" onClick={() => { setDestino("NENHUM"); setExcluindo(o); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></label>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dados() {
  const invalidar = useInvalidar();
  async function exportar() {
    const tabelas = ["operadores", "empresas", "bancos", "demandas", "extratos", "historico"] as const;
    const out: Record<string, unknown> = { exportado_em: new Date().toISOString() };
    for (const t of tabelas) out[t] = (await supabase.from(t).select("*").limit(50000)).data;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `backup-extratos-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    toast.success("Backup exportado.");
  }
  async function importar(f: File) {
    try {
      const j = JSON.parse(await f.text());
      for (const t of ["operadores", "empresas", "bancos", "demandas", "extratos", "historico"] as const) {
        if (Array.isArray(j[t]) && j[t].length) {
          const { error } = await supabase.from(t).upsert(j[t], { onConflict: "id", ignoreDuplicates: true });
          if (error) throw error;
        }
      }
      await registrar({ tipo: null, acao: "BACKUP RESTAURADO", detalhe: f.name });
      toast.success("Backup importado (registros existentes foram mantidos)."); invalidar();
    } catch (e) { toast.error(`Falha ao importar: ${(e as Error).message}`); }
  }
  async function excluirTudo() {
    const { error } = await supabase.rpc("excluir_todos_dados");
    if (error) { toast.error(error.message); return; }
    await registrar({ tipo: null, acao: "TODOS OS DADOS EXCLUÍDOS", detalhe: "Exclusão total do sistema" });
    toast.success("Todos os dados do sistema foram excluídos."); invalidar();
  }
  return (
    <div className="max-w-xl space-y-3 rounded-xl border bg-card shadow-sm p-5">
      <p className="text-sm text-muted-foreground">Os dados ficam no servidor e são compartilhados por toda a equipe. O backup é uma cópia de segurança adicional.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportar}>Exportar backup</Button>
        <Button variant="outline" asChild><label className="cursor-pointer">Importar backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} /></label></Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 className="h-4 w-4" />Excluir todos os dados do sistema</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Excluir TODOS os dados?</AlertDialogTitle><AlertDialogDescription>Serão apagados empresas, bancos, cartões, operadores, competências, status, comentários e todo o histórico. Esta ação não pode ser desfeita. Exporte um backup antes, se precisar.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={excluirTudo}>Excluir tudo</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
