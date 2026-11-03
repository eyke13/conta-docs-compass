import { useState } from "react";
import { Building2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertaPeculiaridade } from "@/components/alertaPeculiaridade";
import { cn } from "@/lib/utils";
import { frasesDivisao, listaLonga, meusDoGrupo, type InfoGrupo } from "@/lib/grupos";

const ROT_ST: Record<string, string> = { PENDENTE: "Pendente", AGUARDANDO: "Aguardando Envio", RECEBIDO: "Recebido", CONCLUIDA: "Concluída" };

type Variante = "faixa" | "pill";

/** Aviso único de grupo: "faixa" (subtítulo do bloco) ou "pill" (linha Talento · Regime). */
export function AvisoGrupo({ g, empresaId, operadorId, eu, variante, qtd }: { g: InfoGrupo | undefined; empresaId: string; operadorId: string | null; eu: string; variante: Variante; qtd?: number }) {
  const [aberto, setAberto] = useState(false);
  if (!g) return null;
  const meus = meusDoGrupo(g, eu);
  const laranja = g.dividido;
  const mesmos = g.membros.filter((m) => m.operador_id === operadorId);
  const nomeOp = (id: string | null) => g.membros.find((m) => m.operador_id === id)?.operador_nome ?? "—";
  const outros = new Map<string, { nome: string; n: number }>();
  let sem = 0;
  for (const m of g.membros) {
    if (!m.operador_id) { sem++; continue; }
    if (m.operador_id === operadorId) continue;
    const o = outros.get(m.operador_id) ?? { nome: m.operador_nome ?? "Outro", n: 0 }; o.n++; outros.set(m.operador_id, o);
  }
  const fmt = (xs: string[]) => new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(xs);
  const tip = laranja ? frasesDivisao(g, operadorId, false)
    : [operadorId && operadorId === eu && meus.length > 1
      ? `Você está com ${meus.length} empresas do grupo ${g.nome}: ${listaLonga(meus)}. Faça a cobrança deste grupo em um único contato.`
      : `Todas as ${g.membros.length} empresas do grupo ${g.nome} estão com ${operadorId ? nomeOp(operadorId) : "nenhum operador"}: ${listaLonga(g.membros)}.`];
  const com = operadorId && operadorId === eu ? "você" : nomeOp(operadorId);
  const cor = laranja
    ? "bg-warning/15 text-foreground ring-warning/50 [&_svg]:text-warning"
    : "bg-info/10 text-foreground ring-info/40 [&_svg]:text-info";
  const abrir = (e: React.SyntheticEvent) => { e.stopPropagation(); setAberto(true); };
  const conteudo = variante === "faixa" ? (
    <button type="button" onClick={abrir}
      className={cn("flex min-h-7 w-full min-w-0 flex-wrap items-center gap-x-1.5 border-l-4 px-4 py-1 text-left text-xs font-medium sm:flex-nowrap",
        laranja ? "border-l-warning bg-warning/10" : "border-l-info bg-info/10")}>
      <Building2 className={cn("h-3.5 w-3.5 shrink-0", laranja ? "text-warning" : "text-info")} />
      <span className="truncate font-semibold">Grupo {g.nome}</span>
      <span className="shrink-0 text-muted-foreground">· {qtd ?? g.membros.length} empresas</span>
      {laranja ? <span className="min-w-0 truncate">
        {outros.size > 0 && <>· <span className="font-semibold">⚠ Dividido com {fmt([...outros.values()].map((o) => `${o.nome} (${o.n})`))}</span></>}
        {sem > 0 && <> · {sem} sem operador</>}
      </span> : <span className="shrink-0">· Todas com {com}</span>}
    </button>
  ) : (
    <button type="button" onClick={abrir}
      className={cn("inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-full px-2 text-xs font-medium ring-1", cor)}>
      <Building2 className="h-3 w-3 shrink-0" />
      <span className="max-w-[220px] truncate">{g.nome}</span>
      <span className="shrink-0">· {laranja ? "dividido" : `${mesmos.length} com ${com}`}</span>
    </button>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{conteudo}</TooltipTrigger>
        <TooltipContent className="max-w-[360px] whitespace-normal">
          <div className="space-y-1">{tip.map((f, i) => <p key={i}>{f}</p>)}</div>
        </TooltipContent>
      </Tooltip>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl" onClick={(e) => e.stopPropagation()}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Grupo {g.nome}</SheetTitle>
            <SheetDescription>{g.membros.length} empresas do grupo nesta carteira · somente leitura</SheetDescription>
          </SheetHeader>
          <div className={cn("mt-4 space-y-1 rounded-md border px-3 py-2 text-sm", laranja ? "border-warning/50 bg-warning/10" : "border-info/40 bg-info/10")}>
            {tip.map((f, i) => <p key={i}>{f}</p>)}
          </div>
          <div className="mt-4 space-y-4">
            {[...g.operadores].sort((a, b) => (a === eu ? -1 : b === eu ? 1 : 0)).map((op) => {
              const ms = g.membros.filter((m) => m.operador_id === op);
              return (
                <section key={op ?? "sem"}>
                  <h3 className={cn("mb-1.5 text-sm font-semibold", op === eu && "text-primary")}>{op ? ms[0]!.operador_nome ?? "—" : "Sem operador"}{op === eu && " (você)"} <span className="font-normal text-muted-foreground">({ms.length})</span></h3>
                  <div className="space-y-1.5">
                    {ms.map((m) => (
                      <div key={`${m.empresa_id}-${m.tipo}`} className={cn("rounded-lg border p-2", m.empresa_id === empresaId && "border-primary ring-1 ring-primary", m.operador_id === eu && eu && "bg-primary/5")}>
                        <div className="flex items-center gap-1.5 font-medium"><span className="truncate">{m.empresa_nome}</span><AlertaPeculiaridade empresaId={m.empresa_id} nome={m.empresa_nome} estatico /></div>
                        <div className="text-xs text-muted-foreground">Padrinho: {m.talento ?? "Sem padrinho"} · Status: {ROT_ST[m.status] ?? m.status}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

const ROT_F: Record<string, string> = { TODOS: "Grupo: Todos", COM: "Com grupo", DIV: "Grupos divididos entre operadores", MEU: "Grupos na minha carteira" };

export function FiltroGrupoSelect({ valor, onChange, grupos }: { valor: string; onChange: (v: string) => void; grupos: InfoGrupo[] }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const rot = ROT_F[valor] ?? `Grupo ${grupos.find((g) => g.id === valor)?.nome ?? "—"}`;
  const esc = (v: string) => { onChange(v); setAberto(false); };
  const lista = grupos.filter((g) => !q || g.nome.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start gap-1.5 font-normal sm:w-56"><Building2 className="h-4 w-4" /><span className="truncate">{rot}</span></Button></PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {Object.entries(ROT_F).map(([v, r]) => <button key={v} onClick={() => esc(v)} className={cn("block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted", valor === v && "font-semibold")}>{v === "TODOS" ? "Todos" : r}</button>)}
        <Input className="my-2 h-8" placeholder="Pesquisar grupo" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-60 overflow-y-auto">
          {lista.map((g) => <button key={g.id} onClick={() => esc(g.id)} className={cn("block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted", valor === g.id && "font-semibold")}>{g.nome} <span className="text-muted-foreground">({g.membros.length})</span></button>)}
          {!lista.length && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum grupo.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
