// Sessão do perfil atual: operador escolhido (ID é a referência principal) e modo gestor.
export const CHAVE_ID = "usuarioId";
export const CHAVE_NOME = "usuarioNome";
export const CHAVE_STATUS = "usuarioStatus";
export const CHAVE_GESTOR = "acesso_gestor";
export const CHAVE_PAPEL = "acesso_papel";
export const CHAVE_VISITANTE = "visitanteNome";
export type Papel = "usuario" | "gestor" | "visitante";

const ler = (k: string) => (typeof window === "undefined" ? "" : localStorage.getItem(k) ?? "");

export function usuarioId(): string { return ler(CHAVE_ID); }
export function nomeAcesso(): string { return ler(CHAVE_ID) ? ler(CHAVE_NOME) : ""; }
export function ehGestor(): boolean { return ler(CHAVE_GESTOR) === "1"; }

export function salvarAcesso(u: { id: string; nome: string; ativo: boolean }, gestor: boolean) {
  localStorage.setItem(CHAVE_ID, u.id);
  localStorage.setItem(CHAVE_NOME, u.nome);
  localStorage.setItem(CHAVE_STATUS, u.ativo ? "ATIVO" : "INATIVO");
  localStorage.setItem(CHAVE_GESTOR, gestor ? "1" : "0");
  localStorage.setItem(CHAVE_PAPEL, gestor ? "gestor" : "usuario");
  localStorage.removeItem(CHAVE_VISITANTE);
  localStorage.removeItem("filtroOperador");
}
export function atualizarNome(nome: string, ativo: boolean) { localStorage.setItem(CHAVE_NOME, nome); localStorage.setItem(CHAVE_STATUS, ativo ? "ATIVO" : "INATIVO"); }
export function limparAcesso() {
  for (const k of [CHAVE_ID, CHAVE_NOME, CHAVE_STATUS, CHAVE_GESTOR, "acesso_nome", "filtroOperador", CHAVE_PAPEL, CHAVE_VISITANTE]) localStorage.removeItem(k);
}

export function papelLocal(): Papel | "" { const p = ler(CHAVE_PAPEL); return p === "usuario" || p === "gestor" || p === "visitante" ? p : ""; }
export function ehVisitante(): boolean { return ler(CHAVE_PAPEL) === "visitante"; }
export function visitanteNome(): string { return ler(CHAVE_VISITANTE); }
export function salvarAcessoVisitante(nome: string) {
  for (const k of [CHAVE_ID, CHAVE_NOME, CHAVE_STATUS, CHAVE_GESTOR, "filtroOperador"]) localStorage.removeItem(k);
  localStorage.setItem(CHAVE_PAPEL, "visitante");
  localStorage.setItem(CHAVE_VISITANTE, nome.trim());
}

/** Modo somente leitura: visitante vê tudo, mas não opera (exceto incluir peculiaridades). */
export function podeOperar(): boolean { return !ehVisitante(); }
export function usePodeOperar(): boolean { return podeOperar(); }
export function exigirOperar() { if (!podeOperar()) throw new Error("Visitante não pode alterar dados"); }
