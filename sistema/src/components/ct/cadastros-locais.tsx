"use client";
import { useState, type FormEvent } from "react";
import { registroLocalSchema, type EstadoLocal, type RegistroLocal } from "@/lib/ct/local";

const descricoes: Record<RegistroLocal["tipo"], { titulo: string; singular: string; detalhe: string; ajuda: string }> = {
  contacts: { titulo: "Contatos e leads", singular: "contato", detalhe: "Modalidade, objetivo e observações", ajuda: "Acompanhe o interessado desde o primeiro contato até a matrícula." },
  tags: { titulo: "Tags e rótulos", singular: "rótulo", detalhe: "Descrição e critério de uso", ajuda: "Organize interesses, origens de tráfego e etapas do atendimento." },
  campaigns: { titulo: "Campanhas", singular: "campanha", detalhe: "Mensagem da campanha", ajuda: "Prepare campanhas para atrair novos alunos. Os rascunhos locais não fazem disparos." },
  agendamentos: { titulo: "Mensagens agendadas", singular: "mensagem", detalhe: "Texto da mensagem", ajuda: "Prepare lembretes de aula experimental. Nesta versão local nenhum envio é executado." },
  team: { titulo: "Equipe", singular: "membro", detalhe: "Função e observações", ajuda: "Organize recepção, professores e gestão. O cadastro de teste não cria credenciais de acesso." },
  plans: { titulo: "Planos", singular: "plano", detalhe: "Valor, periodicidade e condições", ajuda: "Cadastre os planos de matrícula do CT. Informe os valores oficiais; não há cobrança nesta tela." },
};
export function CadastrosLocais({ tipo, estado, salvar }: { tipo: RegistroLocal["tipo"]; estado: EstadoLocal; salvar: (e: EstadoLocal) => void }) {
  const [busca, setBusca] = useState(""), [editando, setEditando] = useState<RegistroLocal | null>(null), [aberto, setAberto] = useState(false), [aviso, setAviso] = useState(""), [erro, setErro] = useState("");
  const config = descricoes[tipo], itens = estado.registros.filter(r => r.tipo === tipo && `${r.nome} ${r.detalhe} ${r.telefone}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErro(""); const f = new FormData(e.currentTarget);
    const resultado = registroLocalSchema.safeParse({ id: editando?.id ?? crypto.randomUUID(), tipo, nome: f.get("nome"), detalhe: f.get("detalhe"), telefone: f.get("telefone") ?? "", data: f.get("data") ?? "", status: f.get("status") ?? "Rascunho" });
    if (!resultado.success) { setErro(resultado.error.issues[0].message); return; }
    const r = resultado.data;
    if ((tipo === "contacts" || tipo === "agendamentos") && !/^\+[1-9]\d{6,14}$/.test(r.telefone)) { setErro("Informe WhatsApp com DDI e DDD, como +5571999999999."); return; }
    if (tipo === "agendamentos" && (!r.data || Date.parse(r.data) <= Date.now())) { setErro("Escolha data e horário futuros."); return; }
    if (!r.detalhe.trim() && ["campaigns", "agendamentos", "plans"].includes(tipo)) { setErro("Preencha o texto e as condições do cadastro."); return; }
    if (tipo === "tags" && estado.registros.some(i => i.tipo === "tags" && i.id !== r.id && i.nome.toLocaleLowerCase("pt-BR") === r.nome.toLocaleLowerCase("pt-BR"))) { setErro("Já existe um rótulo com esse nome."); return; }
    try { salvar({ ...estado, registros: editando ? estado.registros.map(i => i.id === r.id ? r : i) : [...estado.registros, r] }); setAberto(false); setEditando(null); setAviso("Cadastro salvo neste navegador para testes."); } catch { setErro("Não foi possível salvar no navegador. Confira o espaço disponível."); }
  }
  return <div className="page-stack"><header className="page-head"><div><div className="ct-eyebrow">CT LUIZ ROCA</div><h1>{config.titulo}</h1><p>{config.ajuda}</p></div><button className="primary" onClick={() => { setEditando(null); setAberto(!aberto); setErro(""); }}>{aberto ? "Fechar" : `+ Novo ${config.singular}`}</button></header>
    {aviso && <p role="status" className="ct-success">{aviso}</p>}{erro && <p role="alert" className="ct-error">{erro}</p>}
    {aberto && <form key={editando?.id ?? "novo"} className="panel feature-form" onSubmit={enviar}><h2>{editando ? "Editar" : "Cadastrar"} {config.singular}</h2><div className="ct-form-grid"><label>{tipo === "agendamentos" ? "Identificação do lembrete" : "Nome"}<input name="nome" required maxLength={150} defaultValue={editando?.nome} /></label>
      {(tipo === "contacts" || tipo === "agendamentos") && <label>WhatsApp<input name="telefone" type="tel" required placeholder="+5571999999999" defaultValue={editando?.telefone} /></label>}
      {tipo === "agendamentos" && <label>Data e horário (horário deste navegador)<input type="datetime-local" name="data" required defaultValue={editando?.data} /></label>}
      {tipo === "contacts" && <label>Etapa<select name="status" defaultValue={editando?.status ?? "Novo lead"}>{["Novo lead", "Em atendimento", "Experimental agendada", "Matriculado"].map(s => <option key={s}>{s}</option>)}</select></label>}
    </div><label>{config.detalhe}<textarea name="detalhe" rows={4} maxLength={6000} defaultValue={editando?.detalhe} /></label><div className="feature-actions"><button className="primary">Salvar {config.singular}</button><button className="secondary" type="button" onClick={() => setAberto(false)}>Cancelar edição</button></div></form>}
    <section className="panel"><div className="panel-title"><h2>{itens.length} {itens.length === 1 ? "registro" : "registros"}</h2><label>Buscar<input type="search" value={busca} onChange={e => setBusca(e.target.value)} /></label></div>
      {!itens.length ? <div className="feature-empty"><h3>{busca ? "Nenhum resultado" : "Comece pelo primeiro cadastro"}</h3><p>{busca ? "Tente buscar por outro termo." : `Adicione um ${config.singular} para testar este módulo.`}</p></div> : <div className="table"><table><thead><tr><th>Nome</th><th>Detalhes</th><th>Status</th><th>Ações</th></tr></thead><tbody>{itens.map(r => <tr key={r.id}><td><strong>{r.nome}</strong><small>{r.telefone}</small></td><td><span className="ct-wrap">{r.detalhe || "Sem observações"}</span>{r.data && <small>{new Date(r.data).toLocaleString("pt-BR")}</small>}</td><td><span className="badge">{r.status}</span></td><td><button className="secondary" onClick={() => { setEditando(r); setAberto(true); setErro(""); }}>Editar</button></td></tr>)}</tbody></table></div>}
    </section>{(tipo === "campaigns" || tipo === "agendamentos") && <p className="ct-note">Rascunhos de teste. Não há disparos, cobranças ou processamento automático neste ambiente.</p>}
  </div>;
}
