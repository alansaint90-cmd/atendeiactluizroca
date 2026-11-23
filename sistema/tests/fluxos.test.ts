import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {applyMigrations} from '../src/lib/db/migrate';
import {systemUserId} from '../src/lib/db/bootstrap';
import {listarFluxos,salvarFluxoServidor,selecionarFluxo,fluxoContinuaAtivo} from '../src/lib/fluxos/repository';
import {anuncioPadrao,correspondeFluxo,type Fluxo} from '../src/lib/fluxos/schema';
import {ABERTURA_CT} from '../src/lib/ct/recepcao';
test('gatilho do anúncio aceita acentos, saudação e pontuação sem capturar frases diferentes',()=>{
 const f:Fluxo={...anuncioPadrao,id:'00000000-0000-4000-8000-000000000021',versao:0};
 for(const t of ['Olá, gostaria de mais informações sobre a aula.','OLA GOSTARIA DE MAIS INFORMACOES SOBRE A AULA!!!','Gostaria de mais informações','Oi, gostaria de mais informações.'])assert.equal(correspondeFluxo(f,t),true,t);
 for(const t of ['Não gostaria de mais informações','Gostaria de mais informações sobre cancelamento','Quero emagrecer'])assert.equal(correspondeFluxo(f,t),false,t);
 assert.equal(correspondeFluxo({...f,ativo:false},'Gostaria de mais informações'),false);
});
test('fluxo inicial é persistente e único, isolado por chip e protegido contra edição concorrente',async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente);
 try{
  await applyMigrations(banco);await applyMigrations(banco);
  const lista=await listarFluxos(banco,'ctluizroca');assert.equal(lista.length,1);assert.equal((await listarFluxos(banco,'outro')).length,0);
  const inicial=await selecionarFluxo(banco,'ctluizroca','Olá, gostaria de mais informações sobre a aula.');assert.ok(inicial);assert.deepEqual(inicial.mensagens,ABERTURA_CT);
  assert.equal(await selecionarFluxo(banco,'outro','Gostaria de mais informações'),null);
  const salvo=await salvarFluxoServidor(banco,{...anuncioPadrao,ativo:false},{id:lista[0].id,versao:0},systemUserId);
  assert.equal(salvo.versao,1);assert.equal(await fluxoContinuaAtivo(banco,'ctluizroca',inicial),false);assert.equal(await selecionarFluxo(banco,'ctluizroca','Gostaria de mais informações'),null);
  await assert.rejects(salvarFluxoServidor(banco,anuncioPadrao,{id:salvo.id,versao:0},systemUserId),/outra sessão/);
  await assert.rejects(salvarFluxoServidor(banco,{...anuncioPadrao,definicao:{...anuncioPadrao.definicao,instancia:'outro'}},{id:salvo.id,versao:1},systemUserId),/outra sessão/);
  const novo=await salvarFluxoServidor(banco,{...anuncioPadrao,nome:'Anúncio outro chip',definicao:{...anuncioPadrao.definicao,instancia:'outro'}},null,systemUserId);
  assert.equal((await selecionarFluxo(banco,'outro','Gostaria de mais informações'))?.id,novo.id);
  assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE action='fluxo_criado' OR action='fluxo_atualizado'")).rows.length,2);
 }finally{await cliente.close();}
});
