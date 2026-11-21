import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {contextualizarGradeDia} from "../src/lib/aulas/aceite-consulta";
import {processMessage,type DeliveryState,type ProcessingPort} from "../src/lib/agent/processor";
import type {AgentConfig} from "../src/lib/agent/config";

test("contexto do dia vem do pedido do cliente, sem restaurar modalidade negada ou de outro participante",()=>{
 const pergunta="Tem aula na quinta?";
 assert.match(contextualizarGradeDia(pergunta,[{role:"user",content:"Quero Muay Thai"},{role:"assistant",content:"Temos Jiu-Jitsu"}]),/Muay Thai$/);
 assert.equal(contextualizarGradeDia(pergunta,[{role:"user",content:"Quero Muay Thai"},{role:"user",content:"Não quero Muay Thai"}]),pergunta);
 assert.equal(contextualizarGradeDia(pergunta,[{role:"user",content:"Quero Muay Thai"},{role:"user",content:"Agora é para mim"}]),pergunta);
 assert.equal(contextualizarGradeDia(pergunta,[{role:"user",content:"Quem é o professor de Jiu-Jitsu?"}]),pergunta);
 assert.equal(contextualizarGradeDia("Tem Taekwondo quinta?",[{role:"user",content:"Quero Muay Thai"}]),"Tem Taekwondo quinta?");
});

test("pergunta sobre quinta preserva Muay Thai e ignora turno e alternativas antigos",async()=>{
 const clock=Date.now;Date.now=()=>Date.parse("2026-11-20T21:39:00-03:00");
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const chave="atendeia:{evolution}:cadastro-aula:grade-quinta";
 const atender=agendaAulasDoAgente(banco,redis,"lease","grade-quinta","5571000000001",async()=>true);
 try {
  await applyMigrations(banco);const antes=JSON.stringify(await consultarAulas(banco));
  await atender("Para mim");await atender("Muay Thai à tarde");
  const original=JSON.parse(cache.get(chave)!);
  original.dataSolicitada="2026-11-26";original.dataAlternativa="2026-11-30";
  original.consulta.data="2026-11-26";original.consulta.turno="tarde";
  for(const texto of ["tem aula nas quintas feiras?","Tem aula na quinta?","Quais horários têm na quinta?","Tem Muay Thai quinta-feira?","E na quinta?","Tem quinta?"]) {
   cache.set(chave,JSON.stringify(original));
   const resposta=await atender(texto),estado=JSON.parse(cache.get(chave)!);
   assert.match(resposta!,/Muay Thai/,texto);assert.match(resposta!,/Quinta: 06:00, 08:00, 09:00 e 20:15/,texto);
   assert.doesNotMatch(resposta!,/segunda|30\/11|Jiu-Jitsu|Taekwondo|para essa idade|nome completo/);
   assert.equal(estado.consulta.modalidade,"Muay Thai");assert.equal(estado.turnoSolicitado,null);
   assert.equal(estado.adultoSemIdade,true);assert.equal(estado.consulta.idade,null);
   assert.equal(estado.dataAlternativa,undefined);assert.equal(estado.opcoes.length,0);
  }
  cache.set(chave,JSON.stringify({...original,participante:"crianca",adultoSemIdade:false,consulta:{...original.consulta,idade:15}}));
  assert.match((await atender("Tem aula na quinta?"))!,/Quinta: 06:00, 08:00, 09:00 e 20:15/);
  assert.equal(JSON.parse(cache.get(chave)!).consulta.idade,15,"consulta da grade não apaga idade real");
  cache.set(chave,JSON.stringify(original));
  const noite=await atender("Tem aula na quinta à noite?");
  assert.match(noite!,/Quinta: 20:15/);assert.doesNotMatch(noite!,/06:00|08:00|09:00|Jiu-Jitsu|Taekwondo/);
  cache.set(chave,JSON.stringify(original));
  const tarde=await atender("Tem aula na quinta à tarde?");
  assert.match(tarde!,/Não há horários de Muay Thai/);assert.doesNotMatch(tarde!,/segunda|Jiu-Jitsu|Taekwondo|1\./);
  cache.set(chave,JSON.stringify({...original,modalidadePreferida:null,modalidadePendente:undefined,consulta:{...original.consulta,modalidade:null}}));
  let estado:DeliveryState|null=null;const enviadas:string[]=[];
  const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atenda o aluno do CT.",OPENAI_API_KEY:"teste",OPENAI_MODEL:"modelo",EVOLUTION_API_KEY:"teste",EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_INSTANCE_NAME:"ctluizroca",REDIS_URL:"redis://localhost:6379",agendaAulas:true};
  const port:ProcessingPort={read:async()=>estado,write:async s=>{estado=s;},history:async()=>[{role:"user",content:"Quero Muay Thai"},{role:"assistant",content:"Muay Thai e Jiu-Jitsu na segunda-feira"}],complete:async s=>{estado=s;},enabled:async()=>true,aulaExperimental:atender,generate:async()=>{throw new Error("A pergunta deve ser resolvida pelo servidor");},send:async(_c,_n,t)=>{enviadas.push(t);return `teste-${enviadas.length}`;}};
  assert.equal(await processMessage({identity:"quinta-cache-antigo",conversation:"grade-quinta",number:"5571000000001",text:"Tem aula na quinta?",timestamp:Date.now()/1000},config,port),"enviada");
  assert.match(enviadas.join("\n"),/Muay Thai.*Quinta: 06:00, 08:00, 09:00 e 20:15/s);
  assert.doesNotMatch(enviadas.join("\n"),/Jiu-Jitsu|segunda|30\/11/);
  assert.equal(JSON.parse(cache.get(chave)!).modalidadePreferida,"Muay Thai");
  assert.equal(JSON.stringify(await consultarAulas(banco)),antes,"informação não altera grade ou reservas");
 } finally {Date.now=clock;await cliente.close();}
});
