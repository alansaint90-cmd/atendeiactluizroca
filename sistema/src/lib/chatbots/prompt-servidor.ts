import { orientacaoExperimentais } from "../aulas/oferta-experimental";
import type { Chatbot } from "./schema";

export function montarInstrucoesDoAgente(chatbot: Chatbot | null): string {
  if (!chatbot?.context.trim()) return "";
  const promptDaThais = /wellington\s+junior/i.test(chatbot.context);
  const contexto = promptDaThais && /Você está buscando um atendimento individual ou uma mentoria em grupo\?/iu.test(chatbot.context)
    ? chatbot.context
      .replace(/Primeiro pergunte:\s*"Claro![^"\n]*mentoria em grupo\?"/giu,
        'Primeiro explique:\n"Claro! 😊 O atendimento e a mentoria com Wellington Junior são individuais e personalizados."')
      .replace(/Se responder individual:/giu, "Sobre o atendimento individual:")
    : chatbot.context;
  const fluxos = chatbot.flows.length
    ? chatbot.flows.map(fluxo => `- ${fluxo.name}: ${fluxo.description}`).join("\n")
    : "Nenhum fluxo específico cadastrado.";
  return [
    "CONFIGURAÇÃO DO CHATBOT SDR:",
    `Identificador: ${chatbot.identifier}`,
    `Persona: ${chatbot.persona} (${chatbot.gender})`,
    `Personalidade: ${chatbot.personalities.join(", ") || "não definida"}`,
    `Missão: ${chatbot.mission}`,
    "Prompt de atendimento obrigatório:",
    contexto,
    "AGENDA DO CT INTEGRADA: as aulas duram 60 minutos, repetem semanalmente e não têm limite de alunos. No sábado, agende somente Taekwondo; não ofereça Muay Thai nesse dia. Para experimental, use consultar_aulas_experimentais e depois preparar_reserva_aula. Colete nome completo e idade do participante, e responsável para menores, aproveitando dados já informados. A ferramenta apresenta datas reais e a conferência. Só o servidor grava após confirmação explícita; nunca prometa agendamento por texto livre. As reservas verificadas no contexto prevalecem sobre o histórico. Se o cliente disser oi em conversa com reserva, retome o agendamento, sem repetir apresentação. Responda em parágrafos curtos, um assunto por bloco. Informações da aula já confirmadas pelo servidor prevalecem sobre trechos antigos do prompt que diziam agenda desconectada. Nunca use a agenda médica.",
    orientacaoExperimentais,
    "A conferência termina apenas com “Os dados estão corretos?”. Sim confirma a reserva; não pergunta o que alterar, sem gravar e sem aceitar nova confirmação até reconferir os dados. Após sucesso real, não mostrar protocolo: enviar três balões separados (agendamento com nome/modalidade/data, link do endereço, “Posso te ajudar em algo mais?”). Aguardar resposta: sim pergunta como ajudar; não despede lembrando a aula e a data verificadas. Dúvidas específicas são respondidas antes de encerrar.",
    ...(promptDaThais ? ["O atendimento e a mentoria com Wellington Junior são exclusivamente individuais. Não apresente modalidades, turmas ou benefícios ausentes deste prompt; corrija qualquer informação contraditória no histórico da conversa."] : []),
    `Se não souber responder: ${chatbot.fallback}`,
    `Transferência humana: ${chatbot.transferHuman ? `habilitada para ${chatbot.destination}. Quando solicitada, acione transferir_para_humano. O servidor enviará o aviso salvo; não invente confirmação de transferência.` : "desabilitada. Não prometa transferir nem diga que transferiu."}`,
    "Fluxos inteligentes:",
    fluxos,
    "CONFIGURAÇÃO ATUAL — prevalece sobre exemplos do prompt e falas anteriores:",
    `Seu nome é ${chatbot.persona}. Apresente-se exclusivamente com esse nome, no gênero ${chatbot.gender}. O identificador ${chatbot.identifier} é interno, não é o nome do cliente.`,
    `Adote o tom ${chatbot.personalities.join(", ") || "profissional"} e a missão cadastrada acima. Não mantenha uma identidade antiga mencionada no histórico.`,
    "O histórico serve apenas para compreender o cliente, nunca para substituir estas configurações atuais.",
  ].join("\n");
}
