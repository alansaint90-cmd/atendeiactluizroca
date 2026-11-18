import test from "node:test";
import assert from "node:assert/strict";
import {aberturaHorarios} from "../src/lib/aulas/apresentacao";
test("disponibilidade responde à pergunta e ao turno sem afirmar vaga ausente",()=>{
 assert.equal(aberturaHorarios("Tem pela manhã?",2,"manha",false),"Temos sim! Pela manhã:");
 assert.equal(aberturaHorarios("Tem de tarde?",1,"tarde",false),"Temos sim! À tarde:");
 assert.equal(aberturaHorarios("Tem à noite?",2,"noite",false),"Temos sim! À noite:");
 assert.equal(aberturaHorarios("Tem pela manhã?",0,"manha",false),"");
 assert.equal(aberturaHorarios("Outra opção",1,"noite",true),"Claro! Também temos este horário:");
 assert.equal(aberturaHorarios("Prefiro de manhã",2,"manha",false),"Pela manhã, você pode vir nestes horários:");
});
