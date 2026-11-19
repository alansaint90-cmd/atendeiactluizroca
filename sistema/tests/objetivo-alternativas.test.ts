import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {identificarObjetivo,recomendarObjetivo,explicarBeneficioObjetivo} from "../src/lib/aulas/objetivo";
import {correspondeTurno} from "../src/lib/aulas/turno";
import {dataLocalCt,interpretarDataCt} from "../src/lib/aulas/calendario";
import {acaoAulasSchema,ferramentasAulas} from "../src/lib/aulas/agente-schema";

test("energia é objetivo; todas as modalidades podem ter benefício sem promessa de resultado",()=>{
 assert.equal(identificarObjetivo("Quero uma para ele gastar energia"),"energia");
 assert.equal(identificarObjetivo("Não quero gastar energia"),null);
 assert.equal(recomendarObjetivo("energia",9,true)?.modalidade,"Taekwondo");
 assert.equal(recomendarObjetivo("emagrecer",null,false)?.modalidade,"Muay Thai");
 for(const m of ["Muay Thai","Jiu-Jitsu","Taekwondo"])assert.match(explicarBeneficioObjetivo("emagrecer",m,null,false),/gasto|energia|calórico/);
 assert.ok(ferramentasAulas[0].parameters.required.includes("objetivo"));
 assert.equal(acaoAulasSchema.safeParse({acao:"consultar",modalidade:null,idade:9,objetivo:"energia"}).success,true);
 assert.equal(acaoAulasSchema.safeParse({acao:"consultar",modalidade:null,idade:9,objetivo:"inventado"}).success,false);
});

test("explica benefícios e oferece alternativa real, mantendo idade, turno, data e histórico de opções",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=(c:string)=>agendaAulasDoAgente(banco,redis,"lease",c,"5571000000001",async()=>true);
 const estado=(c:string)=>JSON.parse(cache.get(`atendeia:{evolution}:cadastro-aula:${c}`)!);
 try{
  await applyMigrations(banco);
  await cliente.exec("UPDATE atendeia_aulas SET is_deleted=true WHERE modalidade='Muay Thai'");
  const grade=JSON.stringify((await consultarAulas(banco)).aulas);
  const historico=await atender("objetivo-historico")("Tem pela manhã?",{acao:"consultar",modalidade:"Muay Thai",idade:9,objetivo:"energia"});
  assert.match(historico!,/recomendo Taekwondo/);
  assert.equal(estado("objetivo-historico").objetivo,"energia");
  assert.ok(estado("objetivo-historico").opcoes.length>0&&estado("objetivo-historico").opcoes.every((o:{modalidade:string;inicio:string})=>o.modalidade==="Taekwondo"&&correspondeTurno(o.inicio,"manha")));
  await atender("manha")("É pra mim, de manhã");
  const manha=await atender("manha")("Quero emagrecer");
  assert.match(manha!,/primeira indicação é Muay Thai/);assert.match(manha!,/Taekwondo/);
  assert.doesNotMatch(manha!,/Jiu-Jitsu/);
  assert.ok(estado("manha").opcoes.length>0&&estado("manha").opcoes.length<=2);
  assert.ok(estado("manha").opcoes.every((o:{modalidade:string;inicio:string})=>o.modalidade==="Taekwondo"&&correspondeTurno(o.inicio,"manha")));
  const mostradas=estado("manha").opcoes.map((o:{aulaId:string})=>o.aulaId);
  await atender("manha")("Outra opção");
  assert.ok(estado("manha").opcoes.every((o:{aulaId:string})=>!mostradas.includes(o.aulaId)));
  await atender("explicita")("É pra mim, de manhã");
  const explicita=await atender("explicita")("Quero Muay Thai",{acao:"consultar",modalidade:"Muay Thai",idade:null,adultoSemIdade:true});
  assert.doesNotMatch(explicita!,/Taekwondo|Jiu-Jitsu/);
  assert.doesNotMatch((await atender("explicita")("Quero emagrecer"))!,/Taekwondo|Jiu-Jitsu/);
  assert.equal(estado("explicita").opcoes.length,0,"não substituir escolha explícita por recomendação");
  await atender("noite")("É pra mim");
  const noite=await atender("noite")("Quero emagrecer na próxima segunda à noite");
  assert.match(noite!,/Jiu-Jitsu/);assert.doesNotMatch(noite!,/Taekwondo/);
  const dia=interpretarDataCt("próxima segunda");assert.equal(dia?.tipo,"data");
  assert.ok(estado("noite").opcoes.every((o:{modalidade:string;inicio:string})=>o.modalidade==="Jiu-Jitsu"&&correspondeTurno(o.inicio,"noite")&&dia?.tipo==="data"&&dataLocalCt(Date.parse(o.inicio))===dia.data));
  assert.match((await atender("noite")("Participante Exemplo",{acao:"preparar",opcao:1,nome:"Participante Exemplo",idade:null,adultoSemIdade:true,responsavel:""}))!,/Jiu-Jitsu/);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  await atender("mais-noite")("É pra mim, de noite");
  await atender("mais-noite")("Quero emagrecer");
  const vistas=new Set<string>();let ofereceuTaekwondo=false;
  for(let rodada=0;rodada<4;rodada++){
   const opcoes=estado("mais-noite").opcoes as {aulaId:string;modalidade:string;inicio:string}[];
   assert.ok(opcoes.length>0&&opcoes.length<=2,"alternativas são apresentadas em pares");
   for(const o of opcoes){assert.ok(!vistas.has(o.aulaId),"não repetir turmas ao trocar a modalidade alternativa");vistas.add(o.aulaId);assert.ok(correspondeTurno(o.inicio,"noite"));}
   if(opcoes.every(o=>o.modalidade==="Taekwondo")){ofereceuTaekwondo=true;break;}
   await atender("mais-noite")("Outra opção");
  }
  assert.equal(ofereceuTaekwondo,true);
  await atender("energia")("Quero gastar energia");
  await atender("energia")("É para meu filho");
  const infantil=await atender("energia")("9 anos");
  assert.match(infantil!,/recomendo Taekwondo/);assert.doesNotMatch(infantil!,/Muay Thai|Jiu-Jitsu/);
  assert.ok(estado("energia").opcoes.every((o:{modalidade:string})=>o.modalidade==="Taekwondo"));
  assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),grade,"o agente não altera o cadastro das aulas");
  await cliente.exec("UPDATE atendeia_aulas SET is_deleted=true WHERE modalidade='Taekwondo'");
  await atender("dez")("É para meu filho de 10 anos, à tarde",{acao:"consultar",modalidade:null,idade:10});
  const dez=await atender("dez")("Quero uma para ele gastar energia");
  assert.match(dez!,/Jiu-Jitsu/);
  const aulasAtuais=(await consultarAulas(banco)).aulas;
  assert.ok(estado("dez").opcoes.length>0,"há turma compartilhada de Jiu-Jitsu compatível com 10 anos");
  assert.ok(estado("dez").opcoes.every((o:{aulaId:string;inicio:string})=>{const a=aulasAtuais.find(a=>a.id===o.aulaId);return a&&a.turma!=="Geral"&&a.idadeMinima<=10&&a.idadeMaxima>=10&&correspondeTurno(o.inicio,"tarde");}));
  await atender("oito")("É para meu filho de 8 anos, à tarde",{acao:"consultar",modalidade:null,idade:8});
  const oito=await atender("oito")("Quero uma para ele gastar energia");
  assert.match(oito!,/recomendo Taekwondo/);assert.equal(estado("oito").opcoes.length,0);
  assert.doesNotMatch(oito!,/1\. Jiu-Jitsu|1\. Muay Thai/);
  await cliente.exec("UPDATE atendeia_aulas SET is_deleted=true WHERE modalidade='Jiu-Jitsu'");
  await atender("vazia")("É pra mim, de manhã");
  const vazia=await atender("vazia")("Quero emagrecer");
  assert.match(vazia!,/recomendo Muay Thai/);assert.match(vazia!,/funcionais/);
  assert.equal(estado("vazia").opcoes.length,0);assert.doesNotMatch(vazia!,/Temos sim/);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
 }finally{await cliente.close();}
});
