import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";

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
  assert.equal(JSON.stringify(await consultarAulas(banco)),antes,"informação não altera grade ou reservas");
 } finally {Date.now=clock;await cliente.close();}
});
