import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {interpretarDataCt,dataLocalCt} from "../src/lib/aulas/calendario";
import {aceiteConsulta,perguntaGradeDia} from "../src/lib/aulas/aceite-consulta";
import {consultarAulas} from "../src/lib/aulas/repository";
import {processMessage,type DeliveryState,type ProcessingPort} from "../src/lib/agent/processor";
import type {AgentConfig} from "../src/lib/agent/config";
import {incomingMessage} from "../src/lib/agent/message";
import type {Turn} from "../src/lib/agent/providers";

const agora=Date.parse("2026-11-19T18:00:00-03:00");
test("reconhece dias no plural sem confundir segunda opção com segunda-feira",()=>{
 for(const [texto,data] of [["aos sábados","2026-11-21"],["às segundas-feiras","2026-11-23"],["às terças","2026-11-24"],["quartas-feiras","2026-11-25"],["quintas","2026-11-19"],["sextas","2026-11-20"],["domingos","2026-11-22"]]) assert.deepEqual(interpretarDataCt(texto,agora),{tipo:"data",data},texto);
 assert.equal(interpretarDataCt("a segunda opção",agora),null);
 assert.equal(aceiteConsulta("sim",[{role:"assistant",content:"Os dados estão corretos?"}]),null);
 assert.equal(aceiteConsulta("sim",[{role:"user",content:"Tem aulas aos sábados?"},{role:"assistant",content:"Posso conferir os horários?"}]),"Tem aulas aos sábados?");
 assert.equal(aceiteConsulta("sim",[{role:"user",content:"Taekwondo aos sábados"},{role:"assistant",content:"Quer confirmar a aula experimental?"}]),null);
 assert.equal(aceiteConsulta("sim",[{role:"assistant",content:"Esse horário funciona pra você?"}]),null);
 assert.equal(aceiteConsulta("não",[{role:"user",content:"Vocês têm aulas aos sábados?"},{role:"assistant",content:"Quer que eu confira os horários?"}]),null);
 assert.equal(aceiteConsulta("sim",[{role:"user",content:"Quero Muay Thai"},{role:"assistant",content:"Posso mostrar os horários de Taekwondo?"}]),null);
 assert.equal(perguntaGradeDia("Quero Muay Thai aos sábados"),false);
 assert.equal(perguntaGradeDia("Segunda é bom"),false);
});

test("aceite de consulta preserva modalidade da conversa; troca explícita e conversa nova usam o sábado real",async()=>{
 const clock=Date.now;Date.now=()=>agora;
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=(c:string)=>agendaAulasDoAgente(banco,redis,"lease",c,"5571000000001",async()=>true);
 const estado=(c:string)=>JSON.parse(cache.get(`atendeia:{evolution}:cadastro-aula:${c}`)!);
 try{
  await applyMigrations(banco);const grade=JSON.stringify((await consultarAulas(banco)).aulas);
  await atender("sabado")("É para mim");
  await atender("sabado")("Quero Muay Thai nesta quinta-feira");
  assert.equal(estado("sabado").dataSolicitada,"2026-11-19");
  const history:Turn[]=[{role:"user",content:"Vocês têm aulas aos sábados?"},{role:"assistant",content:"Sim, temos aulas aos sábados só de Taekwondo. Quer que eu confira os horários disponíveis para você?"}];
  let state:DeliveryState|null=null;const textos:string[]=[];
  const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atenda o aluno.",OPENAI_API_KEY:"sk-test-only",OPENAI_MODEL:"modelo",EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"teste",REDIS_URL:"redis://localhost:6379",agendaAulas:true};
  const port:ProcessingPort={read:async()=>state,write:async s=>{state=s;},history:async()=>history,complete:async s=>{state=s;},enabled:async()=>true,aulaExperimental:atender("sabado"),generate:async()=>{throw new Error("Não usar IA para reinterpretar esse aceite");},send:async(_c,_n,t)=>{textos.push(t);return "id-teste";}};
  const mensagem=incomingMessage({instance:"teste",event:"messages.upsert",data:{key:{id:"aceite",fromMe:false,remoteJid:"5571000000001@s.whatsapp.net"},messageTimestamp:Math.floor(agora/1000),message:{conversation:"Sim"}}},"teste",agora)!;
  assert.equal(await processMessage(mensagem,config,port),"enviada");
  assert.match(textos.join("\n"),/Não há horários de Muay Thai/);
  assert.doesNotMatch(textos.join("\n"),/Taekwondo|quinta|19\/11|agendada|Os dados estão corretos/);
  assert.equal(estado("sabado").dataSolicitada,"2026-11-21");
  assert.equal(estado("sabado").opcoes.length,0);
  assert.equal(estado("sabado").consulta.modalidade,"Muay Thai");
  assert.equal(await atender("sabado")("Sim"),null);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  const explicito=await atender("sabado")("Quero Muay Thai aos sábados");
  assert.match(explicito!,/sábado/);assert.match(explicito!,/Muay Thai/);assert.doesNotMatch(explicito!,/quinta/);assert.equal(estado("sabado").dataSolicitada,"2026-11-21");assert.equal(estado("sabado").dataAlternativa,"2026-11-23");assert.ok(estado("sabado").opcoes.every((o:{modalidade:string;inicio:string})=>o.modalidade==="Muay Thai"&&dataLocalCt(Date.parse(o.inicio))==="2026-11-23"));
  const desconhecido=await atender("novo")("Vocês têm aulas aos sábados?");
  assert.match(desconhecido!,/Taekwondo/);assert.match(desconhecido!,/para você ou para outra pessoa/);
  assert.doesNotMatch((await atender("novo")("Sim"))!,/Muay|quinta|agendada/);
  assert.match((await atender("novo")("Para mim"))!,/Taekwondo.*sábado/s);
  cache.set("atendeia:{evolution}:cadastro-aula:infantil",JSON.stringify({participante:"crianca",modalidadePreferida:"Muay Thai",opcoes:[],consulta:{modalidade:"Muay Thai",idade:8,mostradas:[]}}));
  assert.match((await atender("infantil")("Vocês têm aulas aos sábados?"))!,/Não há horários de Muay Thai/);
  assert.equal(estado("infantil").consulta.idade,8);
  assert.match((await atender("infantil")("Tem aulas de Taekwondo aos sábados?"))!,/Taekwondo.*10:00/s);
  assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),grade);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
 }finally{Date.now=clock;await cliente.close();}
});
