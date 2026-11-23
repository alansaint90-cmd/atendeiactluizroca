"use client";
import { ocorrenciasAula, rotuloRecorrencia } from "@/lib/aulas/recorrencia";
import { useRelogio } from "@/lib/ct/relogio";

import { useRef, useState, type FormEvent } from "react";
import { aulaSchema, formatarAula, type AulaDados, type AgendaAulas } from "@/lib/aulas/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

export interface PortaAgenda {
  criar: (dados: AulaDados) => Promise<void>;
  cancelar: (alvo: { id: string; atualizadoEm: string }) => Promise<void>;
}
export function AgendaAulasPainel({ dados, porta, local = false }: { dados: AgendaAulas; porta: PortaAgenda; local?: boolean }) {
  const agora = useRelogio();
  const [novo, setNovo] = useState(false), [selecionada, setSelecionada] = useState("");
  const [filtro, setFiltro] = useState(""), [erro, setErro] = useState(""), [aviso, setAviso] = useState(""), [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<{ titulo: string; resumo: string; executar: () => Promise<void> } | null>(null);
  const tituloReservas = useRef<HTMLHeadingElement>(null);
  const aulaSelecionada = dados.aulas.find(a => a.id === selecionada);
  const opcoes = dados.aulas.filter(a => !filtro || a.modalidade.toLocaleLowerCase("pt-BR").includes(filtro.toLocaleLowerCase("pt-BR")));
  const reservas = dados.reservas.filter(r => !aulaSelecionada || r.aulaId === aulaSelecionada.id);
  function proporAula(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro(""); setAviso("");
    const f = new FormData(evento.currentTarget), campo = (nome: string) => String(f.get(nome) ?? "");
    const data = new Date(`${campo("inicio")}:00-03:00`);
    if (Number.isNaN(data.getTime()) || data.getTime() <= agora) { setErro("Escolha uma data e horário futuros."); return; }
    const r = aulaSchema.safeParse({ modalidade: campo("modalidade"), turma: campo("turma"), professor: campo("professor"), inicio: data.toISOString(), duracao: Number(campo("duracao")), capacidade: campo("capacidade") ? Number(campo("capacidade")) : null, idadeMinima: Number(campo("idadeMinima")), idadeMaxima: Number(campo("idadeMaxima")) });
    if (!r.success) { setErro(r.error.issues[0].message); return; }
    setPendente({ titulo: "Cadastrar aula", resumo: `${r.data.modalidade} · ${r.data.turma} · ${formatarAula(r.data.inicio)} · ${r.data.capacidade === null ? "Sem limite de alunos" : `${r.data.capacidade} vagas`}.`, executar: async () => { await porta.criar(r.data); setNovo(false); } });
  }
  return <div className="page-stack ct-agenda-aulas"><header className="page-head"><div><div className="ct-eyebrow">AULAS EXPERIMENTAIS</div><h1>Agenda de aulas</h1><p>Turmas, vagas e o primeiro passo de cada novo aluno.</p></div><button className="primary" onClick={() => { setNovo(!novo); setErro(""); }}> {novo ? "Fechar cadastro" : "+ Cadastrar aula"}</button></header>
    <p className="ct-note">Horários de Brasília · A grade semanal se repete e cada reserva tem sua própria data.</p>
    {erro && <p role="alert" className="ct-error">{erro}</p>}{aviso && <p role="status" className="ct-success">{aviso}</p>}
    {novo && <form className="panel feature-form" onSubmit={proporAula}><h2>Nova aula disponível</h2><div className="ct-form-grid">
      <label>Modalidade<input name="modalidade" required maxLength={150} placeholder="Informe uma modalidade do CT" /></label><label>Turma<input name="turma" required maxLength={150} placeholder="Nome da turma" /></label><label>Professor<input name="professor" required maxLength={150} /></label>
      <label>Data e horário (Brasília)<input name="inicio" type="datetime-local" required /></label><label>Duração em minutos<input name="duracao" type="number" min={15} max={240} required /></label><label>Vagas para experimental (vazio = sem limite)<input name="capacidade" type="number" min={1} max={100} /></label>
      <label>Idade mínima<input name="idadeMinima" type="number" min={0} max={120} required /></label><label>Idade máxima<input name="idadeMaxima" type="number" min={0} max={120} required /></label></div><button className="primary" disabled={ocupado}>Conferir aula</button></form>}
    <section className="panel">
      <div className="panel-title">
        <h2 ref={tituloReservas} tabIndex={-1} className="ct-aulas-reservas-titulo">Alunos agendados</h2>
        {aulaSelecionada && <button type="button" className="secondary" onClick={() => { setSelecionada(""); tituloReservas.current?.focus(); }}>Ver todas as aulas</button>}
      </div>
      {aulaSelecionada && <p className="ct-note" role="status">{aulaSelecionada.modalidade} · {aulaSelecionada.turma} · {aulaSelecionada.diaSemana == null ? formatarAula(aulaSelecionada.inicio) : rotuloRecorrencia(aulaSelecionada)}</p>}
      {!reservas.length ? <p className="feature-empty">Nenhuma reserva registrada.</p> : <div className="table"><table><thead><tr><th>Aluno</th><th>Aula</th><th>WhatsApp</th><th>Status</th><th>Ações</th></tr></thead><tbody>{reservas.map(r => { const a = dados.aulas.find(item => item.id === r.aulaId); return <tr key={r.id}><td><strong>{r.nome}</strong><small>{r.idade === null ? "Adulto" : `${r.idade} anos`}{r.responsavel && ` · Responsável: ${r.responsavel}`}</small></td><td>{a?.modalidade}<small>{a && formatarAula(r.inicio ?? a.inicio)}</small></td><td>{r.telefone}</td><td><span className={`badge ${r.status === "confirmada" ? "green" : "neutral"}`}>{r.status === "confirmada" ? "Confirmada" : "Cancelada"}</span></td><td>{r.status === "confirmada" && <button className="secondary" onClick={() => setPendente({ titulo: "Cancelar reserva", resumo: `Cancelar a reserva de ${r.nome}? A vaga será liberada e o histórico preservado.`, executar: () => porta.cancelar(r) })}>Cancelar</button>}</td></tr>; })}</tbody></table></div>}
    </section>
    <section className="panel"><div className="panel-title"><h2>Aulas cadastradas</h2><label>Buscar modalidade<input type="search" value={filtro} onChange={e => setFiltro(e.target.value)} /></label></div>
      {!opcoes.length ? <div className="feature-empty"><h3>Nenhuma aula {filtro ? "encontrada" : "cadastrada"}</h3>{!filtro && <p>Cadastre os horários e as modalidades do CT.</p>}</div> : <ul className="ct-aulas-lista" aria-label="Aulas cadastradas" role="list">{opcoes.map(a => {
        const proxima = ocorrenciasAula(a, agora)[0];
        const ocupadas = dados.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada" && (!r.inicio || r.inicio === proxima)).length, livres = a.capacidade === null ? null : a.capacidade - ocupadas;
        const horario = a.diaSemana == null ? formatarAula(a.inicio) : rotuloRecorrencia(a);
        return <li key={a.id} className="ct-aula-linha">
          <div className="ct-aula-detalhes">
            <strong>{a.modalidade}</strong>
            <span>{a.turma}</span>
          </div>
          <div className="ct-aula-detalhes">
            <span>{horario} · {a.duracao} min</span>
            <span>{a.professor} · {a.idadeMinima} a {a.idadeMaxima} anos</span>
          </div>
          <span className="ct-aula-vagas">{livres === null ? "Sem limite de alunos" : livres > 0 ? `${livres} de ${a.capacidade} vagas livres` : "Turma lotada"}</span>
          <button
            type="button"
            className="secondary"
            aria-label={`Ver alunos de ${a.modalidade} · ${a.turma} · ${horario}`}
            aria-pressed={aulaSelecionada?.id === a.id}
            onClick={() => { setSelecionada(a.id); tituloReservas.current?.focus(); }}
          >Ver alunos</button>
        </li>;
      })}</ul>}
    </section>
    <ModalConfirmacaoBlock aberto={!!pendente} titulo={pendente?.titulo ?? "Conferir"} mensagem={pendente?.resumo ?? ""} carregando={ocupado} onCancelar={() => setPendente(null)} onConfirmar={() => { if (!pendente || ocupado) return; setOcupado(true); void pendente.executar().then(() => { setAviso(local ? "Alteração salva no ambiente de testes local." : "Alteração salva na agenda do CT."); setPendente(null); }).catch(e => { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); setPendente(null); }).finally(() => setOcupado(false)); }} />
  </div>;
}
