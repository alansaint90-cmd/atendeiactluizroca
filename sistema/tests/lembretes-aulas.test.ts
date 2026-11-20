import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {applyMigrations} from '../src/lib/db/migrate';
import {criarAula,reservarAula} from '../src/lib/aulas/repository';
import {sincronizarLembretesAulas,mensagemLembreteAula} from '../src/lib/aulas/lembretes';
import {padraoAulasCt} from '../src/lib/followups/aulas-ct';
import {listarAgendamentos} from '../src/lib/agendamentos/repository';
import {processarAgendamento} from '../src/lib/agendamentos/worker';
import {limparNomeParticipante} from '../src/lib/aulas/nome-participante';
import {formatarDiaHoraCt} from '../src/lib/aulas/calendario';
import {followupDaInstancia} from '../src/lib/evolution/instancias';
import {systemUserId} from '../src/lib/db/bootstrap';

test('nome, confirmação curta e campos do CT não afetam outros chips',()=>{
 assert.equal(limparNomeParticipante('Homem Benjamin Silva de Santana'),'Benjamin Silva de Santana');
 assert.equal(formatarDiaHoraCt('2026-11-19T08:00:00-03:00'),'quinta-feira, às 8h');
 const settings={EVOLUTION_INSTANCE_NAME:'ctluizroca',EVOLUTION_SECOND_INSTANCE_NAME:'outro'};
 const ct=followupDaInstancia(settings,'ctluizroca');assert.equal(ct.mode,'aulas');assert.deepEqual(ct.steps.map(s=>s.enabled),[true,true,false]);
 assert.equal(followupDaInstancia(settings,'outro').enabled,false);
});
test('follow-ups usam nome do lead e saudação no horário local',()=>{
 for(const [hora,saudacao] of [['08','Bom dia'],['15','Boa tarde'],['20','Boa noite']]) {
  assert.match(mensagemLembreteAula('Ana Silva','',null,'Muay Thai',`2026-11-20T${hora}:00:00-03:00`),new RegExp(`Opa, Ana! ${saudacao}!`));
 }
 assert.match(mensagemLembreteAula('Filho Silva','Ricardo Silva',8,'Taekwondo','2026-11-20T08:00:00-03:00'),/Opa, Ricardo!/);
 assert.match(mensagemLembreteAula('Ana Silva','',null,'Muay Thai','2026-11-20T08:00:00-03:00',2),/Como foi sua experiência.*Gostou/);
});
test('etapas únicas antes e após o término; cancelamento, pausa, configuração e incerteza impedem reenvio',async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),config=padraoAulasCt('ctluizroca');
 const settings={EVOLUTION_API_URL:'https://evolution.example.com',EVOLUTION_API_KEY:'teste',EVOLUTION_INSTANCE_NAME:'ctluizroca'};
 let envios=0;
 try {
  await applyMigrations(banco);
  const inicio=new Date(Date.now()+3*86400000).toISOString();
  const aula=await criarAula(banco,{modalidade:'Muay Thai',turma:'Geral',professor:'Professor',inicio,duracao:60,capacidade:null,idadeMinima:18,idadeMaxima:120},systemUserId);
  const reservar=async(telefone:string,nome='Ana Silva')=>reservarAula(banco,{aulaId:aula.id,inicio,aluno:{nome,telefone,idade:null,adultoSemIdade:true,responsavel:''},solicitacaoId:randomUUID(),conferido:true},systemUserId);
  const r=await reservar('+5571999999999');
  await sincronizarLembretesAulas(banco,'outro');assert.equal((await listarAgendamentos(banco)).length,0);
  await sincronizarLembretesAulas(banco,'ctluizroca');await sincronizarLembretesAulas(banco,'ctluizroca');
  const jobs=await listarAgendamentos(banco);assert.equal(jobs.length,2);
  const tempos=jobs.map(j=>Date.parse(j.agendadoPara)-Date.parse(inicio)).sort((a,b)=>a-b);
  assert.deepEqual(tempos,[-3600000,7200000],'depois = uma hora após o término de uma aula de 60min');
  const editada=structuredClone(config);editada.steps[0].text="Oi, {nome}! {saudacao}! Nos vemos hoje?";
  await sincronizarLembretesAulas(banco,"ctluizroca",editada);
  assert.equal((await listarAgendamentos(banco)).filter(j=>j.status==="pendente").length,2);
  assert.ok((await listarAgendamentos(banco)).some(j=>j.mensagem.startsWith("Oi, Ana!")));
  await sincronizarLembretesAulas(banco,"ctluizroca",config);
  const enviar=async()=>{envios++;return `teste-${envios}`;};
  await processarAgendamento(banco,async()=>settings,enviar);assert.equal(envios,0);
  async function vencer(reserva:string,etapa:number){
   const ini=new Date(Date.now()+(etapa===1?59:-121)*60000).toISOString();
   await cliente.query('UPDATE atendeia_aulas_reservas SET inicio=$1 WHERE id=$2',[ini,reserva]);
   const devido=new Date(Date.parse(ini)+(etapa===1?-3600000:7200000)).toISOString();
   const participante=(await cliente.query<{nome:string}>('SELECT nome FROM atendeia_aulas_reservas WHERE id=$1',[reserva])).rows[0].nome;
   const texto=mensagemLembreteAula(participante,'',null,'Muay Thai',devido,etapa);
   await cliente.query('UPDATE atendeia_agendamentos SET agendado_para=$1,mensagem=$2 WHERE reserva_aula_id=$3 AND etapa_aula=$4',[devido,texto,reserva,etapa]);
  }
  await vencer(r.id,1);await processarAgendamento(banco,async()=>settings,enviar);await processarAgendamento(banco,async()=>settings,enviar);assert.equal(envios,1);
  assert.equal((await cliente.query("SELECT id FROM atendeia_messages WHERE provider_message_id='teste-1' AND sender_type='bot'")).rows.length,1);
  const pos=await reservar('+5571888888888');await sincronizarLembretesAulas(banco,'ctluizroca');await vencer(pos.id,2);
  await processarAgendamento(banco,async()=>settings,enviar);assert.equal(envios,2);
  const cancelada=await reservar('+5571777777777');await sincronizarLembretesAulas(banco,'ctluizroca');await vencer(cancelada.id,1);
  let leituras=0;await processarAgendamento(banco,async()=>{if(++leituras===2)await cliente.query("UPDATE atendeia_aulas_reservas SET status='cancelada' WHERE id=$1",[cancelada.id]);return settings;},enviar);assert.equal(envios,2);
  const incerta=await reservar('+5571666666666');await sincronizarLembretesAulas(banco,'ctluizroca');await vencer(incerta.id,1);
  await processarAgendamento(banco,async()=>settings,async()=>{envios++;throw new Error('timeout');});await processarAgendamento(banco,async()=>settings,enviar);assert.equal(envios,3);
  assert.ok((await listarAgendamentos(banco)).some(j=>j.reservaAulaId===incerta.id && j.status==='incerto'));
  const pausa=await reservar('+5571999999999','Outra Aluna');await sincronizarLembretesAulas(banco,'ctluizroca');await vencer(pausa.id,1);
  await cliente.query("UPDATE atendeia_conversations SET human_takeover=true WHERE remote_jid='5571999999999@s.whatsapp.net'");
  await processarAgendamento(banco,async()=>settings,enviar);assert.equal(envios,3);
  const desligado={...config,enabled:false};await sincronizarLembretesAulas(banco,'ctluizroca',desligado);
  assert.equal((await listarAgendamentos(banco)).filter(j=>j.status==='pendente').length,0);
 }finally{await cliente.close();}
});
