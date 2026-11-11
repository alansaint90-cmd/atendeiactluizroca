import { useRelogio } from "@/lib/ct/relogio";
import type { AgendaAulas } from "@/lib/aulas/schema";
import { formatarAula } from "@/lib/aulas/schema";
export function ResumoAulas({ dados, erro, abrir, tentar }: { dados: AgendaAulas | null; erro?: string; abrir?: () => void; tentar?: () => void }) {
  const agora = useRelogio();
  const futuras = dados?.aulas.filter(a => Date.parse(a.inicio) > agora) ?? [];
  return <section className="panel" aria-label="Próximas aulas experimentais"><div className="panel-title"><div><div className="ct-eyebrow">CT LUIZ ROCA</div><h2>Próximas aulas experimentais</h2><p>Horários de Brasília · vagas nas turmas cadastradas</p></div><button className="secondary" onClick={abrir}>Ver agenda de aulas</button></div>{erro ? <p role="alert">{erro} <button onClick={tentar}>Tentar novamente</button></p> : !dados ? <p role="status">Consultando aulas…</p> : !futuras.length ? <p className="feature-empty">Nenhuma aula futura cadastrada. Abra a agenda para cadastrar as turmas do CT.</p> : <div className="table"><table><thead><tr><th>Modalidade / turma</th><th>Horário</th><th>Vagas livres</th></tr></thead><tbody>{futuras.slice(0, 5).map(a => <tr key={a.id}><td>{a.modalidade}<small>{a.turma} · {a.professor}</small></td><td>{formatarAula(a.inicio)}</td><td>{a.capacidade - dados.reservas.filter(r => r.aulaId === a.id && r.status === "confirmada").length}</td></tr>)}</tbody></table></div>}</section>;
}
