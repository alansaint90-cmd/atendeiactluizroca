import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {escolherHorario} from "../src/lib/aulas/escolha";
import {mensagensDaAula} from "../src/lib/agent/blocos";
test("reconhece escolha por hora ou opção e esclarece ambiguidades",()=>{
 const opcoes=[{inicio:"2026-11-19T06:00:00-03:00"},{inicio:"2026-11-19T08:00:00-03:00"}];
 for(const texto of ["Às 6 é bom","às seis é bom","Pode ser às 6","às 6","1","a primeira"]) assert.equal(escolherHorario(texto,opcoes),1,texto);
 assert.equal(escolherHorario("às 8 é bom",opcoes),2);
 assert.equal(escolherHorario("Tem às 6?",opcoes),null);
 assert.equal(escolherHorario("Tenho 6 anos",opcoes),null);
 assert.equal(escolherHorario("Às 9 é bom",opcoes),null);
 assert.equal(escolherHorario("às 6 é bom",[opcoes[0],{inicio:"2026-11-19T18:00:00-03:00"}]),"ambigua");
 assert.equal(escolherHorario("às 6 é bom",[opcoes[0],{inicio:"2026-11-20T06:00:00-03:00"}]),"ambigua");
});
test("acolhe em dois balões, guarda o horário e só reserva após dados e confirmação",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const atender=agendaAulasDoAgente(banco,redis,"lease","escolha","5571999999999",async()=>true);
  await atender("É pra mim");
  await atender("Tem Muay Thai pela manhã?",{acao:"consultar",modalidade:"Muay Thai",idade:null,adultoSemIdade:true});
  const resposta=await atender("Às 6 é bom");const partes=mensagensDaAula(resposta!);
  assert.equal(partes.length,2);assert.equal(partes[0],"Boa! Vamos de 06:00.");
  assert.equal(partes[1],"Para prepararmos a aula de Muay Thai, qual é o nome completo do participante?");assert.doesNotMatch(partes[1],/e a idade/);
  assert.doesNotMatch(partes[1],/06:00|feira|\d{2}\/\d{2}/);
  const cadastro=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:escolha")!);assert.equal(cadastro.opcaoEscolhida,1);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  assert.match((await atender("Aluno de Teste",{acao:"preparar",opcao:2,nome:"Aluno de Teste",idade:null,adultoSemIdade:true,responsavel:""}))!,/outro horário/);
  const conferencia=await atender("Aluno de Teste",{acao:"preparar",opcao:1,nome:"Aluno de Teste",idade:null,adultoSemIdade:true,responsavel:""});
  assert.match(conferencia!,/está agendada/);assert.doesNotMatch(conferencia!,/Os dados estão corretos|Confira sua aula/);assert.equal((await consultarAulas(banco)).reservas.length,1);
  await atender("sim");assert.equal((await consultarAulas(banco)).reservas.length,1);
 }finally{await cliente.close();}
});
