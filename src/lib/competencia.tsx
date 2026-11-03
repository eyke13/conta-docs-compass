import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { COMPETENCIA_INICIAL, mesAtual, type Tipo } from "./extratos";

const Ctx = createContext<{ competencia: string; setCompetencia: (c: string) => void; tipo: Tipo; setTipo: (t: Tipo) => void }>({
  competencia: mesAtual(),
  setCompetencia: () => {},
  tipo: "BANCO",
  setTipo: () => {},
});

export function CompetenciaProvider({ children }: { children: ReactNode }) {
  const [competencia, setC] = useState(mesAtual());
  const [tipo, setT] = useState<Tipo>("BANCO");
  useEffect(() => {
    const s = localStorage.getItem("competencia");
    if (s && s >= COMPETENCIA_INICIAL) setC(s);
    if (localStorage.getItem("area") === "CARTAO") setT("CARTAO");
  }, []);
  const setCompetencia = (c: string) => {
    localStorage.setItem("competencia", c);
    setC(c);
  };
  const setTipo = (t: Tipo) => {
    localStorage.setItem("area", t);
    setT(t);
  };
  return <Ctx.Provider value={{ competencia, setCompetencia, tipo, setTipo }}>{children}</Ctx.Provider>;
}

export const useCompetencia = () => useContext(Ctx);

/** Tipo local (sem alterar a área do topo): usado em telas que escolhem Banco/Cartão por conta própria. */
export function TipoLocal({ tipo, children }: { tipo: Tipo; children: ReactNode }) {
  const pai = useContext(Ctx);
  return <Ctx.Provider value={{ ...pai, tipo }}>{children}</Ctx.Provider>;
}
