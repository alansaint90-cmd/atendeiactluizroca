import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas} from "../src/lib/aulas/repository";
import {correspondeTurno} from "../src/lib/aulas/turno";
import {identificarParticipante} from "../src/lib/aulas/participante";

test("pedido literal vence recomendação e troca do filho para pai não herda filtros",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=(c:string,t:string,acao?:Parameters<ReturnType<typeof agendaAulasDoAgente>>[1])=>agendaAulasDoAgente(banco,redis,"lease",c,"5571000000001",async()=>true)(t,acao);
 const estado=(c:string)=>JSON.parse(cache.get(`atendeia:{evolution}:cadastro-aula:${c}`)!);
 try{
  await applyMigrations(banco);
  const grade=JSON.stringify((await consultarAulas(banco)).aulas);
  await atender("pai","Para meu filho de 15 anos, quero gastar energia na próxima segunda à noite");
  await atender("pai","Jiu-Jitsu");
  assert.match((await atender("pai","Tem Muay Thai?"))!,/Muay Thai/);
  const resposta=await atender("pai","Agora é para mim\nAlan\nO pai de Benjamim");
  assert.match(resposta!,/Muay Thai/);assert.doesNotMatch(resposta!,/Jiu-Jitsu|Taekwondo/);
  assert.equal(estado("pai").consulta.idade,null);
  assert.equal(estado("pai").adultoSemIdade,true);
  assert.equal(estado("pai").objetivo,undefined);
  assert.equal(estado("pai").dataSolicitada,null);
  assert.ok(estado("pai").opcoes.length>0);
  assert.ok(estado("pai").opcoes.every((o:{modalidade:string})=>o.modalidade==="Muay Thai"));
  await atender("pai","MUAY THAI");
  assert.ok(estado("pai").opcoes.every((o:{modalidade:string})=>o.modalidade==="Muay Thai"));
  for(const modalidade of ["Muay Thai","Jiu-Jitsu","Taekwondo"]){
   const c=`literal-${modalidade}`;
   const primeira=await atender(c,`Tem ${modalidade} de noite?`);
   assert.match(primeira!,new RegExp(`Temos ${modalidade}, sim`));
   const horarios=await atender(c,"Pra mim");
   assert.match(horarios!,new RegExp(modalidade));
   assert.ok(estado(c).opcoes.length>0);
   assert.ok(estado(c).opcoes.every((o:{modalidade:string;inicio:string})=>o.modalidade===modalidade&&correspondeTurno(o.inicio,"noite")));
  }
  await atender("defesa","Pra mim, de noite");
  assert.match((await atender("defesa","Quero defesa pessoal"))!,/recomendo Jiu-Jitsu/);
  assert.match((await atender("defesa","Prefiro Muay Thai"))!,/Muay Thai/);
  assert.ok(estado("defesa").opcoes.every((o:{modalidade:string})=>o.modalidade==="Muay Thai"));
  await cliente.exec("UPDATE atendeia_aulas SET is_deleted=true WHERE modalidade='Jiu-Jitsu'");
  await atender("alternativa","Pra mim, de noite");
  assert.match((await atender("alternativa","Quero defesa pessoal"))!,/Muay Thai.*defesa pessoal/s);
  assert.ok(estado("alternativa").opcoes.every((o:{modalidade:string})=>o.modalidade==="Muay Thai"));
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  await cliente.exec("UPDATE atendeia_aulas SET is_deleted=false WHERE modalidade='Jiu-Jitsu'");
  assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),grade);
  assert.equal(identificarParticipante("Agora é para mim, sou o pai do meu filho"),"adulto");
  assert.equal(identificarParticipante("Não é para mim, é para meu filho"),"crianca");
 }finally{await cliente.close();}
});
