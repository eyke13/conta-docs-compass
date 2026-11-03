export type PeriodoMensal = { comp_inicio: string; comp_fim: string; meses_conciliados: Record<string, boolean> };

export function competenciasPeriodo(c: Pick<PeriodoMensal, "comp_inicio" | "comp_fim">): string[] {
  const indice = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
  const meses: string[] = [];
  for (let i = indice(c.comp_inicio); i <= indice(c.comp_fim); i++) {
    meses.push(`${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`);
  }
  return meses;
}

export function progressoConciliacao(c: PeriodoMensal) {
  const meses = competenciasPeriodo(c);
  const conciliados = meses.filter((m) => c.meses_conciliados[m] === true).length;
  const total = meses.length;
  return { total, conciliados, andamento: total - conciliados, percentual: total ? Math.round(conciliados / total * 10000) / 100 : 0 };
}

export function situacaoCompetencia(c: PeriodoMensal, mes: string): "CONCILIADO" | "ANDAMENTO" {
  return c.meses_conciliados[mes] === true ? "CONCILIADO" : "ANDAMENTO";
}