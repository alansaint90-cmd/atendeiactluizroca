import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {intencaoModalidade} from "../src/lib/aulas/objetivo";
import {correspondeTurno} from "../src/lib/aulas/turno";

test("não confunde modalidades negadas ou comparadas com escolha",()=>{
 assert.equal(intencaoModalidade("Não quero Muay Thai").modalidade,null);
 assert.equal(intencaoModalidade("Não quero Muay Thai, quero Jiu-Jitsu").modalidade,"Jiu-Jitsu");
 assert.equal(intencaoModalidade("Qual a diferença entre Muay Thai e Taekwondo?").modalidade,null);
});

test("lembra modalidade entre processos, primeira identificação e idade infantil",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),dados=new Map<string,string>();
 const redis={get:async(k:string)=>dados.get(k)??null,eval:async(s:string,_n:number,_lock:string,k:string,_token:string,v:string)=>{assert.match(s,/'EX', 604800/);dados.set(k,v);return 1;}} as unknown as Redis;
 const mensagem=(conversa:string,texto:string,acao?:Parameters<ReturnType<typeof agendaAulasDoAgente>>[1])=>agendaAulasDoAgente(banco,redis,"lease",conversa,"5571000000001",async()=>true)(texto,acao);
 const cadastro=(c:string)=>JSON.parse(dados.get(`atendeia:{evolution}:cadastro-aula:${c}`)!);
 try{
  await applyMigrations(banco);
  await mensagem("adulto","gostaria de fazer muay thai de noite");
  assert.equal(cadastro("adulto").consulta.modalidade,"Muay Thai");
  const resposta=await mensagem("adulto","pra mim");
  assert.match(resposta!,/Muay Thai/);assert.doesNotMatch(resposta!,/Qual modalidade|idade/);
  assert.equal(cadastro("adulto").turnoSolicitado,"noite");
  assert.ok(cadastro("adulto").opcoes.length>0);
  assert.ok(cadastro("adulto").opcoes.every((o:{inicio:string})=>correspondeTurno(o.inicio,"noite")));
  assert.match((await mensagem("ferramenta","gostaria de fazer muay thai",{acao:"consultar",modalidade:"Muay Thai",idade:null}))!,/para você/);
  assert.match((await mensagem("ferramenta","pra mim"))!,/Muay Thai/);
  await mensagem("filho","Taekwondo");
  assert.match((await mensagem("filho","para meu filho"))!,/Qual é a idade/);
  assert.match((await mensagem("filho","8 anos"))!,/Taekwondo/);
  assert.equal(cadastro("filho").consulta.idade,8);
  assert.equal(await mensagem("isolada","pra mim"),"Claro! Qual modalidade você gostaria de experimentar?");
  await mensagem("adulto","não quero Muay Thai, prefiro Jiu-Jitsu");
  assert.equal(cadastro("adulto").consulta.modalidade,"Jiu-Jitsu");
  assert.ok(cadastro("adulto").opcoes.length>0);
  assert.ok(cadastro("adulto").opcoes.every((o:{modalidade:string})=>o.modalidade==="Jiu-Jitsu"));
  assert.equal((await consultarAulas(banco)).reservas.length,0);
 }finally{await cliente.close();}
});
