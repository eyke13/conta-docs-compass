import { exigirOperar, podeOperar } from "./acesso";
import { supabase } from "@/integrations/supabase/client";

export type Tipo = "BANCO" | "CARTAO";
export const ROT_TIPO: Record<Tipo, { item: string; itens: string; artigo: string; area: string; exemplo: string }> = {
  BANCO: { item: "Banco", itens: "Bancos", artigo: "o", area: "Controle de Bancos", exemplo: "Santander" },
  CARTAO: { item: "Cartão", itens: "Cartões", artigo: "o", area: "Controle de Cartões", exemplo: "Cartão Itaú Visa" },
};
export const ROT_AMBOS = { item: "Banco/Cartão", itens: "Bancos e Cartões" };
export function tipoAtual(): Tipo {
  return typeof window !== "undefined" && localStorage.getItem("area") === "CARTAO" ? "CARTAO" : "BANCO";
}

export type StatusBanco = "PENDENTE" | "CONCLUIDO" | "ERRO";
export type StatusEmpresa = "PENDENTE" | "CONCLUIDA";

export interface Operador { id: string; nome: string; cargo: string; ativo: boolean; demo: boolean; setor?: string | null }
export const REGIMES = ["REAL", "PRESUMIDO", "SIMPLES"] as const;
export const ROT_REGIME: Record<string, string> = { REAL: "Real", PRESUMIDO: "Presumido", SIMPLES: "Simples" };
export const SETORES = { SIMPLES: "Célula Simples", REAL_PRESUMIDO: "Célula Real/Presumido" } as const;
export type Setor = keyof typeof SETORES;
/** Setor que atende o regime; null quando a empresa não tem regime. */
export function setorDoRegime(regime: string | null | undefined): Setor | null {
  return regime === "SIMPLES" ? "SIMPLES" : regime === "REAL" || regime === "PRESUMIDO" ? "REAL_PRESUMIDO" : null;
}
export interface Extrato {
  id: string; competencia: string; empresa_id: string; banco_id: string | null; banco_nome: string;
  tipo: Tipo; status: StatusBanco; comentario: string | null; atualizado_por: string | null; atualizado_em: string | null; concluido_em: string | null;
}
export interface Demanda {
  id: string; competencia: string; empresa_id: string; empresa_nome: string; operador_id: string | null;
  atribuido_em: string | null; atribuido_por: string | null; tipo: Tipo;
  concluida: boolean; concluida_em: string | null; concluida_por: string | null;
  bloqueada: boolean; bloqueada_em: string | null; bloqueada_por: string | null;
}
export interface EmpresaLinha extends Demanda {
  bancos: Extrato[]; total: number; concluidos: number; erros: number; peso: number;
  status: StatusEmpresa; operador: Operador | null; talento: string | null; regime: string | null; prioridade: number | null;
}

export const ROTULO_EMPRESA: Record<StatusEmpresa, string> = {
  PENDENTE: "Pendente", CONCLUIDA: "Concluída",
};
export const ROTULO_BANCO: Record<StatusBanco, string> = { PENDENTE: "Pendente", CONCLUIDO: "Concluído", ERRO: "Erro de login" };
export const COR_EMPRESA: Record<StatusEmpresa, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  CONCLUIDA: "bg-success/15 text-success",
};
export const COR_BANCO: Record<StatusBanco, string> = {
  PENDENTE: "bg-muted text-muted-foreground", CONCLUIDO: "bg-success/15 text-success", ERRO: "bg-destructive/10 text-destructive",
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function rotuloComp(c: string) {
  const [a, m] = c.split("-");
  return `${MESES[Number(m) - 1]}/${a}`;
}
/** Marco inicial permanente: julho/2026. Nenhuma competência anterior existe. */
export const COMPETENCIA_INICIAL = "2026-07";
export function listaCompetencias(extras: string[] = []) {
  const set = new Set(extras.filter((c) => c >= COMPETENCIA_INICIAL));
  const d = new Date();
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1); // mês atual + 1
  for (let x = new Date(2026, 6, 1); x <= fim; x = new Date(x.getFullYear(), x.getMonth() + 1, 1)) {
    set.add(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return [...set].sort().reverse();
}
export function fmtDataHora(s: string | null) {
  return s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** O status da empresa é manual (botão da empresa), independente dos itens. */
export function statusEmpresa(d: { concluida: boolean }): StatusEmpresa {
  return d.concluida ? "CONCLUIDA" : "PENDENTE";
}

export async function autorAtual() {
  if (typeof window !== "undefined" && localStorage.getItem("acesso_papel") === "visitante") return `${localStorage.getItem("visitanteNome") ?? ""} (Visitante)`;
  const n = typeof window !== "undefined" && localStorage.getItem("usuarioId") ? localStorage.getItem("usuarioNome") : null;
  const g = typeof window !== "undefined" && localStorage.getItem("acesso_gestor") === "1";
  return n ? (g ? `${n} (Gestor)` : n) : "desconhecido";
}

export async function registrar(h: {
  competencia?: string | null; empresa_id?: string | null; empresa_nome?: string | null; banco_nome?: string | null;
  operador_nome?: string | null; acao: string; detalhe?: string | null; tipo?: Tipo | null;
}) {
  exigirOperar();
  const autor = await autorAtual();
  await supabase.from("historico").insert({ ...h, tipo: h.tipo === undefined ? tipoAtual() : h.tipo, autor, autor_operador_id: (typeof window !== "undefined" && localStorage.getItem("usuarioId")) || null });
}

export async function carregarCompetencia(competencia: string, tipo: Tipo) {
  // Visitante só lê: nunca abre/sincroniza a competência.
  if (podeOperar()) await sincronizarCompetencia(competencia, tipo);
  const [d, e, o, em] = await Promise.all([
    supabase.from("demandas").select("*").eq("competencia", competencia).eq("tipo", tipo).order("empresa_nome").limit(5000),
    supabase.from("extratos").select("*").eq("competencia", competencia).eq("tipo", tipo).order("banco_nome").limit(20000),
    supabase.from("operadores").select("*").order("nome"),
    supabase.from("empresas").select("id,talento_banco,talento_cartao,regime,prioridade,inativa_banco,inativa_cartao").limit(5000),
  ]);
  if (d.error) throw d.error;
  if (e.error) throw e.error;
  if (o.error) throw o.error;
  const operadores = (o.data ?? []) as Operador[];
  const talentos = new Map((em.data ?? []).map((x) => [x.id, (tipo === "BANCO" ? x.talento_banco : x.talento_cartao) ?? null]));
  const regimes = new Map((em.data ?? []).map((x) => [x.id, x.regime ?? null]));
  const prioridades = new Map((em.data ?? []).map((x) => [x.id, x.prioridade ?? null]));
  const inativas = new Set((em.data ?? []).filter((x) => (tipo === "BANCO" ? x.inativa_banco : x.inativa_cartao)).map((x) => x.id));
  const porEmpresa = new Map<string, Extrato[]>();
  for (const x of (e.data ?? []) as Extrato[]) {
    const arr = porEmpresa.get(x.empresa_id) ?? [];
    arr.push(x);
    porEmpresa.set(x.empresa_id, arr);
  }
  const linhas: EmpresaLinha[] = ((d.data ?? []) as Demanda[]).filter((dm) => !inativas.has(dm.empresa_id)).map((dm) => {
    const bancos = porEmpresa.get(dm.empresa_id) ?? [];
    return {
      ...dm, bancos, total: bancos.length, peso: bancos.length,
      concluidos: bancos.filter((b) => b.status === "CONCLUIDO").length,
      erros: bancos.filter((b) => b.status === "ERRO").length,
      status: statusEmpresa(dm), operador: operadores.find((op) => op.id === dm.operador_id) ?? null,
      talento: talentos.get(dm.empresa_id) ?? null,
      regime: regimes.get(dm.empresa_id) ?? null,
      prioridade: prioridades.get(dm.empresa_id) ?? null,
    };
  });
  return { linhas, operadores };
}

/**
 * Garante que a competência tenha os registros mensais de toda a base cadastral.
 * O cadastro é permanente: toda empresa ativa na área aparece em qualquer competência.
 * Registros já existentes nunca são modificados (ignoreDuplicates).
 */
export async function sincronizarCompetencia(competencia: string, tipo: Tipo) {
  if (!podeOperar()) return;
  const [empTodas, bc, ant, atuais, extAtuais] = await Promise.all([
    supabase.from("empresas").select("id,nome,inativa_banco,inativa_cartao").limit(5000),
    supabase.from("bancos").select("id,empresa_id,nome").eq("tipo", tipo).limit(20000),
    supabase.from("demandas").select("empresa_id,operador_id,competencia,bloqueada").eq("tipo", tipo).lt("competencia", competencia).order("competencia", { ascending: false }).limit(20000),
    supabase.from("demandas").select("empresa_id").eq("competencia", competencia).eq("tipo", tipo).limit(5000),
    supabase.from("extratos").select("banco_id").eq("competencia", competencia).eq("tipo", tipo).limit(20000),
  ]);
  if (empTodas.error) throw empTodas.error;
  if (bc.error) throw bc.error;
  const inativas = new Set((empTodas.data ?? []).filter((x) => (tipo === "BANCO" ? x.inativa_banco : x.inativa_cartao)).map((x) => x.id));
  bc.data = (bc.data ?? []).filter((b) => !inativas.has(b.empresa_id));
  const comItens = new Set((bc.data ?? []).map((b) => b.empresa_id));
  const jaDem = new Set((atuais.data ?? []).map((x) => x.empresa_id));
  const jaExt = new Set((extAtuais.data ?? []).map((x) => x.banco_id));
  const respAnterior = new Map<string, string | null>();
  const bloqAnterior = new Set<string>();
  for (const a of ant.data ?? []) if (!respAnterior.has(a.empresa_id)) { respAnterior.set(a.empresa_id, a.operador_id); if (a.bloqueada) bloqAnterior.add(a.empresa_id); }
  const novasDem = (empTodas.data ?? []).filter((x) => comItens.has(x.id) && !jaDem.has(x.id));
  // Atribuição automática de empresas novas: mesmo operador do talento, senão o operador ativo mais leve.
  const semResp = novasDem.filter((x) => !respAnterior.get(x.id));
  if (semResp.length) {
    const [ops, emps, dems, outra] = await Promise.all([
      supabase.from("operadores").select("id,ativo,setor"),
      supabase.from("empresas").select("id,talento_banco,talento_cartao,regime").limit(5000),
      supabase.from("demandas").select("empresa_id,operador_id").eq("tipo", tipo).eq("competencia", competencia).limit(5000),
      supabase.from("demandas").select("empresa_id,operador_id,competencia").eq("tipo", tipo === "BANCO" ? "CARTAO" : "BANCO").lte("competencia", competencia).not("operador_id", "is", null).order("competencia", { ascending: false }).limit(20000),
    ]);
    // Mesma empresa em Bancos e Cartões fica com o mesmo operador (célula BANCO | CARTÕES)
    const opOutra = new Map<string, string>();
    for (const d of outra.data ?? []) if (d.operador_id && !opOutra.has(d.empresa_id)) opOutra.set(d.empresa_id, d.operador_id);
    const ativosOps = (ops.data ?? []).filter((o) => o.ativo);
    const ativos = ativosOps.map((o) => o.id);
    if (ativos.length) {
      const tal = new Map((emps.data ?? []).map((e) => [e.id, (tipo === "BANCO" ? e.talento_banco : e.talento_cartao) ?? null]));
      const peso = new Map<string, number>();
      for (const b of bc.data ?? []) peso.set(b.empresa_id, (peso.get(b.empresa_id) ?? 0) + 1);
      const carga = new Map(ativos.map((id) => [id, 0]));
      const opTal = new Map<string, string>();
      const registrarCarga = (emp: string, op: string | null | undefined) => {
        if (!op) return;
        if (carga.has(op)) carga.set(op, carga.get(op)! + (peso.get(emp) ?? 0));
        const t = tal.get(emp); if (t && !opTal.has(chaveNome(t))) opTal.set(chaveNome(t), op);
      };
      for (const d of dems.data ?? []) registrarCarga(d.empresa_id, d.operador_id);
      for (const x of novasDem) if (respAnterior.get(x.id)) registrarCarga(x.id, respAnterior.get(x.id));
      for (const x of semResp.sort((a, b) => (peso.get(b.id) ?? 0) - (peso.get(a.id) ?? 0))) {
        const t = tal.get(x.id);
        // Bancos/Cartões não têm trava de setor: qualquer operador ativo.
        const elegiveis = ativos;
        let op = opOutra.get(x.id);
        if (op && !elegiveis.includes(op)) op = undefined;
        if (!op && t) op = opTal.get(chaveNome(t));
        if (op && !elegiveis.includes(op)) op = undefined;
        if (!op) op = elegiveis.length ? elegiveis.reduce((m, id) => (carga.get(id)! < carga.get(m)! ? id : m), elegiveis[0]!) : undefined;
        if (!op) continue;
        respAnterior.set(x.id, op);
        registrarCarga(x.id, op);
      }
    }
  }
  const novosExt = (bc.data ?? []).filter((b) => !jaExt.has(b.id));
  if (novasDem.length) {
    const { error } = await supabase.from("demandas").upsert(
      novasDem.map((x) => ({ competencia, empresa_id: x.id, empresa_nome: x.nome, tipo, operador_id: respAnterior.get(x.id) ?? null,
        ...(bloqAnterior.has(x.id) ? { bloqueada: true, bloqueada_em: new Date().toISOString(), bloqueada_por: "Mês anterior", concluida: true, concluida_em: new Date().toISOString(), concluida_por: "Serviços bloqueados" } : {}) })),
      { onConflict: "competencia,empresa_id,tipo", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  if (novosExt.length) {
    const { error } = await supabase.from("extratos").upsert(
      novosExt.map((b) => ({ competencia, empresa_id: b.empresa_id, banco_id: b.id, banco_nome: b.nome, tipo })),
      { onConflict: "competencia,banco_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  if (novasDem.length && !jaDem.size) await registrar({ competencia, acao: "COMPETÊNCIA ABERTA", tipo, detalhe: `${ROT_TIPO[tipo].itens}: ${novasDem.length} empresas` });
}

/** Cria (ou reaproveita) empresa e bancos, incluindo-os na competência indicada. */
/** Chave de comparação: sem acentos, sem pontuação extra, espaços únicos, maiúsculas. */
export function chaveNome(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

export async function cadastrarEmpresaComBancos(nome: string, bancos: string[], competencia: string, origem: string, tipo: Tipo, talento?: string, regime?: string, prioridade?: number | null) {
  exigirOperar();
  const nomeN = nome.trim().replace(/\s+/g, " ").toUpperCase();
  const chave = chaveNome(nomeN);
  const { data: todas, error: errE } = await supabase.from("empresas").select("id,nome").order("criado_em");
  if (errE) throw errE;
  const existente = (todas ?? []).find((e) => chaveNome(e.nome) === chave) ?? null;
  let empresaId = existente?.id;
  let nova = false;
  if (!empresaId) {
    const { data, error } = await supabase.from("empresas").insert({ nome: nomeN, regime: regime ?? null, prioridade: prioridade ?? null }).select("id").single();
    if (error) throw error;
    empresaId = data.id;
    nova = true;
  } else if (regime) {
    const { data: atualR } = await supabase.from("empresas").select("regime").eq("id", empresaId).single();
    if ((atualR?.regime ?? null) !== regime) {
      const { error } = await supabase.from("empresas").update({ regime }).eq("id", empresaId);
      if (error) throw error;
      await registrar({ competencia, empresa_id: empresaId, empresa_nome: existente!.nome, tipo: null, acao: "REGIME ALTERADO", detalhe: `${atualR?.regime ?? "—"} → ${regime} (Origem: ${origem})` }); // existente garantido neste ramo
    }
  }
  const tal = talento?.trim().replace(/\s+/g, " ");
  if (tal) {
    const campo = tipo === "BANCO" ? "talento_banco" : "talento_cartao";
    const { data: atual } = await supabase.from("empresas").select("talento_banco,talento_cartao").eq("id", empresaId).single();
    if ((atual?.[campo] ?? "") !== tal) {
      const { error } = await supabase.from("empresas").update(tipo === "BANCO" ? { talento_banco: tal } : { talento_cartao: tal }).eq("id", empresaId);
      if (error) throw error;
      if (!nova) await registrar({ competencia, empresa_id: empresaId, empresa_nome: existente?.nome ?? nomeN, tipo, acao: "TALENTO ALTERADO", detalhe: `${atual?.[campo] ?? "—"} → ${tal} (Origem: ${origem})` });
    }
  }
  const { data: atuais } = await supabase.from("bancos").select("nome").eq("empresa_id", empresaId).eq("tipo", tipo);
  const jaTem = new Set((atuais ?? []).map((b) => chaveNome(b.nome)));
  const autor = await autorAtual();
  const adicionados: string[] = [];
  for (const b of bancos) {
    const bn = b.trim().replace(/\s+/g, " ");
    if (!bn || jaTem.has(chaveNome(bn))) continue;
    jaTem.add(chaveNome(bn));
    const { data, error } = await supabase.from("bancos").insert({ empresa_id: empresaId, nome: bn, tipo, criado_por: autor }).select("id").single();
    if (error) throw error;
    void data;
    adicionados.push(bn);
  }
  if (adicionados.length) await supabase.from("empresas").update(tipo === "BANCO" ? { inativa_banco: false } : { inativa_cartao: false }).eq("id", empresaId);
  if (nova) await registrar({ competencia, empresa_id: empresaId, empresa_nome: nomeN, tipo, acao: "EMPRESA CADASTRADA", detalhe: `Origem: ${origem}` });
  for (const b of adicionados) await registrar({ competencia, empresa_id: empresaId, empresa_nome: existente?.nome ?? nomeN, banco_nome: b, tipo, acao: `${ROT_TIPO[tipo].item.toUpperCase()} INCLUÍDO`, detalhe: `Origem: ${origem}` });
  return { nova, adicionados };
}

/* ===================== Carteiras ===================== */
export interface GrupoTalento { chave: string; talento: string | null; empresas: EmpresaLinha[]; peso: number; operador_id: string | null }

/** Agrupa empresas por talento; empresa sem talento forma um grupo próprio. */
export function gruposPorTalento(linhas: EmpresaLinha[]): GrupoTalento[] {
  const m = new Map<string, GrupoTalento>();
  for (const l of linhas) {
    const chave = l.talento ? `T:${chaveNome(l.talento)}` : `E:${l.empresa_id}`;
    const g = m.get(chave) ?? { chave, talento: l.talento, empresas: [], peso: 0, operador_id: l.operador_id };
    g.empresas.push(l); g.peso += l.peso;
    m.set(chave, g);
  }
  return [...m.values()];
}

/** Distribuição equilibrada: maiores grupos primeiro, sempre para o operador mais leve (LPT). */
/** Setor exigido pelo grupo; "MISTO" quando o talento tem empresas de células diferentes. */
export function setorDoGrupo(g: GrupoTalento): Setor | "MISTO" | null {
  const s = new Set(g.empresas.map((e) => setorDoRegime(e.regime)));
  if (s.size > 1) return "MISTO";
  return [...s][0] ?? null;
}

/** Cada grupo vai para o operador elegível (mesmo setor) mais leve. Grupos sem elegível ficam em `semDestino`. */
export function planejarDistribuicao(grupos: GrupoTalento[], ativos: Operador[], cargaInicial?: Map<string, number>, usarSetor = true) {
  const carga = new Map(ativos.map((o) => [o.id, cargaInicial?.get(o.id) ?? 0]));
  const plano = new Map<string, string>();
  const semDestino: GrupoTalento[] = [];
  for (const g of [...grupos].sort((a, b) => b.peso - a.peso || b.empresas.length - a.empresas.length)) {
    const setor = setorDoGrupo(g);
    const eleg = usarSetor ? ativos.filter((o) => setor && setor !== "MISTO" && o.setor === setor) : ativos;
    if (!eleg.length) { semDestino.push(g); continue; }
    let melhor = eleg[0]!.id;
    for (const o of eleg) if (carga.get(o.id)! < carga.get(melhor)!) melhor = o.id;
    plano.set(g.chave, melhor);
    carga.set(melhor, carga.get(melhor)! + g.peso);
  }
  return { plano, semDestino, carga };
}

/** Altera só o responsável (desta competência em diante); status, comentários e histórico ficam intactos. */
export async function atribuirEmpresas(empresaIds: string[], operadorId: string, competencia: string, tipo: Tipo | "AMBOS" | "COBRANCA"): Promise<string[]> {
  exigirOperar();
  if (!empresaIds.length) return [];
  const autor = await autorAtual();
  if (tipo === "COBRANCA") {
    // Cobrança: a unidade inteira (padrinho na célula) vai junto, validada no banco
    const { data, error } = await supabase.rpc("atribuir_operador_cobranca", { p_competencia: competencia, p_empresa_ids: empresaIds, p_operador_id: operadorId, p_autor: autor });
    if (error) throw error;
    return (data ?? []) as string[];
  }
  const upd = { operador_id: operadorId, atribuido_em: new Date().toISOString(), atribuido_por: autor };
  for (let i = 0; i < empresaIds.length; i += 200) {
    const ids = empresaIds.slice(i, i + 200);
    const { error } = tipo === "AMBOS"
      ? await supabase.from("demandas").update(upd).in("empresa_id", ids).gte("competencia", competencia)
      : await supabase.from("demandas").update(upd).in("empresa_id", ids).eq("tipo", tipo).gte("competencia", competencia);
    if (error) throw error;
  }
  return empresaIds;
}

/** Célula BANCO | CARTÕES: uma unidade por empresa, peso = bancos + cartões. */
export interface UnidadeBC extends EmpresaLinha { nBancos: number; nCartoes: number }
export async function carregarCarteiraBC(competencia: string) {
  const [b, c] = await Promise.all([carregarCompetencia(competencia, "BANCO"), carregarCompetencia(competencia, "CARTAO")]);
  const m = new Map<string, UnidadeBC>();
  for (const l of b.linhas) m.set(l.empresa_id, { ...l, nBancos: l.total, nCartoes: 0 });
  for (const l of c.linhas) {
    const u = m.get(l.empresa_id);
    if (u) { u.nCartoes = l.total; u.total += l.total; u.peso += l.peso; u.talento ??= l.talento; if (!u.operador_id) { u.operador_id = l.operador_id; u.operador = l.operador; } }
    else m.set(l.empresa_id, { ...l, nBancos: 0, nCartoes: l.total });
  }
  // Empresa com operadores diferentes nas duas áreas: divergente (corrigida ao transferir/redistribuir)
  const opC = new Map(c.linhas.map((l) => [l.empresa_id, l.operador_id]));
  const divergentes = b.linhas.filter((l) => opC.has(l.empresa_id) && opC.get(l.empresa_id) !== l.operador_id).length;
  return { linhas: [...m.values()].sort((x, y) => x.empresa_nome.localeCompare(y.empresa_nome, "pt-BR")), operadores: b.operadores, divergentes };
}

/** Célula COBRANÇA: uma unidade por empresa da cobrança, peso 1; carrega o operador do mês anterior. */
export async function carregarCarteiraCob(competencia: string) {
  const [e, cs, ant, o] = await Promise.all([
    supabase.from("empresas").select("id,nome,talento_doc,regime,prioridade").eq("cobranca", true).limit(5000),
    supabase.from("cobrancas").select("id,empresa_id,operador_id").eq("competencia", competencia).limit(5000),
    supabase.from("cobrancas").select("empresa_id,operador_id,competencia").lt("competencia", competencia).not("operador_id", "is", null).order("competencia", { ascending: false }).limit(20000),
    supabase.from("operadores").select("*").order("nome"),
  ]);
  if (e.error) throw e.error;
  const operadores = (o.data ?? []) as Operador[];
  const atual = new Map((cs.data ?? []).map((x) => [x.empresa_id, x.operador_id]));
  const anterior = new Map<string, string>();
  for (const a of ant.data ?? []) if (a.operador_id && !anterior.has(a.empresa_id)) anterior.set(a.empresa_id, a.operador_id);
  const linhas = (e.data ?? []).filter((x) => atual.has(x.id)).map((x) => {
    const op = atual.get(x.id) ?? null; void anterior;
    return { empresa_id: x.id, empresa_nome: x.nome, talento: x.talento_doc, regime: x.regime, prioridade: x.prioridade, operador_id: op,
      operador: operadores.find((p) => p.id === op) ?? null, peso: 1, total: 1 } as unknown as EmpresaLinha;
  }).sort((x, y) => x.empresa_nome.localeCompare(y.empresa_nome, "pt-BR"));
  return { linhas, operadores };
}
