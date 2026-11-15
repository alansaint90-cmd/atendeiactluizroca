import type { Aula } from "./schema";
/** Política comercial temporária. Não altera a grade nem reservas existentes. */
export const orientacaoExperimentais = "OFERTA ATUAL DE AULAS EXPERIMENTAIS: apresente somente Taekwondo (todas as turmas compatíveis com a idade) e Muay Thai. Muay Thai: segunda e quarta apenas às 15h45 e 21h15; terça e quinta todos os horários cadastrados. Não ofereça Jiu-Jitsu nem Muay Thai de segunda/quarta às 18h15 para novas experimentais neste momento. Consulte a ferramenta para datas reais. Se perguntarem por Jiu-Jitsu, explique que existe no CT, mas a oferta atual de experimentais está concentrada em Taekwondo e Muay Thai nesses horários. Preserve agendamentos já confirmados, inclusive de outras modalidades; isso não autoriza cancelá-los ou mudá-los. Esta política prevalece sobre a grade completa e roteiros comerciais antigos.";
export function permiteExperimental(aula: Pick<Aula, "modalidade" | "inicio" | "diaSemana">, inicio = aula.inicio): boolean {
  const modalidade = aula.modalidade.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  if (modalidade === "taekwondo") return true;
  if (modalidade !== "muaythai") return false;
  const local = new Date(Date.parse(inicio) - 3 * 3600000);
  const dia = aula.diaSemana ?? local.getUTCDay(), horario = `${String(local.getUTCHours()).padStart(2,"0")}:${String(local.getUTCMinutes()).padStart(2,"0")}`;
  return [2,4].includes(dia) || [1,3].includes(dia) && ["15:45","21:15"].includes(horario);
}
