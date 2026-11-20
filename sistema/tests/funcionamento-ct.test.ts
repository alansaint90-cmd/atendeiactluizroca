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
    assert.match(funcionamentoNoDiaCt(aulas,"Qual horário de funcionamento?"),/primeira aula.*termina a última/);
    assert.equal(responderDuvidaCt("E quinta?","funcionamento")?.assunto,"funcionamento");
    assert.equal(responderDuvidaCt("Quero agendar quinta","funcionamento"),null);
    assert.equal(responderDuvidaCt("Qual o horário de atendimento humano no WhatsApp?")?.assunto,"horarioHumano");
    assert.equal(perguntaInformativaCt("Qual o horário de funcionamento?"),true);
    assert.equal(responderDuvidaCt("Sou mulher, tenho receio de treinar com homens, como funciona?")?.assunto,"feminina");
    assert.ok(montarInstrucoesDoAgente(chatbotExample).includes(REGRA_FUNCIONAMENTO_CT));
  } finally { Date.now = clock; }
});
