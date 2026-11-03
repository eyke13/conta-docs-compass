<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- All screens read the same per-competência query (`useDadosCompetencia`) and invalidate it after every change, so indicators stay in sync.
- Every change writes a row to `historico` with the signed-in user as author, for traceability.
- Data access goes through the browser client under RLS (signed-in users only); the protected screens live under `_authenticated/`.
- Read `_authenticated/AGENTS.md` for screen and reporting rules. Why: preserve workflows.
- Access is by selecting an active operador card: a server function validates the operador ID and signs into one of two shared internal accounts (team or gestor, gestor checked against GESTOR_SENHA); usuarioId/usuarioNome live in localStorage and the gate reads the local session (getSession) and only logs out when the operador no longer exists (inactive operadores may still sign in to act on behalf of others). Why: identity tied to the operador ID, no reload logouts, RLS still restricts writes to gestor.
- Bancos and Cartões are separate areas: `bancos`, `extratos`, `demandas` and `historico` carry a `tipo` column (BANCO|CARTAO) and every read/write filters by the area chosen in the top bar. Why: each area keeps its own items, responsáveis, indicators and history.

- Cadastro (empresas, bancos, talentos, regime, prioridade) is permanent and only changes via Excel import; each competência's `demandas`/`extratos` rows are auto-created from it, never modifying existing rows; per-area inactivation uses `empresas.inativa_banco/inativa_cartao` (Cobrança uses `empresas.cobranca`). Julho/2026 is the permanent first competência. The monthly schedule `abertura-mensal-competencia` (day 1, 00:05 SP) calls `/api/public/jobs/abrir-competencia` → `abrir_competencia_mensal()`, opening the month from the cadastro (previous operador and bloqueada carried, idempotent); on-load sync is the backstop. Why: months start automatically, zeroed, without re-import.
- Empresa status is manual (`demandas.concluida`), independent of item statuses; Talento (from import, per area on `empresas`) is distinct from Operador (who claims the demanda). Why: errors outside the operator's control must not block completion.
- Full data wipe goes through the `excluir_todos_dados()` SQL function, which checks the gestor role. Why: historico has no delete policy for the app.
- Excel import validates the whole sheet client-side, then writes everything in one call to the `importar_planilha()` SQL function (single transaction, gestor-only). Why: any error must leave the base untouched.
- historico stores autor_operador_id (client sets it; importar_planilha via app.operador_id + trigger) and only the gestor role can SELECT it. Why: traceability by operador ID, history restricted to gestor at the RLS level.

- Cobrança de Documentação is its own area: membership on `empresas.cobranca`, monthly status in `cobrancas`, each status change appended to `cobranca_movimentos` (readable by all, unlike historico). Why: independent from Bancos/Cartões with consultable movement history.
- Peculiaridades live in `peculiaridades`, linked to the empresa (identified by normalized name), not to a competência. Why: permanent info shared across months.
- `importar_planilha` takes p_modo ADICAO|SUBSTITUICAO; substitution inactivates companies missing from the sheet in that area (from the chosen competência on) instead of deleting. Why: preserve history.

- Visitante is a third shared account (visitante@acesso.interno, role `visitante`) entered by name only. It sees every screen the team sees (Histórico and Importação stay gestor-only) in read-only mode (`podeOperar()`/`usePodeOperar()` in src/lib/acesso.ts, checked by shared components and client write helpers) and only operates Peculiaridades, inserting through `incluir_peculiaridade_visitante()`. RLS gives visitante SELECT on operational tables and no direct writes; in read-only mode screens skip the on-load sync (sincronizarCompetencia, cobrancas upsert). Why: outside people follow the work and add company info without touching operational data.
- Dashboard is the home for every profile. Each operador has one current "padrinho em foco" (talento_doc) in `operador_foco`, set manually (`definir_foco`) or automatically when they change the Cobrança status of a company with another talento (`mudar_status_cobranca`, same transaction). Dashboard reads Cobrança through `resumo_cobranca()` and never writes; carteiras list padrinhos alphabetically by name. Why: the team sees who is working on which padrinho in real time.
- Cobrança lists companies grouped by padrinho name (alphabetical, pt-BR, accent-insensitive, "Sem padrinho" last), then by company name with numeric comparison so the leading code sorts correctly. Why: the team works padrinho by padrinho.
- Cobrança distributes by unit = padrinho within a cell (Simples or Real/Presumido); one operador per unit per cell, enforced by `atribuir_operador_cobranca()`, `abrir_cobranca()` and the talento_doc/regime trigger. Details in src/routes/_authenticated/AGENTS.md. Why: one owner per padrinho per cell.
