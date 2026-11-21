import { dataLocalCt, interpretarDataCt, rotuloDataCt, somarDiasCt } from "../aulas/calendario";
import type { Aula } from "../aulas/schema";
import { aulaProgramadaCt, consultaSabadoCt, RESPOSTA_SABADO_CT } from "./sabado";

export const REGRA_FUNCIONAMENTO_CT = "FUNCIONAMENTO DO CT — atualizado em 20/11/2026: o CT abre no início da primeira aula do dia e fecha ao término da última aula, considerando a duração cadastrada. Na pergunta geral, apresentar diretamente abertura e fechamento por dia, agrupando dias com horas iguais, sem perguntar qual dia deseja e sem introdução sobre os próximos sete dias. Consulte a grade real de todas as modalidades e idades, sem reutilizar filtros da conversa. Sexta e domingo abrimos eventualmente em aulas extras. Informar horas exatas nesses dias somente quando a aula extra estiver cadastrada, sem inventar funcionamento fixo. Nos demais dias sem aula cadastrada, não anunciar abertura. Essa regra é do espaço físico, não define horário de atendimento humano no WhatsApp.";
export const RESPOSTA_FUNCIONAMENTO_CT = "O CT abre na primeira aula e fecha quando termina a última do dia.";

export function perguntaFuncionamentoCt(texto: string) {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return !/\b(?:whatsapp|humano|atendente|equipe)\b/.test(t) &&
    (/\b(?:funcionamento|abertura|fechamento|abre|abrem|fecha|fecham|aberto|abertos|fechado|fechados)\b/.test(t) ||
      /\bfuncionam?\b/.test(t) && /\b(?:ct|academia|centro|horas|horario)\b/.test(t));
}

export function continuacaoFuncionamentoCt(texto: string) {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return /^(?:e\s+)?(?:(?:na|no|para|pra|em)\s+)?(?:hoje|amanha|depois de amanha|(?:proxim[ao]\s+)?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)[?!.\s]*$/.test(t);
}

function limitesNoDia(aulas: Aula[], data: string) {
  const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
  const intervalos = aulas.filter(a => aulaProgramadaCt(a) && (a.diaSemana == null ? dataLocalCt(Date.parse(a.inicio)) === data : a.diaSemana === diaSemana))
    .map(a => {
      const hora = new Date(a.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const inicio = Date.parse(`${data}T${hora}:00-03:00`);
      return { inicio, fim: inicio + a.duracao * 60000 };
    });
  return intervalos.length ? { inicio: Math.min(...intervalos.map(i => i.inicio)), fim: Math.max(...intervalos.map(i => i.fim)) } : null;
}

const horaCt = (instante: number) => new Date(instante).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const nomesDias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
function listarDias(dias: string[]) { return dias.length < 2 ? dias[0] : `${dias.slice(0,-1).join(", ")} e ${dias.at(-1)!.toLocaleLowerCase("pt-BR")}`; }

/** Cada dia usa a ocorrência real mais próxima, incluindo aulas pontuais nessa data. */
function funcionamentoSemanalCt(aulas: Aula[]) {
  const hoje = dataLocalCt(), diaHoje = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const grupos = new Map<string, string[]>(), semAulas: string[] = [];
  for (const dia of [1,2,3,4,5,6,0]) {
    const data = somarDiasCt(hoje,(dia-diaHoje+7)%7), limites = limitesNoDia(aulas,data);
    if (!limites) { semAulas.push(nomesDias[dia]); continue; }
    const faixa = `das ${horaCt(limites.inicio)} às ${horaCt(limites.fim)}${dataLocalCt(limites.fim) !== data ? " do dia seguinte" : ""}`;
    grupos.set(faixa,[...grupos.get(faixa) ?? [], nomesDias[dia]]);
  }
  const linhas = [...grupos].map(([faixa,dias]) => `${listarDias(dias)}: ${faixa}.`);
  const semGrade=semAulas.filter(d=>d!=="Sexta" && d!=="Domingo" && d!=="Sábado"), extras=semAulas.filter(d=>d==="Sexta" || d==="Domingo");
  if (semAulas.includes("Sábado")) linhas.push(RESPOSTA_SABADO_CT);
  if (semGrade.length) linhas.push(`${listarDias(semGrade)}: sem aulas cadastradas.`);
  if (extras.length) linhas.push(`${listarDias(extras)}: abrimos eventualmente em aulas extras.`);
  return `${RESPOSTA_FUNCIONAMENTO_CT}\n\n${linhas.join("\n")}`;
}

/** Limites do espaço físico: não aplica idade, modalidade, turno ou lotação. */
export function funcionamentoNoDiaCt(aulas: Aula[], texto: string) {
  const data = interpretarDataCt(texto);
  if (!data) return funcionamentoSemanalCt(aulas);
  if (data.tipo !== "data") return "Qual data você quer consultar para saber quando o CT abre e fecha?";
  const limites = limitesNoDia(aulas,data.data);
  if (!limites && consultaSabadoCt(texto)) return RESPOSTA_SABADO_CT;
  if (!limites) return `Em ${rotuloDataCt(data.data)}, não há aulas cadastradas. O CT funciona nos dias com aulas. Quer consultar outro dia?`;
  return `Em ${rotuloDataCt(data.data)}, o CT abre às ${horaCt(limites.inicio)} e fecha às ${horaCt(limites.fim)}${dataLocalCt(limites.fim) !== data.data ? " do dia seguinte" : ""}. O fechamento é ao término da última aula.`;
}
