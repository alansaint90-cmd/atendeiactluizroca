"use client";
import { useEffect, useState } from "react";
import { PainelShell } from "@/components/painel-shell";
import { AgendaAulasPainel } from "@/components/aulas/agenda";
import { CadastrosLocais } from "@/components/ct/cadastros-locais";
import { AutomacoesLocais } from "@/components/ct/automacoes-locais";
import { DashboardLocal } from "@/components/ct/dashboard-local";
import { InboxLocal } from "@/components/ct/inbox-local";
import { novoEstadoLocal, lerEstadoLocal, reservarLocal, CHAVE_CT, type EstadoLocal, type RegistroLocal } from "@/lib/ct/local";
import { chatbotExample } from "@/lib/chatbots/defaults";
import { nav } from "@/lib/demo/data";
import "./previa.css";
export function PreviaDesign() {
  const [rota, setRota] = useState("dashboard"), [estado, setEstado] = useState<EstadoLocal | null>(null), [erro, setErro] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try { const salvo = localStorage.getItem(CHAVE_CT); setEstado(salvo ? lerEstadoLocal(salvo) : novoEstadoLocal(chatbotExample)); } catch { setErro("Não foi possível ler os dados locais. O conteúdo existente foi preservado; verifique o armazenamento do navegador."); }
      const r = new URLSearchParams(location.search).get("view"); if (nav.some(([id]) => id === r)) setRota(r!);
    }, 0);
    const voltar = () => { const r = new URLSearchParams(location.search).get("view") ?? "dashboard"; if (nav.some(([id]) => id === r)) setRota(r); };
    window.addEventListener("popstate", voltar);
    return () => { clearTimeout(timer); window.removeEventListener("popstate", voltar); };
  }, []);
  function navegar(r: string) { setRota(r); history.pushState(null, "", `/previa-design?view=${r}`); window.scrollTo({ top: 0 }); }
  function salvar(e: EstadoLocal) { const validado = lerEstadoLocal(JSON.stringify(e)); localStorage.setItem(CHAVE_CT, JSON.stringify(validado)); setEstado(validado); }
  const cadastros = ["contacts", "tags", "campaigns", "agendamentos", "team", "plans"];
  return <PainelShell papel="super_admin" nome="Equipe CT Luiz Roca" email="Ambiente local" rota={rota} titulo={nav.find(([id]) => id === rota)?.[1] ?? "Dashboard"} aoNavegar={navegar}
    rodape={<div className="account"><div className="account-identity"><span className="account-avatar">CT</span><span className="account-details"><strong>CT Luiz Roca</strong><small>Ambiente de testes</small></span></div><a className="ct-sair" href="/entrar">Ver tela de login</a></div>}>
    <main className="content"><div className="ct-local-banner"><span><strong>Ambiente local de testes</strong> · Dados salvos neste navegador. Sem envios ao WhatsApp ou cobranças.</span><a href="/entrar">Tela de login ↗</a></div>
      {erro && <p role="alert">{erro}</p>}{!estado && !erro && <p role="status">Carregando ambiente do CT…</p>}
      {estado && <>{rota === "dashboard" && <DashboardLocal estado={estado} navegar={navegar} />}
        {rota === "consultas" && <AgendaAulasPainel dados={estado} local porta={{ criar: async a => { salvar({ ...estado, aulas: [...estado.aulas, { ...a, id: crypto.randomUUID(), atualizadoEm: new Date().toISOString() }] }); }, reservar: async r => salvar({ ...estado, ...reservarLocal(estado, r) }), cancelar: async r => { const alvo = estado.reservas.find(i => i.id === r.id); if (!alvo || alvo.atualizadoEm !== r.atualizadoEm || alvo.status !== "confirmada") throw new Error("Reserva alterada. Reabra a agenda."); salvar({ ...estado, reservas: estado.reservas.map(i => i.id === r.id ? { ...i, status: "cancelada", atualizadoEm: new Date().toISOString() } : i) }); } }} />}
        {cadastros.includes(rota) && <CadastrosLocais key={rota} tipo={rota as RegistroLocal["tipo"]} estado={estado} salvar={salvar} />}
        {["chatbot", "flows", "followups", "settings"].includes(rota) && <AutomacoesLocais key={rota} rota={rota} estado={estado} salvar={salvar} />}
        {rota === "inbox" && <InboxLocal estado={estado} salvar={salvar} aoContatos={() => navegar("contacts")} />}
      </>}
    </main>
  </PainelShell>;
}
