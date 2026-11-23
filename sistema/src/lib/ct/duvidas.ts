import { dataLocalCt } from "../aulas/calendario";
import { perguntaFuncionamentoCt, continuacaoFuncionamentoCt, RESPOSTA_FUNCIONAMENTO_CT } from "./funcionamento";
import {modalidadeMencionada} from "../aulas/objetivo";
import {respostasCt,type AssuntoCt} from "./politicas";
import { perguntaMuayInfantil, respostaMuayInfantil } from "./muay-infantil";
import { equipamentosDaModalidade } from "./equipamentos";

/** Dúvida informativa é respondida antes de qualquer consulta ou mutação da agenda. */
export function responderDuvidaCt(texto:string,anterior?:AssuntoCt,modalidadeContexto?:string|null):{assunto:AssuntoCt;resposta:string;convidarExperimental?:boolean}|null {
 const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/\s+/g," ").trim();
 const modalidade=modalidadeMencionada(texto);
 const responder=(assunto:keyof typeof respostasCt)=>({assunto,resposta:respostasCt[assunto]});
 if(perguntaMuayInfantil(texto))return {assunto:'idadeMuay',resposta:respostaMuayInfantil()};
 const agenda=/\b(?:agendar|agende|marcar|reserve|reservar|remarcar|reagendar|horarios?|vagas?)\b/.test(t);
 if (perguntaFuncionamentoCt(texto) || anterior === "funcionamento" && continuacaoFuncionamentoCt(texto)) return {assunto:"funcionamento",resposta:RESPOSTA_FUNCIONAMENTO_CT};
 if (/\bestacionamento\b|\bonde estacionar\b|\bvaga (?:de|para) carro\b/.test(t)) return {assunto:"estacionamento",resposta:"Sim, o CT oferece estacionamento para os alunos."};
 if (/\b(?:professor|professora|instrutor|quem ensina|quem da (?:a |as )?aulas)\b/.test(t) || /quem.*responsavel.*(?:ct|centro)/.test(t)
   || anterior==="professores" && modalidade && /^(?:e\s+(?:(?:o|a|de|do|da)\s+)*|(?:de|do|da)\s+)(?:muay(?: thai)?|jiu(?:[ -]?jitsu)?|taekwondo|tae)[?!.\s]*$/.test(t)) {
   const alvo=modalidade ?? (/responsavel.*(?:ct|centro)/.test(t)?"Taekwondo":modalidadeContexto);
   return {assunto:"professores",resposta:alvo==="Taekwondo"?respostasCt.professorTae:alvo?respostasCt.professorLutas:`${respostasCt.professorTae} ${respostasCt.professorLutas}`};
 }
 if (/\b(?:documentos?|rg|ficha|autorizacao)\b/.test(t) && /matricul|precis|necess|levar|responsavel|document/.test(t)) return responder("documentos");
 if (/(?:experimental|experimentar).*(?:gratuit|paga|pago|custa|preco|valor)|(?:gratuit|preco|valor|custa).*(?:experimental)/.test(t)) return responder("experimental");
 if (/\b(?:e se|tenho medo de|posso)\b.*\b(?:machucar|lesionar|me lesionar|me ferir)\b/.test(t)) {
   return {assunto:"adaptacao",resposta:"Na experimental, o professor orienta os movimentos e adapta os exercícios ao seu ritmo. Se sentir dor ou se machucar, pare e avise o professor na hora.",convidarExperimental:true};
 }
 if (/\b(?:feminina|feminino|mulheres|mulher|homens)\b/.test(t) && !agenda) return responder("feminina");
 if (/competicao|competicoes|campeonato/.test(t) && !agenda) return responder("competicao");
 if (/quantos.*alunos|muitos?.*alunos|alunos.*(?:por|na|em cada).*turma|tamanho.*turma/.test(t)) return responder("tamanho");
 if (/\b(?:equipamentos?|luvas?|bandagens?|kimono|quimono|uniforme|roupas?|garrafinha|garrafa)\b|o que.*levar|precisa comprar/.test(t)) return {assunto:'equipamentos',resposta:equipamentosDaModalidade(modalidade ?? modalidadeContexto)};
 if (/cancel.*(?:matricula|plano|contrato)|(?:matricula|plano|contrato).*cancel|aviso previo/.test(t)) return responder("cancelamento");
 if (/(?:remarcar|reagendar|cancelar|cancelamento).*(?:experimental|aula)|(?:experimental|aula).*(?:remarcar|cancelar|cancelamento)/.test(t)) return {assunto:"alterarExperimental",resposta:"Para remarcar ou cancelar sua experimental, é só solicitar pelo WhatsApp. Primeiro entendemos o motivo e tentamos outro dia; se você preferir cancelar, respeitamos sua decisão e concluímos o cancelamento."};
 if (/\b(?:repor|reposicao|reposicoes)\b|faltar.*aula|faltar.*semana/.test(t)) return responder("reposicao");
 if (/\b(?:desconto|negociar|antecipado|antecipar)\b/.test(t)) return responder("desconto");
 if (/\bcar[oa]\b|opcao mais barata|valor.*alto/.test(t)) return responder("valor");
 if (/(?:mensalidade|plano|valor|pagar|preco|cobre|inclui).*(?:modalidade|lutas)|(?:duas|mais de uma|varias).*modalidades/.test(t)) return responder("modalidades");
 if (/todos os dias|quantas.*aulas|frequencia|vezes.*semana|posso.*(?:dias|vezes).*treinar/.test(t)) return responder("frequencia");
 if (/\b(?:pais|mae|pai|responsavel)\b.*(?:acompanhar|ficar|permanecer|buscar)|acompanhar.*(?:filh|crianca|aula infantil)/.test(t)) return responder("responsaveis");
 if (/antecedencia|quantos minutos.*chegar|(?:que horas|quanto tempo|quando).*chegar|chegar.*antes/.test(t)) return responder("chegada");
 if (/duracao|quanto tempo.*(?:aula|treino)|(?:aula|treino).*dura/.test(t)) return responder("duracao");
 if (/horario.*(?:humano|equipe|atendente)|(?:humano|equipe|atendente).*horario|atendimento humano.*funciona/.test(t)) return responder("horarioHumano");
 if (/pouca.*resistencia|condicionamento.*(?:baixo|ruim)|adaptad|adaptar|sedentari/.test(t) && !agenda) return responder("adaptacao");
 const idade=/(?:idade minima|a partir de quantos|partir de que idade|crianca|\d+\s*anos.*(?:pode|posso|comecar|aprender)|(?:pode|posso).*(?:\d+\s*anos))/.test(t);
 if (idade && !agenda && modalidade === "Muay Thai") {
   const anos=t.match(/\b(\d{1,3})\s*anos\b/);
   if (anos && Number(anos[1]) >= 14) return {assunto:"iniciantes",resposta:"Pode começar, sim! Adolescentes e adultos iniciantes treinam nas turmas regulares, e o professor adapta o treino ao seu nível."};
 }
 if (idade && !agenda && modalidade) return responder(modalidade==="Muay Thai"?"idadeMuay":modalidade==="Jiu-Jitsu"?"idadeJiu":"idadeTae");
 if (/iniciante|nunca (?:lutei|treinei)|sem (?:ter )?praticado|sem experiencia|posso (?:comecar|aprender)/.test(t) && !agenda) return responder("iniciantes");
 if (/taxa.*matricula|taxa.*anuidade|cobram.*matricula/.test(t)) return {assunto:"documentos",resposta:"Não cobramos taxa de matrícula nem anuidade."};
 if (/forma.*pagamento|como.*pagar|cartao|pix|dinheiro/.test(t) && !agenda) return {assunto:"modalidades",resposta:"Aceitamos cartão de débito, cartão de crédito, Pix ou dinheiro."};
 if (/quanto.*(?:mensalidade|plano)|valor.*mensalidade|preco.*(?:plano|mensalidade)|custa.*mensalidade/.test(t)) return {assunto:"modalidades",resposta:dataLocalCt() <= "2026-12-31" ? "A mensalidade é R$ 199 para adulto e R$ 220 para kids até 31/12/2026. Quem se matricular nesse período mantém o valor de 2026 até 31/03/2027." : "Para novos alunos a partir de 2027, a mensalidade é R$ 250. Quem se matriculou até 31/12/2026 mantém seu valor de 2026 até 31/03/2027."};
 if (/beneficios?/.test(t) && modalidade) return {assunto:"adaptacao",resposta:modalidade==="Muay Thai" ? "O Muay Thai combina técnicas e exercícios funcionais, trabalhando o condicionamento e o gasto de energia, além de habilidades de defesa pessoal." : modalidade==="Jiu-Jitsu" ? "O Jiu-Jitsu trabalha controle, escapes e defesa pessoal, além de força, movimentação e condicionamento." : "O Taekwondo trabalha coordenação, disciplina, confiança e movimentação, com atividades adaptadas à idade."};
 return null;
}

export function perguntaInformativaCt(texto:string) {
 if(perguntaMuayInfantil(texto))return true;
 if (perguntaFuncionamentoCt(texto)) return true;
 const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 return /\b(?:professores?|professoras?|instrutor|documentos?|equipamentos?|gratuita|gratuito|desconto|mensalidade|feminina|matricula|anuidade|kimono|quimono|beneficios?|reposicao|vestiario|banheiro|chuveiro|estacionamento|multa|contrato|fidelidade|taxa)\b|idade minima|partir de quantos|quantos.*alunos/.test(t)
   && !/\b(?:agendar|agende|marcar|reservar|reserva|horarios?|vagas?|remarcar|reagendar)\b/.test(t);
}

export function solicitaHumanoCt(texto:string) {
 const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 return /\b(?:quero|preciso|gostaria de|posso|pode)\s+(?:falar|conversar|atendimento)\s+(?:(?:com|um|uma|o|a)\s+)*(?:humano|humana|atendente|pessoa|alguem|equipe|professor|professora)\b/.test(t)
   || /\b(?:quero|preciso|gostaria de|pode)\s+cancelar\b.*\b(?:matricula|plano|contrato)\b/.test(t);
}
