import { interpretarDataCt } from "./calendario";
import { modalidadeMencionada, intencaoModalidade } from "./objetivo";
import { identificarParticipante } from "./participante";
import { responderDuvidaCt, perguntaInformativaCt } from "../ct/duvidas";
import type { Turn } from "../agent/providers";

export function perguntaGradeDia(texto: string) {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  const curta=/^(?:e\s+)?(?:(?:tem|ha)\s+)?(?:(?:na|no|nas|nos|as|aos)\s+)?(?:domingos?|segundas?|tercas?|quartas?|quintas?|sextas?|sabados?)(?:[ -]feiras?)?\s*\?$/.test(t.trim());
  return interpretarDataCt(texto)?.tipo === "data"
    && !/\b(?:agendar|agende|marcar|reservar|reserve|confirmar|remarcar|reagendar)\b/.test(t)
    && (curta || /\b(?:tem|temos|ha|oferecem|funcionam|quais|acontecem|mostre|mostrar)\b/.test(t)
    && (/\b(?:aulas?|turmas?|treinos?|modalidades?|horarios?)\b/.test(t) || Boolean(modalidadeMencionada(texto))));
}
export function aceiteConsulta(texto: string, historico: Turn[]) {
  if (!/^(?:sim|quero(?: sim)?|pode(?: sim)?|pode consultar|pode ver|claro)[.!\s]*$/iu.test(texto.trim())) return null;
  const ultima=historico.at(-1);
  if (ultima?.role !== "assistant") return null;
  const oferta=ultima.content.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  if (!/\b(?:quer|gostaria|posso)\b/.test(oferta) || !/\b(?:consult\w*|confer\w*|confir[ao]\w*|verific\w*|veja|ver|mostrar)\b/.test(oferta) || !/\b(?:horarios?|aulas?|turmas?)\b/.test(oferta)) return null;
  const pergunta=historico.slice(0,-1).findLast(t=>t.role === "user")?.content;
  const anterior=pergunta ? modalidadeMencionada(pergunta) : null, oferecida=modalidadeMencionada(ultima.content);
  if (anterior && oferecida && anterior !== oferecida) return null;
  return pergunta && (interpretarDataCt(pergunta)?.tipo === "data" || modalidadeMencionada(pergunta)) ? pergunta : null;
}

/** Repara contexto perdido por versões antigas usando somente pedidos do cliente. */
export function contextualizarGradeDia(texto:string,historico:Turn[]) {
  if(!perguntaGradeDia(texto) || modalidadeMencionada(texto))return texto;
  for(const turno of [...historico].reverse()) {
    if(turno.role!=="user")continue;
    if(responderDuvidaCt(turno.content) || perguntaInformativaCt(turno.content)) {
      if(identificarParticipante(turno.content))return texto;
      continue;
    }
    const interesse=intencaoModalidade(turno.content);
    if(interesse.modalidade)return `${texto}\n${interesse.modalidade}`;
    if(interesse.negadas.length || identificarParticipante(turno.content))return texto;
  }
  return texto;
}
