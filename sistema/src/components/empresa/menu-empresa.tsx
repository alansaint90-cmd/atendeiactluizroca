"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DadosEmpresa } from "@/lib/empresa/dados";
import { AvatarEmpresa } from "./avatar-empresa";

export function MenuEmpresa({ empresa, aoEditar }: { empresa: Pick<DadosEmpresa, "nome" | "foto">; aoEditar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const menuId = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fecharFora(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener("pointerdown", fecharFora);
    return () => document.removeEventListener("pointerdown", fecharFora);
  }, [aberto]);

  return <div className="empresa-menu" ref={raiz}
    onBlur={evento => { if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false); }}
    onKeyDown={evento => {
      if (aberto && evento.key === "Escape") {
        evento.preventDefault();
        setAberto(false);
        botao.current?.focus();
      }
    }}>
    {aoEditar ? <button type="button" className="empresa-identidade empresa-acionador" ref={botao}
      aria-label={`Opções de ${empresa.nome}`} aria-expanded={aberto} aria-controls={menuId}
      onClick={() => setAberto(atual => !atual)}>
      <AvatarEmpresa {...empresa} /><span className="empresa-nome" title={empresa.nome}>{empresa.nome}</span>
      <span className="empresa-seta" aria-hidden="true" />
    </button> : <div className="empresa-identidade">
      <AvatarEmpresa {...empresa} /><span className="empresa-nome" title={empresa.nome}>{empresa.nome}</span>
    </div>}
    {aoEditar && <div id={menuId} className="empresa-opcoes" hidden={!aberto}>
      <button type="button" onClick={() => {
        setAberto(false);
        botao.current?.focus();
        aoEditar();
      }}>Editar identidade da empresa</button>
    </div>}
  </div>;
}
