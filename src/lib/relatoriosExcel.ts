import * as XLSX from "xlsx-js-style";
import { diaSP, MODULOS, montarRelatorio, SEM_PENDENCIAS, SITUACOES, type DadosRelatorios, type FiltrosRelatorio } from "./relatorios";

type Linha = Record<string, string | number | boolean | null>;
// Identidade visual do app (azul-marinho, dourado, creme; Montserrat) aplicada ao modelo de planilha da Elite.
const COR = { marinho: "1E3A64", dourado: "D9A23A", creme: "FBF3E2", zebra: "F5F7FA", texto: "233746", suave: "6B7C8F", cartao: "EEF3F7", borda: "D5DCE4" };
const FONTE = "Montserrat";
const borda = { top: { style: "thin", color: { rgb: COR.borda } }, bottom: { style: "thin", color: { rgb: COR.borda } }, left: { style: "thin", color: { rgb: COR.borda } }, right: { style: "thin", color: { rgb: COR.borda } } };
export const LINHA_CABECALHO = 6; // dados começam na linha 7, como no modelo
const DESCRICOES: Record<string, string> = {
  "Resumo gerencial": "Visão consolidada da competência e notas de leitura",
  Demandas: "Todas as demandas da competência com situação, responsável e padrinho",
  Indicadores: "Totais calculados a partir da aba Demandas",
  Produtividade: "Carteira atual por responsável",
  Participação: "Operadores com autoria registrada no histórico",
};

export function criarExcelRelatorio(d: DadosRelatorios, f: FiltrosRelatorio, agora = new Date()) {
  const r = montarRelatorio(d, f, agora); const wb = XLSX.utils.book_new();
  const geradoEm = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  function aba(nome: string, rows: Linha[], headers: string[] = []) {
    // Relatório limpo: identificadores internos (colunas "ID…") nunca vão para a planilha.
    const interna = (k: string) => /^ID\b/.test(k) || k === "Demanda";
    const keys = (headers.length ? headers : Object.keys(rows[0] ?? {})).filter(k => !interna(k));
    rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !interna(k))));
    const n = Math.max(keys.length, 4);
    const sheet = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_json(sheet, rows, { header: keys, origin: `A${LINHA_CABECALHO}` });
    const set = (ref: string, v: string | number, s: object) => { sheet[ref] = { t: typeof v === "number" ? "n" : "s", v, s }; };
    const col = (i: number) => XLSX.utils.encode_col(i);
    // Faixa de título, nome do relatório e descrição
    set("A1", "ELITE | CONSULTORIA CONTÁBIL", { font: { name: FONTE, sz: 14, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: COR.marinho } }, alignment: { vertical: "center" } });
    set("A2", nome.toUpperCase(), { font: { name: FONTE, sz: 12, bold: true, color: { rgb: COR.marinho } }, border: { bottom: { style: "medium", color: { rgb: COR.dourado } } } });
    set("A3", `${DESCRICOES[nome] ?? "Controle Operacional Contábil"} • ${MODULOS[f.modulo]} • Competência ${f.comp}`, { font: { name: FONTE, sz: 9, italic: true, color: { rgb: COR.suave } } });
    const merges = [0, 1, 2].map(rr => ({ s: { r: rr, c: 0 }, e: { r: rr, c: n - 1 } }));
    for (let c = 1; c < n; c++) { set(`${col(c)}1`, "", sheet["A1"].s); set(`${col(c)}2`, "", sheet["A2"].s); }
    // Cartões de indicadores (linhas 4–5)
    const cartoes: [string, string | number][] = [["COMPETÊNCIA", f.comp], ["RELATÓRIO", MODULOS[f.modulo]], ["REGISTROS", rows.length], ["GERADO EM", geradoEm]];
    const larg = Math.floor(n / 4);
    cartoes.forEach(([rot, val], i) => {
      const c0 = i * larg; const c1 = i === 3 ? n - 1 : c0 + larg - 1;
      for (let c = c0; c <= c1; c++) {
        set(`${col(c)}4`, c === c0 ? rot : "", { font: { name: FONTE, sz: 9, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: COR.marinho } }, alignment: { horizontal: "center" }, border: { bottom: { style: "medium", color: { rgb: COR.dourado } } } });
        set(`${col(c)}5`, c === c0 ? val : "", { font: { name: FONTE, sz: 11, bold: true, color: { rgb: COR.marinho } }, fill: { fgColor: { rgb: COR.cartao } }, alignment: { horizontal: "center" } });
      }
      if (c1 > c0) merges.push({ s: { r: 3, c: c0 }, e: { r: 3, c: c1 } }, { s: { r: 4, c: c0 }, e: { r: 4, c: c1 } });
    });
    // Cabeçalho e linhas zebradas
    keys.forEach((_, c) => {
      const h = sheet[`${col(c)}${LINHA_CABECALHO}`];
      if (h) h.s = { font: { name: FONTE, sz: 9, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: COR.marinho } }, alignment: { vertical: "center", wrapText: true }, border: borda };
      rows.forEach((_, i) => {
        const ref = `${col(c)}${LINHA_CABECALHO + 1 + i}`;
        const cell = sheet[ref] ?? (sheet[ref] = { t: "s", v: "" });
        cell.s = { font: { name: FONTE, sz: 9, color: { rgb: COR.texto } }, fill: { fgColor: { rgb: i % 2 ? COR.zebra : "FFFFFF" } }, border: borda, alignment: { vertical: "top" } };
      });
    });
    sheet["!merges"] = merges;
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: LINHA_CABECALHO + Math.max(rows.length, 0) - 1, c: n - 1 } });
    sheet["!rows"] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 16 }, { hpt: 18 }, { hpt: 22 }, { hpt: 22 }];
    sheet["!cols"] = Array.from({ length: n }, (_, i) => { const k = keys[i] ?? ""; return { wch: Math.min(65, Math.max(18, k.length + 2, ...rows.slice(0, 100).map(row => String(row[k] ?? "").length))) }; });
    if (keys.length) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: LINHA_CABECALHO - 1, c: 0 }, e: { r: LINHA_CABECALHO - 1 + rows.length, c: keys.length - 1 } }) };
    (sheet as Record<string, unknown>)["!freeze"] = { xSplit: 0, ySplit: LINHA_CABECALHO };
    sheet["!views"] = [{ state: "frozen", ySplit: LINHA_CABECALHO }];
    XLSX.utils.book_append_sheet(wb, sheet, nome); return sheet;
  }


  aba("Resumo gerencial", [
    { Indicador: "Competência", Valor: f.comp }, { Indicador: "Relatório", Valor: MODULOS[f.modulo] },
    { Indicador: "Gerado em (São Paulo)", Valor: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) },
    { Indicador: "Resumo", Valor: r.resumo }, { Indicador: "Pendências", Valor: r.pendencias.length ? `${r.pendencias.length} demandas não concluídas` : SEM_PENDENCIAS },
    { Indicador: "Primeira movimentação registrada", Valor: r.historico[0]?.criado_em ?? "Não registrada" },
    { Indicador: "Última movimentação registrada", Valor: r.historico.at(-1)?.criado_em ?? "Não registrada" },
    { Indicador: "Primeiro registro de demanda disponível", Valor: r.rows.map(x => x.abertura).filter((x): x is string => !!x).sort()[0] ?? "Não registrado" },
    { Indicador: "Último registro de demanda disponível", Valor: r.rows.map(x => x.abertura).filter((x): x is string => !!x).sort().at(-1) ?? "Não registrado" },
    { Indicador: "Nota sobre datas", Valor: "Operador: data de atribuição; Cobrança: abertura; Conciliação: início da demanda. A data de criação de demandas do Operador não está registrada." },
    { Indicador: "Nota sobre competência", Valor: "Conciliação conta o mês abrangido e sua marcação individual; períodos reabertos estão somente no histórico. Demandas de Bancos/Cartões são contadas por empresa/área, itens separados." },
    { Indicador: "Nota sobre responsáveis", Valor: "Produtividade por responsável é a carteira atual. Participação efetiva exige autoria registrada. Padrinhos e regime vêm do cadastro atual, sem snapshot histórico." },
    { Indicador: "Nota sobre erros", Valor: "Erros são apenas itens com ERRO. Saídas de erro são ocorrências documentadas, não erros únicos. Conciliação não possui campo de divergência." },
    { Indicador: "Nota sobre pendências", Valor: "Pendências detalhadas incluem todas as demandas não concluídas; classificação em andamento preserva o status original. Sem data não se calcula tempo." },
    { Indicador: "Nota sobre abrangência", Valor: "Geral inclui módulos operacionais, histórico e peculiaridades pertinentes. Dashboard e Carteira não geram novas demandas." },
    { Indicador: "Fonte", Valor: "Registros reais do Controle Operacional Contábil — Elite Contábil" },
  ]);
  const detalhes = r.rows.map(x => ({ ID: x.id, Módulo: MODULOS[x.modulo], Área: x.area, Competência: x.comp, Empresa: x.empresa, "ID empresa": x.empresaId, Responsável: x.operador, "ID responsável": x.operadorId, Padrinho: x.talento || "Não se aplica", Situação: SITUACOES[x.situacao], "Status original": x.statusOriginal, Erros: x.erros, Registro: x.abertura ?? "Não registrado", Atualização: x.atualizado ?? "Não registrada", Descrição: x.descricao, Bloqueada: x.bloqueada ? "Sim" : "Não", "Período inicial": x.inicio ?? "", "Período final": x.fim ?? "" }));
  aba("Demandas", detalhes, ["ID", "Módulo", "Área", "Competência", "Empresa", "ID empresa", "Responsável", "ID responsável", "Padrinho", "Situação", "Status original", "Erros", "Registro", "Atualização", "Descrição", "Bloqueada", "Período inicial", "Período final"]);
  const indicadores = aba("Indicadores", [
    { Indicador: "Total de demandas", Valor: r.ind.total }, { Indicador: "Concluídas", Valor: r.ind.concluidas }, { Indicador: "Em andamento", Valor: r.ind.andamento },
    { Indicador: "Pendentes", Valor: r.ind.pendentes }, { Indicador: "Demandas com erro", Valor: r.ind.comErros }, { Indicador: "Itens com erro", Valor: r.ind.erros },
    { Indicador: "Percentual de conclusão", Valor: r.ind.conclusao }, { Indicador: "Percentual pendente", Valor: r.ind.percentualPendente }, { Indicador: "Empresas atendidas", Valor: r.ind.empresas },
    { Indicador: "Participantes com autoria identificada", Valor: r.participantes.length }, { Indicador: "Padrinhos com atuação registrada", Valor: r.padrinhos.length },
  ]);
  const ini = LINHA_CABECALHO + 1; const fim = LINHA_CABECALHO + r.rows.length;
  const B = (i: number) => `B${LINHA_CABECALHO + i}`; // i = posição do indicador (1 = total)
  const formula = (ref: string, f: string, v: number, z?: string) => { indicadores[ref] = { ...indicadores[ref], t: "n", f, v, ...(z ? { z } : {}) }; };
  if (r.rows.length) {
    formula(B(1), `COUNTA(Demandas!A${ini}:A${fim})`, r.ind.total);
    for (const [i, status, value] of [[2, "Concluída", r.ind.concluidas], [3, "Em andamento", r.ind.andamento], [4, "Pendente", r.ind.pendentes]] as const)
      formula(B(i), `COUNTIF(Demandas!G${ini}:G${fim},"${status}")`, value);
    formula(B(5), `COUNTIF(Demandas!I${ini}:I${fim},">0")`, r.ind.comErros);
    formula(B(6), `SUM(Demandas!I${ini}:I${fim})`, r.ind.erros);
  }
  formula(B(7), `IFERROR(${B(2)}/${B(1)},0)`, r.ind.conclusao, "0.0%");
  formula(B(8), `IFERROR(${B(4)}/${B(1)},0)`, r.ind.percentualPendente, "0.0%");
  aba("Produtividade", r.produtividade, ["Responsável", "Demandas", "Concluídas", "Em andamento", "Pendentes", "Com erros", "Conclusão", "Empresas", "Registros como autor"]);
  aba("Participação", r.participantes, ["Operador", "ID", "Registros", "Demandas com atuação registrada"]);
  aba("Padrinhos", r.talentos.map(nome => ({ Padrinho: nome, Demandas: r.rows.filter(x => x.talento === nome).length, "Com atuação registrada": r.padrinhos.includes(nome) ? "Sim" : "Não" })));
  aba("Empresas", [...new Set(r.rows.map(x => x.empresaId))].map(id => ({ Empresa: r.rows.find(x => x.empresaId === id)?.empresa ?? id, Demandas: r.rows.filter(x => x.empresaId === id).length, Concluídas: r.rows.filter(x => x.empresaId === id && x.situacao === "CONCLUIDA").length })));
  aba("Pendências", r.pendencias.length ? r.pendencias : [{ Informação: SEM_PENDENCIAS }]);
  aba("Erros atuais", r.erros, ["Empresa", "Área", "Item", "Descrição", "Responsável", "Autor", "Data", "Situação"]);
  aba("Saídas de erro", r.corrigidos, ["Empresa", "Área", "Item", "Descrição", "Responsável", "Autor", "Data", "Situação"]);
  aba("Histórico", r.historico.map(h => ({ ID: h.id, Data: h.criado_em, "Dia São Paulo": diaSP(h.criado_em), Competência: h.competencia ?? "", Módulo: h.tipo ?? "Outros", Ação: h.acao, Empresa: h.empresa_nome ?? "", Item: h.banco_nome ?? "", Autor: h.autor ?? "", "ID autor": h.autor_operador_id ?? "", Detalhe: h.detalhe ?? "" })));
  aba("Evolução diária", r.diaria, ["Dia", "Registros", "Alterações de status"]);
  aba("Comparativo", [{ Competência: f.comp, ...r.ind }, { Competência: r.anterior.length ? "Anterior (mesmos filtros)" : "Anterior sem dados compatíveis", ...r.anterior.reduce((acc, x) => ({ ...acc, total: acc.total + 1, concluidas: acc.concluidas + (x.situacao === "CONCLUIDA" ? 1 : 0) }), { total: 0, concluidas: 0 }) }]);
  const ids = new Set(r.rows.map(x => x.empresaId));
  if (f.modulo === "GERAL" || f.modulo === "OPERADOR") aba("Itens Bancos e Cartões", d.extratos.filter(e => e.competencia === f.comp && r.rows.some(x => x.modulo === "OPERADOR" && x.empresaId === e.empresa_id && x.area === (e.tipo === "CARTAO" ? "Cartões" : "Bancos"))).map(e => ({ ID: e.id, Empresa: r.rows.find(x => x.empresaId === e.empresa_id)?.empresa ?? "", Área: e.tipo, Item: e.banco_nome, Status: e.status, Comentário: e.comentario ?? "", Autor: e.atualizado_por ?? "", Atualizado: e.atualizado_em ?? "", Concluído: e.concluido_em ?? "" })));
  if (f.modulo === "GERAL" || f.modulo === "COBRANCA") aba("Movimentos Cobrança", d.movimentos.filter(m => m.competencia === f.comp && r.rows.some(x => x.modulo === "COBRANCA" && x.id === m.cobranca_id)).map(m => ({ ID: m.id, Empresa: r.rows.find(x => x.id === m.cobranca_id)?.empresa ?? "", De: m.de ?? "", Para: m.para, Autor: m.autor ?? "", Data: m.criado_em })));
  if (f.modulo === "GERAL" || f.modulo === "CONCILIACAO") {
    aba("Histórico Conciliação", d.conciliacoes.filter(c => (r.rows.some(x => x.id === c.id) || (c.status === "REABERTA" && c.comp_inicio <= f.comp && c.comp_fim >= f.comp && (!f.empresa || f.empresa === c.empresa_id) && (!f.operador || f.operador === c.operador_id) && !f.talento && f.situacao === "TODAS"))).map(c => ({ ID: c.id, Empresa: c.empresa_nome, Responsável: c.operador_nome, Início: c.comp_inicio, Fim: c.comp_fim, Status: c.status, Assumida: c.assumida_em, Concluída: c.concluida_em ?? "", Reaberta: c.reaberta_em ?? "", Motivo: c.reaberta_motivo ?? "", "Marcações mensais": JSON.stringify(c.meses_conciliados) })));
    aba("Marcações Conciliação", d.alteracoes.filter(a => a.competencia === f.comp && r.rows.some(x => x.id === a.conciliacao_id)).map(a => ({ ID: a.id, Demanda: a.conciliacao_id, Competência: a.competencia, Conciliado: a.conciliado ? "Sim" : "Não", "Status de": a.status_de, "Status para": a.status_para, Autor: a.autor, Data: a.criado_em })));
  }
  if (f.modulo === "GERAL") aba("Peculiaridades", d.peculiaridades.filter(p => ids.has(p.empresa_id)).map(p => ({ Empresa: r.rows.find(x => x.empresaId === p.empresa_id)?.empresa ?? "", Categoria: p.categoria, Descrição: p.descricao, Origem: p.origem, Autor: p.criado_por ?? "", Registro: p.criado_em })));
  return wb;
}
export function blobExcel(d: DadosRelatorios, f: FiltrosRelatorio) {
  return new Blob([XLSX.write(criarExcelRelatorio(d, f), { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export async function entregarExcel(blob: Blob, nome: string) {
  const file = new File([blob], nome, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return; }
    catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}