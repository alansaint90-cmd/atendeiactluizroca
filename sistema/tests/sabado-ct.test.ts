import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type Redis from "ioredis";
import { applyMigrations } from "../src/lib/db/migrate";
import { agendaAulasDoAgente } from "../src/lib/aulas/agente";
import { consultarAulas, reservarAula } from "../src/lib/aulas/repository";
import { systemUserId } from "../src/lib/db/bootstrap";
import { apresentarGradeInformativa } from "../src/lib/aulas/grade-informativa";
import { ocorrenciasAula } from "../src/lib/aulas/recorrencia";
import { funcionamentoNoDiaCt } from "../src/lib/ct/funcionamento";
import { REGRA_SABADO_CT, RESPOSTA_SABADO_CT } from "../src/lib/ct/sabado";
import { PROMPT_CT_LUIZ_ROCA } from "../src/lib/ct/prompt";

test("sábado explica a política geral, libera proposta antiga e preserva grade, participante e reservas",async()=>{
 const clock=Date.now;Date.now=()=>Date.parse("2026-11-20T22:00:00-03:00");
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const chave="atendeia:{evolution}:cadastro-aula:sabado";
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=agendaAulasDoAgente(banco,redis,"lease","sabado","5571000000001",async()=>true);
 try {
  await applyMigrations(banco);const antes=await consultarAulas(banco);
  const antigo={participante:"crianca",modalidadePreferida:"Muay Thai",turnoSolicitado:"tarde",dataSolicitada:"2026-11-26",opcoes:[{aulaId:"antiga",inicio:"2026-11-26T15:45:00-03:00"}],opcaoEscolhida:1,reserva:{aulaId:"antiga"},consulta:{modalidade:"Muay Thai",idade:15,mostradas:["antiga"]}};
  for(const texto of ["Sábado tem aula?","E tem alguma modalidade sábado?","Tem Taekwondo aos sábados?","Quero agendar Muay Thai sábado","Tem aula amanhã?"]) {
   cache.set(chave,JSON.stringify(antigo));
   assert.equal(await atender(texto),RESPOSTA_SABADO_CT,texto);
   const atual=JSON.parse(cache.get(chave)!);
   assert.equal(atual.consulta.idade,15);assert.equal(atual.modalidadePreferida,"Muay Thai");
   assert.deepEqual(atual.opcoes,[]);assert.equal(atual.reserva,undefined);
   assert.equal(await atender("Sim"),null,"aceite não usa proposta antiga");
  }
  const sabados=antes.aulas.filter(a=>a.diaSemana===6);assert.ok(sabados.length);
  for(const aula of sabados) assert.deepEqual(ocorrenciasAula(aula),[]);
  const aula=sabados.find(a=>a.turma==="Geral")!;
  const inicio="2026-11-21T09:00:00.000-03:00",aluno={nome:"Participante Teste",idade:null,adultoSemIdade:true,telefone:"+5571000000001",responsavel:""};
  cache.set(chave,JSON.stringify({participante:"adulto",adultoSemIdade:true,opcoes:[{aulaId:aula.id,inicio,modalidade:aula.modalidade,turma:aula.turma}],opcaoEscolhida:1}));
  assert.equal(await atender("Participante Teste",{acao:"preparar",opcao:1,nome:aluno.nome,idade:null,adultoSemIdade:true,responsavel:""}),RESPOSTA_SABADO_CT);
  await assert.rejects(reservarAula(banco,{aulaId:aula.id,inicio,aluno,conferido:true,solicitacaoId:"6ed235a4-dc4a-4c25-9d9b-94a1c4885261"},systemUserId),/Não temos aulas programadas aos sábados/);
  assert.equal(apresentarGradeInformativa(antes.aulas,"Tem Taekwondo sábado?","Taekwondo"),RESPOSTA_SABADO_CT);
  assert.doesNotMatch(apresentarGradeInformativa(antes.aulas,"Toda a grade",null),/Sábado/);
  assert.equal(funcionamentoNoDiaCt(antes.aulas,"O CT abre sábado?"),RESPOSTA_SABADO_CT);
  const extra={...sabados[0],id:"extra-teste",diaSemana:null,inicio:"2026-11-21T14:00:00-03:00"};
  assert.deepEqual(ocorrenciasAula(extra),[extra.inicio]);
  assert.match(apresentarGradeInformativa([...antes.aulas,extra],"Sábado tem aula?",null),/14:00/);
  assert.match(funcionamentoNoDiaCt([...antes.aulas,extra],"O CT abre sábado?"),/14:00.*15:00/);
  assert.ok(PROMPT_CT_LUIZ_ROCA.endsWith(REGRA_SABADO_CT));
  assert.deepEqual(await consultarAulas(banco),antes,"não apagar cadastros nem reservas");
 }finally{Date.now=clock;await cliente.close();}
});
