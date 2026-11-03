import { useMemo, useState } from "react";
import { Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entregarArquivo } from "@/lib/entregarArquivo";
import { diaInicial, diaPadrao, montarSlide } from "@/lib/relatoriosSlide";
import { rotuloComp } from "@/lib/extratos";
import type { DadosRelatorios } from "@/lib/relatorios";

const ultimoDia = (comp: string) => {
  const d = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Terceira modalidade de exportação: o relatório em slide (PowerPoint), alimentado por Conciliação e Cobrança. */
export function DialogRelatorioSlide({ d, comp, open, onOpenChange }: { d: DadosRelatorios; comp: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [dia, setDia] = useState(() => diaPadrao(comp));
  const [sol, setSol] = useState("");
  const [gerando, setGerando] = useState(false);
  const desde = diaInicial(comp), ate = ultimoDia(comp);
  const soNumero = /^\d+$/.test(sol.trim());
  const solicitacoes = soNumero ? Number(sol.trim()) : 0;
  const r = useMemo(() => montarSlide(d, comp, dia, solicitacoes), [d, comp, dia, solicitacoes]);
  const gerar = async () => {
    if (!soNumero) return;
    setGerando(true);
    try {
      const { criarSlidePptx } = await import("@/lib/relatoriosSlidePptx");
      await entregarArquivo(await criarSlidePptx(r), `Elite-Relatorio-Slide-${comp}.pptx`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PowerPoint.");
    } finally { setGerando(false); }
  };
  const vindas = [
    { label: "Ligações realizadas", valor: r.ligacoes },
    { label: "Contatos por WhatsApp", valor: r.whats },
    { label: "Clientes 100% na data", valor: r.clientes100 },
    { label: "Meses conciliados", valor: r.mesesConciliados },
    { label: "Empresas conciliadas", valor: r.conciliadas.length },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Presentation className="size-4" />Relatório em Slide (PowerPoint)</DialogTitle>
          <DialogDescription>Apresentação no padrão da Elite: cobrança e conciliação. Os números do banco consideram tudo que foi feito de {diaInicial(comp).slice(8, 10)}/{comp.slice(5, 7)}/{comp.slice(0, 4)} até o dia escolhido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="slide-dia">Data do relatório</Label>
            <Input id="slide-dia" type="date" min={desde} max={ate} value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slide-sol">Informe a quantidade de solicitações recebidas</Label>
            <Input id="slide-sol" type="number" min={0} step={1} inputMode="numeric" placeholder="0" value={sol} onChange={(e) => setSol(e.target.value)} aria-invalid={!soNumero && sol !== ""} />
            {sol !== "" && !soNumero && <p className="text-xs text-destructive">Informe um número inteiro igual ou maior que zero.</p>}
          </div>
          <p className="text-xs text-muted-foreground">Somente as solicitações são informadas por você; ligações, WhatsApp, clientes 100% e conciliações vêm dos registros reais.</p>
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold">Conferência até {dia.split("-").reverse().join("/")}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {vindas.map((v) => (
                <div key={v.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{v.label}</span>
                  <span className="font-semibold tabular-nums">{v.valor}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Solicitações informadas</span>
                <span className="font-semibold tabular-nums">{soNumero ? solicitacoes : "—"}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando || !soNumero || dia < desde || dia > ate}>
            <Presentation className="size-4" />{gerando ? "Gerando..." : "Gerar PowerPoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
