import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import type Redis from 'ioredis';
import {applyMigrations} from '../src/lib/db/migrate';
import {idadeParticipanteInformada,idadesNegadas,contextualizarRespostaIdade} from '../src/lib/aulas/idade-informada';
import {identificarParticipante} from '../src/lib/aulas/participante';
import {interpretarDataCt,dataLocalCt} from '../src/lib/aulas/calendario';
import {agendaAulasDoAgente} from '../src/lib/aulas/agente';
import {consultarAulas} from '../src/lib/aulas/repository';

test('idade com e sem anos, por extenso e número isolado somente na etapa de idade',()=>{
 for(const texto of ['Eu tenho 23','tenho vinte e três','23 anos','vinte e três anos','minha idade é 23','estou com 23','Nome Sobrenome, 23 anos'])assert.equal(idadeParticipanteInformada(texto)?.[1],'23',texto);
 for(const texto of ['23','vinte e três','23!']){assert.equal(idadeParticipanteInformada(texto),null);assert.equal(idadeParticipanteInformada(texto,true)?.[1],'23',texto);}
 for(const texto of ['ele tem 8','meu filho tem oito','8 aninhos','ela está com oito anos'])assert.equal(idadeParticipanteInformada(texto)?.[1],'8',texto);
 for(const texto of ['23/11','dia 23','às 23h','23:00','tenho 23 reais','tenho 2 filhos','Não tenho 23','não tenho vinte e três anos','ele tem 8 ou 9 anos','tenho 121 anos','23.5 anos','Qual idade mínima, 23 anos?'])assert.equal(idadeParticipanteInformada(texto,true),null,texto);
 assert.deepEqual(idadesNegadas('não tenho quinze, tenho vinte e três'),[15]);
 assert.equal(idadeParticipanteInformada('Não tenho 15, tenho 23')?.[1],'23');
 assert.equal(identificarParticipante('Eu tenho 23'),'adulto');
 assert.equal(identificarParticipante('Eu tenho quinze'),'crianca');
 assert.match(contextualizarRespostaIdade('23',[{role:'assistant',content:'Qual é a idade de quem vai fazer a aula?'}]),/23 anos/);
 assert.equal(contextualizarRespostaIdade('1',[{role:'assistant',content:'Qual opção você prefere?'}]),'1');
 assert.equal(contextualizarRespostaIdade('23/11',[{role:'assistant',content:'Qual é a idade?'}]),'23/11');
});

test('datas numéricas, por extenso e relativas usam o calendário atual sem confundir idade',()=>{
 const agora=Date.parse('2026-11-22T21:00:00-03:00');
 for(const texto of ['23/11','23 / 11 / 2026','23.11.26','23-11-2026','23 de novembro','dia vinte e três de novembro de dois mil e vinte e seis','dia 23','amanhã','daqui a um dia','segunda-feira'])assert.deepEqual(interpretarDataCt(texto,agora),{tipo:'data',data:'2026-11-23'},texto);
 assert.deepEqual(interpretarDataCt('dia 23/12/2026',agora),{tipo:'data',data:'2026-12-23'});
 assert.deepEqual(interpretarDataCt('daqui a dois dias',agora),{tipo:'data',data:'2026-11-24'});
 assert.equal(interpretarDataCt('31 de fevereiro de 2027',agora)?.tipo,'invalida');
 assert.equal(interpretarDataCt('31.02.27',agora)?.tipo,'invalida');
 assert.equal(interpretarDataCt('dia 10',agora)?.tipo,'invalida');
 assert.equal(interpretarDataCt('23 de novembro ou 24 de novembro',agora)?.tipo,'ambigua');
 for(const texto of ['Eu tenho 23','23','23 anos','primeira opção'])assert.equal(interpretarDataCt(texto,agora),null,texto);
});

test('resposta curta de idade avança sem repetir pergunta nem perder Muay Thai; números de opções não viram idade',async()=>{
 const clock=Date.now;Date.now=()=>Date.parse('2026-11-22T12:00:00-03:00');
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>(),chave='atendeia:{evolution}:cadastro-aula:variacoes';
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=agendaAulasDoAgente(banco,redis,'lease','variacoes','5571000000001',async()=>true);
 try {
  await applyMigrations(banco);const antes=JSON.stringify(await consultarAulas(banco));
  for(const texto of ['Eu tenho 23','tenho vinte e três','23','vinte e três','23 anos']) {
   cache.set(chave,JSON.stringify({participante:'crianca',opcoes:[],consulta:{modalidade:'Muay Thai',idade:null,mostradas:[]}}));
   const resposta=await atender(texto),estado=JSON.parse(cache.get(chave)!);
   assert.match(resposta!,/Muay Thai/,texto);assert.doesNotMatch(resposta!,/Qual.*idade|Qual modalidade|para você ou para outra pessoa/iu,texto);
   assert.equal(estado.consulta.idade,23,texto);assert.equal(estado.consulta.modalidade,'Muay Thai');assert.equal(estado.adultoSemIdade,false);
   assert.ok(estado.opcoes.length);
  }
  const estado=JSON.parse(cache.get(chave)!);
  await atender('1');assert.equal(JSON.parse(cache.get(chave)!).consulta.idade,23,'opção não sobrescreve idade');
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  cache.set(chave,JSON.stringify({...estado,opcoes:[],opcaoEscolhida:undefined}));
  const respostaData=await atender('dia vinte e quatro de novembro');
  assert.ok(respostaData);const atualizado=JSON.parse(cache.get(chave)!);
  assert.equal(atualizado.consulta.idade,23);assert.equal(atualizado.dataSolicitada,'2026-11-24');
  assert.ok(atualizado.opcoes.every((o:{inicio:string})=>dataLocalCt(Date.parse(o.inicio))==='2026-11-24'));
  assert.equal(JSON.stringify(await consultarAulas(banco)),antes,'consulta preserva grade e reservas');
 }finally{Date.now=clock;await cliente.close();}
});
