export function identificarParticipante(texto: string): "adulto" | "crianca" | "outraPessoa" | null {
  const normal=texto.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
  const idade=normal.match(/\b(\d{1,3})\s*anos\b/);
  if (/\b(?:pra|para) mim\b|\beu mesm[oa]\b|\bsou eu\b/.test(normal) && !/\bnao(?:\s+\w+){0,2}\s+(?:pra|para) mim\b/.test(normal)) return idade && Number(idade[1])<18 ? "crianca" : "adulto";
  if (/\b(?:filh[oa]|crianca|menor|adolescente|bebe|net[oa])\b/.test(normal)) return "crianca";
  if (/\b(?:outra pessoa|meu marido|minha esposa|minha mae|meu pai|meu irmao|minha irma)\b/.test(normal)) return "outraPessoa";
  return null;
}
