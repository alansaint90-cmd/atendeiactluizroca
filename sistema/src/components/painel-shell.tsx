"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { Papel } from "@/lib/db/schema/_enums";
import { nav } from "@/lib/demo/data";
import { icon } from "@/lib/demo/icons";
import { ContaMenu } from "./conta-menu";
import { Marca } from "./marca";
import { podeAcessarRotaPainel } from "@/lib/auth/rotas-painel";
import { empresaPadrao, type DadosEmpresa } from "@/lib/empresa/dados";

interface PainelShellProps {
  papel: Papel;
  email: string;
  rota: string;
  titulo: string;
  aoNavegar: (rota: string) => void;
  children: ReactNode;
  rodape?: ReactNode;
  rotasVisiveis?: readonly string[];
  empresa?: Pick<DadosEmpresa, "nome" | "foto">;
}

export function PainelShell({ papel, email, rota, titulo, aoNavegar, children, rodape, rotasVisiveis, empresa = empresaPadrao }: PainelShellProps) {
  const [recolhido, setRecolhido] = useState(false);
  const menu = nav.filter(([id]) => podeAcessarRotaPainel(papel, id) && (!rotasVisiveis || rotasVisiveis.includes(id)));

  return <div className={`shell tema-atende-pro${recolhido ? " sidebar-collapsed" : ""}`}>
    <aside className="sidebar"><div className="sidebar-marca"><Marca clara /></div><nav aria-label="Menu principal">
      {menu.map(([id, label, ico]) => <button key={id} type="button" className={rota === id ? "active" : ""}
        data-route={id} aria-label={label} aria-current={rota === id ? "page" : undefined}
        onClick={() => aoNavegar(id)}><span className="nav-icone" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(ico) }} /><span className="nav-label">{label}</span></button>)}
    </nav>{rodape ?? <ContaMenu nome={empresa.nome} email={email} foto={empresa.foto} aoAbrirAssinatura={() => aoNavegar("plans")} />}</aside>
    <section className="workspace"><header className="topbar">
      <button className="icon-button" type="button" aria-label="Alternar menu" aria-expanded={!recolhido} onClick={() => setRecolhido(!recolhido)}>☰</button>
      <strong>{titulo}</strong>
    </header>{children}</section>
  </div>;
}
