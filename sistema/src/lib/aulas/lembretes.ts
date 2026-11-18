import { limparNomeParticipante } from "./nome-participante";
import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { systemUserId } from "../db/bootstrap";
import { fusoCt } from "./calendario";
import { padraoAulasCt } from "../followups/aulas-ct";
import { delayMs, type FollowupConfig } from "../followups/schema";
import { inWindow } from "../followups/schedule";
export const instanciaLembretesCt = "ctluizroca";
interface Reserva {id:string;nome:string;responsavel:string;idade:number|null;telefone:string;modalidade:string;inicio:string;duracao:number}
export function mensagemLembreteAula(nome:string,responsavel:string,idade:number|null,_modalidade:string,inicio:string,etapa=1,modelo?:string) {
 const primeiro=limparNomeParticipante(idade!==null && idade<18 ? responsavel : nome).split(/\s+/)[0];
 const hora=Number(new Intl.DateTimeFormat('en-GB',{timeZone:fusoCt,hour:'2-digit',hourCycle:'h23'}).format(new Date(inicio)));
 const saudacao=hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
 return (modelo ?? padraoAulasCt(instanciaLembretesCt).steps[etapa-1].text).replaceAll('{nome}',primeiro).replaceAll('{saudacao}',saudacao);
}
function programacao(r:Reserva,etapa:number,config:FollowupConfig) {
 const step=config.steps[etapa-1];
 if(!config.enabled || config.mode!=='aulas' || !step.enabled)return null;
 const inicio=Date.parse(r.inicio),due=etapa===1?inicio-delayMs(step):inicio+r.duracao*60000+delayMs(step);
 if(!inWindow(config,due))return null;
 return {due,mensagem:mensagemLembreteAula(r.nome,r.responsavel,r.idade,r.modalidade,new Date(due).toISOString(),etapa,step.text)};
}
/** Campos 1 e 2 são relativos ao início e ao fim da aula, sem depender da última conversa. */
export async function sincronizarLembretesAulas(banco:BancoSql,instancia:string,config=padraoAulasCt(instancia)) {
 if(instancia!==instanciaLembretesCt)return;
 await banco.transaction(async tx=>{
  const pendentes=linhas<{id:string;etapa:number;reserva:string;agendado:string;mensagem:string}>(await tx.execute(sql`SELECT id,etapa_aula etapa,reserva_aula_id reserva,agendado_para agendado,mensagem FROM atendeia_agendamentos WHERE instancia=${instancia} AND reserva_aula_id IS NOT NULL AND status='pendente' AND is_deleted=false`));
  const reservas=linhas<Reserva>(await tx.execute(sql`SELECT r.id,r.nome,r.responsavel,r.idade,r.telefone,a.modalidade,coalesce(r.inicio,a.inicio) inicio,a.duracao FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.is_deleted=false AND a.is_deleted=false AND r.status='confirmada' AND coalesce(r.inicio,a.inicio)>now()-interval '2 days'`));
  for(const item of pendentes) {
   const r=reservas.find(r=>r.id===item.reserva),p=r && item.etapa>0?programacao(r,item.etapa,config):null;
   const limite=r ? (item.etapa===1?Date.parse(r.inicio):(p?.due ?? 0)+86400000):0;
   if(p && p.due>Date.now() && (p.due!==new Date(item.agendado).getTime() || p.mensagem!==item.mensagem)) {
    await tx.execute(sql`UPDATE atendeia_agendamentos SET mensagem=${p.mensagem},agendado_para=${new Date(p.due).toISOString()}::timestamptz,version=version+1,updated_at=now(),modified_by=${systemUserId} WHERE id=${item.id} AND status='pendente'`);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES ('lembrete_aula_atualizado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
    continue;
   }
   if(!p || p.due!==new Date(item.agendado).getTime() || p.mensagem!==item.mensagem || limite<=Date.now()) {
    await tx.execute(sql`UPDATE atendeia_agendamentos SET status='cancelado',version=version+1,updated_at=now(),modified_by=${systemUserId},codigo_erro='aula_ou_followup_alterado' WHERE id=${item.id} AND status='pendente'`);
    await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES ('lembrete_aula_cancelado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
   }
  }
  for(const r of reservas)for(const etapa of [1,2]) {
   const p=programacao(r,etapa,config);
   if(!p || p.due<=Date.now())continue;
   const novos=linhas<{id:string}>(await tx.execute(sql`INSERT INTO atendeia_agendamentos(telefone,instancia,mensagem,agendado_para,reserva_aula_id,etapa_aula,modified_by) VALUES (${r.telefone},${instancia},${p.mensagem},${new Date(p.due).toISOString()}::timestamptz,${r.id},${etapa},${systemUserId}) ON CONFLICT(reserva_aula_id,etapa_aula) DO NOTHING RETURNING id`));
   for(const item of novos)await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES ('lembrete_aula_programado','agendamento',${item.id},'[]'::jsonb,${systemUserId})`);
  }
 });
}
/** Guarda repetida na seleção e antes do envio; cancelamento e pausa humana prevalecem. */
export const condicaoLembreteAula=sql`(atendeia_agendamentos.reserva_aula_id IS NULL OR (
 EXISTS(SELECT 1 FROM atendeia_aulas_reservas r JOIN atendeia_aulas a ON a.id=r.aula_id WHERE r.id=atendeia_agendamentos.reserva_aula_id AND r.is_deleted=false AND a.is_deleted=false AND r.status='confirmada' AND r.telefone=atendeia_agendamentos.telefone AND (
 (atendeia_agendamentos.etapa_aula=1 AND now()<coalesce(r.inicio,a.inicio) AND atendeia_agendamentos.agendado_para<coalesce(r.inicio,a.inicio)) OR
 (atendeia_agendamentos.etapa_aula=2 AND now()>=coalesce(r.inicio,a.inicio)+a.duracao*interval '1 minute' AND now()<atendeia_agendamentos.agendado_para+interval '1 day')))
 AND NOT EXISTS(SELECT 1 FROM atendeia_conversations c JOIN atendeia_channels ch ON ch.id=c.channel_id WHERE ch.instance_name=atendeia_agendamentos.instancia AND c.remote_jid=substring(atendeia_agendamentos.telefone from 2)||'@s.whatsapp.net' AND c.is_deleted=false AND ch.is_deleted=false AND (c.human_takeover=true OR EXISTS(SELECT 1 FROM atendeia_messages m WHERE m.conversation_id=c.id AND m.direction='outbound' AND m.sender_type='agent' AND m.is_deleted=false AND m.sent_at>now()-interval '30 minutes')))))`;
export async function revalidarLembreteAula(banco:BancoSql,id:string,config=padraoAulasCt(instanciaLembretesCt)) {
 const [r]=linhas<Reserva & {etapa:number;agendado:string;mensagem:string}>(await banco.execute(sql`SELECT r.id,r.nome,r.responsavel,r.idade,r.telefone,a.modalidade,coalesce(r.inicio,a.inicio) inicio,a.duracao,g.etapa_aula etapa,g.agendado_para agendado,g.mensagem FROM atendeia_agendamentos g JOIN atendeia_aulas_reservas r ON r.id=g.reserva_aula_id JOIN atendeia_aulas a ON a.id=r.aula_id WHERE g.id=${id} AND g.is_deleted=false AND g.id IN (SELECT id FROM atendeia_agendamentos WHERE ${condicaoLembreteAula})`));
 if(!r || r.etapa<1 || r.etapa>2 || !inWindow(config,Date.now()))return false;
 const p=programacao(r,r.etapa,config);
 return Boolean(p && p.due===new Date(r.agendado).getTime() && p.mensagem===r.mensagem);
}
