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
 assert.equal(await generateReply(config,[],"Onde fica?",async()=>texto("Estamos em Buraquinho.")),"Estamos em Buraquinho.");
 assert.equal(await generateReply({...config,agendaAulas:false},[],"Dados?",async()=>texto("Os dados estão corretos?")),"Os dados estão corretos?");
});

test("nome gera somente a conferência persistida e o primeiro sim grava uma única reserva",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const aula=agendaAulasDoAgente(banco,redis,"lease","confirmacao-unica","5571000000001",async()=>true);
  await aula("É pra mim");
  const menu=await aula("Muay Thai",{acao:"consultar",modalidade:"Muay Thai",idade:null,adultoSemIdade:true});
  const pergunta=await aula("1");
  const historico:Turn[]=[{role:"assistant",content:menu!},{role:"user",content:"1"},{role:"assistant",content:pergunta!}];
  let estado:DeliveryState|null=null,chamadas=0;
  const enviados:string[]=[];
  const request:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   assert.match(body.instructions,/CONFERÊNCIA ÚNICA/);
   if(++chamadas===1)return texto("Os dados estão corretos? Participante: Participante Exemplo. Modalidade: Muay Thai. Confirma a reserva para essa aula experimental?");
   assert.deepEqual(body.tool_choice,{type:"function",name:"preparar_reserva_aula"});
   return Response.json({status:"completed",output:[{type:"function_call",name:"preparar_reserva_aula",arguments:JSON.stringify(preparo)}]});
  };
  const port:ProcessingPort={read:async()=>estado,write:async v=>{estado=v;},history:async()=>historico,complete:async(v,turnos)=>{estado=v;historico.push(...turnos);},enabled:async()=>true,aulaExperimental:aula,generate:(c,h,t)=>generateReply(c,h,t,request),send:async(_c,_n,t)=>{enviados.push(t);return `saida-${enviados.length}`;}};
  const mensagem={identity:"nome",conversation:"confirmacao-unica",number:"5571000000001",text:"Participante Exemplo",timestamp:Math.floor(Date.now()/1000)};
  assert.equal(await processMessage(mensagem,config,port),"enviada");
  assert.equal(enviados.join("\n").match(/Os dados estão corretos\?/g)?.length,1);
  assert.doesNotMatch(enviados.join("\n"),/Confirma a reserva/);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  assert.ok(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:confirmacao-unica")!).reserva);
  estado=null;enviados.length=0;
  assert.equal(await processMessage({...mensagem,identity:"sim",text:"Sim"},config,port),"enviada");
  assert.match(enviados.join("\n"),/está agendada/);
  assert.doesNotMatch(enviados.join("\n"),/Os dados estão corretos|Confira sua aula/);
  assert.equal((await consultarAulas(banco)).reservas.length,1);
  assert.equal(chamadas,2);
  const totalEnviado=enviados.length;
  await processMessage({...mensagem,identity:"sim",text:"Sim"},config,port);
  assert.equal(enviados.length,totalEnviado);
  assert.equal(chamadas,2);
  assert.equal((await consultarAulas(banco)).reservas.length,1);
 }finally{await cliente.close();}
});
