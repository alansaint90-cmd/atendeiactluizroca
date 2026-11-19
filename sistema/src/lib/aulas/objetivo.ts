export const objetivosAula = ["emagrecer", "energia", "ludico", "defesa"] as const;
export type ObjetivoAula = typeof objetivosAula[number];
export function identificarObjetivo(texto: string): ObjetivoAula | null {
  const t=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  if (/emagrec|perder peso|queimar calorias|condicionamento/.test(t) && !/nao (?:quero |preciso |busco )?(?:emagrec|perder peso|queimar calorias)/.test(t)) return "emagrecer";
  if (/(?:gastar|queimar|gaste|gasta|gastar a|gaste a)\s+energia|extravasar|mais ativo|mais ativa/.test(t) && !/nao (?:quero |preciso |busco )?(?:gastar|queimar) energia/.test(t)) return "energia";
  if (/ludic|brincar|coordenacao|disciplina/.test(t)) return "ludico";
  if (/defesa pessoal|me defender|se defender|autodefesa/.test(t)) return "defesa";
  return null;
}
export function recomendarObjetivo(objetivo: ObjetivoAula | null | undefined, idade: number | null, crianca: boolean) {
  if (!objetivo) return null;
  if (crianca && idade === null && objetivo !== "ludico" && objetivo !== "energia") return null;
  if (objetivo === "energia" && (crianca && idade === null || idade !== null && idade < 18)) return {modalidade:"Taekwondo",explicacao:"Para gastar energia, recomendo Taekwondo! O treino é dinâmico e trabalha coordenação, disciplina e confiança de forma divertida."};
  if (objetivo === "ludico" || idade !== null && idade < 12) return {modalidade:"Taekwondo",explicacao:crianca || idade !== null && idade < 18 ? "Para a criança, recomendo Taekwondo! As atividades lúdicas trabalham coordenação, disciplina e confiança de forma divertida." : "Para seu objetivo, recomendo Taekwondo! O treino trabalha coordenação, disciplina e confiança de forma dinâmica."};
  if (objetivo === "emagrecer" || objetivo === "energia") return {modalidade:"Muay Thai",explicacao:"Para seu objetivo, recomendo Muay Thai! O treino combina técnicas e exercícios funcionais, aumentando o gasto calórico e trabalhando o condicionamento."};
  return {modalidade:"Jiu-Jitsu",explicacao:"Para seu objetivo, recomendo Jiu-Jitsu! Você aprende técnicas de controle, escapes e defesa pessoal, respeitando seu ritmo."};
}
export function alternativasPorObjetivo(objetivo: ObjetivoAula | null | undefined, principal: string) {
  if (objetivo !== "emagrecer" && objetivo !== "energia" && objetivo !== "defesa") return [];
  return ["Muay Thai", "Jiu-Jitsu", "Taekwondo"].filter(m=>m!==principal);
}
export function explicarBeneficioObjetivo(objetivo: ObjetivoAula | null | undefined, modalidade: string, idade: number | null, crianca: boolean, principal?: string) {
  const recomendacao=recomendarObjetivo(objetivo,idade,crianca);
  if (recomendacao?.modalidade===modalidade) return recomendacao.explicacao;
  if (objetivo==="defesa") {
    const defesa:Record<string,string>={"Muay Thai":"trabalha golpes, movimentação e noção de distância, habilidades úteis para defesa pessoal", "Taekwondo":"trabalha chutes, movimentação e controle de distância, habilidades úteis para defesa pessoal"};
    return defesa[modalidade] ? `${principal ? `Minha primeira indicação é ${principal}. ` : ""}Uma opção é ${modalidade}: o treino ${defesa[modalidade]}.` : "";
  }
  if (objetivo!=="emagrecer" && objetivo!=="energia") return "";
  const beneficios:Record<string,string>={"Muay Thai":"combina técnicas e exercícios funcionais, trabalhando o condicionamento e o gasto de energia", "Jiu-Jitsu":"trabalha movimentação, força e condicionamento, contribuindo para o gasto de energia", "Taekwondo":"tem movimentos dinâmicos que trabalham coordenação e condicionamento, contribuindo para o gasto de energia"};
  if (!beneficios[modalidade]) return "";
  const beneficio=`${beneficios[modalidade]}${objetivo==="emagrecer" ? ", o que pode ajudar no emagrecimento" : ""}`;
  return principal ? `Minha primeira indicação é ${principal}. Uma alternativa é ${modalidade}: o treino ${beneficio}.` : `Uma opção é ${modalidade}! O treino ${beneficio}.`;
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
