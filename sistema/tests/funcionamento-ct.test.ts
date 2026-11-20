import test from "node:test";
import assert from "node:assert/strict";
import { funcionamentoNoDiaCt, REGRA_FUNCIONAMENTO_CT } from "../src/lib/ct/funcionamento";
import { responderDuvidaCt, perguntaInformativaCt } from "../src/lib/ct/duvidas";
import type { Aula } from "../src/lib/aulas/schema";
import { montarInstrucoesDoAgente } from "../src/lib/chatbots/prompt-servidor";
import { chatbotExample } from "../src/lib/chatbots/defaults";

test("funcionamento usa primeira aula e término mais tardio, incluindo aulas pontuais", () => {
  const aulas: Aula[] = [
    { id:"primeira", modalidade:"Taekwondo", turma:"Kids", professor:"Teste", inicio:"2026-11-19T08:00:00-03:00", diaSemana:4, duracao:60, capacidade:1, idadeMinima:4, idadeMaxima:12, atualizadoEm:"2026-11-19T00:00:00Z" },
    { id:"ultima", modalidade:"Muay Thai", turma:"Geral", professor:"Teste", inicio:"2026-11-19T21:15:00-03:00", diaSemana:4, duracao:60, capacidade:null, idadeMinima:14, idadeMaxima:120, atualizadoEm:"2026-11-19T00:00:00Z" },
    { id:"longa", modalidade:"Jiu-Jitsu", turma:"Geral", professor:"Teste", inicio:"2026-11-19T20:30:00-03:00", diaSemana:null, duracao:120, capacidade:null, idadeMinima:10, idadeMaxima:120, atualizadoEm:"2026-11-19T00:00:00Z" },
  ];
  const clock = Date.now; Date.now = () => Date.parse("2026-11-19T22:44:00-03:00");
  try {
    assert.match(funcionamentoNoDiaCt(aulas,"Que horas o CT abre hoje?"),/08:00.*22:30/);
    assert.match(funcionamentoNoDiaCt(aulas,"E na próxima quinta?"),/08:00.*22:15/);
    assert.match(funcionamentoNoDiaCt(aulas,"Abre amanhã?"),/não há aulas cadastradas/);
    const semana=funcionamentoNoDiaCt(aulas,"Qual horário de funcionamento?");
    assert.match(semana,/primeira aula.*termina a última/);
    assert.match(semana,/Quinta: das 08:00 às 22:30/);
    assert.doesNotMatch(semana,/Qual dia/);
    assert.equal(responderDuvidaCt("E quinta?","funcionamento")?.assunto,"funcionamento");
    assert.equal(responderDuvidaCt("Quero agendar quinta","funcionamento"),null);
    assert.equal(responderDuvidaCt("Qual o horário de atendimento humano no WhatsApp?")?.assunto,"horarioHumano");
    assert.equal(perguntaInformativaCt("Qual o horário de funcionamento?"),true);
    assert.equal(responderDuvidaCt("Sou mulher, tenho receio de treinar com homens, como funciona?")?.assunto,"feminina");
    assert.ok(montarInstrucoesDoAgente(chatbotExample).includes(REGRA_FUNCIONAMENTO_CT));
  } finally { Date.now = clock; }
});

test("resumo semanal acompanha mudanças da grade e não transforma aulas pontuais passadas em semanais", () => {
  const clock=Date.now; Date.now=()=>Date.parse("2026-11-20T00:30:00-03:00");
  const aula: Aula={id:"pontual",modalidade:"Taekwondo",turma:"Geral",professor:"Teste",inicio:"2026-11-19T08:00:00-03:00",diaSemana:null,duracao:60,capacidade:null,idadeMinima:13,idadeMaxima:120,atualizadoEm:"2026-11-19T00:00:00Z"};
  try {
    assert.doesNotMatch(funcionamentoNoDiaCt([aula],"Que horas abre?"),/das 08:00/);
    const semanal={...aula,diaSemana:4};
    assert.match(funcionamentoNoDiaCt([semanal],"Qual horário de funcionamento?"),/Quinta: das 08:00 às 09:00/);
    assert.match(funcionamentoNoDiaCt([{...semanal,inicio:"2026-11-19T23:30:00-03:00",duracao:120}],"Qual horário de funcionamento?"),/23:30 às 01:30 do dia seguinte/);
  } finally {Date.now=clock;}
});
