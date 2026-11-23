/** Exibe poucas opções sem restringir a grade nem alterar reservas. */
import { dataLocalCt } from "./calendario";

export const orientacaoExperimentais = "APRESENTAÇÃO DE EXPERIMENTAIS: todas as aulas cadastradas podem receber experimental, incluindo Taekwondo, Muay Thai e Jiu-Jitsu, respeitando idade e disponibilidade. Não restrinja modalidades, dias ou horários pela política antiga. Use a ferramenta e apresente apenas duas opções por vez, incluindo uma à tarde quando houver turma compatível. Se o interessado não conseguir nesses horários ou pedir alternativas, consulte mais duas opções usando maisOpcoes=true, sem repetir as que acabou de oferecer. Pergunte pelo dia ou período preferido quando necessário. Nunca despeje a grade inteira. Preserve reservas existentes e o cadastro das aulas.";
export function selecionarExperimentais<T extends { aulaId: string; inicio: string }>(opcoes: T[], mostradas: string[] = [], variarDias = false): T[] {
  const ordenadas = [...opcoes].sort((a,b)=>a.inicio.localeCompare(b.inicio));
  const unicas = ordenadas.filter((a,i)=>!mostradas.includes(a.aulaId) && ordenadas.findIndex(b=>b.aulaId===a.aulaId)===i);
  const hora = (a: T) => new Date(Date.parse(a.inicio)-3*3600000).getUTCHours();
  const tarde = (a: T) => hora(a)>=12 && hora(a)<18;
  const primeira = unicas.find(tarde) ?? unicas[0];
  if (!primeira) return [];
  const restantes = unicas.filter(a=>a.aulaId!==primeira.aulaId);
  const data = variarDias ? dataLocalCt(Date.parse(primeira.inicio)) : null;
  const outroDia = data ? restantes.filter(a=>dataLocalCt(Date.parse(a.inicio))!==data) : [];
  const alternativas = outroDia.length ? outroDia : restantes;
  const segunda = alternativas.find(a=>!tarde(a)) ?? alternativas.find(a=>hora(a)!==hora(primeira)) ?? alternativas[0];
  return segunda ? [primeira,segunda] : [primeira];
}

/** Prioridade de apresentação; pedidos explícitos e demais turmas continuam disponíveis. */
export function priorizarInfantil<T extends { modalidade: string; aulaId: string }>(opcoes: T[], idade: number | null, modalidade: string | null, mostradas: string[]): T[] {
  if (idade === null || idade >= 12 || modalidade?.trim()) return opcoes;
  const taekwondo = opcoes.filter(a => a.modalidade === "Taekwondo" && !mostradas.includes(a.aulaId));
  return taekwondo.length ? taekwondo : opcoes;
}
