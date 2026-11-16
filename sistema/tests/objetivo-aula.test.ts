import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {identificarObjetivo,recomendarObjetivo} from "../src/lib/aulas/objetivo";
import {mensagensDaAula} from "../src/lib/agent/blocos";
import {correspondeTurno} from "../src/lib/aulas/turno";

test("recomenda uma modalidade por objetivo sem ignorar criança",()=>{
 assert.equal(identificarObjetivo("Quero emagrecer"),"emagrecer");
 assert.equal(identificarObjetivo("Quero aprender defesa pessoal"),"defesa");
 assert.equal(identificarObjetivo("Algo lúdico para meu filho"),"ludico");
 assert.equal(identificarObjetivo("Não quero emagrecer"),null);
 assert.equal(recomendarObjetivo("emagrecer",null,false)?.modalidade,"Muay Thai");
 assert.equal(recomendarObjetivo("defesa",25,false)?.modalidade,"Jiu-Jitsu");
 assert.equal(recomendarObjetivo("defesa",8,true)?.modalidade,"Taekwondo");
 assert.equal(recomendarObjetivo("defesa",null,true),null);
});
test("explica antes dos horários e mantém noite e participante nas alternativas",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),dados=new Map<string,string>();
 const redis={get:async(k:string)=>dados.get(k)??null,eval:async(_s:string,_n:number,_lock:string,k:string,_token:string,v:string)=>{dados.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const atender=agendaAulasDoAgente(banco,redis,"lease","objetivo","5571999999999",async()=>true);
  await atender("É pra mim, de noite");
  const resposta=await atender("Quero emagrecer");
  assert.match(resposta!,/recomendo Muay Thai/);assert.match(resposta!,/funcionais/);
  const blocos=mensagensDaAula(resposta!);assert.ok(blocos.length>=2);
  assert.doesNotMatch(blocos[0],/1\./);assert.match(blocos[1],/1\. Muay Thai/);
  assert.doesNotMatch(resposta!,/Jiu-Jitsu|Taekwondo/);
  let cadastro=JSON.parse(dados.get("atendeia:{evolution}:cadastro-aula:objetivo")!);
  assert.equal(cadastro.turnoSolicitado,"noite");assert.equal(cadastro.consulta.modalidade,"Muay Thai");
  assert.ok(cadastro.opcoes.length && cadastro.opcoes.every((o:{inicio:string})=>correspondeTurno(o.inicio,"noite")));
  const alternativas=await atender("Outra opção");assert.doesNotMatch(alternativas!,/recomendo/);
  cadastro=JSON.parse(dados.get("atendeia:{evolution}:cadastro-aula:objetivo")!);
  assert.ok(cadastro.opcoes.every((o:{inicio:string})=>correspondeTurno(o.inicio,"noite")));
  const defesa=await atender("Quero aprender defesa pessoal");assert.match(defesa!,/recomendo Jiu-Jitsu/);
  const crianca=agendaAulasDoAgente(banco,redis,"lease","objetivo-kids","5571888888888",async()=>true);
  await crianca("É para meu filho de 8 anos",{acao:"consultar",modalidade:"Taekwondo",idade:8});
  const ludico=await crianca("Quero algo lúdico",{acao:"consultar",modalidade:null,idade:8});
  assert.match(ludico!,/recomendo Taekwondo/);assert.doesNotMatch(ludico!,/Muay Thai|Jiu-Jitsu/);
  const combinado=agendaAulasDoAgente(banco,redis,"lease","objetivo-combinado","5571666666666",async()=>true);
  assert.match((await combinado("É pra mim, quero emagrecer"))!,/recomendo Muay Thai/);
  const filhoNovo=agendaAulasDoAgente(banco,redis,"lease","objetivo-filho-novo","5571555555555",async()=>true);
  assert.match((await filhoNovo("Quero algo lúdico para meu filho"))!,/Qual é a idade/);
  assert.equal(JSON.parse(dados.get("atendeia:{evolution}:cadastro-aula:objetivo-filho-novo")!).objetivo,"ludico");
  const semDados=agendaAulasDoAgente(banco,redis,"lease","objetivo-novo","5571777777777",async()=>true);
  assert.match((await semDados("Quero emagrecer"))!,/A aula é para você/);
  assert.match((await semDados("Para mim"))!,/recomendo Muay Thai/);
 }finally{await cliente.close();}
});
