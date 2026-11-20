import { interpretarDataCt } from "./calendario";
import { modalidadeMencionada } from "./objetivo";
import type { Turn } from "../agent/providers";

export function perguntaGradeDia(texto: string) {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  return !modalidadeMencionada(texto) && interpretarDataCt(texto)?.tipo === "data"
    && /\b(?:tem|temos|ha|oferecem|funcionam|quais|acontecem)\b/.test(t)
    && /\b(?:aulas?|turmas?|treinos?|modalidades?)\b/.test(t);
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
