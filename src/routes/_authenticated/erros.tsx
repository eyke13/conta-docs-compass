import { createFileRoute, redirect } from "@tanstack/react-router";

/** A tela "Itens com Erro" passou a ser a aba BANCO | CARTÃO dentro do Operador; o endereço antigo continua valendo. */
export const Route = createFileRoute("/_authenticated/erros")({
  head: () => ({ meta: [{ title: "Itens com Erro — Controle Operacional Contábil" }, { name: "description", content: "A funcionalidade agora fica na aba Banco | Cartão do Operador." }, { property: "og:title", content: "Itens com Erro — Controle Operacional Contábil" }, { property: "og:description", content: "A funcionalidade agora fica na aba Banco | Cartão do Operador." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: () => { throw redirect({ to: "/controle", search: { aba: "BC" } }); },
});
