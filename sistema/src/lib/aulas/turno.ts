import { fusoCt } from "./calendario";
export type TurnoAula = "manha" | "tarde" | "noite";
/** undefined mantém a preferência; null remove apenas por pedido explícito. */
export function interpretarTurno(texto: string): TurnoAula | "ambiguo" | null | undefined {
  const normal = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (/^(?:bom dia|boa tarde|boa noite)[!.\s]*$/.test(normal)) return undefined;
  if (/qualquer (?:turno|periodo|horario)|sem preferencia de (?:turno|periodo|horario)|tanto faz o (?:turno|periodo|horario)/.test(normal)) return null;
  const achados = [...normal.matchAll(/\b(manha|tarde|noite|matutino|vespertino|noturno)\b/g)].filter(m => !/(?:nao|nem)(?:\s+\w+){0,3}\s+$/.test(normal.slice(0,m.index)));
  const nomes: Record<string,TurnoAula> = {manha:"manha",matutino:"manha",tarde:"tarde",vespertino:"tarde",noite:"noite",noturno:"noite"};
  const turnos = [...new Set(achados.map(m => nomes[m[1]]))];
  return turnos.length > 1 ? "ambiguo" : turnos[0];
}
export function correspondeTurno(inicio: string, turno: TurnoAula | null | undefined) {
  if (!turno) return true;
  const hora = Number(new Intl.DateTimeFormat("en-GB", {timeZone:fusoCt,hour:"2-digit",hourCycle:"h23"}).format(new Date(inicio)));
  return turno === "manha" ? hora < 12 : turno === "tarde" ? hora >= 12 && hora < 18 : hora >= 18;
}
