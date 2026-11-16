import test from "node:test";
import assert from "node:assert/strict";
import {interpretarTurno,correspondeTurno} from "../src/lib/aulas/turno";
test("intenção de turno distingue saudação e amanhã",()=>{
  assert.equal(interpretarTurno("Quero sim, de noite"),"noite");
  assert.equal(interpretarTurno("amanhã à tarde"),"tarde");
  assert.equal(interpretarTurno("amanhã"),undefined);
  assert.equal(interpretarTurno("pela manhã"),"manha");
  assert.equal(interpretarTurno("noturno"),"noite");
  assert.equal(interpretarTurno("Boa noite!"),undefined);
  assert.equal(interpretarTurno("de manhã ou de noite"),"ambiguo");
  assert.equal(interpretarTurno("qualquer turno"),null);
});
test("limites de turno usam o início da aula no fuso do CT",()=>{
  assert.equal(correspondeTurno("2026-11-17T11:59:00-03:00","manha"),true);
  assert.equal(correspondeTurno("2026-11-17T12:00:00-03:00","manha"),false);
  assert.equal(correspondeTurno("2026-11-17T17:59:00-03:00","tarde"),true);
  assert.equal(correspondeTurno("2026-11-17T18:00:00-03:00","tarde"),false);
  assert.equal(correspondeTurno("2026-11-18T00:15:00Z","noite"),true);
  assert.equal(correspondeTurno("2026-11-17T16:00:00-03:00","noite"),false);
});
