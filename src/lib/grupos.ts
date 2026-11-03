import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: object) => any };

export type CelulaGrupo = "COBRANCA" | "BC";
export interface SitGrupo {
  grupo_id: string; grupo_nome: string; empresa_id: string; codigo: number; empresa_nome: string;
  talento: string | null; operador_id: string | null; operador_nome: string | null; tipo: string; status: string;
}
export interface InfoGrupo { id: string; nome: string; membros: SitGrupo[]; operadores: Set<string | null>; dividido: boolean }

/** Código ERP: número no início do nome ("1527 - EMPRESA"). */
export function codigoEmpresa(nome: string): number | null {
  const m = /^\s*(\d+)\s*-/.exec(nome);
  return m ? Number(m[1]) : null;
}

export const QK_GRUPOS_SIT = ["grupos-sit"] as const;

/** Situação dos grupos na carteira inteira da célula (não depende dos filtros da tela). */
export function useGruposSituacao(competencia: string, celula: CelulaGrupo, tipo?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`grp-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: celula === "COBRANCA" ? "cobrancas" : "demandas" }, () => qc.invalidateQueries({ queryKey: QK_GRUPOS_SIT }))
      .on("postgres_changes", { event: "*", schema: "public", table: "grupo_empresas" }, () => qc.invalidateQueries({ queryKey: QK_GRUPOS_SIT }))
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos" }, () => qc.invalidateQueries({ queryKey: QK_GRUPOS_SIT }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, celula]);
  return useQuery({
    queryKey: [...QK_GRUPOS_SIT, competencia, celula, tipo ?? ""],
    queryFn: async () => {
      const { data, error } = await db.rpc("grupos_situacao", { p_competencia: competencia, p_celula: celula });
      if (error) throw error;
      let rows = (data ?? []) as SitGrupo[];
      if (tipo) rows = rows.filter((r) => r.tipo === tipo);
      const grupos = new Map<string, InfoGrupo>();
      for (const r of rows) {
        const g = grupos.get(r.grupo_id) ?? { id: r.grupo_id, nome: r.grupo_nome, membros: [], operadores: new Set(), dividido: false };
        g.membros.push(r); g.operadores.add(r.operador_id); grupos.set(r.grupo_id, g);
      }
      const porEmpresa = new Map<string, InfoGrupo>();
      for (const g of grupos.values()) {
        g.membros.sort((a, b) => a.codigo - b.codigo);
        g.dividido = g.membros.length > 1 && (g.operadores.size > 1);
        if (g.membros.length > 1) for (const m of g.membros) porEmpresa.set(m.empresa_id, g);
      }
      return { grupos: [...grupos.values()].filter((g) => g.membros.length > 1).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })), porEmpresa };
    },
  });
}

const fmtLista = (xs: string[]) => new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(xs);
export const rotEmp = (m: SitGrupo) => m.empresa_nome;
export function listaCurta(ms: SitGrupo[], max = 5) {
  const nomes = ms.map(rotEmp);
  return nomes.length > max ? `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}` : fmtLista(nomes);
}
export const listaLonga = (ms: SitGrupo[]) => fmtLista(ms.map(rotEmp));

export function meusDoGrupo(g: InfoGrupo, eu: string) { return eu ? g.membros.filter((m) => m.operador_id === eu) : []; }

/** Frases do aviso laranja, relativas ao operador da empresa da linha. */
export function frasesDivisao(g: InfoGrupo, opLinha: string | null, curta: boolean) {
  const L = curta ? listaCurta : listaLonga;
  const frases = [`Esta empresa faz parte do grupo ${g.nome}.`];
  const porOp = new Map<string, SitGrupo[]>();
  const sem: SitGrupo[] = [];
  for (const m of g.membros) {
    if (!m.operador_id) { sem.push(m); continue; }
    if (m.operador_id === opLinha) continue;
    porOp.set(m.operador_id, [...(porOp.get(m.operador_id) ?? []), m]);
  }
  for (const ms of porOp.values()) {
    const n = ms[0]!.operador_nome ?? "Outro operador";
    frases.push(`${n} está responsável por ${L(ms)}. Alinhe com ${n} a cobrança deste grupo.`);
  }
  if (sem.length && opLinha) frases.push(`${sem.length} ${sem.length === 1 ? "empresa do grupo está" : "empresas do grupo estão"} sem operador: ${L(sem)}.`);
  return frases;
}

/**
 * Ordena mantendo os segmentos (padrinho) e, dentro de cada um, puxa os membros do mesmo grupo
 * para junto: o bloco entra no menor código do grupo naquele segmento.
 */
export function ordenarPorGrupo<T>(itens: T[], segmento: (x: T) => string, nome: (x: T) => string, id: (x: T) => string, porEmpresa: Map<string, InfoGrupo> | undefined): T[] {
  const segs = new Map<string, T[]>();
  for (const x of itens) { const k = segmento(x); segs.set(k, [...(segs.get(k) ?? []), x]); }
  const out: T[] = [];
  for (const arr of segs.values()) {
    const cod = (x: T) => codigoEmpresa(nome(x)) ?? Number.MAX_SAFE_INTEGER;
    const minGrupo = new Map<string, number>();
    for (const x of arr) { const g = porEmpresa?.get(id(x)); if (g) minGrupo.set(g.id, Math.min(minGrupo.get(g.id) ?? Infinity, cod(x))); }
    const chave = (x: T) => { const g = porEmpresa?.get(id(x)); return g ? minGrupo.get(g.id)! : cod(x); };
    out.push(...[...arr].sort((a, b) => chave(a) - chave(b) || (porEmpresa?.get(id(a))?.id ?? "").localeCompare(porEmpresa?.get(id(b))?.id ?? "") || cod(a) - cod(b) || nome(a).localeCompare(nome(b), "pt-BR", { numeric: true, sensitivity: "base" })));
  }
  return out;
}

export type FiltroGrupo = string; // TODOS | COM | DIV | MEU | <grupo_id>
export function passaFiltroGrupo(f: FiltroGrupo, empresaId: string, porEmpresa: Map<string, InfoGrupo> | undefined, eu: string) {
  if (f === "TODOS") return true;
  const g = porEmpresa?.get(empresaId);
  if (!g) return false;
  if (f === "COM") return true;
  if (f === "DIV") return g.dividido;
  if (f === "MEU") return meusDoGrupo(g, eu).length > 1;
  return g.id === f;
}
