import { ROT_AMBOS } from "@/lib/extratos";
import { useFiltroOperador } from "@/lib/filtroOperador";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Carregando, StatusBancoSelect, useDadosAmbos } from "@/components/extratos";
import { fmtDataHora } from "@/lib/extratos";

/** Aba BANCO | CARTÃO do Operador: itens com erro de acesso nas duas áreas (era a tela "Itens com Erro"). */
export function ItensComErro() {
  const { data, isLoading } = useDadosAmbos();
  const R = ROT_AMBOS;
  const [emp, setEmp] = useState("");
  const [banco, setBanco] = useState("");
  const [opSel, setOp, opPronto] = useFiltroOperador();
  const op = opSel === "TODOS" || (data?.linhas ?? []).some((l) => l.operador_id === opSel) ? opSel : "TODOS";
  const erros = useMemo(() => (data?.linhas ?? []).flatMap((l) => l.bancos.filter((b) => b.status === "ERRO").map((b) => ({ l, b })))
    .filter(({ l, b }) =>
      l.empresa_nome.toLowerCase().includes(emp.toLowerCase()) &&
      b.banco_nome.toLowerCase().includes(banco.toLowerCase()) &&
      (op === "TODOS" || l.operador_id === op)), [data, emp, banco, op]);
  if (isLoading || !opPronto) return <Carregando />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{R.itens} com erro de acesso <span className="font-medium text-foreground">({erros.length})</span></p>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Filtrar empresa" value={emp} onChange={(e) => setEmp(e.target.value)} />
        <Input className="max-w-xs" placeholder={`Filtrar ${R.item.toLowerCase()}`} value={banco} onChange={(e) => setBanco(e.target.value)} />
        <Select value={op} onValueChange={setOp}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os operadores</SelectItem>
            {data?.operadores.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>{R.item}</TableHead><TableHead>Responsável</TableHead><TableHead>Comentário</TableHead><TableHead>Última atualização</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {erros.map(({ l, b }) => (
              <TableRow key={b.id}>
                <TableCell><Link to="/controle" search={{ empresa: l.empresa_id }} className="font-medium text-primary hover:underline">{l.empresa_nome}</Link></TableCell>
                <TableCell>{b.banco_nome}</TableCell>
                <TableCell>{l.operador?.nome ?? "—"}</TableCell>
                <TableCell className="max-w-xs text-sm">{b.comentario ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{b.atualizado_por}<br />{fmtDataHora(b.atualizado_em)}</TableCell>
                <TableCell><StatusBancoSelect b={b} empresaNome={l.empresa_nome} /></TableCell>
              </TableRow>
            ))}
            {erros.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum {R.item.toLowerCase()} com erro de login nesta competência.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
