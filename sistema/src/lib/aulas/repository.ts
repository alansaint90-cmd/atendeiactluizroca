import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { type BancoSql, type TransacaoSql, linhas } from "../db/porta";
import { aulas, aulasReservas } from "../db/schema/agenda-aulas";
import { vivos, travaDeColisao } from "../db/soft-delete";
import { ErroDeNegocio } from "../acao";
import { aulaSchema, reservaAulaSchema, alvoAulaSchema, validarVaga, type Aula, type ReservaAula } from "./schema";

const camposAula = sql`id,modalidade,turma,professor,inicio,duracao,capacidade,dia_semana AS "diaSemana",idade_minima AS "idadeMinima",idade_maxima AS "idadeMaxima",updated_at AS "atualizadoEm"`;
const camposReserva = sql`id,aula_id AS "aulaId",solicitacao_id AS "solicitacaoId",inicio,nome,idade,telefone,responsavel,status,updated_at AS "atualizadoEm"`;
const normalizar = <T extends { atualizadoEm: string }>(r: T): T => ({ ...r, atualizadoEm: new Date(r.atualizadoEm).toISOString() });
async function auditar(tx: TransacaoSql, id: string, acao: string, autor: string) {
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${acao},'aula',${id},'[]'::jsonb,${autor})`);
}
export async function consultarAulas(banco: BancoSql) {
  const itens = linhas<Aula>(await banco.execute(sql`SELECT ${camposAula} FROM atendeia_aulas WHERE ${vivos(aulas)} ORDER BY inicio`));
  const reservas = linhas<ReservaAula>(await banco.execute(sql`SELECT ${camposReserva} FROM atendeia_aulas_reservas WHERE ${vivos(aulasReservas)} ORDER BY created_at`));
  return { aulas: itens.map(a => ({ ...normalizar(a), inicio: new Date(a.inicio).toISOString() })), reservas: reservas.map(r => ({ ...normalizar(r), inicio: r.inicio ? new Date(r.inicio).toISOString() : null })) };
}
export async function criarAula(banco: BancoSql, entrada: unknown, autor: string) {
  const a = aulaSchema.parse(entrada);
  if (Date.parse(a.inicio) <= Date.now()) throw new ErroDeNegocio("Cadastre uma aula em data futura.");
  return banco.transaction(async tx => {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO atendeia_aulas(id,modalidade,turma,professor,inicio,duracao,capacidade,idade_minima,idade_maxima,dia_semana,modified_by)
      VALUES(${id},${a.modalidade},${a.turma},${a.professor},${a.inicio}::timestamptz,${a.duracao},${a.capacidade},${a.idadeMinima},${a.idadeMaxima},${a.diaSemana ?? null},${autor})`);
    await auditar(tx, id, "aula_criada", autor); return { id };
  });
}
export async function reservarAula(banco: BancoSql, entrada: unknown, autor: string) {
  const r = reservaAulaSchema.parse(entrada);
  return banco.transaction(async tx => {
    // A trava por aula serializa a contagem e impede ultrapassar a capacidade.
    const [aula] = linhas<Aula>(await tx.execute(sql`SELECT ${camposAula} FROM atendeia_aulas WHERE id=${r.aulaId} AND ${vivos(aulas)} FOR UPDATE`));
    if (!aula) throw new ErroDeNegocio("Aula indisponível.");
    const inicio = r.inicio ?? new Date(aula.inicio).toISOString();
    const local = new Date(Date.parse(inicio) - 3 * 3600000), base = new Date(Date.parse(aula.inicio) - 3 * 3600000);
    if (aula.diaSemana != null ? local.getUTCDay() !== aula.diaSemana || local.getUTCHours() !== base.getUTCHours() || local.getUTCMinutes() !== base.getUTCMinutes() || local.getUTCSeconds() !== base.getUTCSeconds() || local.getUTCMilliseconds() !== base.getUTCMilliseconds() : Date.parse(inicio) !== Date.parse(aula.inicio)) throw new ErroDeNegocio("Data e horário não correspondem à aula cadastrada.");
    const [existente] = linhas<ReservaAula & { autor: string }>(await tx.execute(sql`SELECT ${camposReserva},modified_by AS autor FROM atendeia_aulas_reservas WHERE solicitacao_id=${r.solicitacaoId} AND ${vivos(aulasReservas)}`));
    if (existente) {
      if (existente.aulaId !== r.aulaId || (existente.inicio && Date.parse(existente.inicio) !== Date.parse(inicio)) || existente.autor !== autor || existente.status !== "confirmada" || existente.nome !== r.aluno.nome || existente.idade !== r.aluno.idade || existente.telefone !== r.aluno.telefone || existente.responsavel !== r.aluno.responsavel) throw new ErroDeNegocio("Solicitação já utilizada. Atualize a agenda.");
      return { id: existente.id };
    }
    const reservas = linhas<ReservaAula>(await tx.execute(sql`SELECT ${camposReserva} FROM atendeia_aulas_reservas WHERE aula_id=${r.aulaId} AND ${vivos(aulasReservas)}`));
    try { validarVaga({ ...aula, inicio }, r.aluno, reservas.filter(item => !item.inicio || Date.parse(item.inicio) === Date.parse(inicio))); } catch (erro) { throw new ErroDeNegocio(erro instanceof Error ? erro.message : "Reserva indisponível."); }
    const id = randomUUID(), p = r.aluno;
    await tx.execute(sql`INSERT INTO atendeia_aulas_reservas(id,aula_id,solicitacao_id,nome,idade,telefone,responsavel,inicio,modified_by) VALUES(${id},${r.aulaId},${r.solicitacaoId},${p.nome},${p.idade},${p.telefone},${p.responsavel},${inicio}::timestamptz,${autor})`);
    await auditar(tx, id, "aula_reservada", autor); return { id };
  });
}
export async function cancelarReservaAula(banco: BancoSql, entrada: unknown, autor: string) {
  const alvo = alvoAulaSchema.parse(entrada);
  return banco.transaction(async tx => {
    const [reserva] = linhas<{ id: string }>(await tx.execute(sql`UPDATE atendeia_aulas_reservas SET status='cancelada',updated_at=now(),modified_by=${autor}
      WHERE ${travaDeColisao(aulasReservas, alvo.id, new Date(alvo.atualizadoEm))} AND status='confirmada' RETURNING id`));
    if (!reserva) throw new ErroDeNegocio("Reserva alterada por outro usuário. Atualize a agenda.");
    await auditar(tx, alvo.id, "aula_cancelada", autor); return reserva;
  });
}
