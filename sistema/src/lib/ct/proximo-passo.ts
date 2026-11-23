import { PERGUNTA_RETOMADA_AGENDAMENTO } from "./equipamentos";
import { PERGUNTA_AGENDAR_EXPERIMENTAL } from "./modalidades";
import type { AssuntoCt } from "./politicas";

export const PERGUNTA_VISITA_CT = "Quer visitar o CT e experimentar uma aula?";
export const PERGUNTA_MATRICULA_CT = "Gostaria de fazer sua matrícula?";
export const PERGUNTA_AJUDA_CT = "Posso te ajudar com mais alguma coisa?";

export function proximoPassoCt(assunto: AssuntoCt, etapa: { emAndamento: boolean; confirmada: boolean }) {
  if (["cancelamento", "alterarExperimental", "horarioHumano", "reposicao"].includes(assunto)) return PERGUNTA_AJUDA_CT;
  if (assunto === "documentos") return PERGUNTA_MATRICULA_CT;
  if (etapa.confirmada) return PERGUNTA_AJUDA_CT;
  if (assunto === "equipamentos" && etapa.emAndamento) return PERGUNTA_RETOMADA_AGENDAMENTO;
  if (assunto === "estacionamento" || assunto === "funcionamento") return PERGUNTA_VISITA_CT;
  return PERGUNTA_AGENDAR_EXPERIMENTAL;
}

export const ORIENTACAO_PROXIMO_PASSO_CT = "CONTINUIDADE DO ATENDIMENTO: responda primeiro à dúvida com poucas frases. Em um parágrafo separado, termine com uma única pergunta que ajude a avançar. Convide para a aula experimental quando houver interesse em treinar, para visitar o CT em dúvidas sobre acesso ou espaço, e para a matrícula quando a pessoa demonstrar interesse em se matricular. Se já estiver agendando, pergunte só o próximo dado pendente. Se já tiver uma reserva, ofereça ajuda sobre a aula agendada. Respeite despedidas, recusas e encaminhamentos à equipe. Nunca diga que uma matrícula, visita ou reserva foi concluída sem a confirmação correspondente.";
