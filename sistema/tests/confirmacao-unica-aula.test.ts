import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {generateReply,ProviderError,type Turn} from "../src/lib/agent/providers";
import {processMessage,type DeliveryState,type ProcessingPort} from "../src/lib/agent/processor";
import type {AgentConfig} from "../src/lib/agent/config";

const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atenda o CT.",OPENAI_API_KEY:"teste",OPENAI_MODEL:"gpt-4.1-mini",EVOLUTION_API_KEY:"teste",EVOLUTION_API_URL:"https://example.test",EVOLUTION_INSTANCE_NAME:"ctluizroca",REDIS_URL:"redis://localhost:6379",agendaAulas:true};
const texto=(text:string)=>Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text}]}]});
const preparo={opcao:1,nome:"Participante Exemplo",idade:null,adultoSemIdade:true,responsavel:""};

test("não entrega conferência livre nem entra em loop se o modelo ignorar a ferramenta",async()=>{
 let chamadas=0;
 await assert.rejects(generateReply(config,[],"Participante Exemplo",async()=>{chamadas++;return texto("Os dados estão corretos? Confirma a reserva?");}), (e:unknown)=>e instanceof ProviderError&&e.code==="openai_conferencia_sem_preparo");
 assert.equal(chamadas,2);
 for(const resposta of ["Sua aula foi agendada!","Seu agendamento está confirmado.","Agendei sua aula para quinta."]) {
  await assert.rejects(generateReply(config,[],"Participante Exemplo",async()=>texto(resposta)),/openai_conferencia_sem_preparo/);
 }
 assert.equal(await generateReply(config,[],"Onde fica?",async()=>texto("Estamos em Buraquinho.")),"Estamos em Buraquinho.");
 assert.equal(await generateReply({...config,agendaAulas:false},[],"Dados?",async()=>texto("Os dados estão corretos?")),"Os dados estão corretos?");
});

test("escolha e nome gravam a reserva e enviam somente a confirmação final, sem pedir sim",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const aula=agendaAulasDoAgente(banco,redis,"lease","confirmacao-unica","5571000000001",async()=>true);
  await aula("É pra mim");
  const menu=await aula("Muay Thai",{acao:"consultar",modalidade:"Muay Thai",idade:null,adultoSemIdade:true});
  const pergunta=await aula("1");
  assert.match((await aula("Ana",{acao:"preparar",...preparo,nome:"Ana"}))!,/nome e sobrenome/);
  assert.equal((await consultarAulas(banco)).reservas.length,0,"dados incompletos não gravam reserva");
  const historico:Turn[]=[{role:"assistant",content:menu!},{role:"user",content:"1"},{role:"assistant",content:pergunta!}];
  let estado:DeliveryState|null=null,chamadas=0;
  const enviados:string[]=[];
  const request:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   assert.match(body.instructions,/RESERVA DIRETA/);assert.match(body.instructions,/CALENDÁRIO INTERNO DO CT/);
   if(++chamadas===1)return texto("Os dados estão corretos? Participante: Participante Exemplo. Modalidade: Muay Thai. Confirma a reserva para essa aula experimental?");
   assert.deepEqual(body.tool_choice,{type:"function",name:"preparar_reserva_aula"});
   return Response.json({status:"completed",output:[{type:"function_call",name:"preparar_reserva_aula",arguments:JSON.stringify(preparo)}]});
  };
  const port:ProcessingPort={read:async()=>estado,write:async v=>{estado=v;},history:async()=>historico,complete:async(v,turnos)=>{estado=v;historico.push(...turnos);},enabled:async()=>true,aulaExperimental:aula,generate:(c,h,t)=>generateReply(c,h,t,request),send:async(_c,_n,t)=>{enviados.push(t);return `saida-${enviados.length}`;}};
  const mensagem={identity:"nome",conversation:"confirmacao-unica",number:"5571000000001",text:"Participante Exemplo",timestamp:Math.floor(Date.now()/1000)};
  assert.equal(await processMessage(mensagem,config,port),"enviada");
  assert.doesNotMatch(enviados.join("\n"),/Os dados estão corretos|Confirma a reserva|Confira sua aula/);
  assert.match(enviados.join("\n"),/está agendada/);
  assert.equal((await consultarAulas(banco)).reservas.length,1);
  const salvo=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:confirmacao-unica")!);
  const solicitacao=salvo.reserva.solicitacaoId;delete salvo.confirmada;
  cache.set("atendeia:{evolution}:cadastro-aula:confirmacao-unica",JSON.stringify(salvo));
  assert.match((await aula("Participante Exemplo",{acao:"preparar",...preparo}))!,/está agendada/);
  assert.equal(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:confirmacao-unica")!).reserva.solicitacaoId,solicitacao);
  assert.equal((await consultarAulas(banco)).reservas.length,1,"retomada após SQL sem atualização final do cache não duplica");
  assert.ok(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:confirmacao-unica")!).reserva);
  assert.equal(chamadas,2);
  const totalEnviado=enviados.length;
  await processMessage(mensagem,config,port);
  assert.equal(enviados.length,totalEnviado);
  assert.equal(chamadas,2);
  assert.equal((await consultarAulas(banco)).reservas.length,1);
 }finally{await cliente.close();}
});

test("às 21h do dia 19 não oferece nem reserva as 6h do mesmo dia; bloqueia confirmação inventada",async()=>{
 const clock=Date.now;Date.now=()=>Date.parse("2026-11-19T21:00:00-03:00");
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try {
  await applyMigrations(banco);
  const aula=agendaAulasDoAgente(banco,redis,"lease","horario-passado","5571000000001",async()=>true);
  await aula("Para mim");await aula("Muay Thai de manhã");
  const chave="atendeia:{evolution}:cadastro-aula:horario-passado",estado=JSON.parse(cache.get(chave)!);
  assert.ok(estado.opcoes.every((o:{inicio:string})=>Date.parse(o.inicio)>Date.now()));
  const real=(await consultarAulas(banco)).aulas.find(a=>a.modalidade==="Muay Thai"&&a.diaSemana===4&&new Date(a.inicio).getUTCHours()===9)!;
  cache.set(chave,JSON.stringify({...estado,opcaoEscolhida:1,opcoes:[{aulaId:real.id,inicio:"2026-11-19T06:00:00-03:00",modalidade:"Muay Thai",turma:"Geral"}]}));
  assert.match((await aula("Participante Exemplo",{acao:"preparar",...preparo}))!,/já passou/);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  let chamadas=0;
  await assert.rejects(generateReply(config,[],"Participante Exemplo",async(_u,init)=>{
    chamadas++;assert.match(JSON.parse(String(init?.body)).instructions,/hoje é quinta-feira, 19\/11\/2026/);
    return texto("Sua experimental de Muay Thai está agendada para quinta-feira, às 6h!");
  }),/openai_conferencia_sem_preparo/);
  assert.equal(chamadas,2);
 }finally{Date.now=clock;await cliente.close();}
});
