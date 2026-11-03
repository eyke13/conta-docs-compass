import logoBranco from "@/assets/elite-logo-branco.png.asset.json";
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, History, LayoutDashboard, Landmark, CreditCard, LogOut, Briefcase, Users, Moon, Sun, FileCheck, NotebookText, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CompetenciaProvider, useCompetencia } from "@/lib/competencia";
import { ROT_TIPO, listaCompetencias, rotuloComp } from "@/lib/extratos";
import { atualizarNome, limparAcesso, nomeAcesso, papelLocal, usuarioId, visitanteNome, CHAVE_PAPEL, CHAVE_GESTOR, type Papel } from "@/lib/acesso";
import { useTema } from "@/lib/tema";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Sessão lida do armazenamento local (sem depender da rede), evitando voltar ao login no F5.
    const { data } = await supabase.auth.getSession();
    if (!data.session) { limparAcesso(); throw redirect({ to: "/auth" }); }
    // Papel vem do banco; em falha de rede usa o local (o banco protege de qualquer forma).
    let papel: Papel | null;
    const rp = await supabase.rpc("papel_atual");
    if (rp.error) papel = papelLocal() || null;
    else papel = (rp.data as Papel | null) ?? null;
    if (!papel) { await supabase.auth.signOut(); limparAcesso(); throw redirect({ to: "/auth" }); }
    localStorage.setItem(CHAVE_PAPEL, papel);
    if (papel === "visitante") {
      const vn = visitanteNome();
      if (!vn) { await supabase.auth.signOut(); limparAcesso(); throw redirect({ to: "/auth" }); }
      if (location.pathname === "/historico" || location.pathname === "/importacao") throw redirect({ to: "/dashboard" });
      return { user: data.session.user, usuarioId: "", nome: vn, gestor: false, visitante: true, podeOperar: false, papel };
    }
    localStorage.setItem(CHAVE_GESTOR, papel === "gestor" ? "1" : "0");
    const id = usuarioId();
    if (!id || !nomeAcesso()) { limparAcesso(); throw redirect({ to: "/auth" }); }
    // Valida o operador; só desloga se ele foi removido do cadastro (inativo pode operar; falha de rede não desloga).
    const { data: op, error } = await supabase.from("operadores").select("nome, ativo").eq("id", id).maybeSingle();
    if (!error && !op) {
      await supabase.auth.signOut();
      limparAcesso();
      throw redirect({ to: "/auth" });
    }
    if (op) atualizarNome(op.nome, op.ativo);
    return { user: data.session.user, usuarioId: id, nome: nomeAcesso(), gestor: papel === "gestor", visitante: false, podeOperar: true, papel };
  },
  component: Layout,
});

type ItemMenu = { title: string; url: "/dashboard" | "/controle" | "/cobranca" | "/peculiaridades" | "/conciliacoes" | "/carteira" | "/cadastros" | "/importacao" | "/historico" | "/relatorios"; icon: typeof LayoutDashboard };
const I = {
  dashboard: { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  controle: { title: "Operador Banco|Cartão", url: "/controle", icon: ClipboardList },
  cobranca: { title: "Cobrança de Documentação", url: "/cobranca", icon: FileCheck },
  peculiaridades: { title: "Peculiaridades", url: "/peculiaridades", icon: NotebookText },
  conciliacoes: { title: "Conciliações Financeiras", url: "/conciliacoes", icon: Scale },
  carteira: { title: "Carteira de Operadores", url: "/carteira", icon: Briefcase },
  cadastros: { title: "Cadastros", url: "/cadastros", icon: Users },
  importacao: { title: "Importação Excel", url: "/importacao", icon: FileSpreadsheet },
  historico: { title: "Histórico", url: "/historico", icon: History },
  relatorios: { title: "Relatórios", url: "/relatorios", icon: FileSpreadsheet },
} satisfies Record<string, ItemMenu>;
type GrupoMenu = { rotulo: string | null; itens: ItemMenu[] };
// Menu por papel. A ordem não altera permissões (o gate e o RLS continuam decidindo o acesso).
// Dentro de cada grupo os itens seguem a ordem alfabética.
const MENU_POR_PAPEL: Record<Papel, GrupoMenu[]> = {
  visitante: [
    { rotulo: null, itens: [I.dashboard, I.peculiaridades] },
    { rotulo: "Consulta", itens: [I.cobranca, I.conciliacoes, I.controle, I.carteira, I.cadastros] },
  ],
  usuario: [
    { rotulo: null, itens: [I.dashboard] },
    { rotulo: "Processo", itens: [I.controle, I.cobranca, I.conciliacoes, I.peculiaridades] },
    { rotulo: "Equipe", itens: [I.carteira, I.cadastros] },
  ],
  gestor: [
    { rotulo: null, itens: [I.dashboard] },
    { rotulo: "Processo", itens: [I.controle, I.cobranca, I.conciliacoes, I.peculiaridades] },
    { rotulo: "Gestão", itens: [I.carteira, I.cadastros, I.importacao, I.historico, I.relatorios] },
  ],
};
const alfa = (a: ItemMenu, b: ItemMenu) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });

function Layout() {
  return (
    <CompetenciaProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topo />
            <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8"><Outlet /></main>
          </div>
        </div>
      </SidebarProvider>
    </CompetenciaProvider>
  );
}

function Topo() {
  const { competencia, setCompetencia, tipo, setTipo } = useCompetencia();
  const { gestor, visitante } = Route.useRouteContext();
  const { escuro, alternar } = useTema();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b bg-card/95 px-3 py-2 sm:gap-3 sm:px-4 backdrop-blur">
      <SidebarTrigger />
      {path === "/controle" && <div className="inline-flex rounded-lg border bg-muted p-0.5" role="tablist" aria-label="Área de controle">
        {(["BANCO", "CARTAO"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tipo === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "BANCO" ? <Landmark className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}{ROT_TIPO[t].itens}
          </button>
        ))}
      </div>}
      <>
      <span className="hidden text-sm text-muted-foreground lg:inline">Competência</span>
      <Select value={competencia} onValueChange={setCompetencia}>
        <SelectTrigger className="h-9 w-40 sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {listaCompetencias([competencia]).map((c) => <SelectItem key={c} value={c}>{rotuloComp(c)}</SelectItem>)}
        </SelectContent>
      </Select>
      </>
      {gestor && <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"><ShieldCheck className="h-3.5 w-3.5" /><span className="hidden md:inline">Modo Gestor</span></span>}
      <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">Dados salvos no servidor e compartilhados com a equipe</span>
      <Button variant="ghost" size="icon" className="ml-auto xl:ml-0" onClick={alternar} title={escuro ? "Modo claro" : "Modo noturno"} aria-label={escuro ? "Ativar modo claro" : "Ativar modo noturno"}>
        {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
    {visitante && <div className="sticky top-14 z-10 border-b bg-accent/60 px-4 py-1.5 text-center text-xs font-medium text-accent-foreground">Modo visitante: somente visualização. Você pode incluir peculiaridades.</div>}
    </>
  );
}

function AppSidebar() {
  const { nome, gestor, visitante, papel } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    limparAcesso();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-2">
          <img src={logoBranco.url} alt="Elite" className="h-7 w-auto object-contain shrink-0 group-data-[collapsible=icon]:hidden" />
          <img src="/favicon.png" alt="Elite" className="hidden h-7 w-7 shrink-0 group-data-[collapsible=icon]:block" />
        </div>
        <div className="px-1 pb-1 text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">Controle Operacional Contábil
        </div>
      </SidebarHeader>
      <SidebarContent>
        {MENU_POR_PAPEL[papel].map((g, gi) => (
          <SidebarGroup key={gi} className={gi > 0 ? "group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-sidebar-border" : undefined}>
            {g.rotulo && <SidebarGroupLabel>{g.rotulo}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {[...g.itens].sort(g.rotulo ? alfa : () => 0).map((i) => (
                  <SidebarMenuItem key={i.url}>
                    <SidebarMenuButton asChild isActive={path === i.url} tooltip={i.title}>
                      <Link to={i.url}><i.icon className="h-4 w-4" /><span>{i.title}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-1.5 truncate px-2 text-xs text-sidebar-foreground group-data-[collapsible=icon]:hidden">{nome}{gestor && <span className="inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"><ShieldCheck className="h-3 w-3" />GESTOR</span>}{visitante && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">VISITANTE</span>}</div>
        <Button variant="ghost" size="sm" className="justify-start" onClick={sair}><LogOut className="h-4 w-4" /><span className="group-data-[collapsible=icon]:hidden">Sair</span></Button>
      </SidebarFooter>
    </Sidebar>
  );
}
