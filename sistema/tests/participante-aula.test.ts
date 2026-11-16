import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {identificarParticipante} from "../src/lib/aulas/participante";
import {alunoSchema} from "../src/lib/aulas/schema";
import {mensagemLembreteAula} from "../src/lib/aulas/lembretes";

test("identifica destinatário sem tratar menor como adulto",()=>{
 assert.equal(identificarParticipante("Posso agendar pra mim também?"),"adulto");
 assert.equal(identificarParticipante("É para meu filho"),"crianca");
 assert.equal(identificarParticipante("Pra mim, tenho 16 anos"),"crianca");
 assert.equal(identificarParticipante("É para outra pessoa"),"outraPessoa");
 assert.equal(identificarParticipante("não é pra mim"),null);
 const aluno={nome:"Aluno de Teste",idade:null,telefone:"+5571999999999",responsavel:""};
 assert.equal(alunoSchema.safeParse(aluno).success,false);
 assert.equal(alunoSchema.safeParse({...aluno,adultoSemIdade:true}).success,true);
 assert.equal(alunoSchema.safeParse({...aluno,idade:8,adultoSemIdade:true}).success,false);
 assert.equal(alunoSchema.safeParse({...aluno,idade:8}).success,false);
 assert.match(mensagemLembreteAula("Pai de Teste","",null,"Taekwondo","2026-11-18T22:15:00Z"),/Opa, Pai!/);
});
test("pai agenda depois do filho sem idade fictícia e sem apagar a reserva infantil",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),dados=new Map<string,string>();
 const redis={get:async(k:string)=>dados.get(k)??null,eval:async(_s:string,_n:number,_lock:string,k:string,_token:string,v:string)=>{dados.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const atender=agendaAulasDoAgente(banco,redis,"lease","participantes","5571999999999",async()=>true);
  assert.match((await atender("É para meu filho"))!,/Qual é a idade/);
  assert.match((await atender("Taekwondo",{acao:"consultar",modalidade:"Taekwondo",idade:null}))!,/Qual é a idade/);
  await atender("Ele tem 8 anos",{acao:"consultar",modalidade:"Taekwondo",idade:8});
  await atender("Filho de Teste",{acao:"preparar",opcao:1,nome:"Filho de Teste",idade:8,responsavel:"Pai de Teste"});
  await atender("sim");
  assert.equal((await consultarAulas(banco)).reservas.length,1);
  assert.equal(await atender("Posso agendar pra mim também?"),"Claro! Qual modalidade você gostaria de experimentar?");
  await atender("Taekwondo",{acao:"consultar",modalidade:"Taekwondo",idade:8});
  const cadastro=JSON.parse(dados.get("atendeia:{evolution}:cadastro-aula:participantes")!);
  assert.equal(cadastro.consulta.idade,null); assert.equal(cadastro.adultoSemIdade,true);
  assert.ok(cadastro.opcoes.length>0 && cadastro.opcoes.every((o:{turma:string})=>!o.turma.startsWith("Kids")));
  const conferencia=await atender("Pai de Teste",{acao:"preparar",opcao:1,nome:"Pai de Teste",idade:null,adultoSemIdade:true,responsavel:""});
  assert.match(conferencia!,/Adulto/);assert.doesNotMatch(conferencia!,/null|8 anos|18 anos/);
  const resultado=await atender("sim");assert.match(resultado!,/está agendada/);
  const reservas=(await consultarAulas(banco)).reservas;
  assert.equal(reservas.length,2);
  assert.equal(reservas.find(r=>r.nome==="Filho de Teste")?.idade,8);
  const pai=reservas.find(r=>r.nome==="Pai de Teste")!;
  assert.equal(pai.idade,null);assert.equal(pai.adultoSemIdade,true);
  await atender("confirmo");assert.equal((await consultarAulas(banco)).reservas.length,2);
 }finally{await cliente.close();}
});
