import {generateReply} from "../src/lib/agent/providers";
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {systemUserId} from "../src/lib/db/bootstrap";
import {receberOperacao} from "../src/lib/operacao/receber";
import {atendimentoHumanoAtivo,assumirConversa} from "../src/lib/atendimento/atendimento";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {idadeParticipanteInformada} from "../src/lib/aulas/idade-informada";
import {identificarParticipante} from "../src/lib/aulas/participante";
import {processMessage,type DeliveryState,type ProcessingPort} from "../src/lib/agent/processor";
import {FalhaAtendimento,encaminharFalhaHumana,telefoneAlertaHumano} from "../src/lib/agent/falha-humana";
import {incomingMessage} from "../src/lib/agent/message";
import type {AgentConfig} from "../src/lib/agent/config";
import {processarAgendamento} from "../src/lib/agendamentos/worker";
import {listarAgendamentos} from "../src/lib/agendamentos/repository";
import {agentKeys,agentRedis} from "../src/lib/agent/redis";
import {encerrarAcompanhamentoHumano,pausaManualKey} from "../src/lib/agent/pausa";

const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atenda o aluno.",OPENAI_API_KEY:"sk-test-only",OPENAI_MODEL:"modelo",EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"ctluizroca",REDIS_URL:"redis://localhost:6379",AI_HUMAN_ALERT_PHONE:"+5511000000099",agendaAulas:true};
const evento={event:"messages.upsert" as const,instance:"ctluizroca",data:{key:{id:"teste-falha",fromMe:false,remoteJid:"5571000000001@s.whatsapp.net"},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Na verdade é para mim\nNão tenho 15 anos"}}};
const message=incomingMessage(evento,"ctluizroca")!;
function fixture(){
 let state:DeliveryState|null=null,sends=0,alerts=0;
 const port:ProcessingPort={read:async()=>state,write:async v=>{state=v;},history:async()=>[],complete:async v=>{state=v;},enabled:async()=>true,
  generate:async()=>{throw new Error("Detalhe privado do provedor");},send:async()=>{sends++;return "envio";},falhaHumana:async()=>{alerts++;}};
 return {port,state:()=>state,sends:()=>sends,alerts:()=>alerts,reset:()=>{state=null;}};
}
test("idade negada não identifica menor; alerta padrão somente no CT",()=>{
 assert.equal(idadeParticipanteInformada("Não tenho 15 anos"),null);
 assert.equal(idadeParticipanteInformada("Não tenho 15 anos, tenho 32 anos")?.[1],"32");
 assert.equal(identificarParticipante("Na verdade é para mim. Não tenho 15 anos"),"adulto");
 assert.equal(telefoneAlertaHumano({EVOLUTION_INSTANCE_NAME:"outro-projeto"}),null);
 assert.equal(telefoneAlertaHumano({EVOLUTION_INSTANCE_NAME:"ctluizroca"}),"+5571986639830");
});
test("falhas técnicas respeitam tentativas; contexto contraditório e envio incerto encaminham sem repetição",async()=>{
 const f=fixture();
 assert.equal(await processMessage(message,config,f.port),"repetir");
 assert.equal(await processMessage(message,config,f.port),"repetir");
 assert.equal(f.alerts(),0);
 assert.equal(await processMessage(message,config,f.port),"falhou");
 await processMessage(message,config,f.port);assert.equal(f.alerts(),1);assert.equal(f.sends(),0);
 const contexto=fixture();contexto.port.aulaExperimental=async()=>{throw new FalhaAtendimento("contexto_idade_contraditorio");};
 assert.equal(await processMessage(message,config,contexto.port),"falhou");assert.equal(contexto.alerts(),1);assert.equal(contexto.state()?.attempts,1);
 const incerta=fixture();incerta.port.generate=async()=>"Mensagem";incerta.port.send=async()=>{throw new Error("timeout");};
 assert.equal(await processMessage(message,config,incerta.port),"incerta");await processMessage(message,config,incerta.port);assert.equal(incerta.alerts(),1);
 const retry=fixture();retry.port.aulaExperimental=contexto.port.aulaExperimental;
 let chamadas=0;retry.port.falhaHumana=async()=>{if(++chamadas===1)throw new Error("Banco temporariamente indisponível");};
 await assert.rejects(processMessage(message,config,retry.port),/temporariamente/);
 assert.equal(retry.state()?.escalar,true);
 assert.equal(await processMessage(message,config,retry.port),"falhou");assert.equal(chamadas,2);
 await processMessage(message,config,retry.port);assert.equal(chamadas,2);
 const outro=fixture();outro.port.aulaExperimental=contexto.port.aulaExperimental;
 await processMessage(message,{...config,AI_HUMAN_ALERT_PHONE:undefined,EVOLUTION_INSTANCE_NAME:"outro-projeto"},outro.port);assert.equal(outro.alerts(),0);
});
test("erro do print pausa conversa real e enfileira um alerta atômico, sem reenviar entrega incerta",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);await receberOperacao(banco,evento);
  const agenda=agendaAulasDoAgente(banco,redis,"lease",message.conversation,message.number,async()=>true);
  await agenda("Para meu filho de 15 anos, quero gastar energia à noite");await agenda("Jiu-Jitsu");
  const f=fixture();f.port.aulaExperimental=agenda;
  f.port.enabled=async()=>!await atendimentoHumanoAtivo(banco,"ctluizroca",message.number);
  f.port.falhaHumana=async codigo=>{await encaminharFalhaHumana(banco,"ctluizroca",message.number,config.AI_HUMAN_ALERT_PHONE!,codigo);};
  assert.equal(await processMessage(message,config,f.port),"falhou");
  assert.equal(f.sends(),0);
  assert.equal(await atendimentoHumanoAtivo(banco,"ctluizroca",message.number),true);
  assert.equal(await atendimentoHumanoAtivo(banco,"outro-chip",message.number),false);
  await processMessage(message,config,f.port);
  assert.equal(await encaminharFalhaHumana(banco,"ctluizroca",message.number,config.AI_HUMAN_ALERT_PHONE!,"agenda_inconsistente"),false);
  let fila=await listarAgendamentos(banco);assert.equal(fila.length,1);assert.equal(fila[0].telefone,config.AI_HUMAN_ALERT_PHONE);
  assert.match(fila[0].mensagem,/IA está pausada/);assert.doesNotMatch(fila[0].mensagem,/15 anos|Detalhe privado/);
  const cadastro=JSON.parse(cache.get(`atendeia:{evolution}:cadastro-aula:${message.conversation}`)!);
  assert.equal(cadastro.consulta.idade,null);assert.equal(cadastro.adultoSemIdade,true);
  f.reset();assert.equal(await processMessage({...message,identity:randomUUID(),text:"Oi"},config,f.port),"pausada");
  let envios=0;const settings=async()=>config;
  await processarAgendamento(banco,settings,async()=>{envios++;throw new Error("timeout");});
  await processarAgendamento(banco,settings,async()=>{envios++;return "Não reenviar";});
  fila=await listarAgendamentos(banco);assert.equal(fila[0].status,"incerto");assert.equal(envios,1);
  const operador=randomUUID();await cliente.query("INSERT INTO atendeia_users(id,name,role,enabled,modified_by) VALUES($1,'Operador teste','operador',true,$2)",[operador,systemUserId]);
  const conversa=(await cliente.query<{id:string}>("SELECT id FROM atendeia_conversations WHERE is_deleted=false")).rows[0].id;
  await assumirConversa(banco,{userId:operador,papel:"operador"},{id:conversa,assumir:false});
  assert.equal(await atendimentoHumanoAtivo(banco,"ctluizroca",message.number),false);
  await cliente.exec("ALTER TABLE atendeia_agendamentos ADD CONSTRAINT impedir_alerta_teste CHECK (mensagem='bloqueada') NOT VALID");
  await assert.rejects(encaminharFalhaHumana(banco,"ctluizroca",message.number,config.AI_HUMAN_ALERT_PHONE!,"falha_tecnica"));
  assert.equal(await atendimentoHumanoAtivo(banco,"ctluizroca",message.number),false,"falha ao enfileirar reverte a pausa na transação");
  const auditoria=await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='ia_encaminhada_humano' AND is_deleted=false");assert.equal(auditoria.rows.length,1);
  assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE is_deleted=false")).rows.length,1,"preserva o histórico recebido");
  assert.equal((await cliente.query("SELECT id FROM atendeia_aulas_reservas WHERE is_deleted=false")).rows.length,0);
 }finally{await cliente.close();}
});
test("Redis real encerra follow-up sem prazo extra de pausa, preserva outros contatos e exige lease",{skip:!process.env.TEST_REDIS_URL},async()=>{
 const url=process.env.TEST_REDIS_URL!,alvo=new URL(url);assert.ok(["localhost","127.0.0.1"].includes(alvo.hostname)&&alvo.pathname==="/15");
 const client=agentRedis(url),conversa=randomUUID(),outra=randomUUID(),token=randomUUID();await client.connect();
 const key=`atendeia:{evolution}:followup:${conversa}`,keyOutra=`atendeia:{evolution}:followup:${outra}`,queue="atendeia:{evolution}:followups";
 try{
  assert.ok(await client.set(agentKeys.lock,token,"PX",120000,"NX"));await client.set(key,"pendente");await client.set(keyOutra,"preservado");await client.zadd(queue,Date.now(),conversa,Date.now(),outra);
  await assert.rejects(encerrarAcompanhamentoHumano(client,"lease-errado",conversa));assert.equal(await client.get(key),"pendente");
  await encerrarAcompanhamentoHumano(client,token,conversa);assert.equal(await client.get(key),null);assert.equal(await client.zscore(queue,conversa),null);
  assert.equal(await client.get(pausaManualKey(conversa)),null);assert.equal(await client.get(keyOutra),"preservado");
 }finally{await client.del(key,keyOutra);await client.zrem(queue,conversa,outra);if(await client.get(agentKeys.lock)===token)await client.del(agentKeys.lock);client.disconnect();}
});

test("ferramenta sinaliza falha sem prometer ações e não é aceita em instância sem destino",async()=>{
 const request:typeof fetch=async(_url,init)=>{
  const corpo=JSON.parse(String(init?.body));assert.ok(corpo.tools.some((t:{name:string})=>t.name==="sinalizar_falha_atendimento"));
  return new Response(JSON.stringify({status:"completed",output:[{type:"function_call",name:"sinalizar_falha_atendimento",arguments:"{}"}]}));
 };
 assert.deepEqual(await generateReply(config,[],"Você está repetindo a idade errada",request),{falhaAtendimento:true});
 const f=fixture();f.port.generate=async()=>({falhaAtendimento:true});
 assert.equal(await processMessage(message,config,f.port),"falhou");assert.equal(f.alerts(),1);assert.equal(f.sends(),0);
 await assert.rejects(generateReply({...config,EVOLUTION_INSTANCE_NAME:"outro",AI_HUMAN_ALERT_PHONE:undefined},[],"Teste",async()=>new Response(JSON.stringify({status:"completed",output:[{type:"function_call",name:"sinalizar_falha_atendimento",arguments:"{}"}]}))),/openai_acao_invalida/);
});