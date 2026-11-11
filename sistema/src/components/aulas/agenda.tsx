"use client";
import { useRelogio } from "@/lib/ct/relogio";

import { useState, type FormEvent } from "react";
import { aulaSchema, alunoSchema, formatarAula, type AulaDados, type AlunoDados, type AgendaAulas } from "@/lib/aulas/schema";
import { ModalConfirmacaoBlock } from "../modal-confirmacao-block";

export interface PortaAgenda {
  criar: (dados: AulaDados) => Promise<void>;
  reservar: (dados: { aulaId: string; aluno: AlunoDados; solicitacaoId: string; conferido: true }) => Promise<void>;
  cancelar: (alvo: { id: string; atualizadoEm: string }) => Promise<void>;
}
export function AgendaAulasPainel({ dados, porta, local = false }: { dados: AgendaAulas; porta: PortaAgenda; local?: boolean }) {
  const agora = useRelogio();
  const [novo, setNovo] = useState(false), [selecionada, setSelecionada] = useState("");
  const [filtro, setFiltro] = useState(""), [erro, setErro] = useState(""), [aviso, setAviso] = useState(""), [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<{ titulo: string; resumo: string; executar: () => Promise<void> } | null>(null);
  const aula = dados.aulas.find(a => a.id === selecionada);
  const opcoes = dados.aulas.filter(a => !filtro || a.modalidade.toLocaleLowerCase("pt-BR").includes(filtro.toLocaleLowerCase("pt-BR")));
  const reservas = dados.reservas.filter(r => !selecionada || r.aulaId === selecionada);
  function propor(evento: FormEvent<HTMLFormElement>, tipo: "aula" | "reserva") {
    evento.preventDefault(); setErro(""); setAviso("");
    const f = new FormData(evento.currentTarget), campo = (nome: string) => String(f.get(nome) ?? "");
    if (tipo === "aula") {
      const data = new Date(`${campo("inicio")}:00-03:00`);
      if (Number.isNaN(data.getTime()) || data.getTime() <= agora) { setErro("Escolha uma data e horário futuros."); return; }
      const r = aulaSchema.safeParse({ modalidade: campo("modalidade"), turma: campo("turma"), professor: campo("professor"), inicio: data.toISOString(), duracao: Number(campo("duracao")), capacidade: Number(campo("capacidade")), idadeMinima: Number(campo("idadeMinima")), idadeMaxima: Number(campo("idadeMaxima")) });
      if (!r.success) { setErro(r.error.issues[0].message); return; }
      setPendente({ titulo: "Cadastrar aula", resumo: `${r.data.modalidade} · ${r.data.turma} · ${formatarAula(r.data.inicio)} · ${r.data.capacidade} vagas.`, executar: async () => { await porta.criar(r.data); setNovo(false); } });
    } else if (aula) {
      const r = alunoSchema.safeParse({ nome: campo("nome"), idade: Number(campo("idade")), telefone: campo("telefone"), responsavel: campo("responsavel") });
      if (!r.success) { setErro(r.error.issues[0].message); return; }
      const solicitacaoId = crypto.randomUUID();
      setPendente({ titulo: "Confirmar aula experimental", resumo: `${r.data.nome}, ${r.data.idade} anos · ${r.data.telefone}${r.data.responsavel ? ` · Responsável: ${r.data.responsavel}` : ""} · ${aula.modalidade}, ${aula.turma} · ${formatarAula(aula.inicio)}. Confira as condições da aula com o interessado.`, executar: () => porta.reservar({ aulaId: aula.id, aluno: r.data, solicitacaoId, conferido: true }) });
    }
  }
  return <div className="page-stack"><header className="page-head"><div><div className="ct-eyebrow">CT LUIZ ROCA · AULAS EXPERIMENTAIS</div><h1>Agenda de aulas</h1><p>Turmas, vagas e o primeiro passo de cada novo aluno.</p></div><button className="primary" onClick={() => { setNovo(!novo); setErro(""); }}> {novo ? "Fechar cadastro" : "+ Cadastrar aula"}</button></header>
    <p className="ct-note">Horários de Brasília · Cada cadastro corresponde a uma aula em data específica. {local ? "Reservas de teste ficam apenas neste navegador." : "A reserva não envia mensagem automaticamente."}</p>
    {erro && <p role="alert" className="ct-error">{erro}</p>}{aviso && <p role="status" className="ct-success">{aviso}</p>}
    {novo && <form className="panel feature-form" onSubmit={e => propor(e, "aula")}><h2>Nova aula disponível</h2><div className="ct-form-grid">
      <label>Modalidade<input name="modalidade" required maxLength={150} placeholder="Informe uma modalidade do CT" /></label><label>Turma<input name="turma" required maxLength={150} placeholder="Nome da turma" /></label><label>Professor<input name="professor" required maxLength={150} /></label>
      <label>Data e horário (Brasília)<input name="inicio" type="datetime-local" required /></label><label>Duração em minutos<input name="duracao" type="number" min={15} max={240} required /></label><label>Vagas para experimental<input name="capacidade" type="number" min={1} max={100} required /></label>
      <label>Idade mínima<input name="idadeMinima" type="number" min={0} max={120} required /></label><label>Idade máxima<input name="idadeMaxima" type="number" min={0} max={120} required /></label></div><button className="primary" disabled={ocupado}>Conferir aula</button></form>}
    <section className="panel"><div className="panel-title"><h2>Aulas cadastradas</h2><label>Buscar modalidade<input type="search" value={filtro} onChange={e => setFiltro(e.target.value)} /></label></div>
      {!opcoes.length ? <div className="feature-empty"><h3>Nenhuma aula {filtro ? "encontrada" : "cadastrada"}</h3><p>Cadastre os horários e as modalidades reais do CT para começar a reservar.</p></div> : <div className="ct-aulas-grid">{opcoes.map(a => {
        const ocupadas = dados.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada").length, livres = a.capacidade - ocupadas;
        return <button key={a.id} type="button" className={`ct-aula ${selecionada === a.id ? "selecionada" : ""}`} aria-pressed={selecionada === a.id} onClick={() => { setSelecionada(a.id); setErro(""); setAviso(""); }}><span className="badge">{a.modalidade}</span><strong>{a.turma}</strong><span>{formatarAula(a.inicio)} · {a.duracao} min</span><span>{a.professor} · {a.idadeMinima} a {a.idadeMaxima} anos</span><b>{livres > 0 ? `${livres} de ${a.capacidade} vagas livres` : "Turma lotada"}</b></button>;
      })}</div>}
    </section>
    {aula && <form key={aula.id} className="panel feature-form" onSubmit={e => propor(e, "reserva")}><h2>Reservar experimental · {aula.turma}</h2><p>{formatarAula(aula.inicio)} · {aula.modalidade}</p><div className="ct-form-grid"><label>Nome completo do aluno<input name="nome" required maxLength={150} autoComplete="off" /></label><label>Idade<input name="idade" type="number" min={aula.idadeMinima} max={aula.idadeMaxima} required /></label><label>WhatsApp do aluno ou responsável<input name="telefone" type="tel" required placeholder="+5571999999999" /></label><label>Nome completo do responsável (menor de 18 anos)<input name="responsavel" maxLength={150} /></label></div><button className="primary" disabled={ocupado || Date.parse(aula.inicio) <= agora}>Conferir reserva</button></form>}
    <section className="panel"><div className="panel-title"><h2>Alunos agendados</h2>{selecionada && <button className="secondary" onClick={() => setSelecionada("")}>Ver todas as aulas</button>}</div>{!reservas.length ? <p className="feature-empty">Nenhuma reserva registrada.</p> : <div className="table"><table><thead><tr><th>Aluno</th><th>Aula</th><th>WhatsApp</th><th>Status</th><th>Ações</th></tr></thead><tbody>{reservas.map(r => { const a = dados.aulas.find(item => item.id === r.aulaId); return <tr key={r.id}><td><strong>{r.nome}</strong><small>{r.idade} anos{r.responsavel && ` · Responsável: ${r.responsavel}`}</small></td><td>{a?.modalidade}<small>{a && formatarAula(a.inicio)}</small></td><td>{r.telefone}</td><td><span className={`badge ${r.status === "confirmada" ? "green" : "neutral"}`}>{r.status === "confirmada" ? "Confirmada" : "Cancelada"}</span></td><td>{r.status === "confirmada" && <button className="secondary" onClick={() => setPendente({ titulo: "Cancelar reserva", resumo: `Cancelar a reserva de ${r.nome}? A vaga será liberada e o histórico preservado.`, executar: () => porta.cancelar(r) })}>Cancelar</button>}</td></tr>; })}</tbody></table></div>}</section>
    <ModalConfirmacaoBlock aberto={!!pendente} titulo={pendente?.titulo ?? "Conferir"} mensagem={pendente?.resumo ?? ""} carregando={ocupado} onCancelar={() => setPendente(null)} onConfirmar={() => { if (!pendente || ocupado) return; setOcupado(true); void pendente.executar().then(() => { setAviso(local ? "Alteração salva no ambiente de testes local." : "Alteração salva na agenda do CT."); setPendente(null); }).catch(e => { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); setPendente(null); }).finally(() => setOcupado(false)); }} />
  </div>;
}
