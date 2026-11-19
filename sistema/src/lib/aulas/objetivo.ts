export type ObjetivoAula = "emagrecer" | "ludico" | "defesa";
export function identificarObjetivo(texto: string): ObjetivoAula | null {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  if (/emagrec|perder peso|queimar calorias|condicionamento/.test(t) && !/nao (?:quero |preciso |busco )?(?:emagrec|perder peso|queimar calorias)/.test(t)) return "emagrecer";
  if (/ludic|brincar|coordenacao|disciplina/.test(t)) return "ludico";
  if (/defesa pessoal|me defender|se defender|autodefesa/.test(t)) return "defesa";
  return null;
}
export function recomendarObjetivo(objetivo: ObjetivoAula | null | undefined, idade: number | null, crianca: boolean) {
  if (!objetivo) return null;
  if (crianca && idade === null && objetivo !== "ludico") return null;
  if (objetivo === "ludico" || idade !== null && idade < 12) return {modalidade:"Taekwondo",explicacao:crianca || idade !== null && idade < 18 ? "Para a criança, recomendo Taekwondo! As atividades lúdicas trabalham coordenação, disciplina e confiança de forma divertida." : "Para seu objetivo, recomendo Taekwondo! O treino trabalha coordenação, disciplina e confiança de forma dinâmica."};
  if (objetivo === "emagrecer") return {modalidade:"Muay Thai",explicacao:"Para seu objetivo, recomendo Muay Thai! O treino combina técnicas e exercícios funcionais, aumentando o gasto calórico e trabalhando o condicionamento."};
  return {modalidade:"Jiu-Jitsu",explicacao:"Para seu objetivo, recomendo Jiu-Jitsu! Você aprende técnicas de controle, escapes e defesa pessoal, respeitando seu ritmo."};
}
export function intencaoModalidade(texto: string) {
  const normal=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  const afirmadas=new Set<string>(),negadas=new Set<string>();
  const padroes:[string,RegExp][]=[["Taekwondo",/\b(?:taekwondo|tae)\b/g],["Muay Thai",/\bmuay(?: thai)?\b/g],["Jiu-Jitsu",/\bjiu(?:[ -]?jitsu)?\b/g]];
  for(const [nome,padrao] of padroes) for(const m of normal.matchAll(padrao)) {
    const antes=normal.slice(0,m.index);
    const negada=/\b(?:nao|nem)\s+(?:(?:quero|gosto|prefiro|pretendo|vou|e)(?:\s+mais)?\s+)?(?:(?:de|fazer|treinar|experimentar)\s+){0,2}$/.test(antes);
    (negada?negadas:afirmadas).add(nome);
  }
  return {modalidade:afirmadas.size===1?[...afirmadas][0]:null,negadas:[...negadas]};
}
export function modalidadeMencionada(texto: string) { return intencaoModalidade(texto).modalidade; }
