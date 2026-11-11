import { useRelogio } from "@/lib/ct/relogio";
import type { EstadoLocal } from "@/lib/ct/local";
import { formatarAula } from "@/lib/aulas/schema";
import { icon } from "@/lib/demo/icons";
export function DashboardLocal({ estado, navegar }: { estado: EstadoLocal; navegar: (r: string) => void }) {
  const agora = useRelogio();
  const contatos = estado.registros.filter(r => r.tipo === "contacts"), futuras = estado.aulas.filter(a => Date.parse(a.inicio) > agora).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const reservas = estado.reservas.filter(r => r.status === "confirmada" && futuras.some(a => a.id === r.aulaId));
  const cards = [
    { nome: "Interessados", valor: contatos.length, nota: "Contatos cadastrados", icone: "users", cor: "blue" },
    { nome: "Experimentais agendadas", valor: reservas.length, nota: "Reservas futuras confirmadas", icone: "calendar", cor: "green" },
    { nome: "Vagas disponíveis", valor: futuras.reduce((n, a) => n + a.capacidade, 0) - reservas.length, nota: "Nas aulas futuras cadastradas", icone: "clock", cor: "orange" },
    { nome: "Matriculados", valor: contatos.filter(c => c.status === "Matriculado").length, nota: "Etapa informada no cadastro", icone: "activity", cor: "blue" },
  ];
  return <div className="page-stack dashboard-page"><header className="page-head"><div><div className="ct-eyebrow">CENTRO DE TREINAMENTO LUIZ ROCA</div><h1>O próximo aluno começa aqui.</h1><p>Do primeiro “oi” à primeira aula. Acompanhe o atendimento do CT.</p></div><button className="primary" onClick={() => navegar("consultas")}>Ver agenda de aulas</button></header><section className="kpi-grid">{cards.map(c => <article key={c.nome} className={`kpi ${c.cor}`}><div className="clinica-kpi-label"><span>{c.nome}</span><span dangerouslySetInnerHTML={{ __html: icon(c.icone) }} /></div><strong>{c.valor}</strong><small>{c.nota}</small></article>)}</section>
    <div className="ct-columns"><section className="panel"><div className="panel-title"><div><h2>Próximas aulas</h2><p>Turmas e vagas para receber novos alunos.</p></div><button className="secondary" onClick={() => navegar("consultas")}>Abrir agenda</button></div>{!futuras.length ? <div className="feature-empty"><h3>Sua agenda está pronta para começar</h3><p>Cadastre uma aula com modalidade, professor e vagas para a experimental.</p><button className="primary" onClick={() => navegar("consultas")}>Cadastrar primeira aula</button></div> : <div className="table"><table><thead><tr><th>Modalidade / turma</th><th>Data</th><th>Vagas</th></tr></thead><tbody>{futuras.slice(0, 5).map(a => <tr key={a.id}><td><strong>{a.modalidade}</strong><small>{a.turma} · {a.professor}</small></td><td>{formatarAula(a.inicio)}</td><td><span className="badge green">{a.capacidade - reservas.filter(r => r.aulaId === a.id).length} livres</span></td></tr>)}</tbody></table></div>}</section>
    <aside className="panel"><div className="ct-eyebrow">JORNADA DO ALUNO</div><h2>Um passo de cada vez</h2><ol className="ct-funnel">{["Novo lead", "Em atendimento", "Experimental agendada", "Matriculado"].map(s => <li key={s}><span>{s}</span><strong>{contatos.filter(c => c.status === s).length}</strong></li>)}</ol><p className="ct-note">Etapas atualizadas manualmente em Contatos e leads.</p><button className="secondary" onClick={() => navegar("contacts")}>Ver contatos</button></aside></div>
    <section className="panel"><div className="panel-title"><div><h2>Atendimento pronto para o CT</h2><p>O prompt orienta o acolhimento, a escolha da turma e a conferência antes da reserva.</p></div><button className="secondary" onClick={() => navegar("chatbot")}>Revisar chatbot IA</button></div></section>
  </div>;
}
