import { dataLocalCt, interpretarDataCt, rotuloDataCt } from "../aulas/calendario";
import type { Aula } from "../aulas/schema";

export const REGRA_FUNCIONAMENTO_CT = "FUNCIONAMENTO DO CT — confirmado em 19/11/2026: o CT abre no início da primeira aula do dia e fecha ao término da última aula, considerando a duração cadastrada. Consulte a grade real de todas as modalidades e idades para informar horas exatas, sem reutilizar filtros da conversa. Sem aula cadastrada no dia, não anunciar abertura. Essa regra é do espaço físico, não define horário de atendimento humano no WhatsApp.";
export const RESPOSTA_FUNCIONAMENTO_CT = "O CT abre no horário da primeira aula do dia e fecha quando termina a última. Qual dia você quer consultar?";

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

/** Limites do espaço físico: não aplica idade, modalidade, turno ou lotação. */
export function funcionamentoNoDiaCt(aulas: Aula[], texto: string) {
  const data = interpretarDataCt(texto);
  if (!data) return RESPOSTA_FUNCIONAMENTO_CT;
  if (data.tipo !== "data") return "Qual data você quer consultar para saber quando o CT abre e fecha?";
  const diaSemana = new Date(`${data.data}T12:00:00Z`).getUTCDay();
  const intervalos = aulas.filter(a => a.diaSemana == null ? dataLocalCt(Date.parse(a.inicio)) === data.data : a.diaSemana === diaSemana)
    .map(a => {
      const hora = new Date(a.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const inicio = Date.parse(`${data.data}T${hora}:00-03:00`);
      return { inicio, fim: inicio + a.duracao * 60000 };
    });
  if (!intervalos.length) return `Em ${rotuloDataCt(data.data)}, não há aulas cadastradas. O CT funciona nos dias com aulas. Quer consultar outro dia?`;
  const hora = (instante: number) => new Date(instante).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `Em ${rotuloDataCt(data.data)}, o CT abre às ${hora(Math.min(...intervalos.map(i => i.inicio)))} e fecha às ${hora(Math.max(...intervalos.map(i => i.fim)))}. O fechamento é ao término da última aula.`;
}
