import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { usuarioId } from "@/lib/acesso";
import { autorAtual, chaveNome } from "@/lib/extratos";
import { codigoEmpresa, db, QK_GRUPOS_SIT } from "@/lib/grupos";

const CAB = ["GRUPO", "CODIGOERP", "NOMEFANTASIA", "RAZAOSOCIAL", "APELIDO"];

function decodificar(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder("utf-8").decode(b.subarray(3));
  return new TextDecoder("windows-1252").decode(b);
}
function linhaCsv(l: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i]!;
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ";") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((x) => x.trim());
}

interface Item { codigo: number; chave: string; razao: string; fantasia: string; apelido: string }
interface Previa {
  total: number; comGrupo: number; semGrupo: number;
  grupos: { chave: string; nome: string; variantes: string[]; n: number }[];
  descartadas: { linha: number; codigo: string; motivo: string }[];
  semEmpresa: number[]; empresasSemCodigo: string[];
  novos: string[]; removidos: string[]; mudaram: { codigo: number; de: string; para: string }[];
  razaoAvisos: string[]; itens: Item[];
}

export function ImportarGrupos() {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [arquivo, setArquivo] = useState("");
  const [aplicando, setAplicando] = useState(false);

  async function ler(f: File) {
    setArquivo(f.name); setPrevia(null);
    const linhas = decodificar(await f.arrayBuffer()).split(/\r?\n/);
    const cab = linhaCsv(linhas[0] ?? "").map((c) => chaveNome(c).replace(/\s/g, ""));
    if (CAB.some((c, i) => cab[i] !== c)) { toast.error("Cabeçalho inválido. Esperado: Grupo;CodigoERP;NomeFantasia;RazaoSocial;Apelido"); return; }
    const vistos = new Set<number>(); const descartadas: Previa["descartadas"] = []; const itens: Item[] = [];
    const varMap = new Map<string, Map<string, number>>();
    let total = 0, semGrupo = 0;
    const razoes = new Map<string, Set<string>>();
    linhas.slice(1).forEach((raw, idx) => {
      if (!raw.trim()) return;
      total++;
      const [grupo = "", cod = "", fantasia = "", razao = "", apelido = ""] = linhaCsv(raw);
      const n = /^\d+$/.test(cod) ? Number(cod) : NaN;
      if (cod === "" || Number.isNaN(n)) { descartadas.push({ linha: idx + 2, codigo: cod, motivo: "Código vazio ou não numérico" }); return; }
      if (n === 0) { descartadas.push({ linha: idx + 2, codigo: cod, motivo: "Código 0" }); return; }
      if (vistos.has(n)) { descartadas.push({ linha: idx + 2, codigo: cod, motivo: "Código repetido na planilha" }); return; }
      vistos.add(n);
      const rk = chaveNome(razao);
      if (rk) razoes.set(rk, (razoes.get(rk) ?? new Set()).add(grupo ? chaveNome(grupo) : "(sem grupo)"));
      if (!grupo) { semGrupo++; return; }
      const ch = chaveNome(grupo);
      const vm = varMap.get(ch) ?? new Map(); vm.set(grupo, (vm.get(grupo) ?? 0) + 1); varMap.set(ch, vm);
      itens.push({ codigo: n, chave: ch, razao, fantasia, apelido });
    });
    const grupos = [...varMap.entries()].map(([chave, vm]) => {
      const vs = [...vm.entries()].sort((a, b) => b[1] - a[1]);
      return { chave, nome: vs[0]![0], variantes: vs.map((v) => v[0]), n: [...vm.values()].reduce((s, x) => s + x, 0) };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    const [{ data: emps }, { data: atuais }, { data: gs }] = await Promise.all([
      supabase.from("empresas").select("nome").limit(10000),
      db.from("grupo_empresas").select("codigo,grupo_id").limit(10000),
      db.from("grupos").select("id,nome,chave"),
    ]);
    const codigosSist = new Set<number>(); const semCod = new Set<string>();
    for (const e of emps ?? []) { const c = codigoEmpresa(e.nome); if (c == null) semCod.add(e.nome); else codigosSist.add(c); }
    const gPorId = new Map<string, { nome: string; chave: string }>(((gs ?? []) as { id: string; nome: string; chave: string }[]).map((g) => [g.id, g]));
    const chavesAnt = new Set([...gPorId.values()].map((g) => g.chave));
    const chavesNov = new Set(grupos.map((g) => g.chave));
    const antPorCod = new Map<number, string>(((atuais ?? []) as { codigo: number; grupo_id: string }[]).map((a) => [a.codigo, gPorId.get(a.grupo_id)?.chave ?? ""]));
    const nomeCh = (ch: string) => grupos.find((g) => g.chave === ch)?.nome ?? [...gPorId.values()].find((g) => g.chave === ch)?.nome ?? "Sem grupo";
    const mudaram: Previa["mudaram"] = [];
    if (antPorCod.size) {
      const novoPorCod = new Map(itens.map((i) => [i.codigo, i.chave]));
      for (const c of new Set([...antPorCod.keys(), ...novoPorCod.keys()])) {
        const a = antPorCod.get(c), b = novoPorCod.get(c);
        if (a && a !== b) mudaram.push({ codigo: c, de: nomeCh(a), para: b ? nomeCh(b) : "Sem grupo" });
        else if (!a && b && antPorCod.size) mudaram.push({ codigo: c, de: "Sem grupo", para: nomeCh(b) });
      }
    }
    const razaoAvisos = [...razoes.entries()].filter(([, s]) => s.size > 1).map(([r, s]) => `${r}: ${[...s].map((x) => x === "(sem grupo)" ? x : nomeCh(x)).join(" / ")}`);
    setNomes(Object.fromEntries(grupos.map((g) => [g.chave, g.nome])));
    setPrevia({
      total, comGrupo: itens.length, semGrupo, grupos, descartadas, itens,
      semEmpresa: itens.map((i) => i.codigo).filter((c) => !codigosSist.has(c)).sort((a, b) => a - b),
      empresasSemCodigo: [...semCod].sort(),
      novos: grupos.filter((g) => !chavesAnt.has(g.chave)).map((g) => g.nome),
      removidos: [...gPorId.values()].filter((g) => !chavesNov.has(g.chave)).map((g) => g.nome),
      mudaram: mudaram.sort((a, b) => a.codigo - b.codigo), razaoAvisos,
    });
  }

  async function aplicar() {
    if (!previa) return;
    setAplicando(true);
    try {
      const autor = await autorAtual();
      const { data, error } = await db.rpc("importar_grupos", {
        p_grupos: previa.grupos.map((g) => ({ chave: g.chave, nome: (nomes[g.chave] ?? g.nome).trim() || g.nome })),
        p_itens: previa.itens, p_autor: autor, p_autor_id: usuarioId() || null,
      });
      if (error) throw error;
      toast.success(`Grupos importados: ${data.grupos} grupos, ${data.empresas} empresas.`);
      setPrevia(null); setArquivo("");
      qc.invalidateQueries({ queryKey: QK_GRUPOS_SIT }); qc.invalidateQueries({ queryKey: ["grupos-cad"] });
    } catch (e) { toast.error((e as Error).message); } finally { setAplicando(false); }
  }

  const Lista = ({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio: string }) => (
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{titulo} ({itens.length})</summary>
      {itens.length ? <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-muted-foreground">{itens.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="mt-2 text-muted-foreground">{vazio}</p>}
    </details>
  );

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div><h2 className="text-lg font-semibold">Importar grupos de empresas</h2>
        <p className="text-sm text-muted-foreground">Arquivo .csv separado por ";" com as colunas Grupo;CodigoERP;NomeFantasia;RazaoSocial;Apelido. A importação substitui todos os grupos e não muda a distribuição das carteiras.</p></div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
        <Upload className="h-4 w-4" />{arquivo || "Escolher arquivo .csv"}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = ""; }} />
      </label>
      {previa && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            {[["Linhas", previa.total], ["Empresas com grupo", previa.comGrupo], ["Empresas sem grupo", previa.semGrupo], ["Grupos", previa.grupos.length]].map(([r, n]) => (
              <div key={r} className="rounded-lg border px-3 py-2"><div className="text-xs text-muted-foreground">{r}</div><div className="text-lg font-semibold">{n}</div></div>
            ))}
          </div>
          <details className="rounded-lg border p-3 text-sm" open={previa.grupos.some((g) => g.variantes.length > 1)}>
            <summary className="cursor-pointer font-medium">Variações de grafia unidas ({previa.grupos.filter((g) => g.variantes.length > 1).length})</summary>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {previa.grupos.filter((g) => g.variantes.length > 1).map((g) => (
                <div key={g.chave} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]"><span className="text-muted-foreground">{g.variantes.join(" · ")}</span>
                  <Input className="h-8" value={nomes[g.chave] ?? ""} onChange={(e) => setNomes((s) => ({ ...s, [g.chave]: e.target.value }))} /></div>
              ))}
            </div>
          </details>
          <Lista titulo="Linhas descartadas" itens={previa.descartadas.map((d) => `Linha ${d.linha} · código "${d.codigo}" · ${d.motivo}`)} vazio="Nenhuma." />
          <Lista titulo="Códigos da planilha sem empresa no sistema (ficam gravados)" itens={previa.semEmpresa.map(String)} vazio="Nenhum." />
          <Lista titulo="Empresas do sistema sem código no nome (não entram em grupo)" itens={previa.empresasSemCodigo} vazio="Nenhuma." />
          <Lista titulo="Grupos com uma só empresa (importados, sem agrupamento)" itens={previa.grupos.filter((g) => g.n === 1).map((g) => g.nome)} vazio="Nenhum." />
          <Lista titulo="Grupos novos" itens={previa.novos} vazio="Nenhum." />
          <Lista titulo="Grupos removidos" itens={previa.removidos} vazio="Nenhum." />
          <Lista titulo="Empresas que mudaram de grupo" itens={previa.mudaram.map((m) => `${m.codigo}: ${m.de} → ${m.para}`)} vazio="Nenhuma." />
          <Lista titulo="Avisos: mesma razão social em grupos diferentes ou com e sem grupo" itens={previa.razaoAvisos} vazio="Nenhum." />
          <div className="flex gap-2"><Button onClick={aplicar} disabled={aplicando}>{aplicando && <Loader2 className="h-4 w-4 animate-spin" />}Aplicar importação</Button><Button variant="outline" onClick={() => { setPrevia(null); setArquivo(""); }}>Cancelar</Button></div>
        </div>
      )}
    </section>
  );
}
