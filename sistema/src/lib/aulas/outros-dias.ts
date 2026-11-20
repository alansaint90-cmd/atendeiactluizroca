/** Perguntar se só há aquele dia não significa escolhê-lo ou restringir a agenda. */
export function pediuOutrosDias(texto: string) {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim();
  if (/\bnao (?:quero|posso|consigo|aceito)\b.*\boutr[oa]s? (?:dias?|datas?)\b/.test(t)) return false;
  return /\boutr[oa]s? (?:dias?|datas?)\b/.test(t) ||
    /^(?:e\s+)?(?:so|somente|apenas)\s+(?:(?:na|no|nas|nos|as|aos)\s+)?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[ -]feira)?(?:\s+mesmo)?[?!.\s]*$/.test(t);
}

export const ORIENTACAO_OUTROS_DIAS = "OUTROS DIAS — 20/11/2026: perguntas como 'só segunda?', 'não tem outro dia?' e 'tem outro dia à tarde?' pedem alternativas, não escolhem nem restringem ao dia citado. Consulte outras datas reais, preservando modalidade, idade e turno. Pode informar dias recorrentes juntos quando a agenda confirmar, como segunda e quarta às 15h45. Não repetir a mesma opção como se fosse outro dia; não mudar de turno nem gravar reserva. 'Só posso segunda' continua sendo uma restrição, e 'segunda é bom' continua sendo escolha de dia.";
