import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {sql} from "drizzle-orm";
import type Redis from "ioredis";
import {applyMigrations} from "../src/lib/db/migrate";
import {systemUserId} from "../src/lib/db/bootstrap";
import {agendaAulasDoAgente} from "../src/lib/aulas/agente";
import {consultarAulas,reservarAula,cancelarReservaAula} from "../src/lib/aulas/repository";
import {ocorrenciasAula} from "../src/lib/aulas/recorrencia";
import {elegivelParaExperimental} from "../src/lib/aulas/schema";
import {responderDuvidaCt} from "../src/lib/ct/duvidas";
import {CONHECIMENTO_CT} from "../src/lib/ct/conhecimento";
import {chatbotExample} from "../src/lib/chatbots/defaults";
import {montarInstrucoesDoAgente} from "../src/lib/chatbots/prompt-servidor";
import {generateReply} from "../src/lib/agent/providers";
import {processMessage,type DeliveryState,type ProcessingPort} from "../src/lib/agent/processor";
import type {AgentConfig} from "../src/lib/agent/config";

const perguntas:[string,RegExp][]=[
 ["Tem aula feminina?",/mistas.*respeito/],
 ["Pode começar em uma aula sem ter praticado nenhuma luta?",/Iniciantes.*regulares/],
 ["Vocês trabalham com preparação para competição?",/Taekwondo.*Muay Thai.*Jiu-Jitsu/],
 ["Tem muitos alunos por turma?",/10 e 30/],
 ["Quanto custa a mensalidade? Ou a questão do pagamento?",/199|cartão/],
 ["Existe taxa de matrícula?",/Não cobramos/],
 ["Tem desconto para pagamento antecipado?",/incluído.*presencialmente/],
 ["Com esse valor eu posso fazer aulas todos os dias?",/turma.*mesma modalidade/],
 ["O valor muda por modalidade que eu queira fazer?",/uma modalidade/],
 ["A aula experimental é gratuita?",/gratuita.*única experimental/],
 ["Precisa comprar algum equipamento antes de ir para a aula?",/roupa leve.*água.*kimono.*empréstimo/s],
 ["Quais documentos são necessários para a matrícula?",/RG.*ficha.*autorização/],
 ["Tem idade mínima para o Muay Thai?",/14 anos.*10 a 13.*equipe/],
 ["Eu tenho 15 anos, nunca lutei, posso começar no CT?",/Pode começar.*regulares/s],
 ["Tenho 40 anos, ainda posso aprender Muay Thai?",/Pode começar.*adapta/s],
 ["Sou mulher, tenho receio de treinar com homens, como funciona?",/mistas.*respeito/],
 ["Tenho pouca resistência física, consegue adaptar algo na aula?",/adaptada.*professor avalia/],
 ["Eu achei caro a mensalidade, tem alguma opção diferente?",/acompanhamento.*professores.*presencialmente/],
 ["A partir de quantos anos pode começar o jiu-jítsu?",/10 anos/],
 ["Se eu faltar as aulas da semana, posso repor outro dia?",/sem prazo.*mesma modalidade/],
 ["Posso cancelar a matrícula quando quiser?",/30 dias/],
 ["Quem é o professor responsável pelo CT?",/Luís Roca/],
 ["E o professor de Muay Thai?",/André Prado.*ZMT/],
 ["E de jiu-jítsu?",/André Prado/],
 ["Quantos minutos antes devo chegar?",/10 minutos/],
 ["Os pais podem acompanhar a aula infantil?",/não precisam permanecer.*uma hora/s],
 ["Como remarcar ou cancelar uma aula experimental?",/solicitar pelo WhatsApp/],
 ["Qual o horário de atendimento humano no WhatsApp?",/Não temos horário fixo/],
];
const config:AgentConfig={AI_ENABLED:"true",AI_SYSTEM_PROMPT:"Atenda o CT Luís Roca.",OPENAI_API_KEY:"sk-test-only",OPENAI_MODEL:"modelo",EVOLUTION_API_URL:"https://example.invalid",EVOLUTION_API_KEY:"teste",EVOLUTION_INSTANCE_NAME:"teste",REDIS_URL:"redis://localhost:6379",agendaAulas:true};

test("perguntas da Giovanna usam a base confirmada e não desviam para a agenda antiga",async()=>{
 const clock=Date.now;Date.now=()=>Date.parse("2026-11-19T22:44:00-03:00");
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);
  const atender=agendaAulasDoAgente(banco,redis,"lease","faq","5571000000001",async()=>true);
  await atender("Para mim");await atender("Muay Thai nesta quinta-feira");
  const contextoAntes=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:faq")!);
  assert.match((await atender("Qual horário de funcionamento hoje?"))!,/06:00.*22:15/);
  const contextoDepois=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:faq")!);
  assert.deepEqual(contextoDepois.consulta,contextoAntes.consulta,"abertura do espaço não altera filtros da reserva");
  assert.match((await atender("E amanhã?"))!,/não há aulas cadastradas/);
  for(const [pergunta,esperado] of perguntas){
   const resposta=await atender(pergunta);
   assert.match(resposta!,esperado,pergunta);
   assert.doesNotMatch(resposta!,/infelizmente|1\. Muay|1\. Jiu|19\/11\/2026|20\/11\/2026/,pergunta);
   if(pergunta.startsWith("Eu tenho 15 anos")){await atender("Para mim");const menor=JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:faq")!);assert.equal(menor.consulta.idade,15,"para mim não apaga a idade real já informada");assert.equal(menor.adultoSemIdade,false);}
  }
  assert.equal((await consultarAulas(banco)).reservas.length,0);
  assert.equal(JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:faq")!).consulta.idade,40,"idade pessoal informada em uma dúvida continua lembrada");
  await assert.rejects(atender("Não tenho 40 anos, posso aprender Muay Thai?"),/contexto_idade_contraditorio/);
  const amanha=await atender("Quero fazer uma experimental amanhã");
  if(amanha)assert.doesNotMatch(amanha,/1\. .*20\/11\/2026/);
  let state:DeliveryState|null=null,enviados=0;
  const port:ProcessingPort={read:async()=>state,write:async s=>{state=s;},history:async()=>[],complete:async s=>{state=s;},enabled:async()=>true,aulaExperimental:atender,generate:async()=>{throw new Error("Não chamar o modelo para FAQ conhecida");},send:async(_c,_n,t)=>{assert.match(t,/gratuita|experimental/);enviados++;return randomUUID();}};
  assert.equal(await processMessage({identity:"faq-gratuita",conversation:"faq",number:"5571000000001",text:"A aula experimental é gratuita?",timestamp:Date.now()/1000},config,port),"enviada");
  assert.ok(enviados>0);
  assert.ok(montarInstrucoesDoAgente(chatbotExample).includes(CONHECIMENTO_CT));
  assert.match(chatbotExample.context,/CT_POLITICAS_20261119/);
 }finally{Date.now=clock;await cliente.close();}
});

test("FAQ desconhecida não recebe ferramenta de agenda; perguntas reais de horário continuam usando a ferramenta",async()=>{
 await generateReply(config,[],"Tem chuveiro no CT?",async(_u,init)=>{
  const body=JSON.parse(String(init?.body));assert.ok(!body.tools?.some((t:{name:string})=>t.name==="consultar_aulas_experimentais"));
  return new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Essa informação precisa ser confirmada com a equipe."}]}]}));
 });
 assert.equal(responderDuvidaCt("Tem Muay Thai às 18h?"),null);
 assert.equal(responderDuvidaCt("Quero agendar Jiu-Jitsu amanhã"),null);
 await assert.rejects(generateReply(config,[],"Quais documentos?",async()=>new Response(JSON.stringify({status:"completed",output:[{type:"function_call",name:"consultar_aulas_experimentais",arguments:"{}"}]}))),/openai_acao_invalida/);
});

test("políticas novas: Muay regular desde 14, menor depende da equipe, experimental única por cadastro conhecido",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);const agenda=await consultarAulas(banco),muay=agenda.aulas.find(a=>a.modalidade==="Muay Thai")!,jiu=agenda.aulas.find(a=>a.modalidade==="Jiu-Jitsu")!;
  assert.equal(muay.idadeMinima,14);assert.match(muay.professor,/André Prado/);assert.match(jiu.professor,/André Prado/);
  for(const idade of [14,15,40,60])assert.equal(elegivelParaExperimental(muay,idade),true);
  for(const idade of [10,12,13])assert.equal(elegivelParaExperimental(muay,idade),false);
  const atender=agendaAulasDoAgente(banco,redis,"lease","menor","5571000000002",async()=>true);
  await assert.rejects(atender("Quero agendar Muay Thai para meu filho de 12 anos"),/muay_adaptado/);
  const aluno={nome:"Aluno Exemplo",idade:15,telefone:"+5571000000003",responsavel:"Responsavel Exemplo"};
  const pedido={aulaId:muay.id,inicio:ocorrenciasAula(muay)[0],aluno,solicitacaoId:randomUUID(),conferido:true};
  const r=await reservarAula(banco,pedido,systemUserId);assert.equal((await reservarAula(banco,pedido,systemUserId)).id,r.id);
  await assert.rejects(reservarAula(banco,{...pedido,aulaId:jiu.id,inicio:ocorrenciasAula(jiu)[0],aluno:{...aluno,nome:"ÁLUNO  EXEMPLO"},solicitacaoId:randomUUID()},systemUserId),/única aula experimental/);
  await reservarAula(banco,{...pedido,aluno:{...aluno,nome:"Outro Participante"},solicitacaoId:randomUUID()},systemUserId);
  const reserva=(await consultarAulas(banco)).reservas.find(a=>a.id===r.id)!;
  await cancelarReservaAula(banco,{id:r.id,atualizadoEm:reserva.atualizadoEm},systemUserId);
  await reservarAula(banco,{...pedido,inicio:ocorrenciasAula(muay)[1],solicitacaoId:randomUUID()},systemUserId);
  const reservas=(await consultarAulas(banco)).reservas;assert.equal(reservas.length,3);assert.equal(reservas.filter(a=>a.status==="cancelada").length,1);
 }finally{await cliente.close();}
});

test("migração da base preserva personalizações, demais chatbots e a grade; execução é idempotente e auditada",async()=>{
 const cliente=new PGlite(),banco=drizzle(cliente);
 try{
  await applyMigrations(banco);
  const ct=randomUUID(),outro=randomUUID();
  for(const [id,identifier,context] of [[ct,"CT Luís Roca","Texto personalizado do gestor"],[outro,"Outro negócio","Outro contexto"]])await cliente.query("INSERT INTO atendeia_chatbots(id,identifier,configuration,enabled,modified_by) VALUES($1,$2,$3::jsonb,false,$4)",[id,identifier,JSON.stringify({...chatbotExample,identifier,context,transferHuman:false}),systemUserId]);
  const gradeAntes=(await consultarAulas(banco)).aulas.map(a=>({id:a.id,inicio:a.inicio,capacidade:a.capacidade,duracao:a.duracao,diaSemana:a.diaSemana}));
  const migration=await readFile("src/lib/db/migrations/0023_politicas_ct_confirmadas.sql","utf8");
  const aplicar=()=>banco.transaction(async tx=>{for(const s of migration.split("--> statement-breakpoint").filter(s=>s.trim()))await tx.execute(sql.raw(s));});
  await aplicar();const primeira=await cliente.query<{configuration:typeof chatbotExample;version:number}>("SELECT configuration,version FROM atendeia_chatbots WHERE id=$1",[ct]);
  assert.match(primeira.rows[0].configuration.context,/Texto personalizado do gestor/);assert.ok(primeira.rows[0].configuration.context.includes(CONHECIMENTO_CT));assert.equal(primeira.rows[0].configuration.transferHuman,true);
  await aplicar();const segunda=await cliente.query<{configuration:typeof chatbotExample;version:number;enabled:boolean}>("SELECT configuration,version,enabled FROM atendeia_chatbots WHERE id=$1",[ct]);assert.equal(segunda.rows[0].version,primeira.rows[0].version);assert.equal(segunda.rows[0].enabled,false);
  const other=(await cliente.query<{configuration:typeof chatbotExample}>("SELECT configuration FROM atendeia_chatbots WHERE id=$1",[outro])).rows[0];assert.equal(other.configuration.context,"Outro contexto");assert.equal(other.configuration.transferHuman,false);
  assert.deepEqual((await consultarAulas(banco)).aulas.map(a=>({id:a.id,inicio:a.inicio,capacidade:a.capacidade,duracao:a.duracao,diaSemana:a.diaSemana})),gradeAntes);
  assert.equal((await cliente.query("SELECT id FROM atendeia_audit_logs WHERE entity_id=$1 AND action='politicas_ct_base_atualizada'",[ct])).rows.length,1);
  await applyMigrations(banco);
 }finally{await cliente.close();}
});

test("pedido efetivo de alteração encaminha humano; pergunta sobre política só informa",async()=>{
 let state:DeliveryState|null=null,transferencias=0;const msgs:string[]=[];
 const port:ProcessingPort={read:async()=>state,write:async s=>{state=s;},history:async()=>[],complete:async s=>{state=s;},enabled:async()=>true,aulaExperimental:async()=>{throw new Error("Não consultar agenda nesse pedido");},generate:async()=>{throw new Error("Não depender de texto livre");},transferir:async()=>{transferencias++;},send:async(_c,_n,t)=>{msgs.push(t);return "aviso";}};
 const cfg={...config,atendimento:{transferHuman:true,transferMedia:false,destination:"Atendimento humano",transferNotice:"Vou chamar a equipe para ajudar com sua reserva."}};
 assert.equal(await processMessage({identity:"alterar",conversation:"aluno",number:"5571000000001",text:"Quero remarcar minha experimental",timestamp:Date.now()/1000},cfg,port),"enviada");assert.equal(transferencias,1);assert.doesNotMatch(msgs.join(" "),/remarcada|cancelada/);
 assert.match(responderDuvidaCt("Posso cancelar a matrícula quando quiser?")!.resposta,/30 dias/);
});

test("19/11 às 22h44: amanhã é sexta sem turma; sugere segunda real e só muda após aceite",async()=>{
 const clock=Date.now;Date.now=()=>Date.parse("2026-11-19T22:44:00-03:00");
 const cliente=new PGlite(),banco=drizzle(cliente),cache=new Map<string,string>();
 const redis={get:async(k:string)=>cache.get(k)??null,eval:async(_s:string,_n:number,_l:string,k:string,_t:string,v:string)=>{cache.set(k,v);return 1;}} as unknown as Redis;
 try{
  await applyMigrations(banco);const atender=agendaAulasDoAgente(banco,redis,"lease","proxima","5571000000040",async()=>true);
  await atender("Para mim");const r=await atender("Muay Thai amanhã de noite");
  assert.match(r!,/sexta-feira, 20\/11\/2026.*próximas aulas.*segunda-feira, 23\/11\/2026/s);
  const estado=()=>JSON.parse(cache.get("atendeia:{evolution}:cadastro-aula:proxima")!);
  assert.equal(estado().dataSolicitada,"2026-11-20");assert.equal(estado().dataAlternativa,"2026-11-23");
  assert.match((await atender("Aluno Teste",{acao:"preparar",opcao:1,nome:"Aluno Teste",idade:null,adultoSemIdade:true,responsavel:""}))!,/não é/);
  await atender("A experimental é gratuita?");await atender("sim");assert.equal(estado().dataSolicitada,"2026-11-20","sim após uma dúvida não aceita silenciosamente uma data antiga");
  await atender("1");assert.equal(estado().dataSolicitada,"2026-11-23");assert.equal(estado().dataAlternativa,undefined);
  assert.equal((await consultarAulas(banco)).reservas.length,0);
 }finally{Date.now=clock;await cliente.close();}
});

test("continuação de professor exige referência; modalidade isolada continua sendo uma escolha nova",()=>{
 assert.equal(responderDuvidaCt("Jiu-Jitsu","professores"),null);
 assert.match(responderDuvidaCt("E de jiu-jítsu?","professores")!.resposta,/André Prado/);
 assert.equal(responderDuvidaCt("Quero Muay Thai","professores"),null);
});
