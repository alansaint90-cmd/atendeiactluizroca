import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import type Redis from 'ioredis';
import {applyMigrations} from '../src/lib/db/migrate';
import {systemUserId} from '../src/lib/db/bootstrap';
import {agendaAulasDoAgente} from '../src/lib/aulas/agente';
import {consultarAulas,reservarAula} from '../src/lib/aulas/repository';
import {ocorrenciasAula} from '../src/lib/aulas/recorrencia';
import {intencaoModalidade} from '../src/lib/aulas/objetivo';
import {perguntaMuayInfantil} from '../src/lib/ct/muay-infantil';
import {responderDuvidaCt,perguntaInformativaCt} from '../src/lib/ct/duvidas';
import {processMessage,type ProcessingPort,type DeliveryState} from '../src/lib/agent/processor';
import type {AgentConfig} from '../src/lib/agent/config';
import type {Turn} from '../src/lib/agent/providers';

test('pergunta negativa é interesse; recusa é diferente e FAQ infantil não pede agenda',()=>{
 for(const texto of ['Não tem Muay Thai para ele?','Não tem aula de Muay Thai para ele?','Tem Muay Thai infantil?','Muay Thai infantil?']) {
  assert.deepEqual(intencaoModalidade(texto),{modalidade:'Muay Thai',negadas:[]});
  assert.equal(perguntaMuayInfantil(texto,9),true,texto);
 }
 assert.deepEqual(intencaoModalidade('Não quero Muay Thai infantil'),{modalidade:null,negadas:['Muay Thai']});
 assert.equal(perguntaMuayInfantil('Não quero Muay Thai infantil',9),false);
 assert.equal(perguntaMuayInfantil('Tem Muay Thai para ele?',14),false);
 assert.equal(perguntaMuayInfantil('Quem é o professor de Muay Thai infantil?',9),false);
 assert.equal(perguntaInformativaCt('Tem Muay Thai infantil?'),true);
 assert.equal(responderDuvidaCt('Tem Muay Thai infantil?')?.assunto,'idadeMuay');
});

test('dúvidas do filho de nove recebem resposta sem pausa, conservam contexto e não liberam reserva infantil',async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>(),key='atendeia:{evolution}:cadastro-aula:infantil';
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 const atender=agendaAulasDoAgente(banco,redis,'lease','infantil','5571000000001',async()=>true);
 try {
  await applyMigrations(banco);const antes=JSON.stringify(await consultarAulas(banco));
  assert.match((await atender('É para meu filho de nove'))!,/Taekwondo/);
  const original=JSON.parse(cache.get(key)!);
  let state:DeliveryState|null=null,alertas=0,transferencias=0;const mensagens:string[]=[],historico:Turn[]=[{role:'user',content:'É para meu filho de nove'},{role:'assistant',content:'Temos Taekwondo para ele.'}];
  const cfg:AgentConfig={AI_ENABLED:'true',AI_SYSTEM_PROMPT:'Seu nome é Luísa. Preserve o contexto.',OPENAI_API_KEY:'teste',OPENAI_MODEL:'modelo',EVOLUTION_API_KEY:'teste',EVOLUTION_API_URL:'https://example.invalid',EVOLUTION_INSTANCE_NAME:'ctluizroca',REDIS_URL:'redis://localhost:6379',agendaAulas:true,openingMessages:['Boas-vindas ao CT. Como posso te ajudar?']};
  const port:ProcessingPort={read:async()=>state,write:async s=>{state=s;},complete:async(s,turns)=>{state=s;historico.push(...turns);},history:async()=>historico,enabled:async()=>true,aulaExperimental:atender,
   generate:async()=>{throw new Error('Pergunta normal deve ser respondida pelo servidor');},send:async(_c,_n,t)=>{mensagens.push(t);return `teste-${mensagens.length}`;},falhaHumana:async()=>{alertas++;},transferir:async()=>{transferencias++;}};
  for(const texto of ['Não tem Muay Thai para ele?','Não tem aula de Muay Thai para ele?','Tem Muay Thai infantil?']) {
   state=null;mensagens.length=0;
   assert.equal(await processMessage({identity:randomUUID(),conversation:'infantil',number:'5571000000001',text:texto,timestamp:Date.now()/1000},cfg,port),'enviada');
   assert.match(mensagens.join(' '),/9 anos.*equipe.*confirmar/s);
   assert.doesNotMatch(mensagens.join(' '),/Boas-vindas|Qual.*idade|está agendada|temos turma infantil|não temos Muay/iu);
   const atual=JSON.parse(cache.get(key)!);assert.equal(atual.consulta.idade,9);assert.deepEqual(atual.opcoes,original.opcoes);assert.equal(atual.consulta.modalidade,original.consulta.modalidade);
  }
  assert.equal(alertas,0);assert.equal(transferencias,0);
  state=null;port.generate=async(_config,history,text)=>{assert.equal(text,'Oi');assert.ok(history.some(t=>/Não tem aula de Muay Thai/.test(t.content)));return 'Quer continuar com as opções para seu filho?';};
  mensagens.length=0;
  assert.equal(await processMessage({identity:'retomada',conversation:'infantil',number:'5571000000001',text:'Oi',timestamp:Date.now()/1000},cfg,port),'enviada');
  assert.doesNotMatch(mensagens.join(' '),/Boas-vindas/);
  const agenda=await consultarAulas(banco),muay=agenda.aulas.find(a=>a.modalidade==='Muay Thai')!,inicio=ocorrenciasAula(muay)[0];
  const aluno={nome:'Aluno Teste',idade:9,telefone:'+5571000000001',responsavel:'Responsavel Teste'};
  await assert.rejects(reservarAula(banco,{aulaId:muay.id,inicio,aluno,solicitacaoId:randomUUID(),conferido:true},systemUserId),/equipe.*confirmar/);
  cache.set(key,JSON.stringify({participante:'crianca',opcoes:[{aulaId:muay.id,inicio,modalidade:'Muay Thai',turma:muay.turma}],opcaoEscolhida:1,consulta:{modalidade:'Muay Thai',idade:9,mostradas:[]}}));
  await assert.rejects(atender('Aluno Teste',{acao:'preparar',opcao:1,nome:aluno.nome,idade:9,responsavel:aluno.responsavel}),/muay_adaptado/);
  cache.set(key,JSON.stringify({participante:'crianca',opcoes:[],consulta:{modalidade:'Muay Thai',idade:14,mostradas:[]}}));
  assert.match((await atender('Tem Muay Thai para ele?'))!,/1\. Muay Thai/);
  assert.equal(JSON.stringify(await consultarAulas(banco)),antes);
 }finally{await cliente.close();}
});
