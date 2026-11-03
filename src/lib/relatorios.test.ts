import { describe, expect, it } from "vitest";
import { competenciaAnterior, filtrarDemandas, indicadores, diasEmAberto, normalizarDemandas, type DadosRelatorios, type DemandaRelatorio } from "./relatorios";
const row: DemandaRelatorio = { id:"1",modulo:"OPERADOR",area:"Bancos",comp:"2026-11",empresaId:"e",empresa:"Empresa",operadorId:"o",operador:"Operador",talento:"Padrinho",situacao:"PENDENTE",statusOriginal:"PENDENTE",erros:0,abertura:null,atualizado:null,descricao:"",bloqueada:false };
describe("regras dos relatórios", () => {
  it("preserva conclusão manual da empresa independente de erro no item", () => {
    const d = { empresas:[],operadores:[],demandas:[{id:"d",competencia:"2026-11",empresa_id:"e",empresa_nome:"Empresa",tipo:"BANCO",concluida:true}],extratos:[{competencia:"2026-11",empresa_id:"e",tipo:"BANCO",status:"ERRO"}],cobrancas:[],conciliacoes:[],historico:[],movimentos:[],alteracoes:[],peculiaridades:[] } as unknown as DadosRelatorios;
    expect(normalizarDemandas(d,"2026-11")[0]).toMatchObject({situacao:"CONCLUIDA",erros:1});
  });
  it("considera o mês conciliado sem concluir todo o período ou duplicar demandas", () => {
    const d = { empresas:[],operadores:[],demandas:[],extratos:[],cobrancas:[],conciliacoes:[{id:"c",empresa_id:"e",empresa_nome:"Empresa",operador_nome:"Responsável",status:"EM_ANDAMENTO",comp_inicio:"2026-10",comp_fim:"2026-11",meses_conciliados:{"2026-10":true}}],historico:[],movimentos:[],alteracoes:[],peculiaridades:[] } as unknown as DadosRelatorios;
    expect(normalizarDemandas(d,"2026-10")).toHaveLength(1);
    expect(normalizarDemandas(d,"2026-10")[0]?.situacao).toBe("CONCLUIDA");
    expect(normalizarDemandas(d,"2026-11")[0]?.situacao).toBe("ANDAMENTO");
  });
  it("não classifica pendência como erro sem indicação registrada", () => {
    expect(filtrarDemandas([row],{comp:"2026-11",modulo:"GERAL",empresa:"",operador:"",talento:"",situacao:"ERRO"})).toHaveLength(0);
    expect(indicadores([row]).comErros).toBe(0);
  });
  it("conta demanda com erro uma vez mesmo com dois itens em erro", () => {
    expect(indicadores([{...row,erros:2}])).toMatchObject({ total:1,comErros:1,erros:2 });
  });
  it("calcula conclusão e pendências sem divisão por zero", () => {
    expect(indicadores([row,{...row,id:"2",situacao:"CONCLUIDA"}])).toMatchObject({ conclusao:0.5,percentualPendente:0.5 });
    expect(indicadores([]).conclusao).toBe(0);
  });
  it("não inventa tempo em aberto quando não existe data", () => {
    expect(diasEmAberto(null,new Date("2026-11-03T12:00:00Z"))).toBeNull();
    expect(diasEmAberto("2026-11-01T12:00:00Z",new Date("2026-11-03T12:00:00Z"))).toBe(2);
  });
  it("compara competência anterior inclusive na virada do ano", () => {
    expect(competenciaAnterior("2027-01")).toBe("2026-12");
    expect(competenciaAnterior("2026-11")).toBe("2026-10");
  });
  it("mantém operador distinto de padrinho nos filtros", () => {
    expect(filtrarDemandas([row],{comp:"2026-11",modulo:"GERAL",empresa:"",operador:"Padrinho",talento:"",situacao:"TODAS"})).toHaveLength(0);
    expect(filtrarDemandas([row],{comp:"2026-11",modulo:"GERAL",empresa:"",operador:"o",talento:"Padrinho",situacao:"TODAS"})).toHaveLength(1);
  });
});