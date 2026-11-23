"use client";
import {CampanhasPage} from "./campanhas/page";
import {FluxosPage} from "./fluxos/page";
import { useEffect, useState } from "react";
import { PainelShell } from "./painel-shell";
import { nav } from "@/lib/demo/data";
import { demoViews } from "@/lib/demo/views";
import { ChatbotsPage } from "./chatbots/page";
import { OperacaoPage } from "./operacao/page";
import { Settings } from "./settings";
import { FollowupsPage } from "./followups/page";
import { TagsPage } from "./tags/page";
import { AgendamentosPage } from "./agendamentos/page";
import { AulasPage } from "./aulas/page";
import { UsuariosPage } from "./usuarios/page";
import { AssinaturaPage } from "./assinatura/page";
import type { Papel } from "@/lib/db/schema/_enums";
import type { DadosEmpresa } from "@/lib/empresa/dados";
import { FormularioEmpresa } from "./empresa/formulario-empresa";

export function Workspace({ papel, nome, email, foto, empresaInicial, rotaInicial = "dashboard" }: { papel: Papel; nome: string; email: string; foto?: string | null; empresaInicial: DadosEmpresa; rotaInicial?: string }) {
  const [route, setRoute] = useState(rotaInicial);
  const [salva, setSalva] = useState<DadosEmpresa | null>(null);
  const [aberturasEmpresa, setAberturasEmpresa] = useState(0);
  const empresa = salva && salva.atualizadoEm > empresaInicial.atualizadoEm ? salva : empresaInicial;
  const gestor = papel === "admin" || papel === "super_admin";
  useEffect(() => {
    if (aberturasEmpresa) document.getElementById("nome-empresa")?.focus();
  }, [aberturasEmpresa]);
  return <PainelShell papel={papel} nome={nome} email={email} foto={foto} empresa={empresa} rota={route}
    titulo={route === "plans" ? "Minha assinatura" : nav.find(item => item[0] === route)?.[1] ?? "Dashboard"}
    aoNavegar={setRoute} aoEditarEmpresa={() => { setRoute("settings"); setAberturasEmpresa(atual => atual + 1); }}>
      <main className={`content${route === "inbox" ? " content-conversas" : ""}`}>
        {/* Keep form drafts mounted across navigation, but hide inactive sections. */}
        {gestor && <><div hidden={route !== "chatbot"} className="page-stack"><ChatbotsPage ativo={route === "chatbot"} /></div>
        <div hidden={route !== "followups"}><FollowupsPage ativo={route === "followups"} /></div>
        <div hidden={route !== "campaigns"}><CampanhasPage ativoNaTela={route === "campaigns"}/></div>
        <div hidden={route !== "flows"}><FluxosPage ativo={route === "flows"}/></div>
        <div hidden={route !== "tags"}><TagsPage ativo={route === "tags"} /></div>
        <div hidden={route !== "agendamentos"}><AgendamentosPage ativoNaTela={route === "agendamentos"} /></div>
        <div hidden={route !== "consultas"}><AulasPage ativoNaTela={route === "consultas"} /></div></>}
        {gestor && route === "team" && <UsuariosPage papel={papel} />}
        {papel === "super_admin" && route === "settings" && <><FormularioEmpresa inicial={empresa} aoSalvar={setSalva} /><Settings /></>}
        {route === "plans" && <AssinaturaPage />}
        <div hidden={!["dashboard", "contacts", "inbox"].includes(route)}><OperacaoPage rota={route} podeVerAgenda={gestor} aoVerAgenda={() => setRoute("consultas")} /></div>
        {!["dashboard", "contacts", "inbox", "team", "plans", "flows", "campaigns"].includes(route) && demoViews[route] && <div className="page-stack demo-view" dangerouslySetInnerHTML={{ __html: demoViews[route]() }} />}
      </main>
  </PainelShell>;
}
