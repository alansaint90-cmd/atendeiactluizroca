import { numerosDaFala } from "../consultas/linguagem";

export function idadesNegadas(texto: string) {
  return [...numerosDaFala(texto).matchAll(/\bnao\s+(?:tenho|tem|possuo|possui|e|sao)\s+(\d{1,3})(?![.,/:]\d)(?=\s*(?:anos?\b|aninhos\b|[,;.!?]|$))/g)].map(m=>Number(m[1]));
}

/** Número isolado só é idade quando a etapa anterior aguardava esse dado. */
export function idadeParticipanteInformada(texto: string, aguardandoIdade=false): [string,string]|null {
  const t=numerosDaFala(texto),negadas=idadesNegadas(texto);
  if(/^(?:qual|quais|quanto|quantos|a partir|posso|se\b)|\b(?:ou|idade minima|por exemplo|se (?:eu|ele|ela))\b/.test(t))return null;
  const candidatos:RegExpMatchArray[]=[...t.matchAll(/\b(\d{1,3})\s*(?:anos?|aninhos)\b/g),
    ...t.matchAll(/\b(?:tenho|tem|possuo|possui|estou com|esta com|idade(?: e| de|:)?)[ :]+(\d{1,3})(?![.,/:]\d)(?=\s*(?:anos?\b|aninhos\b|[,;.!?]|e\b|$))/g)];
  if(aguardandoIdade) {
    const isolada=t.match(/^(?:(?:ele|ela|eu)\s+)?(?:de\s+)?(\d{1,3})\s*(?:a|anos?|aninhos)?[.!\s]*$/);
    if(isolada)candidatos.push(isolada);
  }
  const valores=[...new Set(candidatos.filter(m=>!(/^\d/.test(m[0]) && /\d[/:.,-]\s*$/.test(t.slice(0,m.index))) && !negadas.includes(Number(m[1])))
    .map(m=>Number(m[1])).filter(n=>n>=0 && n<=120))];
  return valores.length===1?[texto,String(valores[0])]:null;
}

export function idadePropriaInformada(texto:string) {
  return /\b(?:eu\s+)?(?:tenho|possuo|estou com)\b|\bminha idade\b/.test(numerosDaFala(texto));
}

/** Só acrescenta contexto interno; a mensagem original continua no histórico. */
export function contextualizarRespostaIdade(texto:string,historico:{role:string;content:string}[]) {
  if(idadeParticipanteInformada(texto))return texto;
  const pergunta=historico.findLast(t=>t.role==='assistant')?.content ?? '';
  if(!/(?:qual|que)\s+(?:(?:é|e|a|sua)\s+)*idade|quantos\s+anos|nome.{0,35}\be\s+(?:a\s+)?idade/iu.test(pergunta))return texto;
  const idade=idadeParticipanteInformada(texto,true);
  return idade ? `${texto}\nIdade informada: ${idade[1]} anos.` : texto;
}

export const ORIENTACAO_LINGUAGEM_CT="IDADE E DATA — 22/11/2026: aceite variações naturais como 'eu tenho 23', 'tenho vinte e três', '23 anos' e, após perguntar a idade, '23' ou 'vinte e três'. Idade explícita da própria pessoa identifica o participante; não repetir a pergunta nem perder a modalidade conhecida. Número isolado só é idade na etapa que aguardava esse dado, nunca número de opção, horário ou dia do mês. Preserve a idade real e a exigência de responsável para menores; não invente idade ou nascimento. Datas podem vir por extenso, com barras, pontos, hífens ou expressões relativas; use o calendário atual do CT e consulte a data real antes de reservar. Dia sem mês usa o mês atual; se já passou ou não existe, peça esclarecimento. Idades ou datas ambíguas pedem esclarecimento, sem adivinhar nem criar reserva.";
