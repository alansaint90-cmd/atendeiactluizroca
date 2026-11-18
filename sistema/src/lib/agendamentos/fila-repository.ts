import { sql } from "drizzle-orm";
import { linhas, type BancoSql } from "../db/porta";
import { ErroDeNegocio } from "../acao";
import type { AlvoFila, AcaoFila, MensagemFila } from "./fila-schema";
export async function listarFilaSql(banco:BancoSql):Promise<MensagemFila[]> {
 const individuais=linhas<MensagemFila>(await banco.execute(sql`SELECT id,version::text versao,CASE WHEN reserva_aula_id IS NOT NULL THEN 'aula' ELSE 'individual' END origem,reserva_aula_id::text AS "cicloFollowup",agendado_para AS data,telefone,instancia,mensagem,status,CASE WHEN reserva_aula_id IS NOT NULL THEN 'Follow-up da aula · etapa '||etapa_aula ELSE 'Envio individual' END AS "origemNome",is_deleted lixeira,false previsao FROM atendeia_agendamentos WHERE is_deleted IN (false,true) ORDER BY agendado_para DESC,id`));
 const campanhas=linhas<MensagemFila>(await banco.execute(sql`WITH fila AS (
 SELECT d.id,d.version::text versao,'campanha' origem,
 CASE WHEN d.status='pendente' THEN greatest(c.proximo_envio,now())+(row_number() OVER(PARTITION BY c.id,d.status ORDER BY d.created_at,d.id)-1)*interval '10 seconds' ELSE coalesce(d.iniciado_em,d.created_at) END AS data,
 d.telefone,c.instancia,concat_ws(E'\n',nullif(c.mensagem,''),CASE WHEN c.arquivo IS NOT NULL AND c.arquivo<>'null'::jsonb THEN '[Anexo: '||(c.arquivo->>'nome')||']' END) mensagem,
 CASE WHEN c.status='rascunho' AND d.status='pendente' THEN 'rascunho' ELSE d.status END status,c.nome AS "origemNome",d.is_deleted lixeira,(d.status='pendente') previsao
 FROM atendeia_campanha_destinatarios d JOIN atendeia_campanhas c ON c.id=d.campanha_id WHERE c.is_deleted=false AND c.status<>'rascunho' AND d.is_deleted IN (false,true)) SELECT * FROM fila ORDER BY data DESC,id`));
 return [...individuais,...campanhas].map(item=>({...item,data:new Date(item.data).toISOString()}));
}
export async function modificarFilaSql(banco:BancoSql,alvo:AlvoFila,acao:AcaoFila,autor:string,esperados?:Pick<AlvoFila,"id"|"versao">[]):Promise<string[]> {
 return banco.transaction(async tx=>{
  const individual=alvo.origem!=="campanha";
  const tabela=individual?sql`atendeia_agendamentos`:sql`atendeia_campanha_destinatarios`;
  const versao=sql`version::text`;
  // Ordem global de locks evita inversão ao alterar duas etapas do mesmo ciclo.
  const registros=linhas<{id:string;status:string;lixeira:boolean;versao:string;ciclo:string|null}>(await tx.execute(individual
   ? sql`SELECT id,status,is_deleted lixeira,version::text versao,reserva_aula_id::text ciclo FROM atendeia_agendamentos WHERE id=${alvo.id}::uuid OR (${acao} <> 'restaurar' AND reserva_aula_id=(SELECT reserva_aula_id FROM atendeia_agendamentos WHERE id=${alvo.id}::uuid) AND status='pendente' AND is_deleted=false) ORDER BY id FOR UPDATE`
   : sql`SELECT id,status,is_deleted lixeira,version::text versao,NULL::text ciclo FROM atendeia_campanha_destinatarios WHERE id=${alvo.id}::uuid FOR UPDATE`));
  const item=registros.find(r=>r.id===alvo.id);
  if(!item||item.versao!==alvo.versao)throw new ErroDeNegocio("O envio mudou. Atualize a lista.");
  if((alvo.origem==='aula')!==Boolean(item.ciclo))throw new ErroDeNegocio("Origem do envio inválida.");
  if(item.status==='enviando')throw new ErroDeNegocio("O envio já começou e não pode ser interrompido com segurança.");
  if(acao==='cancelar'&&(item.status!=='pendente'||item.lixeira))throw new ErroDeNegocio("Somente envios pendentes podem ser cancelados.");
  if(acao==='restaurar'?!item.lixeira:item.lixeira)throw new ErroDeNegocio("O registro mudou. Atualize a lista.");
  if(esperados && registros.some(r=>!esperados.some(e=>e.id===r.id&&e.versao===r.versao)))throw new ErroDeNegocio("A quantidade ou versão das etapas mudou. Atualize e confirme novamente.");
  const alterados:string[]=[];
  for(const r of registros){
   const lixeira=acao==='lixeira';
   const updated=linhas<{id:string}>(await tx.execute(sql`UPDATE ${tabela} SET status=${r.status==='pendente'?'cancelado':r.status},is_deleted=${lixeira},deleted_at=${lixeira?new Date().toISOString():null}::timestamptz,updated_at=now(),modified_by=${autor},version=version+1 WHERE id=${r.id} AND ${versao}=${r.versao} RETURNING id`));
   if(updated.length!==1)throw new ErroDeNegocio("O envio mudou durante a alteração.");
   await tx.execute(sql`INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by) VALUES(${"fila_"+acao},${individual?"agendamento":"campanha_destinatario"},${r.id},'["status","is_deleted"]'::jsonb,${autor})`);alterados.push(r.id);
  }
  return alterados;
 });
}
