import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/lib/db/migrate";
import { systemUserId } from "../src/lib/db/bootstrap";
import { criarAula, consultarAulas, reservarAula, cancelarReservaAula } from "../src/lib/aulas/repository";
import { alunoSchema, type AulaDados } from "../src/lib/aulas/schema";
import { novoEstadoLocal, lerEstadoLocal, reservarLocal } from "../src/lib/ct/local";
import { chatbotExample } from "../src/lib/chatbots/defaults";
import { montarInstrucoesDoAgente } from "../src/lib/chatbots/prompt-servidor";

const aula: AulaDados = { modalidade: "Modalidade de teste", turma: "Turma de teste", professor: "Professor de teste", inicio: new Date(Date.now() + 10 * 86400000).toISOString(), duracao: 60, capacidade: 1, idadeMinima: 6, idadeMaxima: 80 };
const aluno = { nome: "Aluno de Teste", idade: 20, telefone: "+5571999999999", responsavel: "" };

test("CT exige responsável de menor e mantém o prompt sem agenda médica", () => {
  assert.equal(alunoSchema.safeParse({ ...aluno, idade: 12 }).success, false);
  assert.equal(alunoSchema.safeParse({ ...aluno, idade: 12, responsavel: "Responsável de Teste" }).success, true);
  const instrucoes = montarInstrucoesDoAgente({ ...chatbotExample, agendaConsultas: true });
  assert.match(instrucoes, /CT Luiz Roca/);
  assert.doesNotMatch(instrucoes, /Juliana|Bonvida|SEMERGE|iniciar_agendamento_consulta/);
});

test("agenda local persiste, impede excesso de vagas e mantém idempotência", () => {
  const estado = novoEstadoLocal(chatbotExample);
  estado.aulas.push({ ...aula, id: randomUUID(), atualizadoEm: new Date().toISOString() });
  const pedido = { aulaId: estado.aulas[0].id, aluno, solicitacaoId: randomUUID() };
  const reservado = { ...estado, ...reservarLocal(estado, pedido) };
  assert.equal(lerEstadoLocal(JSON.stringify(reservado)).reservas.length, 1);
  assert.equal(reservarLocal(reservado, pedido).reservas.length, 1);
  assert.throws(() => reservarLocal(reservado, { ...pedido, solicitacaoId: randomUUID(), aluno: { ...aluno, nome: "Outro Aluno" } }), /lotada/);
  assert.throws(() => reservarLocal({ ...estado, aulas: [{ ...estado.aulas[0], inicio: new Date(0).toISOString() }] }, pedido), /já começou/);
  assert.throws(() => lerEstadoLocal('{"versao":99}'));
});

test("agenda PostgreSQL valida idade, capacidade, repetição, auditoria e cancelamento concorrente", async () => {
  const cliente = new PGlite(), banco = drizzle(cliente);
  try {
    await applyMigrations(banco);
    await assert.rejects(criarAula(banco, { ...aula, inicio: new Date(0).toISOString() }, systemUserId), /futura/);
    const criada = await criarAula(banco, aula, systemUserId);
    const pedido = { aulaId: criada.id, aluno, solicitacaoId: randomUUID(), conferido: true };
    await assert.rejects(reservarAula(banco, { ...pedido, aluno: { ...aluno, idade: 90 } }, systemUserId), /faixa etária/);
    await assert.rejects(reservarAula(banco, { ...pedido, conferido: false }, systemUserId));
    const primeira = await reservarAula(banco, pedido, systemUserId);
    assert.equal((await reservarAula(banco, pedido, systemUserId)).id, primeira.id);
    await assert.rejects(reservarAula(banco, { ...pedido, aluno: { ...aluno, nome: "Outra Pessoa" } }, systemUserId), /já utilizada/);
    await assert.rejects(reservarAula(banco, { ...pedido, solicitacaoId: randomUUID(), aluno: { ...aluno, nome: "Outro Aluno" } }, systemUserId), /lotada/);
    let agenda = await consultarAulas(banco);
    assert.equal(agenda.aulas.length, 1); assert.equal(agenda.reservas.length, 1);
    const r = agenda.reservas[0];
    await assert.rejects(cancelarReservaAula(banco, { id: r.id, atualizadoEm: new Date(0).toISOString() }, systemUserId), /alterada/);
    await cancelarReservaAula(banco, { id: r.id, atualizadoEm: r.atualizadoEm }, systemUserId);
    await assert.rejects(cancelarReservaAula(banco, { id: r.id, atualizadoEm: r.atualizadoEm }, systemUserId), /alterada/);
    const disputas = await Promise.allSettled(["Aluno Um", "Aluno Dois"].map(nome => reservarAula(banco, { ...pedido, solicitacaoId: randomUUID(), aluno: { ...aluno, nome } }, systemUserId)));
    assert.equal(disputas.filter(r => r.status === "fulfilled").length, 1);
    agenda = await consultarAulas(banco);
    assert.equal(agenda.reservas.filter(r => r.status === "confirmada").length, 1);
    assert.equal(agenda.reservas.filter(r => r.status === "cancelada").length, 1);
    const logs = await cliente.query<{ action: string; changed_fields: unknown }>("SELECT action,changed_fields FROM atendeia_audit_logs WHERE entity_type='aula' ORDER BY created_at");
    assert.equal(logs.rows.length, 4);
    assert.ok(logs.rows.every(l => JSON.stringify(l.changed_fields) === "[]"));
  } finally { await cliente.close(); }
});
