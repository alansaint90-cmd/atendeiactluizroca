import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {interpretarDataCt,dataLocalCt} from "../src/lib/aulas/calendario";

test("15 anos consulta Jiu-Jitsu noturno, escolhe segunda e confirma uma única reserva real",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const grade=JSON.stringify((await consultarAulas(banco)).aulas);
  const atender=agendaAulasDoAgente(banco,redis,"lease","jiu15","5571000000015",async()=>true);
  const ler=()=>JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:jiu15")!);
  for(const [dia,hora] of [["próxima segunda","20:15"],["próxima quarta","20:15"],["próxima terça","21:15"],["próxima quinta","21:15"]]){
   const r=await atender(`Jiu-Jitsu à noite ${dia}`,{acao:"consultar",modalidade:"Jiu-Jitsu",idade:15});
   assert.match(r!,new RegExp(hora));assert.doesNotMatch(r!,/infelizmente/);
   const data=interpretarDataCt(dia);assert.ok(data?.tipo==="data");
   assert.ok(ler().opcoes.length>0&&ler().opcoes.every((o:{inicio:string})=>data?.tipo==="data"&&dataLocalCt(Date.parse(o.inicio))===data.data));
  }
  const segunda=await atender("Segunda é bom");
  assert.match(segunda!,/20:15/);assert.doesNotMatch(segunda!,/infelizmente/);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  assert.match((await atender("Aluno Exemplo",{acao:"preparar",opcao:1,nome:"Aluno Exemplo",idade:15,responsavel:""}))!,/responsável/);
  assert.match((await atender("Aluno Exemplo",{acao:"preparar",opcao:1,nome:"Aluno Exemplo",idade:15,responsavel:"Responsavel Exemplo"}))!,/Os dados estão corretos/);
  assert.match((await atender("sim"))!,/está agendada/);
  const reserva=(await consultarAulas(banco)).reservas;assert.equal(reserva.length,1);assert.equal(reserva[0].idade,15);
  const menor=agendaAulasDoAgente(banco,redis,"lease","jiu9","5571000000009",async()=>true);
  await menor("Jiu-Jitsu à noite",{acao:"consultar",modalidade:"Jiu-Jitsu",idade:9});
  assert.equal(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:jiu9")!).opcoes.length,0);
  const muay=agendaAulasDoAgente(banco,redis,"lease","muay15","5571000000115",async()=>true);
  await muay("Muay Thai à noite",{acao:"consultar",modalidade:"Muay Thai",idade:15});
  assert.equal(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:muay15")!).opcoes.length>0,true);
  assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),grade);
 }finally{await cliente.close();}
});
