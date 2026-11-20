import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type Redis from "ioredis";
import { applyMigrations } from "../src/lib/db/migrate";
import { agendaAulasDoAgente } from "../src/lib/aulas/agente";
import { consultarAulas } from "../src/lib/aulas/repository";
import { pediuOutrosDias } from "../src/lib/aulas/outros-dias";
import { pedidoGradeInformativa } from "../src/lib/aulas/grade-informativa";

test("pergunta sobre exclusividade do dia não é uma restrição ou confirmação",()=>{
  for(const texto of ["Só segunda?","É só segunda?","Não tem outro dia?","Tem outro dia à tarde?","Outras datas"]) assert.equal(pediuOutrosDias(texto),true,texto);
  for(const texto of ["Só posso segunda","Segunda é bom","Quero apenas segunda","Não quero outro dia","Sim"]) assert.equal(pediuOutrosDias(texto),false,texto);
  for(const texto of ["Me passe os horários de Muay Thai","Todos","Quero saber o horário das aulas de Muay Thai da semana"]) assert.equal(pedidoGradeInformativa(texto),true,texto);
  assert.equal(pedidoGradeInformativa("Outros horários de Muay Thai"),false);
  assert.equal(pedidoGradeInformativa("Quero agendar Muay Thai"),false);
});

test("só segunda e outro dia à tarde consultam quarta sem repetir a segunda nem perder o contexto",async()=>{
  const clock=Date.now; Date.now=()=>Date.parse("2026-11-20T00:15:00-03:00");
  const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
  const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_lock:string,k:string,_token:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
  const atender=agendaAulasDoAgente(banco,redis,"lease","outro-dia","5571000000001",async()=>true);
  const chave="atendeia:{evolution}:cadastro-aula:outro-dia";
  try {
    await applyMigrations(banco);
    await atender("Para mim");
    assert.match((await atender("Muay Thai na segunda à tarde"))!,/23\/11\/2026 às 15:45/);
    const original=cache.get(chave)!;
    for(const texto of ["Só segunda?","É só segunda?","Não tem outro dia?","Tem outro dia à tarde?"]) {
      cache.set(chave,original);
      const resposta=await atender(texto),estado=JSON.parse(cache.get(chave)!);
      assert.match(resposta!,/quarta-feira, 25\/11\/2026 às 15:45/,texto);
      assert.doesNotMatch(resposta!,/23\/11\/2026|agendada|nome completo/,texto);
      assert.equal(estado.consulta.modalidade,"Muay Thai");
      assert.equal(estado.turnoSolicitado,"tarde");assert.equal(estado.dataSolicitada,null);
      assert.equal(estado.adultoSemIdade,true);assert.equal(estado.consulta.idade,null);
    }
    assert.match((await atender("1"))!,/nome completo/);
    assert.equal((await consultarAulas(banco)).reservas.length,0);
    const ambos=JSON.parse(cache.get(chave)!);
    ambos.opcoes=[...JSON.parse(original).opcoes,...ambos.opcoes];
    cache.set(chave,JSON.stringify(ambos));
    const esgotadas=await atender("Não tem outro dia à tarde?");
    assert.match(esgotadas!,/esses são os horários/);
    assert.doesNotMatch(esgotadas!,/não temos turma|1\./);
    cache.set(chave,original);
    assert.match((await atender("Só posso segunda"))!,/23\/11\/2026 às 15:45/);
    for(const pedido of ["Me passe os horários de Muay Thai","Todos","Quero saber o horário das aulas de Muay Thai da semana"]) {
      const antigo=JSON.parse(original);
      antigo.dataSolicitada="2026-11-26";antigo.turnoSolicitado="tarde";antigo.consulta.data="2026-11-26";antigo.consulta.turno="tarde";
      cache.set(chave,JSON.stringify(antigo));
      const grade=await atender(pedido),estado=JSON.parse(cache.get(chave)!);
      assert.match(grade!,/Segunda e quarta: 15:45, 18:15 e 21:15/);
      assert.match(grade!,/Terça e quinta: 06:00, 08:00, 09:00 e 20:15/);
      assert.doesNotMatch(grade!,/26\/11|30\/11|não temos|para essa idade|nome completo/);
      assert.equal(estado.dataSolicitada,null);assert.equal(estado.turnoSolicitado,null);
      assert.equal(estado.adultoSemIdade,true);assert.equal(estado.consulta.modalidade,"Muay Thai");
      assert.equal(estado.opcoes.length,0);assert.equal(estado.reserva,undefined);
    }
    const tarde=await atender("Todos os horários de Muay Thai à tarde");
    assert.match(tarde!,/15:45/);assert.doesNotMatch(tarde!,/06:00|18:15|21:15/);
    assert.equal((await consultarAulas(banco)).reservas.length,0);
  } finally {Date.now=clock;await cliente.close();}
});
