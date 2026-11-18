import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { receberOperacao } from "../src/lib/operacao/receber";
import { criarCampanha, alterarCampanha, contatosElegiveis, reservarEnvio } from "../src/lib/campanhas/repository";
import { salvarAgendamento, reservarAgendamento } from "../src/lib/agendamentos/repository";
import { listarFilaSql, modificarFilaSql } from "../src/lib/agendamentos/fila-repository";
import { systemUserId } from "../src/lib/db/bootstrap";
test("fila unifica origem e lixeira interrompe pendências sem reativar ao restaurar",async()=>{
 const client=new PGlite();const banco=drizzle(client);
 try{
  await applyMigrations(banco);
  await receberOperacao(banco,{instance:"teste",event:"messages.upsert",data:{key:{id:randomUUID(),fromMe:false,remoteJid:"5511999999999@s.whatsapp.net"},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:"Olá"}}});
  const contato=(await contatosElegiveis(banco,"teste"))[0];
  const id=randomUUID();await criarCampanha(banco,{id,nome:"Campanha retorno",instancia:"teste",mensagem:"Mensagem da campanha",arquivo:null,contatos:[contato.id]});
  assert.equal((await listarFilaSql(banco)).length,0,"Rascunho não está agendado");
  await alterarCampanha(banco,{id,version:0},"iniciar");
  const agendamento=await salvarAgendamento(banco,{id:randomUUID(),telefone:contato.telefone,instancia:"teste",mensagem:"Individual",agendadoPara:new Date(Date.now()+3600000).toISOString()});
  const itens=await listarFilaSql(banco);assert.equal(itens.length,2);assert.equal(itens.find(i=>i.origem==="campanha")?.origemNome,"Campanha retorno");
  const campanha=itens.find(i=>i.origem==="campanha")!;assert.equal(campanha.previsao,true);await modificarFilaSql(banco,campanha,"lixeira",systemUserId);
  assert.equal(await reservarEnvio(banco,"teste"),null);
  let removido=(await listarFilaSql(banco)).find(i=>i.id===campanha.id)!;assert.equal(removido.lixeira,true);assert.equal(removido.status,"cancelado");
  await assert.rejects(modificarFilaSql(banco,campanha,"cancelar",systemUserId),/mudou/);
  await modificarFilaSql(banco,removido,"restaurar",systemUserId);removido=(await listarFilaSql(banco)).find(i=>i.id===campanha.id)!;assert.equal(removido.lixeira,false);assert.equal(removido.status,"cancelado");assert.equal(await reservarEnvio(banco,"teste"),null);
  const individual=itens.find(i=>i.id===agendamento.id)!;await modificarFilaSql(banco,individual,"cancelar",systemUserId);
  await client.query("UPDATE atendeia_agendamentos SET agendado_para=now()-interval '1 minute' WHERE id=$1",[agendamento.id]);assert.equal(await reservarAgendamento(banco,"teste"),null);
  const id2=randomUUID();await salvarAgendamento(banco,{id:id2,telefone:contato.telefone,instancia:"teste",mensagem:"Em envio",agendadoPara:new Date(Date.now()+3600000).toISOString()});
  await client.query("UPDATE atendeia_agendamentos SET agendado_para=now()-interval '1 minute' WHERE id=$1",[id2]);await reservarAgendamento(banco,"teste");
  const enviando=(await listarFilaSql(banco)).find(i=>i.id===id2)!;await assert.rejects(modificarFilaSql(banco,enviando,"lixeira",systemUserId),/já começou/);
  await client.query("UPDATE atendeia_agendamentos SET status='enviado' WHERE id=$1",[id2]);const enviado=(await listarFilaSql(banco)).find(i=>i.id===id2)!;await assert.rejects(modificarFilaSql(banco,enviado,"cancelar",systemUserId),/Somente/);
  await modificarFilaSql(banco,enviado,"lixeira",systemUserId);assert.equal((await listarFilaSql(banco)).find(i=>i.id===id2)?.status,"enviado");
 }finally{await client.close();}
});

test("follow-up da aula encerra as duas etapas e restauração não recria envios",async()=>{
 const client=new PGlite(),banco=drizzle(client);
 try{
  await applyMigrations(banco);
  const {criarAula,reservarAula}=await import('../src/lib/aulas/repository');
  const {sincronizarLembretesAulas}=await import('../src/lib/aulas/lembretes');
  const inicio=new Date(Date.now()+3*86400000).toISOString();
  const a=await criarAula(banco,{modalidade:'Taekwondo',turma:'Geral',professor:'Teste',inicio,duracao:60,capacidade:null,idadeMinima:18,idadeMaxima:120},systemUserId);
  for(const telefone of ['+5511999999999','+5511888888888'])await reservarAula(banco,{aulaId:a.id,inicio,aluno:{nome:'Aluno de Teste',idade:25,telefone,responsavel:''},solicitacaoId:randomUUID(),conferido:true},systemUserId);
  await sincronizarLembretesAulas(banco,'ctluizroca');
  const fila=await listarFilaSql(banco),alvo=fila.find(i=>i.telefone==='+5511999999999')!;
  assert.equal(alvo.origem,'aula');assert.equal(fila.length,4);
  await assert.rejects(modificarFilaSql(banco,alvo,'lixeira',systemUserId,[alvo]),/quantidade ou versão/);
  assert.equal((await modificarFilaSql(banco,alvo,'lixeira',systemUserId)).length,2);
  let atuais=await listarFilaSql(banco);assert.equal(atuais.filter(i=>i.telefone===alvo.telefone&&i.lixeira&&i.status==='cancelado').length,2);
  assert.equal(atuais.filter(i=>i.telefone!==alvo.telefone&&i.status==='pendente').length,2);
  for(const r of atuais.filter(i=>i.lixeira))await modificarFilaSql(banco,r,'restaurar',systemUserId);
  await sincronizarLembretesAulas(banco,'ctluizroca');atuais=await listarFilaSql(banco);assert.equal(atuais.filter(i=>i.telefone===alvo.telefone&&i.status==='pendente').length,0);
 }finally{await client.close();}
});
