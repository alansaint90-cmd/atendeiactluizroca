import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import type Redis from 'ioredis';
import {applyMigrations} from '../src/lib/db/migrate';
import {agendaAulasDoAgente} from '../src/lib/aulas/agente';
import {responderDuvidaCt} from '../src/lib/ct/duvidas';
import {mensagensDaAula} from '../src/lib/agent/blocos';
import {consultarAulas} from '../src/lib/aulas/repository';

test('equipamentos respeitam a modalidade explícita ou atual sem listar outras',()=>{
 const tae=responderDuvidaCt('Qual roupa ele deve ir?',undefined,'Taekwondo')!.resposta;
 assert.match(tae,/roupa leve.*água.*Taekwondo.*não precisa de kimono/s);assert.doesNotMatch(tae,/Muay|Jiu|empréstimo/);
 const jiu=responderDuvidaCt('Preciso de kimono?',undefined,'Jiu-Jitsu')!.resposta;assert.match(jiu,/Jiu-Jitsu/);assert.doesNotMatch(jiu,/Muay|Taekwondo/);
 const muay=responderDuvidaCt('O que levar para Muay Thai?',undefined,'Taekwondo')!.resposta;assert.match(muay,/empréstimo/);assert.doesNotMatch(muay,/Taekwondo|Jiu/);
 assert.doesNotMatch(responderDuvidaCt('O que levar?')!.resposta,/Muay|empréstimo/);
});

test('indicações e dúvidas da experimental chegam em dois balões e retomam a etapa sem reservar no aceite',async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=agendaAulasDoAgente(banco,redis,'lease','roupas','5571000000001',async()=>true);
 try {
  const recomendar=agendaAulasDoAgente(banco,redis,'lease','recomendar','5571000000002',async()=>true);
  await applyMigrations(banco);
  await recomendar('Quero agendar pra mim agora');
  for (const pedido of ['O que vc me indicaria?\nTenho 44 anos','Vcs tem oq aí pra mim?\nTenho 44 anos','O que é melhor para minha saúde? Estou sedentária.']) {
   const partes=mensagensDaAula((await recomendar(pedido))!);
   assert.equal(partes.length,2);
   assert.match(partes[0],/indicaria Jiu-Jitsu ou Muay Thai/);
   assert.match(partes[0],/Taekwondo trabalha.*Muay Thai trabalha.*Jiu-Jitsu trabalha/s);
   assert.equal(partes[1],'Qual das três você prefere?');
   if(pedido.includes('sedentária')) assert.match(partes[0],/sair do sedentarismo/);
  }
  const infantil=agendaAulasDoAgente(banco,redis,'lease','infantil','5571000000003',async()=>true);
  assert.match((await infantil('O que você me indicaria para meu filho de 9 anos?'))!,/minha indicação é o Taekwondo/);
  await recomendar('Muay Thai');
  for(const pergunta of ['Vou fazer o experimental. Mas qual o valor da aula?','E se eu me machucar na aula?']) {
   const partes=mensagensDaAula((await recomendar(pergunta))!);
   assert.equal(partes.length,2);
   assert.match(partes[0],/gratuita|avise o professor/);
   assert.equal(partes[1],'Vamos agendar sua aula experimental?');
  }
  assert.match((await recomendar('Sim'))!,/Qual dos horários/);
  await atender('É para meu filho de 9');await atender('1');
  const antes=JSON.parse(cache.get('atendeia:{evolution}:cadastro-aula:roupas')!);
  const partes=mensagensDaAula((await atender('Qual roupa ele deve ir?'))!);
  assert.equal(partes.length,2);assert.doesNotMatch(partes[0],/Muay|Jiu/);assert.equal(partes[1],'Podemos prosseguir com o agendamento?');
  const depois=JSON.parse(cache.get('atendeia:{evolution}:cadastro-aula:roupas')!);assert.equal(depois.opcaoEscolhida,antes.opcaoEscolhida);assert.equal(depois.consulta.idade,9);
  await atender('Sim');assert.equal((await consultarAulas(banco)).reservas.length,0);
  assert.match((await atender('Aluno Teste',{acao:'preparar',opcao:1,nome:'Aluno Teste',idade:9,responsavel:'Responsavel Teste'}))!,/está agendada/);
  assert.doesNotMatch((await atender('Qual roupa levar?'))!,/prosseguir com o agendamento/);
 }finally{await cliente.close();}
});
