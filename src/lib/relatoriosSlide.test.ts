import { describe, expect, it } from "vitest";
import { codigoEmpresa, diaPadrao, montarSlide, nomeSemCodigo } from "./relatoriosSlide";
import type { DadosRelatorios } from "./relatorios";

const base = {
  empresas: [{ id: "e1", nome: "1516 - ONEVO ENERGIA LTDA", talento_doc: "Arthur Nascimento" }, { id: "e2", nome: "2 - A B COMPUTACAO", talento_doc: "" }],
  operadores: [], demandas: [], extratos: [], historico: [], peculiaridades: [],
  cobrancas: [
    { empresa_id: "e2", competencia: "2026-11", status: "RECEBIDO", movimentado_em: "2026-11-02T12:00:00Z" },
    { empresa_id: "e1", competencia: "2026-11", status: "RECEBIDO", movimentado_em: "2026-11-09T12:00:00Z" },
    { empresa_id: "e1", competencia: "2026-11", status: "PENDENTE", movimentado_em: "2026-11-02T12:00:00Z" },
  ],
  conciliacoes: [{ id: "c1", empresa_id: "e1", empresa_nome: "1516 - ONEVO ENERGIA LTDA" }],
  alteracoes: [
    { conciliacao_id: "c1", competencia: "2026-10", conciliado: true, criado_em: "2026-11-02T12:00:00Z" },
    { conciliacao_id: "c1", competencia: "2026-10", conciliado: false, criado_em: "2026-11-02T13:00:00Z" },
    { conciliacao_id: "c1", competencia: "2026-10", conciliado: true, criado_em: "2026-11-05T12:00:00Z" },
  ],
  movimentos: [],
  contatos: [
    { empresa_id: "e1", competencia: "2026-11", canal: "WHATSAPP", criado_em: "2026-11-01T12:00:00Z" },
    { empresa_id: "e1", competencia: "2026-11", canal: "WHATSAPP", criado_em: "2026-11-03T09:00:00Z" },
    { empresa_id: "e1", competencia: "2026-11", canal: "LIGACAO", criado_em: "2026-11-03T10:00:00Z" },
    { empresa_id: "e1", competencia: "2026-11", canal: "WHATSAPP", criado_em: "2026-11-04T09:00:00Z" },
    { empresa_id: "e1", competencia: "2026-10", canal: "LIGACAO", criado_em: "2026-11-02T09:00:00Z" },
  ],
} as unknown as DadosRelatorios;

describe("regras do relatório em slide", () => {
  it("lê o código da numeração que vem antes do nome da empresa", () => {
    expect(codigoEmpresa("1516 - ONEVO ENERGIA LTDA")).toBe("1516");
    expect(codigoEmpresa("2 - A B COMPUTACAO")).toBe("2");
    expect(codigoEmpresa("SEM NUMERO LTDA")).toBe("—");
    expect(nomeSemCodigo("1516 - ONEVO ENERGIA LTDA")).toBe("ONEVO ENERGIA LTDA");
  });
  it("acumula do dia 01 até o dia escolhido, sem contar o dia seguinte", () => {
    expect(montarSlide(base, "2026-11", "2026-11-03", 5))
      .toMatchObject({ whats: 2, ligacoes: 1, solicitacoes: 5, clientes100: 1, mesesConciliados: 1 });
    expect(montarSlide(base, "2026-11", "2026-11-01", 0))
      .toMatchObject({ whats: 1, ligacoes: 0, clientes100: 0, mesesConciliados: 0, conciliadas: [] });
    expect(montarSlide(base, "2026-11", "2026-11-09", 0)).toMatchObject({ clientes100: 2, whats: 3, ligacoes: 1 });
  });
  it("conta como 100% só a empresa concluída na própria competência", () => {
    const r = montarSlide(base, "2026-11", "2026-11-09", 0);
    expect(r.cobradas).toEqual([
      { codigo: "2", empresa: "A B COMPUTACAO", periodo: "11/2026", padrinho: "—" },
      { codigo: "1516", empresa: "ONEVO ENERGIA LTDA", periodo: "11/2026", padrinho: "Arthur Nascimento" },
    ]);
  });
  it("não mistura atividades de outra competência no acumulado", () => {
    expect(montarSlide(base, "2026-11", "2026-11-03", 0).ligacoes).toBe(1);
  });
  it("lista a empresa conciliada com código, período e padrinho", () => {
    expect(montarSlide(base, "2026-11", "2026-11-03", 0).conciliadas)
      .toEqual([{ codigo: "1516", empresa: "ONEVO ENERGIA LTDA", periodo: "10/2026", padrinho: "Arthur Nascimento" }]);
  });
  it("sugere o dia 01 quando a competência ainda não começou", () => {
    expect(diaPadrao("2027-01", new Date("2026-11-03T12:00:00Z"))).toBe("2027-01-01");
    expect(diaPadrao("2026-11", new Date("2026-11-03T12:00:00Z"))).toBe("2026-11-03");
    expect(diaPadrao("2026-10", new Date("2026-11-03T12:00:00Z"))).toBe("2026-10-31");
  });
});
