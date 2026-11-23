import { PERGUNTA_RETOMADA_AGENDAMENTO } from '../ct/equipamentos';
import { PERGUNTA_AGENDAR_EXPERIMENTAL, PERGUNTA_MODALIDADES } from '../ct/modalidades';
/** Divide em parágrafos e frases, preservando o texto e os IDs de cada envio. */
export function dividirResposta(texto: string, limite = 450): string[] {
  const partes: string[] = [];
  let restante = texto.trim();
  while (restante.length > limite) {
    const trecho = restante.slice(0, limite + 1);
    let corte = trecho.lastIndexOf("\n\n");
    if (corte < limite / 3) corte = Math.max(trecho.lastIndexOf(". ") + 1, trecho.lastIndexOf("? ") + 1, trecho.lastIndexOf("! ") + 1);
    if (corte < limite / 3) corte = trecho.lastIndexOf(" ");
    if (corte < 1) corte = limite;
    partes.push(restante.slice(0, corte).trim()); restante = restante.slice(corte).trim();
  }
  if (restante) partes.push(restante);
  return partes;
}

/** Preserva os três balões da confirmação da experimental. */
export function mensagensDaAula(texto: string): string[] {
  const perguntasSeparadas = [PERGUNTA_RETOMADA_AGENDAMENTO, PERGUNTA_AGENDAR_EXPERIMENTAL, PERGUNTA_MODALIDADES];
  if (perguntasSeparadas.some(pergunta => texto.endsWith(`\n\n${pergunta}`))) {
    return texto.split("\n\n").flatMap(parte => dividirResposta(parte));
  }
  if (/^(?:Sua experimental de |Boa! Vamos de )/u.test(texto)) return texto.split("\n\n").flatMap(parte=>dividirResposta(parte));
  if (/^Para (?:seu objetivo|a criança), recomendo /u.test(texto)) {
    const [explicacao,...agenda] = texto.split("\n\n");
    return [explicacao,...dividirResposta(agenda.join("\n\n"))];
  }
  if (!texto.startsWith("Aula experimental agendada no sistema!")) return dividirResposta(texto);
  const [titulo, dados, ...demais] = texto.split("\n\n");
  return [titulo + "\n\n" + dados, ...demais].flatMap(parte => dividirResposta(parte));
}
