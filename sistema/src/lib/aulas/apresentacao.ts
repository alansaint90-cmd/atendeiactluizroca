import type {TurnoAula} from "./turno";
/** A resposta acompanha a pergunta; a disponibilidade vem sempre da consulta. */
export function aberturaHorarios(texto: string, quantidade: number, turno: TurnoAula | null, alternativas: boolean) {
  if (!quantidade) return "";
  const periodo = turno ? {manha:"Pela manhã",tarde:"À tarde",noite:"À noite"}[turno] : null;
  const perguntaDisponibilidade = /\b(?:tem|temos|ha|h[aá]|existe|voc[eê]s t[eê]m|dispon[ií]vel|dispon[ií]veis|consegue|pode ser)\b/iu.test(texto);
  if (perguntaDisponibilidade && periodo) return `Temos sim! ${periodo}:`;
  if (alternativas) return quantidade === 1 ? "Claro! Também temos este horário:" : "Claro! Também temos estes horários:";
  if (periodo) return `${periodo}, você pode vir ${quantidade === 1 ? "neste horário" : "nestes horários"}:`;
  if (perguntaDisponibilidade) return "Temos sim! Dá uma olhada:";
  return quantidade === 1 ? "Você pode vir neste horário:" : "Você pode vir nestes horários:";
}
