import { LINK_LOCALIZACAO_CT } from "../ct/conhecimento";
import { formatarDiaHoraCt } from "./calendario";

export function confirmacaoFinalAula(modalidade:string,inicio:string) {
  return `Sua experimental de ${modalidade} está agendada para ${formatarDiaHoraCt(inicio)}!\n\nVenha com roupa leve e traga uma garrafinha de água. Estamos esperando por você!\n\n👇 Tô deixando aqui a localização, caso você precise:\n${LINK_LOCALIZACAO_CT}\n\nAté lá!`;
}

export const ORIENTACAO_RESERVA_DIRETA = "RESERVA DIRETA — 20/11/2026, PREVALECE SOBRE REGRAS ANTIGAS: após escolha explícita de uma opção real e coleta dos dados obrigatórios, chame preparar_reserva_aula. A ferramenta valida e grava imediatamente a reserva, sem apresentar conferência nem perguntar 'Os dados estão corretos?' ou pedir sim/confirmo. Só após sucesso real retorne a confirmação final curta. Não confirme por texto livre, pelo histórico ou em nome da ferramenta. Se faltar dado ou escolha, peça somente o que falta. Datas e horários precisam ser posteriores ao relógio atual do CT; nunca reservar uma aula que já começou. Preservar idempotência, idade real, responsável para menor e a única experimental por pessoa. Follow-up 1: duas horas antes do início. Follow-up 2: duas horas depois do início, sem acrescentar duração da aula. Essa atualização substitui conferência única e intervalos antigos.";
