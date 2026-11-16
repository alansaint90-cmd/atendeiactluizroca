import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { fusoCt } from "./calendario";
export const instanciaLembretesCt = "ctluizroca";
export function mensagemLembreteAula(nome: string, responsavel: string, idade: number, modalidade: string, inicio: string) {
  const primeiro = (idade < 18 ? responsavel : nome).trim().split(/\s+/)[0];
  const horario = new Date(inicio).toLocaleTimeString("pt-BR",{timeZone:fusoCt,hour:"2-digit",minute:"2-digit"});
  const aluno = idade < 18 ? ` de ${nome}` : "";
  return `Opa, ${primeiro}! Passando para lembrar da aula experimental${aluno} de ${modalidade} amanhã, às ${horario}. Tá confirmado?`;
}
/** Um lembrete por reserva. Somente aulas com 24h de antecedência entram na fila. */
export async function sincronizarLembretesAulas(banco: BancoSql, instancia: string) {
  if (instancia !== instanciaLembretesCt) return;
  await banco.transaction(async tx => {
    const cancelados = linhas<{id:string}>(await tx.execute(sql`UPDATE atendeia_agendamentos g SET status='cancelado',version=g.version+1,updated_at=now(),modified_by=${systemUserId},codigo_erro='aula_cancelada_alterada_ou_lembrete_expirado'
      WHERE g.reserva_aula_id IS NOT NULL AND g.instancia=${instancia} AND g.status='pendente' AND g.is_deleted=false AND NOT EXISTS (
        SELECT 1 FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.id=g.reserva_aula_id AND r.status='confirmada' AND r.is_deleted=false AND a.is_deleted=false
        AND r.telefone=g.telefone AND coalesce(r.inicio,a.inicio)-interval '1 day'=g.agendado_para
        AND (now() AT TIME ZONE 'America/Bahia')::date < (coalesce(r.inicio,a.inicio) AT TIME ZONE 'America/Bahia')::date) RETURNING g.id`));
    for (const item of cancelados) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES ('lembrete_aula_cancelado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
    const reservas = linhas<{id:string;nome:string;responsavel:string;idade:number;telefone:string;modalidade:string;inicio:string}>(await tx.execute(sql`SELECT r.id,r.nome,r.responsavel,r.idade,r.telefone,a.modalidade,coalesce(r.inicio,a.inicio) inicio
      FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.is_deleted=false AND a.is_deleted=false AND r.status='confirmada' AND coalesce(r.inicio,a.inicio)>now()+interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM atendeia_agendamentos g WHERE g.reserva_aula_id=r.id) ORDER BY inicio LIMIT 100`));
    for (const r of reservas) {
      const inicio=new Date(r.inicio).toISOString(), mensagem=mensagemLembreteAula(r.nome,r.responsavel,r.idade,r.modalidade,inicio);
      const novos=linhas<{id:string}>(await tx.execute(sql`INSERT INTO atendeia_agendamentos(telefone,instancia,mensagem,agendado_para,reserva_aula_id,modified_by)
        VALUES (${r.telefone},${instancia},${mensagem},${new Date(Date.parse(inicio)-86400000).toISOString()}::timestamptz,${r.id},${systemUserId}) ON CONFLICT(reserva_aula_id) DO NOTHING RETURNING id`));
      for (const item of novos) await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES ('lembrete_aula_programado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
    }
  });
}
/** A mesma guarda é usada na seleção e imediatamente antes da chamada externa. */
export const condicaoLembreteAula = sql`(atendeia_agendamentos.reserva_aula_id IS NULL OR (
  EXISTS (SELECT 1 FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.id=atendeia_agendamentos.reserva_aula_id AND r.is_deleted=false AND a.is_deleted=false AND r.status='confirmada'
    AND r.telefone=atendeia_agendamentos.telefone AND coalesce(r.inicio,a.inicio)-interval '1 day'=atendeia_agendamentos.agendado_para
    AND (now() AT TIME ZONE 'America/Bahia')::date < (coalesce(r.inicio,a.inicio) AT TIME ZONE 'America/Bahia')::date)
  AND NOT EXISTS (SELECT 1 FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id WHERE ch.instance_name=atendeia_agendamentos.instancia AND c.remote_jid=substring(atendeia_agendamentos.telefone from 2)||'@s.whatsapp.net' AND c.is_deleted=false AND ch.is_deleted=false AND (c.human_takeover=true OR EXISTS (SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.direction='outbound' AND m.sender_type='agent' AND m.is_deleted=false AND m.sent_at>now()-interval '30 minutes')))))`;
export async function revalidarLembreteAula(banco: BancoSql, id: string) {
  return linhas(await banco.execute(sql`SELECT id FROM atendeia_agendamentos WHERE id=${id} AND is_deleted=false AND ${condicaoLembreteAula}`)).length > 0;
}
