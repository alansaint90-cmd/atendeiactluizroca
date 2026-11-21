import type { Aula } from "./schema";
import { aulaProgramadaCt } from "../ct/sabado";
export const diasAula = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export function ocorrenciasAula(aula: Aula, agora = Date.now(), dias = 60): string[] {
  if (!aulaProgramadaCt(aula)) return [];
  if (aula.diaSemana == null) return Date.parse(aula.inicio) > agora ? [aula.inicio] : [];
  const base = new Date(Date.parse(aula.inicio) - 3 * 3600000), hoje = new Date(agora - 3 * 3600000);
  const primeira = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), base.getUTCHours() + 3, base.getUTCMinutes());
  return Array.from({ length: dias }, (_, i) => primeira + i * 86400000)
    .filter(v => v > agora && new Date(v - 3 * 3600000).getUTCDay() === aula.diaSemana).map(v => new Date(v).toISOString());
}
export function rotuloRecorrencia(aula: Aula) {
  return aula.diaSemana == null ? "Aula em data específica" : `Toda ${diasAula[aula.diaSemana].toLocaleLowerCase("pt-BR")} às ${new Date(aula.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })}`;
}
