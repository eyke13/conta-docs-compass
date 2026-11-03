import { chaveNome, setorDoRegime, type EmpresaLinha, type Operador, type Setor } from "./extratos";

/** Desequilíbrio tolerado em relação à meta da célula antes de mostrar o aviso (0.15 = 15%). */
export const TOLERANCIA_DESEQUILIBRIO = 0.15;

/** Unidade de distribuição da Cobrança: padrinho dentro da célula (empresa sem padrinho é uma unidade própria). */
export interface UnidadeCob {
  chave: string; celula: Setor; talento: string | null; empresas: EmpresaLinha[]; n: number;
  porOp: Map<string | null, number>; atual: string | null;
}

export function chaveUnidade(l: Pick<EmpresaLinha, "empresa_id" | "talento" | "regime">): string | null {
  const cel = setorDoRegime(l.regime);
  if (!cel) return null;
  const t = l.talento ? chaveNome(l.talento) : "";
  return `${cel}|${t ? `T:${t}` : `E:${l.empresa_id}`}`;
}

/** Agrupa as linhas em unidades; empresas sem regime ficam de fora (sem célula). */
export function unidadesCob(linhas: EmpresaLinha[]) {
  const m = new Map<string, UnidadeCob>();
  const semRegime: EmpresaLinha[] = [];
  for (const l of linhas) {
    const chave = chaveUnidade(l);
    if (!chave) { semRegime.push(l); continue; }
    const u = m.get(chave) ?? { chave, celula: setorDoRegime(l.regime)!, talento: l.talento, empresas: [], n: 0, porOp: new Map(), atual: null };
    (u.empresas as EmpresaLinha[]).push(l); u.n++;
    u.porOp.set(l.operador_id, (u.porOp.get(l.operador_id) ?? 0) + 1);
    m.set(chave, u);
  }
  for (const u of m.values()) {
    let best: string | null = null, bn = -1;
    for (const [op, n] of u.porOp) if (op && n > bn) { best = op; bn = n; }
    u.atual = best;
  }
  return { unidades: [...m.values()], semRegime };
}

export const nomeUnidade = (u: UnidadeCob) => u.talento ?? u.empresas[0]?.empresa_nome ?? "—";
export const opsDaUnidade = (u: UnidadeCob) => [...u.porOp.keys()];
export const dividida = (u: UnidadeCob) => [...u.porOp.keys()].filter(Boolean).length > 1 || (u.porOp.has(null) && u.porOp.size > 1);

export const elegiveis = (ops: Operador[], cel: Setor) => ops.filter((o) => o.ativo && o.setor === cel);

/** Carga = número de empresas do operador na célula. */
export function cargaPorOp(unidades: UnidadeCob[]) {
  const c = new Map<string, number>();
  for (const u of unidades) for (const [op, n] of u.porOp) if (op) c.set(op, (c.get(op) ?? 0) + n);
  return c;
}

export type ModoRedist = "MINIMO" | "ZERO";

/** Equilibra as unidades de uma célula entre os participantes (ver regra 3.2/3.3). */
export function equilibrar(unidades: UnidadeCob[], participantes: string[], modo: ModoRedist) {
  const plano = new Map<string, string>();
  const carga = new Map(participantes.map((p) => [p, 0]));
  const total = unidades.reduce((s, u) => s + u.n, 0);
  const meta = participantes.length ? total / participantes.length : 0;
  if (!participantes.length) return { plano, carga, meta };
  const part = new Set(participantes);
  const pool: UnidadeCob[] = [];
  for (const u of unidades) {
    if (modo === "MINIMO" && u.atual && part.has(u.atual)) { plano.set(u.chave, u.atual); carga.set(u.atual, carga.get(u.atual)! + u.n); }
    else pool.push(u);
  }
  for (const u of pool.sort((a, b) => b.n - a.n)) {
    let melhor = participantes[0]!;
    for (const p of participantes) {
      const cp = carga.get(p)!, cm = carga.get(melhor)!;
      if (cp < cm || (cp === cm && p === u.atual)) melhor = p;
    }
    plano.set(u.chave, melhor); carga.set(melhor, carga.get(melhor)! + u.n);
  }
  const custo = (a: number, b: number) => Math.abs(a - meta) + Math.abs(b - meta);
  for (let it = 0; it < 5000; it++) {
    let max = participantes[0]!, min = participantes[0]!;
    for (const p of participantes) { if (carga.get(p)! > carga.get(max)!) max = p; if (carga.get(p)! < carga.get(min)!) min = p; }
    const cMax = carga.get(max)!, cMin = carga.get(min)!;
    if (max === min || cMax - cMin <= 1) break;
    const atualCusto = custo(cMax, cMin);
    const doMax = unidades.filter((u) => plano.get(u.chave) === max);
    const doMin = unidades.filter((u) => plano.get(u.chave) === min);
    let best: { custo: number; mover: UnidadeCob; voltar?: UnidadeCob | undefined } | null = null;
    const tentar = (d: number, mover: UnidadeCob, voltar?: UnidadeCob) => {
      if (d <= 0 || cMin + d >= cMax) return;
      const c = custo(cMax - d, cMin + d);
      if (c < atualCusto - 1e-9 && (!best || c < best.custo)) best = { custo: c, mover, voltar };
    };
    for (const u of doMax) { tentar(u.n, u); for (const v of doMin) if (v.n < u.n) tentar(u.n - v.n, u, v); }
    if (!best) break;
    const b = best as { custo: number; mover: UnidadeCob; voltar?: UnidadeCob | undefined };
    const d = b.mover.n - (b.voltar?.n ?? 0);
    plano.set(b.mover.chave, min); if (b.voltar) plano.set(b.voltar.chave, max);
    carga.set(max, cMax - d); carga.set(min, cMin + d);
  }
  return { plano, carga, meta };
}

/** Operador proposto para unificar uma unidade dividida: o que tem mais empresas; em empate, o de menor carga. */
export function propostaUnificacao(u: UnidadeCob, carga: Map<string, number>, ops: Operador[]) {
  const eleg = new Set(elegiveis(ops, u.celula).map((o) => o.id));
  const cands = [...u.porOp.entries()].filter(([op]) => op && eleg.has(op)) as [string, number][];
  cands.sort((a, b) => b[1] - a[1] || (carga.get(a[0]) ?? 0) - (carga.get(b[0]) ?? 0));
  return cands[0]?.[0] ?? null;
}
