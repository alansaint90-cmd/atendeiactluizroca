import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type Redis from "ioredis";
import { applyMigrations } from "../src/lib/db/migrate";
import { agendaAulasDoAgente, reservasDoContato } from "../src/lib/aulas/agente";
import { consultarAulas, reservarAula } from "../src/lib/aulas/repository";
import { ocorrenciasAula } from "../src/lib/aulas/recorrencia";
import { systemUserId } from "../src/lib/db/bootstrap";
import { dividirResposta } from "../src/lib/agent/blocos";
import { contextoDoContato } from "../src/lib/operacao/memoria";

function redisCadastro() {
  const dados = new Map<string,string>();
  return { get: async (chave: string) => dados.get(chave) ?? null,
    eval: async (_script: string, _n: number, _lock: string, chave: string, _token: string, valor: string) => { dados.set(chave,valor); return 1; } } as unknown as Redis;
}
test("resposta longa é separada em blocos pequenos sem perder frases", () => {
  const texto = Array.from({length: 30},(_,i) => `Orientação ${i+1}: confirme os dados da sua aula.`).join(" ");
  const blocos = dividirResposta(texto);
  assert.ok(blocos.length > 1); assert.ok(blocos.every(b => b.length <=450));
  assert.equal(blocos.join(" "), texto);
});
test("grade semanal, reserva real, confirmação e memória do agendamento", async () => {
  const cliente = new PGlite(), banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    const agenda = await consultarAulas(banco);
    assert.equal(agenda.aulas.length,36);
    assert.ok(agenda.aulas.every(a => a.duracao===60 && a.capacidade===null && a.diaSemana!==null));
    assert.ok(agenda.aulas.filter(a => a.diaSemana===6).every(a => a.modalidade==="Taekwondo"));
    const gradeAntes=JSON.stringify(agenda.aulas);
    const conversar = agendaAulasDoAgente(banco,redisCadastro(),"lease","conversa-a","5571999999999",async()=>true);
    const lista = await conversar("Quero Muay Thai",{acao:"consultar",modalidade:"Muay Thai",idade:25});
    assert.match(lista!, /1\. Muay Thai/);
    const conferencia = await conversar("Meu nome é Aluno de Teste, tenho 25 anos",{acao:"preparar",opcao:1,nome:"Aluno de Teste",idade:25,responsavel:""});
    assert.match(conferencia!, /Responda “confirmo”/);
    assert.equal((await consultarAulas(banco)).reservas.length,0);
    await conversar("Qual roupa devo levar?");
    assert.equal((await consultarAulas(banco)).reservas.length,0,"pergunta não autoriza reserva");
    const recusado=agendaAulasDoAgente(banco,redisCadastro(),"lease","conversa-recusada","5571777777777",async()=>true);
    await recusado("Muay",{acao:"consultar",modalidade:"muay",idade:25});
    await recusado("Outro Aluno",{acao:"preparar",opcao:1,nome:"Outro Aluno",idade:25,responsavel:""});
    assert.match((await recusado("não obrigado"))!,/Conferência cancelada/);
    assert.equal(await recusado("confirmo"),null);
    assert.equal((await consultarAulas(banco)).reservas.length,0);
    const confirmacao = await conversar("confirmo");
    assert.match(confirmacao!, /agendada no sistema/);
    assert.equal((await consultarAulas(banco)).reservas.length,1);
    await conversar("confirmo");
    assert.equal((await consultarAulas(banco)).reservas.length,1,"confirmação repetida não duplica");
    const retomada = await conversar("oi"); assert.match(retomada!, /dúvida sobre seu agendamento/);
    assert.equal((await reservasDoContato(banco,"5571888888888")).length,0,"outro telefone não vê a reserva");
    assert.match(await contextoDoContato(banco,"ctluizroca","5571999999999"),/RESERVAS CONFIRMADAS NO BANCO/);
    const aula = agenda.aulas.find(a => a.modalidade==="Taekwondo" && a.diaSemana===6)!;
    const datas=ocorrenciasAula(aula); assert.ok(datas.length>=2);
    const aluno={nome:"Outro Aluno",idade:25,telefone:"+5571888888888",responsavel:""};
    for(const inicio of datas.slice(0,2)) await reservarAula(banco,{aulaId:aula.id,inicio,aluno,solicitacaoId:randomUUID(),conferido:true},systemUserId);
    await assert.rejects(reservarAula(banco,{aulaId:aula.id,inicio:new Date(Date.parse(datas[0])+86400000).toISOString(),aluno,solicitacaoId:randomUUID(),conferido:true},systemUserId), /não correspondem/);
    assert.equal(JSON.stringify((await consultarAulas(banco)).aulas),gradeAntes,"a oferta não altera o cadastro das aulas");
    const jiu=agenda.aulas.find(a=>a.modalidade==="Jiu-Jitsu")!, dataJiu=ocorrenciasAula(jiu)[0];
    const alunoJiu={nome:"Aluno Antigo",idade:25,telefone:"+5571666666666",responsavel:""};
    await reservarAula(banco,{aulaId:jiu.id,inicio:dataJiu,aluno:alunoJiu,solicitacaoId:randomUUID(),conferido:true},systemUserId);
    const antigo=agendaAulasDoAgente(banco,redisCadastro(),"lease","antigo","5571666666666",async()=>true);
    assert.match((await antigo("oi"))!,/Jiu-Jitsu/);
    assert.match((await antigo("Tem jiu?",{acao:"consultar",modalidade:"Jiu-Jitsu",idade:25}))!,/oferecemos experimentais de Taekwondo/);
    const pendente={opcoes:[{aulaId:jiu.id,inicio:dataJiu,modalidade:jiu.modalidade,turma:jiu.turma}],reserva:{aulaId:jiu.id,inicio:dataJiu,aluno:{...alunoJiu,nome:"Outro Interessado",telefone:"+5571555555555"},solicitacaoId:randomUUID(),conferido:true}};
    const redisAntigo={get:async()=>JSON.stringify(pendente),eval:async()=>1} as unknown as Redis;
    const confirmarAntigo=agendaAulasDoAgente(banco,redisAntigo,"lease","pendente","5571555555555",async()=>true);
    assert.match((await confirmarAntigo("confirmo"))!,/saiu da oferta/);
    assert.equal((await reservasDoContato(banco,"5571555555555")).length,0);
    assert.equal((await reservasDoContato(banco,"5571666666666")).length,1,"preserva a reserva antiga de Jiu-Jitsu");
    const menor=agendaAulasDoAgente(banco,redisCadastro(),"lease","conversa-b","5571888888888",async()=>true);
    await menor("Taekwondo para 3 anos",{acao:"consultar",modalidade:"Taekwondo",idade:3});
    assert.match((await menor("Taekwondo para 3 anos",{acao:"consultar",modalidade:"Taekwondo",idade:3}))!, /Nenhuma reserva foi feita|nenhuma reserva foi feita/);
  } finally { await cliente.close(); }
});

test("oferta permite Taekwondo e somente os dias e horários de Muay Thai solicitados", async()=>{
  const {permiteExperimental}=await import("../src/lib/aulas/oferta-experimental");
  const base={inicio:"2026-11-16T18:15:00-03:00",diaSemana:1,modalidade:"Muay Thai"};
  assert.equal(permiteExperimental(base),false);
  for(const dia of [1,3]) for(const hora of ["15:45","21:15"]) assert.equal(permiteExperimental({...base,diaSemana:dia,inicio:`2026-11-16T${hora}:00-03:00`}),true);
  for(const dia of [2,4]) for(const hora of ["06:00","08:00","09:00","20:15"]) assert.equal(permiteExperimental({...base,diaSemana:dia,inicio:`2026-11-16T${hora}:00-03:00`}),true);
  assert.equal(permiteExperimental({...base,diaSemana:6}),false);
  assert.equal(permiteExperimental({...base,modalidade:"Jiu-Jitsu"}),false);
  assert.equal(permiteExperimental({...base,modalidade:"Taekwondo",diaSemana:6}),true);
});
