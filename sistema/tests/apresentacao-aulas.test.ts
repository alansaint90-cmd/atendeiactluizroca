import test from "node:test";
import assert from "node:assert/strict";
import {aberturaHorarios,semHorarios} from "../src/lib/aulas/apresentacao";
test("disponibilidade responde à pergunta e ao turno sem afirmar vaga ausente",()=>{
 assert.equal(aberturaHorarios("Tem pela manhã?",2,"manha",false),"Temos sim! Pela manhã:");
 assert.equal(aberturaHorarios("Tem de tarde?",1,"tarde",false),"Temos sim! À tarde:");
 assert.equal(aberturaHorarios("Tem à noite?",2,"noite",false),"Temos sim! À noite:");
 assert.equal(aberturaHorarios("Tem pela manhã?",0,"manha",false),"");
 assert.equal(aberturaHorarios("Outra opção",1,"noite",true),"Claro! Também temos este horário:");
 assert.equal(aberturaHorarios("Prefiro de manhã",2,"manha",false),"Pela manhã, você pode vir nestes horários:");
});

test("ausência informa modalidade e período, distinguindo opções já vistas",()=>{
 assert.equal(semHorarios("Jiu-Jitsu","manha",null,false),"Poxa, infelizmente ainda não temos turma de Jiu-Jitsu disponível pela manhã. Você teria interesse em outro horário?");
 assert.match(semHorarios("Muay Thai","noite",null,false),/Muay Thai disponível à noite/);
 assert.match(semHorarios("Taekwondo","tarde","sexta-feira, 20/11/2026",false),/à tarde na sexta-feira, 20\/11\/2026/);
 const esgotadas=semHorarios("Muay Thai","manha",null,true);assert.match(esgotadas,/esses são os horários de Muay Thai/);assert.doesNotMatch(esgotadas,/não temos turma/);
});
