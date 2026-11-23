export const PERGUNTA_MODALIDADES = "Qual das três você prefere?";
export const PERGUNTA_AGENDAR_EXPERIMENTAL = "Vamos agendar sua aula experimental?";

export function pedidoIndicacaoCt(texto: string) {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
  return {
    sedentario: /\bsedent\w*\b/.test(t),
    opcoes: /\b(?:indicaria|recomendaria|me indic[ae]|me recomend[ae]|voce recomenda|qual (?:a )?modalidade (?:me indica|voce indica|e melhor)|(?:tem|oferece)\s+(?:o\s*)?(?:que|q)\b.*\b(?:pra|para) mim|(?:o que|quais modalidades)\b.*\b(?:tem|oferecem)\b|melhor (?:pra|para) minha saude)\b/.test(t),
  };
}

export function apresentarModalidadesCt(idade: number | null, sedentario: boolean) {
  const taekwondo = "Taekwondo trabalha coordenação, equilíbrio e disciplina.";
  const muayThai = "Muay Thai trabalha o condicionamento e a resistência.";
  const jiuJitsu = "Jiu-Jitsu trabalha força, técnica e defesa pessoal.";
  const inicio = sedentario ? "Qualquer uma das três pode ajudar você a sair do sedentarismo. Dá pra começar no seu ritmo.\n" : "";

  if (idade !== null && idade < 14) {
    if (idade < 3) return "O Taekwondo infantil começa aos 3 anos. Quer saber como funcionam as turmas?";
    return inicio + "Para crianças, minha indicação é o Taekwondo. O treino trabalha coordenação e disciplina com atividades adaptadas à idade.\n\n" + PERGUNTA_AGENDAR_EXPERIMENTAL;
  }

  const recomendacao = idade !== null && idade >= 16
    ? "Pra sua faixa etária, eu indicaria Jiu-Jitsu ou Muay Thai.\n"
    : "";
  return inicio + recomendacao + [taekwondo, muayThai, jiuJitsu].join("\n") + "\n\n" + PERGUNTA_MODALIDADES;
}
