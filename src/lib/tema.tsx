import { useCallback, useEffect, useState } from "react";

const CHAVE = "tema";

function temaInicial(): boolean {
  if (typeof window === "undefined") return false;
  const salvo = localStorage.getItem(CHAVE);
  if (salvo) return salvo === "escuro";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function aplicar(escuro: boolean) {
  document.documentElement.classList.toggle("dark", escuro);
}

/** Modo noturno: lê a preferência salva, aplica a classe .dark e persiste a escolha. */
export function useTema() {
  const [escuro, setEscuro] = useState<boolean>(temaInicial);
  useEffect(() => { aplicar(escuro); }, [escuro]);
  const alternar = useCallback(() => {
    setEscuro((v) => {
      const novo = !v;
      localStorage.setItem(CHAVE, novo ? "escuro" : "claro");
      return novo;
    });
  }, []);
  return { escuro, alternar };
}
