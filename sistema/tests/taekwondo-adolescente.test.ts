import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas,reservarAula} from "../src/lib/aulas/repository";
import {systemUserId} from "../src/lib/db/bootstrap";
import {randomUUID} from "node:crypto";
import {correspondeTurno} from "../src/lib/aulas/turno";
import {ocorrenciasAula} from "../src/lib/aulas/recorrencia";

test("Taekwondo geral recebe 13 e 15 anos à noite; menores exigem responsável",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const grade=JSON.stringify((await consultarAulas(banco)).aulas);
  for(const idade of [13,15]){
   const conversa=`adolescente-${idade}`,atender=agendaAulasDoAgente(banco,redis,"lease",conversa,`55710000000${idade}`,async()=>true);
   const resposta=await atender(`É para meu filho de ${idade} anos. Tem Taekwondo à noite?`,{acao:"consultar",modalidade:"Taekwondo",idade});
   assert.match(resposta!,/19:15/);
   const estado=JSON.parse(cache.get(`atendeia:{evolution}:cadastro-aula:${conversa}`)!);
   assert.equal(estado.opcoes.length,2);
   assert.ok(estado.opcoes.every((o:{turma:string;inicio:string})=>o.turma==="Geral"&&correspondeTurno(o.inicio,"noite")&&[2,4].includes(new Date(Date.parse(o.inicio)-3*3600000).getUTCDay())));
   await atender("1");
   assert.match((await atender("Aluno Exemplo",{acao:"preparar",opcao:1,nome:"Aluno Exemplo",idade,responsavel:""}))!,/responsável/);
   assert.equal((await consultarAulas(banco)).reservas.length,idade===13?0:1);
   assert.match((await atender("Aluno Exemplo",{acao:"preparar",opcao:1,nome:"Aluno Exemplo",idade,responsavel:"Responsavel Exemplo"}))!,/está agendada/);
  }
  const pequeno=agendaAulasDoAgente(banco,redis,"lease","pequeno","5571000000006",async()=>true);
  assert.match((await pequeno("Tem Taekwondo à noite?",{acao:"consultar",modalidade:"Taekwondo",idade:6}))!,/para alunos de 6 anos/);
  const doze=agendaAulasDoAgente(banco,redis,"lease","doze","5571000000012",async()=>true);
  await doze("Taekwondo à noite",{acao:"consultar",modalidade:"Taekwondo",idade:12});
  const estadoDoze=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:doze")!);
  assert.ok(estadoDoze.opcoes.length>0&&estadoDoze.opcoes.every((o:{turma:string})=>o.turma!=="Geral"));
  const aula=(await consultarAulas(banco)).aulas.find(a=>a.modalidade==="Taekwondo"&&a.turma==="Geral"&&a.diaSemana===2)!;
  await assert.rejects(reservarAula(banco,{aulaId:aula.id,inicio:ocorrenciasAula(aula)[0],aluno:{nome:"Menor Exemplo",idade:12,telefone:"+5571000000012",responsavel:"Responsavel Exemplo"},solicitacaoId:randomUUID(),conferido:true},systemUserId));
  assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),grade);
 }finally{await cliente.close();}
});
