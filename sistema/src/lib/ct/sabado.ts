import { interpretarDataCt } from "../aulas/calendario";
import type { Aula } from "../aulas/schema";

export const RESPOSTA_SABADO_CT = "Não temos aulas programadas aos sábados. Os sábados ficam livres para aulas extras, eventos e atendimentos na academia.";
export const REGRA_SABADO_CT = "SÁBADOS — atualização de 20/11/2026: não há aulas regulares aos sábados, em nenhuma modalidade. Os sábados ficam livres para aulas extras, eventos e atendimentos na academia. Esta regra substitui a orientação antiga de Taekwondo regular aos sábados. Responda diretamente com essa explicação, sem 'nesse recorte', sem herdar a modalidade anterior e sem prometer horários extras. Aulas extras só podem ser apresentadas e reservadas quando cadastradas em data específica e futura. Cadastros recorrentes antigos de sábado e reservas existentes são preservados, mas não geram novas ofertas automáticas.";

/** Mantém os registros antigos; uma atividade extra exige data específica. */
export function aulaProgramadaCt(aula: Aula) {
  return aula.diaSemana !== 6;
}

export function consultaSabadoCt(texto: string) {
  const data = interpretarDataCt(texto);
  return data?.tipo === "data" && new Date(`${data.data}T12:00:00Z`).getUTCDay() === 6;
}
