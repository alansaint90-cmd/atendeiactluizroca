import { useRelogio } from "@/lib/ct/relogio";
import type { ReactNode } from "react";
import type { PainelOperacional } from "@/lib/operacao/painel";
import type { AgendaAulas } from "@/lib/aulas/schema";
import { icon } from "@/lib/demo/icons";

interface ResumoClinicaProps {
  dados: PainelOperacional | null;
  agenda: AgendaAulas | null;
  periodo: string;
  podeVerAgenda: boolean;
  aoVerAgenda?: () => void;
  filtros?: ReactNode;
}
export function ResumoClinica({ dados, agenda, periodo, podeVerAgenda, aoVerAgenda, filtros }: ResumoClinicaProps) {
  const agora = useRelogio();
  const percentual = dados?.totalAtendidas ? Math.round(dados.atendidasIa / dados.totalAtendidas * 100) : 0;
  const futuras = agenda?.aulas.filter(a => Date.parse(a.inicio) > agora) ?? [];
  const confirmadas = agenda?.reservas.filter(r => r.status === "confirmada" && futuras.some(a => a.id === r.aulaId)).length ?? 0;
  const cards = [
    { nome: "Conversas no período", valor: dados?.novas, nota: periodo, cor: "blue", icone: "message" },
    { nome: "Atendimentos pela IA", valor: dados?.atendidasIa, nota: dados ? `${percentual}% das conversas atendidas` : "Aguardando indicadores", cor: "green", icone: "spark" },
    ...(podeVerAgenda ? [
      { nome: "Experimentais confirmadas", valor: agenda ? confirmadas : undefined, nota: "Reservas nas aulas futuras", cor: "blue", icone: "calendar" },
      { nome: "Vagas disponíveis", valor: agenda ? futuras.reduce((n, a) => n + a.capacidade, 0) - confirmadas : undefined, nota: "Nas turmas futuras do CT", cor: "orange", icone: "clock" },
    ] : []),
  ];
  return <>
    <header className="page-head"><div><div className="ct-eyebrow">CENTRO DE TREINAMENTO LUIZ ROCA</div><h1>Seu atendimento, em dia.</h1><p>Acompanhe os interessados e prepare as próximas aulas experimentais.</p></div>
      {podeVerAgenda && <button type="button" className="primary" onClick={aoVerAgenda}><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon("calendar") }} />Ver agenda</button>}
    </header>
    {filtros}
    <section className="kpi-grid clinica-resumo" aria-label="Resumo do CT Luiz Roca">{cards.map(c => <article className={`kpi ${c.cor}`} key={c.nome}>
      <div className="clinica-kpi-label"><span>{c.nome}</span><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(c.icone) }} /></div>
      <strong>{c.valor ?? "—"}</strong><small>{c.nota}</small>
    </article>)}</section>
  </>;
}
