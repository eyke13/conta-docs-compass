import type { Database } from "@/integrations/supabase/types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type DadosRelatorios = {
  empresas: Row<"empresas">[]; operadores: Row<"operadores">[]; demandas: Row<"demandas">[];
  extratos: Row<"extratos">[]; cobrancas: Row<"cobrancas">[]; conciliacoes: Row<"conciliacoes">[];
  alteracoes: Row<"conciliacao_alteracoes">[]; movimentos: Row<"cobranca_movimentos">[];
  contatos: Row<"cobranca_contatos">[];
  historico: Row<"historico">[]; peculiaridades: Row<"peculiaridades">[];
};
export type Modulo = "GERAL" | "OPERADOR" | "CONCILIACAO" | "COBRANCA";
export type Situacao = "CONCLUIDA" | "ANDAMENTO" | "PENDENTE";
export type FiltrosRelatorio = { comp: string; modulo: Modulo; empresa: string; operador: string; talento: string; situacao: string };
export type DemandaRelatorio = {
  id: string; modulo: Exclude<Modulo, "GERAL">; area: string; comp: string; empresaId: string; empresa: string;
  operadorId: string; operador: string; talento: string; situacao: Situacao; statusOriginal: string;
  erros: number; abertura: string | null; atualizado: string | null; descricao: string; bloqueada: boolean;
  inicio?: string; fim?: string; progresso?: number;
};
export const MODULOS: Record<Modulo, string> = { GERAL: "Geral", OPERADOR: "Operador Banco|Cartão", CONCILIACAO: "Conciliação", COBRANCA: "Cobrança" };
export const SITUACOES: Record<Situacao, string> = { CONCLUIDA: "Concluída", ANDAMENTO: "Em andamento", PENDENTE: "Pendente" };
export const SEM_PENDENCIAS = "NÃO EXISTEM PENDÊNCIAS REGISTRADAS NESTA COMPETÊNCIA.";
const alfa = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
export function competenciaAnterior(comp: string) {
  const ano = Number(comp.slice(0, 4)); const mes = Number(comp.slice(5, 7));
  return `${mes === 1 ? ano - 1 : ano}-${String(mes === 1 ? 12 : mes - 1).padStart(2, "0")}`;
}
export function normalizarDemandas(d: DadosRelatorios, comp: string): DemandaRelatorio[] {
  const emps = new Map(d.empresas.map(e => [e.id, e]));
  const ops = new Map(d.operadores.map(o => [o.id, o.nome]));
  const itens = new Map<string, DadosRelatorios["extratos"]>();
  for (const e of d.extratos) {
    const k = `${e.competencia}|${e.empresa_id}|${e.tipo}`;
    itens.set(k, [...(itens.get(k) ?? []), e]);
  }
  const base = (id: string, empresaId: string, opId: string | null) => ({ id, comp, empresaId, empresa: emps.get(empresaId)?.nome ?? "Empresa sem cadastro", operadorId: opId ?? "", operador: ops.get(opId ?? "") ?? "Sem responsável" });
  const operador: DemandaRelatorio[] = d.demandas.filter(x => x.competencia === comp).map(x => {
    const es = itens.get(`${comp}|${x.empresa_id}|${x.tipo}`) ?? [];
    const andamento = es.some(e => e.status !== "PENDENTE" || e.atualizado_em !== null);
    return { ...base(x.id, x.empresa_id, x.operador_id), empresa: x.empresa_nome, modulo: "OPERADOR", area: x.tipo === "CARTAO" ? "Cartões" : "Bancos",
      talento: (x.tipo === "CARTAO" ? emps.get(x.empresa_id)?.talento_cartao : emps.get(x.empresa_id)?.talento_banco) ?? "",
      situacao: x.concluida ? "CONCLUIDA" : andamento ? "ANDAMENTO" : "PENDENTE", statusOriginal: x.concluida ? "CONCLUIDA" : "PENDENTE",
      erros: es.filter(e => e.status === "ERRO").length, abertura: x.atribuido_em, atualizado: x.concluida_em,
      descricao: `${es.filter(e => e.status === "CONCLUIDO").length}/${es.length} itens concluídos`, bloqueada: x.bloqueada };
  });
  const cobranca: DemandaRelatorio[] = d.cobrancas.filter(x => x.competencia === comp).map(x => ({ ...base(x.id, x.empresa_id, x.operador_id), modulo: "COBRANCA", area: "Documentação",
    talento: emps.get(x.empresa_id)?.talento_doc ?? "", situacao: x.status === "RECEBIDO" ? "CONCLUIDA" : x.status === "AGUARDANDO" ? "ANDAMENTO" : "PENDENTE",
    statusOriginal: x.status, erros: 0, abertura: x.criado_em, atualizado: x.movimentado_em, descricao: x.comentario ?? x.status, bloqueada: x.bloqueada }));
  const conciliacao: DemandaRelatorio[] = d.conciliacoes.filter(x => x.status !== "REABERTA" && x.comp_inicio <= comp && x.comp_fim >= comp).map(x => {
    const meses = (x.meses_conciliados ?? {}) as Record<string, boolean>;
    return { ...base(x.id, x.empresa_id, x.operador_id), empresa: x.empresa_nome, operador: x.operador_nome, modulo: "CONCILIACAO", area: "Financeira",
      talento: "", situacao: meses[comp] === true ? "CONCLUIDA" : "ANDAMENTO", statusOriginal: x.status, erros: 0,
      abertura: x.assumida_em, atualizado: x.concluida_em, descricao: `Mês ${meses[comp] === true ? "conciliado" : "em conciliação"}; período ${x.comp_inicio} a ${x.comp_fim}`,
      bloqueada: false, inicio: x.comp_inicio, fim: x.comp_fim, progresso: meses[comp] === true ? 1 : 0 };
  });
  return [...operador, ...conciliacao, ...cobranca].sort((a,b) => alfa(a.empresa,b.empresa));
}
export function filtrarDemandas(rows: DemandaRelatorio[], f: FiltrosRelatorio) {
  return rows.filter(r => (f.modulo === "GERAL" || r.modulo === f.modulo) && (!f.empresa || r.empresaId === f.empresa) && (!f.operador || r.operadorId === f.operador) && (!f.talento || r.talento === f.talento) &&
    (f.situacao === "TODAS" || (f.situacao === "ERRO" ? r.erros > 0 : r.situacao === f.situacao)));
}
export function indicadores(rows: DemandaRelatorio[]) {
  const total = rows.length; const concluidas = rows.filter(r => r.situacao === "CONCLUIDA").length;
  const pendentes = rows.filter(r => r.situacao === "PENDENTE").length; const andamento = rows.filter(r => r.situacao === "ANDAMENTO").length;
  return { total, concluidas, pendentes, andamento, comErros: rows.filter(r => r.erros > 0).length, erros: rows.reduce((n,r) => n+r.erros,0), conclusao: total ? concluidas / total : 0, percentualPendente: total ? pendentes / total : 0, empresas: new Set(rows.map(r => r.empresaId)).size };
}
export function diasEmAberto(data: string | null, agora: Date) {
  if (!data) return null;
  return Math.max(0, Math.floor((agora.getTime() - new Date(data).getTime()) / 86400000));
}
export function diaSP(data: string) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data)); }
export function moduloHistorico(h: DadosRelatorios["historico"][number]): Modulo {
  if (h.tipo === "BANCO" || h.tipo === "CARTAO") return "OPERADOR";
  if (/CONCILIA/i.test(h.acao)) return "CONCILIACAO";
  if (/COBRAN[CÇ]A|FOCO/.test(h.acao)) return "COBRANCA";
  return "GERAL";
}
export function montarRelatorio(d: DadosRelatorios, f: FiltrosRelatorio, agora = new Date()) {
  const rows = filtrarDemandas(normalizarDemandas(d, f.comp), f);
  const anterior = filtrarDemandas(normalizarDemandas(d, competenciaAnterior(f.comp)), { ...f, comp: competenciaAnterior(f.comp) });
  const ids = new Set(rows.map(r => r.empresaId));
  const historico = d.historico.filter(h => (h.competencia === f.comp || (!h.competencia && diaSP(h.criado_em).startsWith(f.comp))) &&
    (f.modulo === "GERAL" || moduloHistorico(h) === f.modulo) && (!f.empresa || h.empresa_id === f.empresa) && (!f.operador || h.autor_operador_id === f.operador) &&
    ((!f.talento && f.situacao === "TODAS") || (h.empresa_id !== null && ids.has(h.empresa_id)))).sort((a,b) => a.criado_em.localeCompare(b.criado_em));
  const ind = indicadores(rows);
  const erros = d.extratos.filter(e => e.competencia === f.comp && e.status === "ERRO" && rows.some(r => r.modulo === "OPERADOR" && r.empresaId === e.empresa_id && r.area === (e.tipo === "CARTAO" ? "Cartões" : "Bancos"))).map(e => {
    const r = rows.find(r => r.modulo === "OPERADOR" && r.empresaId === e.empresa_id && r.area === (e.tipo === "CARTAO" ? "Cartões" : "Bancos"));
    return { Empresa: r?.empresa ?? "", Área: r?.area ?? "", Item: e.banco_nome, Descrição: e.comentario || "Erro de login registrado", Responsável: r?.operador ?? "", Autor: e.atualizado_por ?? "Não registrado", Data: e.atualizado_em ?? "", Situação: "Não corrigido" };
  });
  const corrigidos = historico.filter(h => h.acao === "STATUS ALTERADO" && /Erro de login\s*→\s*(Concluído|Pendente)/i.test(h.detalhe ?? "")).map(h => ({ Empresa: h.empresa_nome ?? "", Área: h.tipo === "CARTAO" ? "Cartões" : "Bancos", Item: h.banco_nome ?? "", Descrição: h.detalhe ?? "", Responsável: h.operador_nome ?? "", Autor: h.autor ?? "", Data: h.criado_em, Situação: "Saída de erro registrada (ver situação atual)" }));
  const pendencias = rows.filter(r => r.situacao !== "CONCLUIDA").map(r => ({ Módulo: MODULOS[r.modulo], Empresa: r.empresa, Responsável: r.operador, Padrinho: r.talento || "Não se aplica", Registro: r.abertura ?? "Não registrado", "Origem da data": r.modulo === "OPERADOR" ? "Atribuição (abertura não registrada)" : "Abertura", "Dias em aberto": diasEmAberto(r.abertura, agora), Descrição: r.descricao, Situação: SITUACOES[r.situacao] }));
  const produtividade = [...new Set(rows.map(r => r.operadorId))].map(id => {
    const rs = rows.filter(r => r.operadorId === id); const i = indicadores(rs);
    const eventos = historico.filter(h => h.autor_operador_id === id && id !== "");
    return { Responsável: rs[0]?.operador ?? "Sem responsável", Demandas: i.total, Concluídas: i.concluidas, "Em andamento": i.andamento, Pendentes: i.pendentes, "Com erros": i.comErros, Conclusão: i.conclusao, Empresas: i.empresas, "Registros como autor": eventos.length };
  }).sort((a,b) => alfa(a.Responsável,b.Responsável));
  const participantes = [...new Set(historico.map(h => h.autor_operador_id).filter((id): id is string => !!id))].map(id => ({ Operador: d.operadores.find(o => o.id === id)?.nome ?? historico.find(h => h.autor_operador_id === id)?.autor ?? id, ID: id, Registros: historico.filter(h => h.autor_operador_id === id).length, "Demandas com atuação registrada": new Set(historico.filter(h => h.autor_operador_id === id && h.empresa_id).map(h => `${h.empresa_id}|${h.tipo ?? moduloHistorico(h)}`)).size }));
  const padrinhos = [...new Set(rows.filter(r => r.talento && historico.some(h => h.empresa_id === r.empresaId && moduloHistorico(h) === r.modulo && !!h.autor_operador_id)).map(r => r.talento))].sort(alfa);
  const talentos = [...new Set(rows.map(r => r.talento).filter(Boolean))].sort(alfa);
  const volumeModulos = Object.entries(MODULOS).filter(([k]) => k !== "GERAL").map(([k,nome]) => ({ Módulo: nome, ...indicadores(rows.filter(r => r.modulo === k)) }));
  const diaria = [...new Set(historico.map(h => diaSP(h.criado_em)))].sort().map(dia => ({ Dia: dia, Registros: historico.filter(h => diaSP(h.criado_em) === dia).length, "Alterações de status": historico.filter(h => diaSP(h.criado_em) === dia && /STATUS|CONCLU|REABER|MÊS|MES/.test(h.acao)).length }));
  const resumo = `${ind.total} demandas registradas para ${ind.empresas} empresas: ${ind.concluidas} concluídas, ${ind.andamento} em andamento e ${ind.pendentes} pendentes. Conclusão: ${(ind.conclusao*100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%. Há ${ind.erros} itens com erro registrado e ${participantes.length} participantes com autoria identificada no histórico. ${anterior.length ? `Competência anterior: ${anterior.length} demandas, ${indicadores(anterior).concluidas} concluídas (mesmos filtros).` : "Sem dados compatíveis na competência anterior."}`;
  return { rows, anterior, ind, erros, corrigidos, pendencias, produtividade, participantes, padrinhos, talentos, volumeModulos, diaria, historico, resumo };
}