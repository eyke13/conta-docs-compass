import { describe, expect, test } from "vitest";
import { competenciasPeriodo, progressoConciliacao, situacaoCompetencia } from "./progressoConciliacao";

const anual = { comp_inicio: "2026-01", comp_fim: "2026-12", meses_conciliados: {} as Record<string, boolean> };
describe("progresso mensal", () => {
  test("12 meses começam com 0 conciliados e 12 em conciliação", () => {
    expect(competenciasPeriodo(anual)).toHaveLength(12);
    expect(progressoConciliacao(anual)).toEqual({ total: 12, conciliados: 0, andamento: 12, percentual: 0 });
  });
  test("4 de 12 meses produzem 33,33%", () => {
    const c = { ...anual, meses_conciliados: { "2026-01": true, "2026-02": true, "2026-03": true, "2026-04": true } };
    expect(progressoConciliacao(c)).toEqual({ total: 12, conciliados: 4, andamento: 8, percentual: 33.33 });
  });
  test("um mês marcado não altera os outros nem duplica contagens", () => {
    const c = { ...anual, meses_conciliados: { "2026-01": true, "2027-01": true } };
    expect(situacaoCompetencia(c, "2026-01")).toBe("CONCILIADO");
    expect(situacaoCompetencia(c, "2026-02")).toBe("ANDAMENTO");
    expect(progressoConciliacao(c).conciliados).toBe(1);
  });
  test("100% somente quando todos os meses estão conciliados", () => {
    const c = { ...anual, meses_conciliados: Object.fromEntries(competenciasPeriodo(anual).map((m) => [m, true])) };
    expect(progressoConciliacao(c).percentual).toBe(100);
    c.meses_conciliados["2026-08"] = false;
    expect(progressoConciliacao(c)).toEqual({ total: 12, conciliados: 11, andamento: 1, percentual: 91.67 });
  });
  test("períodos entre anos mantêm todos os meses", () => {
    expect(competenciasPeriodo({ comp_inicio: "2025-08", comp_fim: "2026-09" })).toHaveLength(14);
  });
});