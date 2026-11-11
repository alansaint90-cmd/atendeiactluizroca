import type { Chatbot } from "./schema";
import { PROMPT_CT_LUIZ_ROCA } from "../ct/prompt";

export const chatbotExample: Chatbot = {
  id: "ct-luiz-roca", identifier: "CT Luiz Roca — Novos alunos", persona: "Atende Aí", gender: "Neutro",
  personalities: ["Amigável", "Direto ao ponto", "Profissional"],
  mission: "Acolher novos alunos do CT Luiz Roca, esclarecer dúvidas e conduzir à marcação de aulas experimentais.",
  context: PROMPT_CT_LUIZ_ROCA, agendaConsultas: false,
  fallback: "Se desculpe por não saber falar sobre. Ofereça uma nova ajuda com outro assunto.",
  delay: 5, transferMedia: false, transferHuman: true, destination: "Atendimento humano",
  transferNotice: "Não tenho essa resposta, mas estarei transferindo pra outro atendimento. Aguarde nosso retorno sobre esta dúvida...",
  closingPhrase: "Precisar de mim só chamar", flows: [], temperature: 0.2,
  contextRevision: "17a9efaa-8a74-4a0e-a760-8dad96655ae8",
};
