import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import logoAzul from "@/assets/elite-logo-azul-vertical.png.asset.json";
import logoBranco from "@/assets/elite-logo-branco.png.asset.json";
import { Loader2, ShieldCheck, UserRound, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrarSistema, entrarVisitante, listarOperadoresAtivos } from "@/lib/acesso.functions";
import { ehVisitante, nomeAcesso, salvarAcesso, salvarAcessoVisitante, usuarioId, visitanteNome } from "@/lib/acesso";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Controle Operacional Contábil" },
      { name: "description", content: "Selecione seu usuário para acessar o controle mensal de extratos." },
      { property: "og:title", content: "Entrar — Controle Operacional Contábil" },
      { property: "og:description", content: "Selecione seu usuário para acessar o controle mensal de extratos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Op = { id: string; nome: string; cargo: string; ativo: boolean };

function AuthPage() {
  const navigate = useNavigate();
  const entrarFn = useServerFn(entrarSistema);
  const listarFn = useServerFn(listarOperadoresAtivos);
  const ops = useQuery({ queryKey: ["operadores-login"], queryFn: () => listarFn(), staleTime: 0 });
  const [modoGestor, setModoGestor] = useState(false);
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState<string | null>(null);
  const visitFn = useServerFn(entrarVisitante);
  const [modoVisit, setModoVisit] = useState(false);
  const [nomeVisit, setNomeVisit] = useState("");

  async function entrarComoVisitante() {
    const n = nomeVisit.trim();
    if (n.length < 3 || n.length > 80) { toast.error("Informe seu nome (3 a 80 caracteres)."); return; }
    setEntrando("visitante");
    try {
      const r = await visitFn({ data: { nome: n } });
      const { error } = await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      if (error) throw error;
      salvarAcessoVisitante(r.nome);
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("Não foi possível entrar. Tente novamente.");
    } finally { setEntrando(null); }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && ehVisitante() && visitanteNome()) navigate({ to: "/dashboard", replace: true });
      else if (data.session && usuarioId() && nomeAcesso()) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function entrar(op: Op) {
    if (modoGestor && !senha) { toast.error("Informe a senha do Gestor."); return; }
    setEntrando(op.id);
    try {
      const r = await entrarFn({ data: { operadorId: op.id, gestor: modoGestor, senha: modoGestor ? senha : undefined } });
      if (!r.ok) { toast.error(r.erro); ops.refetch(); return; }
      const { error } = await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      if (error) throw error;
      salvarAcesso(r.operador, r.gestor);
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("Não foi possível entrar. Tente novamente.");
    } finally {
      setEntrando(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 border-b pb-6 text-center">
          <img src={logoAzul.url} alt="Elite Consultoria Contábil" className="h-24 w-auto object-contain dark:hidden" />
          <img src={logoBranco.url} alt="Elite Consultoria Contábil" className="hidden h-10 w-auto object-contain dark:block" />
          <h1 className="text-lg font-semibold">Controle Operacional Contábil</h1>
        </div>
        <h2 className="mb-3 text-lg font-semibold">Selecione seu usuário</h2>
        {modoGestor && (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <Label>Senha do Gestor</Label>
            <Input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">Depois, clique no seu usuário para entrar como Gestor.</p>
          </div>
        )}
        {ops.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : ops.isError ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar os usuários. <button className="underline" onClick={() => ops.refetch()}>Tentar novamente</button></div>
        ) : (ops.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum operador cadastrado.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(ops.data ?? []).map((op) => (
              <button key={op.id} type="button" disabled={!!entrando} onClick={() => entrar(op)}
                className="flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {entrando === op.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{op.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{op.cargo}</span>
                </span>
                <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${op.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{op.ativo ? "ATIVO" : "INATIVO"}</span>
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModoGestor(!modoGestor); setSenha(""); }} className="mt-5 w-full text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />{modoGestor ? "Voltar ao acesso normal" : "Entrar como Gestor"}
        </Button>
        <div className="mt-4 border-t pt-4">
          {modoVisit ? (
            <form className="space-y-2 rounded-lg border bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); entrarComoVisitante(); }}>
              <Label htmlFor="nome-visitante">Seu nome</Label>
              <Input id="nome-visitante" autoFocus maxLength={80} value={nomeVisit} onChange={(e) => setNomeVisit(e.target.value)} />
              <p className="text-xs text-muted-foreground">Acesso de visitante: visualiza todas as telas e pode incluir peculiaridades das empresas.</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={!!entrando}>{entrando === "visitante" && <Loader2 className="h-4 w-4 animate-spin" />}Entrar</Button>
                <Button type="button" variant="ghost" onClick={() => { setModoVisit(false); setNomeVisit(""); }}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setModoVisit(true)}><Eye className="h-3.5 w-3.5" />Entrar como Visitante</Button>
          )}
        </div>
      </div>
    </div>
  );
}
