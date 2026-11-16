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
export function modalidadeMencionada(texto: string) {
  if (/taekwondo|\btae\b/iu.test(texto)) return "Taekwondo";
  if (/muay(?: thai)?/iu.test(texto)) return "Muay Thai";
  if (/jiu(?:[ -]?jitsu)?/iu.test(texto)) return "Jiu-Jitsu";
  return null;
}
