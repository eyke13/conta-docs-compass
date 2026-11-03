import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Controle Operacional — Elite Contábil" },
    { name: "description", content: "Acesso ao acompanhamento operacional de documentação, extratos e conciliações da Elite Contábil." },
    { property: "og:title", content: "Controle Operacional — Elite Contábil" },
    { property: "og:description", content: "Acompanhamento de documentação, extratos e conciliações da Elite Contábil." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
