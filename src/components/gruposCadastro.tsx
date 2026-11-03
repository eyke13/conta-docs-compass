import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ehGestor } from "@/lib/acesso";
import { autorAtual, chaveNome, registrar } from "@/lib/extratos";
import { codigoEmpresa, db, QK_GRUPOS_SIT } from "@/lib/grupos";

interface G { id: string; nome: string; chave: string; ignorar: boolean }
interface GE { codigo: number; grupo_id: string; razao_social: string | null }

export function GruposCadastro() {
  const qc = useQueryClient();
  const gestor = ehGestor();
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const { data } = useQuery({
    queryKey: ["grupos-cad"],
    queryFn: async () => {
      const [g, ge, e] = await Promise.all([db.from("grupos").select("*"), db.from("grupo_empresas").select("codigo,grupo_id,razao_social").limit(10000), supabase.from("empresas").select("nome").limit(10000)]);
      if (g.error) throw g.error;
      const nomePorCod = new Map<number, string>();
      for (const x of e.data ?? []) { const c = codigoEmpresa(x.nome); if (c != null && !nomePorCod.has(c)) nomePorCod.set(c, x.nome); }
      return { grupos: ((g.data ?? []) as G[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })), itens: (ge.data ?? []) as GE[], nomePorCod };
    },
  });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["grupos-cad"] }); qc.invalidateQueries({ queryKey: QK_GRUPOS_SIT }); };
  async function exec(acao: string, detalhe: string, f: () => Promise<{ error: unknown }>) {
    const { error } = await f();
    if (error) { toast.error((error as Error).message ?? "Erro"); return; }
    await registrar({ acao, detalhe, tipo: null } as never);
    toast.success("Alteração salva."); atualizar();
  }
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const { grupos, itens, nomePorCod } = data;
  const lista = grupos.filter((g) => !busca || g.nome.toLowerCase().includes(busca.toLowerCase()));
  const rot = (c: number) => nomePorCod.get(c) ?? `${c} (sem empresa no sistema)`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><Input className="w-full sm:w-64" placeholder="Pesquisar grupo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="text-sm text-muted-foreground">{grupos.length} grupos{!gestor && " · somente leitura"}</span></div>
      <div className="divide-y rounded-xl border bg-card">
        {lista.map((g) => {
          const membros = itens.filter((i) => i.grupo_id === g.id).sort((a, b) => a.codigo - b.codigo);
          return (
            <div key={g.id} className="px-4 py-2">
              <button className="flex w-full items-center gap-2 text-left" onClick={() => setAberto(aberto === g.id ? null : g.id)}>
                <Building2 className="h-4 w-4 text-primary" /><span className="font-medium">{g.nome}</span>
                <span className="text-xs text-muted-foreground">{membros.length} empresa(s)</span>{g.ignorar && <Badge variant="outline">Ignorado</Badge>}
              </button>
              {aberto === g.id && <Detalhe g={g} membros={membros} grupos={grupos} rot={rot} gestor={gestor} exec={exec} />}
            </div>
          );
        })}
        {!lista.length && <p className="p-4 text-sm text-muted-foreground">Nenhum grupo. Importe a planilha em Importação.</p>}
      </div>
    </div>
  );
}

function Detalhe({ g, membros, grupos, rot, gestor, exec }: { g: G; membros: GE[]; grupos: G[]; rot: (c: number) => string; gestor: boolean; exec: (a: string, d: string, f: () => Promise<{ error: unknown }>) => Promise<void> }) {
  const [nome, setNome] = useState(g.nome);
  const [uniao, setUniao] = useState("");
  const [cod, setCod] = useState("");
  const outros = grupos.filter((x) => x.id !== g.id);
  return (
    <div className="mt-2 space-y-3 pl-6 text-sm">
      <ul className="space-y-1">
        {membros.map((m) => (
          <li key={m.codigo} className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate">{rot(m.codigo)}</span>
            {gestor && <>
              <Select onValueChange={(v) => exec("EMPRESA MOVIDA DE GRUPO", `${m.codigo}: ${g.nome} → ${grupos.find((x) => x.id === v)?.nome}`, async () => db.from("grupo_empresas").update({ grupo_id: v, atualizado_em: new Date().toISOString(), atualizado_por: await autorAtual() }).eq("codigo", m.codigo))}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Mover para…" /></SelectTrigger>
                <SelectContent>{outros.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => exec("EMPRESA REMOVIDA DO GRUPO", `${m.codigo} saiu de ${g.nome}`, () => db.from("grupo_empresas").delete().eq("codigo", m.codigo))}>Remover</Button>
            </>}
          </li>
        ))}
      </ul>
      {gestor && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input className="h-8 w-56" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!nome.trim() || nome === g.nome} onClick={() => exec("GRUPO RENOMEADO", `${g.nome} → ${nome.trim()}`, () => db.from("grupos").update({ nome: nome.trim(), chave: chaveNome(nome), atualizado_em: new Date().toISOString() }).eq("id", g.id))}>Renomear</Button>
          <Button size="sm" variant="outline" onClick={() => exec(g.ignorar ? "GRUPO REATIVADO" : "GRUPO IGNORADO", g.nome, () => db.from("grupos").update({ ignorar: !g.ignorar, atualizado_em: new Date().toISOString() }).eq("id", g.id))}>{g.ignorar ? "Desmarcar ignorar" : "Marcar como não é grupo"}</Button>
          <Select value={uniao} onValueChange={setUniao}><SelectTrigger className="h-8 w-48"><SelectValue placeholder="Unir com o grupo…" /></SelectTrigger>
            <SelectContent>{outros.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" disabled={!uniao} onClick={() => exec("GRUPOS UNIDOS", `${grupos.find((x) => x.id === uniao)?.nome} → ${g.nome}`, async () => {
            const r = await db.from("grupo_empresas").update({ grupo_id: g.id }).eq("grupo_id", uniao);
            return r.error ? r : db.from("grupos").delete().eq("id", uniao);
          })}>Unir</Button>
          <Input className="h-8 w-28" placeholder="Código" value={cod} onChange={(e) => setCod(e.target.value.replace(/\D/g, ""))} />
          <Button size="sm" variant="outline" disabled={!cod} onClick={async () => { const autor = await autorAtual(); await exec("EMPRESA INCLUÍDA NO GRUPO", `${cod} → ${g.nome}`, () => db.from("grupo_empresas").upsert({ codigo: Number(cod), grupo_id: g.id, atualizado_em: new Date().toISOString(), atualizado_por: autor })); setCod(""); }}>Incluir pelo código</Button>
        </div>
      )}
    </div>
  );
}
