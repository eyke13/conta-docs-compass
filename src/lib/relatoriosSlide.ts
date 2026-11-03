import { diaSP, type DadosRelatorios } from "./relatorios";

// Regra fundamental dos slides: tudo que foi realizado do dia 01 da competência até o dia escolhido,
// usando a data efetiva da atividade (nunca a data de abertura do mês).
export type LinhaSlide = { codigo: string; empresa: string; periodo: string; padrinho: string };
export type SlideRelatorio = {
  comp: string; dia: string; desde: string;
  solicitacoes: number; clientes100: number;
  ligacoes: number; whats: number;
  mesesConciliados: number;
  conciliadas: LinhaSlide[];
  cobradas: LinhaSlide[];
};

const alfa = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
const RE_CODIGO = /^\s*(\d+)\s*[-–—]\s*/;

/** Código = a numeração que vem antes do nome da empresa ("1516 - ONEVO..." → 1516). */
export function codigoEmpresa(nome: string): string {
  const m = RE_CODIGO.exec(nome);
  return m?.[1] ?? "—";
}
/** Nome sem o código na frente, para a coluna EMPRESA não repetir o número. */
export function nomeSemCodigo(nome: string): string {
  return nome.replace(RE_CODIGO, "").trim() || nome;
}
export function compParaTela(comp: string): string {
  return `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;
}
export function diaParaTela(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}
export function diaInicial(comp: string): string {
  return `${comp}-01`;
}
/** Dia sugerido: hoje quando a competência é a atual, senão o último dia da competência. */
export function diaPadrao(comp: string, agora = new Date()): string {
  const hoje = diaSP(agora.toISOString());
  if (hoje.slice(0, 7) === comp) return hoje;
  const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0);
  const ultimo = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
  return hoje > ultimo ? ultimo : hoje.slice(0, 7) < comp ? diaInicial(comp) : ultimo;
}

function linhaSlide(nome: string, periodo: string, padrinho: string | null | undefined): LinhaSlide {
  return { codigo: codigoEmpresa(nome), empresa: nomeSemCodigo(nome), periodo, padrinho: padrinho?.trim() || "—" };
}

/**
 * Consolida os slides. `solicitacoes` é o único número informado pelo gestor;
 * todo o resto vem dos registros reais da competência selecionada.
 */
export function montarSlide(d: DadosRelatorios, comp: string, dia: string, solicitacoes: number): SlideRelatorio {
  const desde = diaInicial(comp);
  const ate = dia >= desde ? dia : desde;
  const naJanela = (iso: string | null) => { const x = iso ? diaSP(iso) : ""; return x >= desde && x <= ate; };
  const emps = new Map(d.empresas.map((e) => [e.id, e]));
  const conc = new Map(d.conciliacoes.map((c) => [c.id, c]));

  let whats = 0, ligacoes = 0;
  for (const c of d.contatos) {
    if (c.competencia !== comp || !naJanela(c.criado_em)) continue;
    if (c.canal === "WHATSAPP") whats++; else if (c.canal === "LIGACAO") ligacoes++;
  }

  // Empresa 100% = concluída (Recebido) na tela de Cobrança, contando pela data efetiva da conclusão.
  const vistosCob = new Set<string>();
  const cobradas: LinhaSlide[] = [];
  for (const c of d.cobrancas) {
    if (c.competencia !== comp || c.status !== "RECEBIDO" || !naJanela(c.movimentado_em)) continue;
    const nome = emps.get(c.empresa_id)?.nome ?? "Empresa sem cadastro";
    if (vistosCob.has(c.empresa_id)) continue;
    vistosCob.add(c.empresa_id);
    cobradas.push(linhaSlide(nome, compParaTela(comp), emps.get(c.empresa_id)?.talento_doc));
  }
  cobradas.sort((a, b) => alfa(a.codigo, b.codigo) || alfa(a.empresa, b.empresa));

  const vistos = new Set<string>();
  const conciliadas: LinhaSlide[] = [];
  let mesesConciliados = 0;
  for (const a of d.alteracoes) {
    if (!a.conciliado || !naJanela(a.criado_em)) continue;
    mesesConciliados++;
    const c = conc.get(a.conciliacao_id);
    const nome = c?.empresa_nome ?? emps.get(c?.empresa_id ?? "")?.nome ?? "Empresa sem cadastro";
    const chave = `${nome}|${a.competencia}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    conciliadas.push(linhaSlide(nome, compParaTela(a.competencia), emps.get(c?.empresa_id ?? "")?.talento_doc));
  }
  conciliadas.sort((a, b) => alfa(a.codigo, b.codigo) || alfa(a.empresa, b.empresa) || alfa(a.periodo, b.periodo));

  return {
    comp, dia: ate, desde,
    solicitacoes: Math.max(0, Math.round(solicitacoes) || 0),
    clientes100: cobradas.length,
    ligacoes, whats, mesesConciliados, conciliadas, cobradas,
  };
}
