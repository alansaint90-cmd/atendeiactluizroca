export function idadesNegadas(texto: string) {
  return [...texto.matchAll(/\bn[aã]o\s+(?:tenho|tem|possuo|possui|[eé]|s[aã]o)\s+(\d{1,3})\s*anos\b/giu)].map(m=>Number(m[1]));
}
export function idadeParticipanteInformada(texto: string) {
  const negadas = idadesNegadas(texto);
  return [...texto.matchAll(/\b(\d{1,3})\s*anos\b/giu)].find(m=>!negadas.includes(Number(m[1]))) ?? null;
}
