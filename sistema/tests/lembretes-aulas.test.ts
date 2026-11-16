import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {applyMigrations} from "../src/lib/db/migrate";
import {criarAula,reservarAula,cancelarReservaAula,consultarAulas} from "../src/lib/aulas/repository";
import {sincronizarLembretesAulas,mensagemLembreteAula} from "../src/lib/aulas/lembretes";
import {listarAgendamentos,cancelarAgendamento} from "../src/lib/agendamentos/repository";
import {processarAgendamento} from "../src/lib/agendamentos/worker";
import {systemUserId} from "../src/lib/db/bootstrap";

test("lembrete usa nome, horário local e responsável sem marcadores",()=>{
  assert.equal(mensagemLembreteAula("Ana Silva","",25,"Taekwondo","2026-11-18T22:15:00Z"),"Opa, Ana! Passando para lembrar da aula experimental de Taekwondo amanhã, às 19:15. Tá confirmado?");
  assert.match(mensagemLembreteAula("Luís Roca","Ricardo Silva",8,"Taekwondo","2026-11-18T22:15:00Z"),/Opa, Ricardo!.*de Luís Roca/);
});
test("lembrete D-1 é único, respeita cancelamento, expiração e entrega incerta",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente);
 const config={EVOLUTION_API_URL:"https://evolution.example.com",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"ctluizroca"};
 let envios=0;
 try {
  await applyMigrations(banco);
  const inicio=new Date(Date.now()+3*86400000).toISOString();
  const a=await criarAula(banco,{modalidade:"Taekwondo",turma:"Teste",professor:"Professor",inicio,duracao:60,capacidade:null,idadeMinima:3,idadeMaxima:120},systemUserId);
  async function reservar(nome:string,telefone:string,idade=25,responsavel="") {
   return reservarAula(banco,{aulaId:a.id,inicio,aluno:{nome,telefone,idade,responsavel},solicitacaoId:randomUUID(),conferido:true},systemUserId);
  }
  const r=await reservar("Ana Silva","+5571999999999");
  await sincronizarLembretesAulas(banco,"outro-chip"); assert.equal((await listarAgendamentos(banco)).length,0);
  await sincronizarLembretesAulas(banco,"ctluizroca"); await sincronizarLembretesAulas(banco,"ctluizroca");
  const jobs=await listarAgendamentos(banco); assert.equal(jobs.length,1); assert.equal(jobs[0].reservaAulaId,r.id);
  assert.equal(Date.parse(inicio)-Date.parse(jobs[0].agendadoPara),86400000);
  assert.match(jobs[0].mensagem,/Opa, Ana!/);assert.doesNotMatch(jobs[0].mensagem,/\[NOME\]/);
  await processarAgendamento(banco,async()=>config,async()=>{envios++;return "envio-prematuro";});assert.equal(envios,0);
  async function vencer(id:string) {
   await cliente.query("UPDATE atendeia_aulas_reservas SET inicio=now()+interval '1 day'-interval '1 minute' WHERE id=$1",[id]);
   await cliente.query("UPDATE atendeia_agendamentos SET agendado_para=(SELECT inicio-interval '1 day' FROM atendeia_aulas_reservas WHERE id=$1) WHERE reserva_aula_id=$1",[id]);
  }
  await vencer(r.id);
  await processarAgendamento(banco,async()=>config,async(_cfg,numero,texto)=>{envios++;assert.equal(numero,"5571999999999");assert.match(texto,/Tá confirmado/);return "lembrete-1";});
  await processarAgendamento(banco,async()=>config,async()=>{envios++;return "duplicado";});assert.equal(envios,1);
  assert.equal((await listarAgendamentos(banco))[0].status,"enviado");
  assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE provider_message_id='lembrete-1' AND sender_type='bot' AND is_deleted=false")).rows.length,1);
  const cancelada=await reservar("Aluno Cancelado","+5571888888888"); await sincronizarLembretesAulas(banco,"ctluizroca");
  const reserva=(await consultarAulas(banco)).reservas.find(x=>x.id===cancelada.id)!;
  await cancelarReservaAula(banco,{id:reserva.id,atualizadoEm:reserva.atualizadoEm},systemUserId);
  await sincronizarLembretesAulas(banco,"ctluizroca"); assert.equal((await listarAgendamentos(banco)).find(x=>x.reservaAulaId===cancelada.id)?.status,"cancelado");
  const manual=await reservar("Aluno Sem Lembrete","+5571777777777");await sincronizarLembretesAulas(banco,"ctluizroca");
  const item=(await listarAgendamentos(banco)).find(x=>x.reservaAulaId===manual.id)!;
  await cancelarAgendamento(banco,{id:item.id,version:item.version});await sincronizarLembretesAulas(banco,"ctluizroca");
  assert.equal((await listarAgendamentos(banco)).filter(x=>x.reservaAulaId===manual.id).length,1);
  assert.equal((await listarAgendamentos(banco)).find(x=>x.reservaAulaId===manual.id)?.status,"cancelado");
  const incerta=await reservar("Aluno Incerto","+5571666666666");await sincronizarLembretesAulas(banco,"ctluizroca");await vencer(incerta.id);
  await processarAgendamento(banco,async()=>config,async()=>{envios++;throw new Error("timeout");});
  await processarAgendamento(banco,async()=>config,async()=>{envios++;return "duplicado";});assert.equal(envios,2);
  assert.equal((await listarAgendamentos(banco)).find(x=>x.reservaAulaId===incerta.id)?.status,"incerto");
  const pausada=await reservar("Outra Aluna","+5571999999999"); await sincronizarLembretesAulas(banco,"ctluizroca");await vencer(pausada.id);
  await cliente.query("UPDATE atendeia_conversations SET human_takeover=true WHERE remote_jid=$1",["5571999999999@s.whatsapp.net"]);
  await processarAgendamento(banco,async()=>config,async()=>{envios++;return "nao-deveria";});assert.equal(envios,2);
  await cliente.query("UPDATE atendeia_conversations SET human_takeover=false WHERE remote_jid=$1",["5571999999999@s.whatsapp.net"]);
  let leituras=0;
  await processarAgendamento(banco,async()=>{leituras++;if(leituras===2) await cliente.query("UPDATE atendeia_aulas_reservas SET status='cancelada' WHERE id=$1",[pausada.id]);return config;},async()=>{envios++;return "cancelamento-ignorado";});
  assert.equal(envios,2,"cancelar entre reservar envio e chamar provedor impede mensagem");
  assert.equal((await listarAgendamentos(banco)).find(x=>x.reservaAulaId===pausada.id)?.status,"erro");
  const curta=new Date(Date.now()+2*3600000).toISOString();
  const aulaCurta=await criarAula(banco,{modalidade:"Taekwondo",turma:"Hoje",professor:"Professor",inicio:curta,duracao:60,capacidade:null,idadeMinima:3,idadeMaxima:120},systemUserId);
  const proxima=await reservarAula(banco,{aulaId:aulaCurta.id,inicio:curta,aluno:{nome:"Aluno Proximo",idade:25,telefone:"+5571444444444",responsavel:""},solicitacaoId:randomUUID(),conferido:true},systemUserId);
  await sincronizarLembretesAulas(banco,"ctluizroca");assert.ok(!(await listarAgendamentos(banco)).some(x=>x.reservaAulaId===proxima.id));
  const expirada=await reservar("Aluno Expirado","+5571555555555");await sincronizarLembretesAulas(banco,"ctluizroca");
  await cliente.query("UPDATE atendeia_aulas_reservas SET inicio=now()+interval '1 hour' WHERE id=$1",[expirada.id]);
  await processarAgendamento(banco,async()=>config,async()=>{envios++;return "atrasado";}); assert.equal(envios,2);
  assert.equal((await listarAgendamentos(banco)).find(x=>x.reservaAulaId===expirada.id)?.status,"cancelado");
 } finally {await cliente.close();}
});
