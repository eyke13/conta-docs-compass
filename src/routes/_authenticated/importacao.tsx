import { ImportarGrupos } from "@/components/importarGrupos";
import type { Json } from "@/integrations/supabase/types";
import { usuarioId } from "@/lib/acesso";
import { ehGestor } from "@/lib/acesso";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvalidar } from "@/components/extratos";
import { useCompetencia } from "@/lib/competencia";
import { autorAtual, chaveNome, registrar, type Tipo } from "@/lib/extratos";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Area = Tipo | "DOC";
const ROT_AREA: Record<Area, { itens: string; item: string }> = { BANCO: { itens: "Bancos", item: "Banco" }, CARTAO: { itens: "Cartões", item: "Cartão" }, DOC: { itens: "Cobrança de Documentação", item: "Empresa" } };
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/importacao")({
  head: () => ({ meta: [{ title: "Importação Excel — Controle Operacional Contábil" }, { name: "description", content: "Importe empresas e bancos por planilha." }, { property: "og:title", content: "Importação Excel — Controle Operacional Contábil" }, { property: "og:description", content: "Importe empresas e bancos por planilha." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { area?: Area } => (s["area"] === "DOC" || s["area"] === "BANCO" || s["area"] === "CARTAO" ? { area: s["area"] as Area } : {}),
  component: Importacao,
});

interface Previa { empresa: string; empresa_id: string | null; bancos: string[]; existe: boolean; novos: string[]; talento: string; talentoAntigo: string | null; regime: string; regimeAntigo: string | null }
interface ErroLinha { aba: string; linha: number; campo: string; motivo: string }

function norm(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim(); }

function Importacao() {
  if (!ehGestor()) return <p className="text-sm text-muted-foreground">A importação de empresas é exclusiva do Gestor.</p>;
  return <div className="space-y-6"><ImportacaoGestor /><ImportarGrupos /></div>;
}

function ImportacaoGestor() {
  const { competencia, tipo: tipoTopo } = useCompetencia();
  const { area: areaUrl } = Route.useSearch();
  const [tipo, setTipo] = useState<Area>(areaUrl ?? tipoTopo);
  const [modo, setModo] = useState<"ADICAO" | "SUBSTITUICAO" | "">("");
  const [confSubst, setConfSubst] = useState(false);
  const [mantidas, setMantidas] = useState<{ total: number; foraDaPlanilha: number }>({ total: 0, foraDaPlanilha: 0 });
  const R = ROT_AREA[tipo];
  const doc = tipo === "DOC";
  const invalidar = useInvalidar();
  const [previa, setPrevia] = useState<Previa[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [importando, setImportando] = useState(false);

  const [erros, setErros] = useState<ErroLinha[]>([]);

  async function ler(f: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer());
    const col2 = tipo === "BANCO" ? "BANCO" : "OPERADORA";
    const esperado = doc ? ["EMPRESA", "TALENTO", "REGIME"] : ["EMPRESA", col2, "TALENTO", "REGIME"];
    const nc = esperado.length;
    const rotCampos = esperado;
    const errs: ErroLinha[] = [];
    const mapa = new Map<string, { empresa: string; bancos: Map<string, string>; talento: string; regime: string; linha: string }>();
    const pares = new Map<string, string>();
    let abasLidas = 0;
    for (const nome of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, defval: "", blankrows: true });
      const vazia = (r: unknown[]) => r.every((c) => String(c ?? "").trim() === "");
      if (!rows.length || rows.every((r) => vazia(r as unknown[]))) continue;
      abasLidas++;
      const head = (rows[0] as unknown[]).map((h) => norm(String(h ?? "")));
      while (head.length && !head[head.length - 1]) head.pop();
      if (head.length !== nc || head.some((h, i) => h !== esperado[i])) {
        errs.push({ aba: nome, linha: 1, campo: "Cabeçalho", motivo: `As colunas devem ser exatamente ${rotCampos.join(" | ")}, nesta ordem. Encontrado: ${head.join(" | ") || "(vazio)"}.` });
        continue;
      }
      rows.slice(1).forEach((raw, i) => {
        const r = raw as unknown[];
        const linha = i + 2;
        if (vazia(r)) return;
        const lido = esperado.map((_, k) => String(r[k] ?? "").trim().replace(/\s+/g, " "));
        // DOC não tem coluna de item: usa a própria empresa como item para reaproveitar a validação
        const v = doc ? [lido[0]!, lido[0]!, lido[1]!, lido[2]!] : lido;
        if (r.slice(nc).some((c) => String(c ?? "").trim())) errs.push({ aba: nome, linha, campo: "—", motivo: `Há valores fora das ${nc} colunas permitidas.` });
        lido.forEach((x, k) => { if (!x) errs.push({ aba: nome, linha, campo: rotCampos[k]!, motivo: "Campo obrigatório vazio." }); });
        const reg = norm(v[3]!);
        if (v[3] && !["REAL", "PRESUMIDO", "SIMPLES"].includes(reg)) errs.push({ aba: nome, linha, campo: "REGIME", motivo: `"${v[3]}" não é aceito. Use somente REAL, PRESUMIDO ou SIMPLES.` });
        if (v.some((x) => !x)) return;
        const emp = v[0]!.toUpperCase();
        const k = chaveNome(emp);
        const par = `${k}|${chaveNome(v[1]!)}`;
        const ref = `aba "${nome}", linha ${linha}`;
        if (pares.has(par)) { errs.push({ aba: nome, linha, campo: "EMPRESA", motivo: doc ? `Empresa duplicada: "${emp}" já aparece na ${pares.get(par)}.` : `Empresa duplicada: "${emp}" com ${R.item.toLowerCase()} "${v[1]}" já aparece na ${pares.get(par)}.` }); return; }
        pares.set(par, ref);
        const item = mapa.get(k);
        if (item) {
          if (chaveNome(item.talento) !== chaveNome(v[2]!)) errs.push({ aba: nome, linha, campo: "TALENTO", motivo: `Empresa duplicada com talento diferente ("${item.talento}" na ${item.linha}).` });
          if (item.regime !== reg) errs.push({ aba: nome, linha, campo: "REGIME", motivo: `Empresa duplicada com regime diferente (${item.regime} na ${item.linha}).` });
          item.bancos.set(chaveNome(v[1]!), v[1]!);
        } else mapa.set(k, { empresa: emp, bancos: new Map([[chaveNome(v[1]!), v[1]!]]), talento: v[2]!, regime: reg, linha: ref });
      });
    }
    if (!abasLidas) errs.push({ aba: "—", linha: 0, campo: "—", motivo: "A planilha está vazia." });
    setArquivo(f.name);
    if (errs.length) { setErros(errs); toast.error(`Planilha inválida: ${errs.length} erro(s). Nada foi importado.`); return; }
    const [{ data: emps }, { data: bcs }] = await Promise.all([
      supabase.from("empresas").select("id,nome,talento_banco,talento_cartao,talento_doc,regime,cobranca,inativa_banco,inativa_cartao").limit(5000),
      supabase.from("bancos").select("empresa_id,nome").eq("tipo", doc ? "BANCO" : tipo).limit(20000),
    ]);
    // Empresas atuais da área (para o resumo de mantidas / inativadas)
    const naArea = new Set(doc ? (emps ?? []).filter((e) => e.cobranca).map((e) => e.id)
      : (bcs ?? []).map((b) => b.empresa_id).filter((id) => { const e = (emps ?? []).find((x) => x.id === id); return e && !(tipo === "BANCO" ? e.inativa_banco : e.inativa_cartao); }));
    const naPlanilha = new Set([...mapa.keys()].map((k) => (emps ?? []).find((e) => chaveNome(e.nome) === k)?.id).filter(Boolean));
    setMantidas({ total: naArea.size, foraDaPlanilha: [...naArea].filter((id) => !naPlanilha.has(id)).length });
    const empPorChave = new Map((emps ?? []).map((e) => [chaveNome(e.nome), e]));
    const bancosDe = new Map<string, Set<string>>();
    for (const b of bcs ?? []) { const s = bancosDe.get(b.empresa_id) ?? new Set(); s.add(chaveNome(b.nome)); bancosDe.set(b.empresa_id, s); }
    setPrevia([...mapa.entries()].map(([k, v]) => {
      const e = empPorChave.get(k);
      const tem = e ? bancosDe.get(e.id) ?? new Set<string>() : new Set<string>();
      const bancos = [...v.bancos.values()];
      const ant = e ? (tipo === "BANCO" ? e.talento_banco : tipo === "CARTAO" ? e.talento_cartao : e.talento_doc) ?? null : null;
      return {
        empresa: e?.nome ?? v.empresa, empresa_id: e?.id ?? null, talento: v.talento, talentoAntigo: ant && ant !== v.talento ? ant : null,
        regime: v.regime, regimeAntigo: e && e.regime !== v.regime ? e.regime ?? "—" : null,
        bancos: doc ? [] : bancos, existe: !!e, novos: doc ? [] : bancos.filter((b) => !tem.has(chaveNome(b))),
      };
    }));
  }

  async function confirmar() {
    setImportando(true);
    try {
      const origem = `importação ${arquivo}`;
      const { data, error } = await supabase.rpc("importar_planilha", {
        p_tipo: tipo, p_competencia: competencia, p_origem: origem, p_autor: await autorAtual(), ...(usuarioId() ? { p_autor_id: usuarioId() } : {}), p_modo: modo || "ADICAO",
        p_itens: previa.map((p) => ({ empresa_id: p.empresa_id, nome: p.empresa, talento: p.talento, regime: p.regime, novos: p.novos })) as unknown as Json,
      });
      if (error) throw error;
      const r = data as { novas: number; itens: number; inativadas: number };
      const modoTxt = modo === "SUBSTITUICAO" ? "Substituição" : "Adição";
      await registrar({ competencia, tipo: doc ? null : tipo, acao: "IMPORTAÇÃO EXCEL", detalhe: `${R.itens} (${modoTxt}) — ${arquivo}: ${r.novas} empresas novas${doc ? "" : `, ${r.itens} ${R.itens.toLowerCase()} novos`}${r.inativadas ? `, ${r.inativadas} inativadas` : ""}` });
      toast.success(`Importado (${modoTxt}): ${r.novas} empresas novas${doc ? "" : ` e ${r.itens} ${R.itens.toLowerCase()} novos`}${r.inativadas ? `; ${r.inativadas} empresas inativadas` : ""}.`);
      setPrevia([]); invalidar();
    } catch (e) { toast.error(`Importação cancelada, nada foi gravado: ${(e as Error).message}`); }
    setImportando(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Importação Excel</h1>
      <div className="max-w-3xl space-y-4 rounded-xl border bg-card p-5 text-sm shadow-sm">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Área da planilha</div>
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            {(["BANCO", "CARTAO", "DOC"] as const).map((a) => (
              <button key={a} onClick={() => { setTipo(a); setPrevia([]); setErros([]); }} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tipo === a ? "bg-card shadow-sm" : "text-muted-foreground")}>{ROT_AREA[a].itens}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Tipo de importação (obrigatório)</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["ADICAO", "Adição à base existente", "Mantém todas as empresas; adiciona as novas e atualiza as existentes. Nada é excluído."], ["SUBSTITUICAO", "Substituição da base", "A planilha vira a base correta da área: empresas fora dela ficam inativas (histórico e peculiaridades são mantidos)."]] as const).map(([v, t, d]) => (
              <button key={v} onClick={() => setModo(v)} className={cn("rounded-lg border p-3 text-left transition", modo === v ? "border-primary ring-1 ring-primary" : "hover:border-primary/40")}>
                <div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">{d}</div>
              </button>
            ))}
          </div>
        </div>
        <p>Colunas exatas na primeira linha, nesta ordem: <b>{doc ? "EMPRESA | TALENTO | REGIME" : `EMPRESA | ${tipo === "BANCO" ? "BANCO" : "OPERADORA"} | TALENTO | REGIME`}</b>. REGIME aceita REAL, PRESUMIDO ou SIMPLES. Havendo qualquer erro, nada é importado.</p>
        <p className="text-muted-foreground">As empresas são reconhecidas pelo nome e ficam no cadastro permanente, valendo para todas as competências sem nova importação.</p>
        <Button variant="outline" asChild disabled={!modo}>
          <label className={cn("cursor-pointer", !modo && "pointer-events-none opacity-50")}><Upload className="h-4 w-4" />Selecionar planilha (.xlsx, .xls, .csv)<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && (setPrevia([]), setErros([]), ler(e.target.files[0]).catch((err) => toast.error((err as Error).message || "Não foi possível ler a planilha.")), (e.target.value = ""))} /></label>
        </Button>
      </div>
      <AlertDialog open={confSubst} onOpenChange={setConfSubst}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Substituir a base de {R.itens}?</AlertDialogTitle>
            <AlertDialogDescription>Esta operação substituirá a base cadastral atual de {R.itens}. {mantidas.foraDaPlanilha} empresa(s) fora da planilha ficarão inativas nesta área a partir de {competencia.slice(5)}/{competencia.slice(0, 4)}. Meses anteriores, histórico e peculiaridades são preservados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { setConfSubst(false); confirmar(); }}>Substituir base</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {erros.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">Planilha <b>{arquivo}</b> inválida: {erros.length} erro(s). Nenhuma alteração foi feita. Corrija e selecione o arquivo novamente.</p>
          <div className="max-h-[60vh] overflow-auto rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead className="w-40">Aba</TableHead><TableHead className="w-20 text-right">Linha</TableHead><TableHead className="w-32">Campo</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
              <TableBody>{erros.map((e, i) => <TableRow key={i}><TableCell className="text-sm">{e.aba}</TableCell><TableCell className="text-right text-sm tabular-nums">{e.linha || "—"}</TableCell><TableCell className="text-sm font-medium">{e.campo}</TableCell><TableCell className="text-sm">{e.motivo}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      )}
      {previa.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-sm">Resumo de <b>{arquivo}</b> ({modo === "SUBSTITUICAO" ? "Substituição" : "Adição"}): <b>{previa.filter((p) => !p.existe).length}</b> a adicionar · <b>{previa.filter((p) => p.existe && (p.talentoAntigo || p.regimeAntigo || p.novos.length)).length}</b> a atualizar · <b>{modo === "SUBSTITUICAO" ? mantidas.total - mantidas.foraDaPlanilha : mantidas.total}</b> mantidas · <b>{modo === "SUBSTITUICAO" ? mantidas.foraDaPlanilha : 0}</b> a inativar{!doc && <> · {previa.reduce((s, p) => s + p.novos.length, 0)} {R.itens.toLowerCase()} novos</>}.</span>
            <Button onClick={() => (modo === "SUBSTITUICAO" ? setConfSubst(true) : confirmar())} disabled={importando}>{importando && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar importação</Button>
            <Button variant="ghost" onClick={() => setPrevia([])}>Cancelar</Button>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Talento</TableHead><TableHead>Regime</TableHead><TableHead>Situação</TableHead>{!doc && <><TableHead>{R.itens} novos</TableHead><TableHead>Já cadastrados</TableHead></>}</TableRow></TableHeader>
              <TableBody>{previa.map((p) => <TableRow key={p.empresa}><TableCell className="font-medium">{p.empresa}</TableCell><TableCell className="text-sm">{p.talentoAntigo ? <span><s className="text-muted-foreground">{p.talentoAntigo}</s> → <b>{p.talento}</b></span> : p.talento || "—"}</TableCell><TableCell className="text-sm">{p.regimeAntigo ? <span><s className="text-muted-foreground">{p.regimeAntigo}</s> → <b>{p.regime}</b></span> : p.regime}</TableCell><TableCell className="text-sm">{p.existe ? "Já cadastrada" : "Nova"}</TableCell>{!doc && <><TableCell className="text-sm font-medium">{p.novos.join(", ") || "—"}</TableCell><TableCell className="text-sm text-muted-foreground">{p.bancos.filter((b) => !p.novos.includes(b)).join(", ") || "—"}</TableCell></>}</TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
