import { useState } from "react";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Dia (AAAA-MM-DD) no fuso de Brasília para um instante UTC. */
const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function diaSP(iso: string | Date): string { return fmtSP.format(typeof iso === "string" ? new Date(iso) : iso); }

export type PeriodoRecebido = { de?: string | undefined; ate?: string | undefined };
export const SEM_DATA = "SEM";

/** A linha passa no filtro? (de/ate inclusivos, dias de Brasília) */
export function passaPeriodo(movimentado_em: string | null, p: PeriodoRecebido): boolean {
  if (!p.de) return true;
  if (p.de === SEM_DATA) return !movimentado_em;
  if (!movimentado_em) return false;
  const d = diaSP(movimentado_em);
  return d >= p.de && d <= (p.ate ?? p.de);
}

// aritmética de datas sobre "AAAA-MM-DD" (meio-dia UTC evita virar o dia)
const paraDate = (s: string) => new Date(`${s}T12:00:00Z`);
const deDate = (d: Date) => d.toISOString().slice(0, 10);
const somaDias = (s: string, n: number) => { const d = paraDate(s); d.setUTCDate(d.getUTCDate() + n); return deDate(d); };
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const ddmmaaaa = (s: string) => `${ddmm(s)}/${s.slice(0, 4)}`;

export function rotuloPeriodo(p: PeriodoRecebido): string | null {
  if (!p.de) return null;
  if (p.de === SEM_DATA) return "sem data";
  const ate = p.ate ?? p.de; const hoje = diaSP(new Date());
  if (p.de === ate) return p.de === hoje ? "hoje" : p.de === somaDias(hoje, -1) ? "ontem" : ddmmaaaa(p.de);
  return `${p.de.slice(0, 4) === ate.slice(0, 4) ? ddmm(p.de) : ddmmaaaa(p.de)} a ${ddmmaaaa(ate)}`;
}

function atalhos(): { rot: string; p: PeriodoRecebido }[] {
  const hoje = diaSP(new Date()); const dow = paraDate(hoje).getUTCDay();
  const ini = `${hoje.slice(0, 7)}-01`; const fimAnt = somaDias(ini, -1);
  return [
    { rot: "Todas as datas", p: {} },
    { rot: "Hoje", p: { de: hoje, ate: hoje } },
    { rot: "Ontem", p: { de: somaDias(hoje, -1), ate: somaDias(hoje, -1) } },
    { rot: "Últimos 7 dias", p: { de: somaDias(hoje, -6), ate: hoje } },
    { rot: "Esta semana", p: { de: somaDias(hoje, -dow), ate: hoje } },
    { rot: "Este mês", p: { de: ini, ate: hoje } },
    { rot: "Mês anterior", p: { de: `${fimAnt.slice(0, 7)}-01`, ate: fimAnt } },
    { rot: "Sem data", p: { de: SEM_DATA } },
  ];
}

export function FiltroRecebido({ valor, onChange }: { valor: PeriodoRecebido; onChange: (p: PeriodoRecebido) => void }) {
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<{ from?: Date | undefined; to?: Date | undefined } | undefined>();
  const rot = rotuloPeriodo(valor);
  const aplicar = (p: PeriodoRecebido) => { onChange(p); setAberto(false); };
  const igual = (p: PeriodoRecebido) => (p.de ?? "") === (valor.de ?? "") && (p.ate ?? p.de ?? "") === (valor.ate ?? valor.de ?? "");
  return (
    <div className="flex items-center">
      <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (o) setSel(valor.de && valor.de !== SEM_DATA ? { from: paraDate(valor.de), to: paraDate(valor.ate ?? valor.de) } : undefined); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("justify-start font-normal", rot && "border-primary text-primary", rot && "rounded-r-none")}>
            <CalendarIcon className="h-4 w-4" />Recebido em: {rot ?? "Todas as datas"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto flex-col gap-2 p-2 sm:flex-row" align="start">
          <div className="flex flex-col gap-0.5 sm:w-40">
            {atalhos().map((a) => (
              <Button key={a.rot} size="sm" variant={igual(a.p) ? "secondary" : "ghost"} className="justify-start" onClick={() => aplicar(a.p)}>{a.rot}</Button>
            ))}
          </div>
          <div className="border-t pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
            <p className="px-2 text-xs font-medium text-muted-foreground">Período personalizado</p>
            <Calendar mode="range" locale={ptBR} weekStartsOn={0} selected={sel as never} onSelect={(r: { from?: Date | undefined; to?: Date | undefined } | undefined) => setSel(r)} numberOfMonths={1} className="pointer-events-auto p-3" />
            <div className="flex items-center justify-between gap-2 px-2">
              <span className="text-xs text-muted-foreground">{sel?.from ? `${ddmmaaaa(deLocal(sel.from))}${sel.to ? ` a ${ddmmaaaa(deLocal(sel.to))}` : ""}` : "Escolha o início e o fim"}</span>
              <Button size="sm" disabled={!sel?.from} onClick={() => sel?.from && aplicar({ de: deLocal(sel.from), ate: deLocal(sel.to ?? sel.from) })}>Aplicar</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {rot && <Button variant="outline" size="icon" className="rounded-l-none border-l-0 border-primary text-primary" aria-label="Limpar data" onClick={() => onChange({})}><X className="h-4 w-4" /></Button>}
    </div>
  );
}

/** Data escolhida no calendário (meia-noite local) → AAAA-MM-DD */
function deLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
