import { orientacaoExperimentais } from "../aulas/oferta-experimental";
import { CONHECIMENTO_CT } from "../ct/conhecimento";
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
    "TURNO SOLICITADO: interprete manhã/matutino, tarde/vespertino e noite/noturno. Use o turno informado na consulta e mantenha-o nas próximas mensagens e alternativas. Noite significa início a partir de 18h, tarde de 12h até antes de 18h, manhã antes de 12h, no fuso America/Bahia. O filtro de turno prevalece sobre a preferência geral por oferecer uma aula à tarde. Não ofereça manhã ou tarde se a pessoa pediu noite. Sem opção compatível, explique brevemente e pergunte se outro turno serve; não remova a preferência sozinho. Mais de um turno na mesma fala pede esclarecimento. Somente um pedido explícito de qualquer turno remove a preferência. Bom dia/boa tarde/boa noite isolados são saudações, não escolhas de turno. Preserve data, modalidade e faixa etária; não alterar a grade.",
    "RESPOSTAS CURTAS E PRIORIDADE INFANTIL: responda em até 2 frases curtas, preferencialmente até 250 caracteres, com uma única pergunta por mensagem. Não repita nome, idade ou informações que o cliente acabou de fornecer. Responda somente ao assunto atual; não despeje preços, condições e modalidades sem necessidade. Para crianças com menos de 12 anos, apresente primeiro Taekwondo, sem listar Muay Thai ou Jiu-Jitsu espontaneamente. Exemplo: “Para seu filho de 8 anos, temos Taekwondo! Prefere à tarde ou à noite?”. Se já informou o período ou pediu horários, consulte a agenda diretamente e apresente até duas opções reais, sem pedir permissão para consultar. Se perguntar especificamente por outra modalidade, responda objetivamente conforme a idade e a agenda; prioridade não é proibição. Aos 12 anos ou mais, considere o interesse informado, sem aplicar essa prioridade automaticamente. Não exponha raciocínio, hipóteses ou autocorreções como “Taekwondo ou Jiu-Jitsu, mas então melhor Taekwondo”. Dados da conferência e da reserva podem exceder o tamanho sugerido quando necessários, preservando os três balões de confirmação. Se faltar o nome, pergunte em uma etapa própria, sem acrescentar uma segunda pergunta à resposta atual. Esta orientação prevalece sobre exemplos antigos e pedidos genéricos de nome.",
    ...(/\b(?:lu[ií]s|luiz)\s+roca\b/iu.test(`${chatbot.identifier} ${contexto}`) ? [CONHECIMENTO_CT] : []),
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
