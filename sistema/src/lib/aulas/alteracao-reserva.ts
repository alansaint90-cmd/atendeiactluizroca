import { sql } from "drizzle-orm";
import { ErroDeNegocio } from "../acao";
import { linhas, type BancoSql, type TransacaoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import type { AlunoDados } from "./schema";

export interface ReservaContato extends AlunoDados {
  id:string; aulaId:string; inicio:string; modalidade:string; atualizadoEm:string;
}
export type AlvoReservaContato = Pick<ReservaContato,"id"|"atualizadoEm">;

export async function reservasFuturasDoContato(banco:BancoSql,telefone:string) {
  return linhas<ReservaContato>(await banco.execute(sql`SELECT r.id,r.aula_id AS "aulaId",r.nome,r.idade,r.adulto_sem_idade AS "adultoSemIdade",r.telefone,r.responsavel,r.updated_at AS "atualizadoEm",a.modalidade,coalesce(r.inicio,a.inicio) AS inicio
    FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id
    WHERE r.telefone=${telefone} AND r.status='confirmada' AND r.is_deleted=false AND a.is_deleted=false AND coalesce(r.inicio,a.inicio)>now()
    ORDER BY coalesce(r.inicio,a.inicio),r.id`)).map(r=>({...r,inicio:new Date(r.inicio).toISOString(),atualizadoEm:new Date(r.atualizadoEm).toISOString()}));
}

/** Somente itens pendentes; saídas já em envio ou concluídas não são recolhidas. */
async function cancelarLembretes(tx:TransacaoSql,id:string) {
  const itens=linhas<{id:string}>(await tx.execute(sql`UPDATE atendeia_agendamentos SET status='cancelado',version=version+1,updated_at=now(),modified_by=${systemUserId},codigo_erro='aula_cancelada_pelo_contato'
    WHERE reserva_aula_id=${id} AND status='pendente' AND is_deleted=false RETURNING id`));
  for(const item of itens)await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES('lembrete_aula_cancelado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
}

/** Telefone vem do evento autenticado, nunca de argumento fornecido pelo modelo. */
export async function cancelarReservaNaTransacao(tx:TransacaoSql,alvo:AlvoReservaContato,telefone:string,remarcacao=false) {
  const [r]=linhas<{status:string;atualizadoEm:string;inicio:string}>(await tx.execute(sql`SELECT r.status,r.updated_at AS "atualizadoEm",coalesce(r.inicio,a.inicio) AS inicio
    FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id
    WHERE r.id=${alvo.id} AND r.telefone=${telefone} AND r.is_deleted=false AND a.is_deleted=false FOR UPDATE OF r`));
  if(!r)throw new ErroDeNegocio("Não consegui localizar essa reserva neste número.");
  if(r.status==='cancelada' && !remarcacao)return;
  if(r.status!=='confirmada' || new Date(r.atualizadoEm).getTime()!==Date.parse(alvo.atualizadoEm) || new Date(r.inicio).getTime()<=Date.now())
    throw new ErroDeNegocio("Esse agendamento mudou ou a aula já começou. Precisamos conferir a reserva atual antes de alterar.");
  await tx.execute(sql`UPDATE atendeia_aulas_reservas SET status='cancelada',updated_at=now(),modified_by=${systemUserId} WHERE id=${alvo.id} AND telefone=${telefone} AND status='confirmada' AND is_deleted=false`);
  await cancelarLembretes(tx,alvo.id);
  await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${remarcacao?'aula_remarcada_origem':'aula_cancelada_pelo_contato'},'aula',${alvo.id},'[]'::jsonb,${systemUserId})`);
}

export async function cancelarReservaDoContato(banco:BancoSql,alvo:AlvoReservaContato,telefone:string) {
  return banco.transaction(tx=>cancelarReservaNaTransacao(tx,alvo,telefone));
}
