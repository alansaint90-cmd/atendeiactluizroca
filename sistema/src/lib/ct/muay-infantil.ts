import { modalidadeMencionada } from "../aulas/objetivo";

/** Pergunta de disponibilidade não é recusa nem autorização para reservar. */
export function perguntaMuayInfantil(texto:string,idade?:number|null) {
 const t=texto.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(modalidadeMencionada(texto)!=='Muay Thai' || idade!=null && idade>=14)return false;
 if(/\b(?:quero|prefiro|agendar|agende|marcar|reservar|reserve|confirmar)\b/.test(t))return false;
 if(/professor|instrutor|equipamento|documento|gratuit|preco|valor|beneficio/.test(t))return false;
 return /\b(?:tem|ha|existe|oferece|oferecem|infantil)\b/.test(t)
  && (idade!=null && idade<14 || /\b(?:infantil|criancas?|filh[oa]|menor)\b/.test(t));
}

export function respostaMuayInfantil(idade?:number|null) {
 return idade!=null && idade<14
  ? `Para ${idade} anos, a equipe precisa confirmar se há treino de Muay Thai adequado antes de agendar.\n\nSe quiser verificar essa possibilidade, pode pedir para falar com a equipe.`
  : "O Muay Thai regular recebe a partir de 14 anos. Para crianças, a equipe precisa confirmar a possibilidade de treino adaptado antes de agendar.";
}

export const ORIENTACAO_MUAY_INFANTIL="MUAY THAI INFANTIL — 22/11/2026: 'Não tem Muay Thai para ele?', 'Não tem aula de Muay Thai para ele?' e 'Tem Muay Thai infantil?' são dúvidas, não recusas da modalidade nem falhas técnicas. Responda com a idade já conhecida, sem reiniciar atendimento, repetir idade ou pausar a IA só por perguntar. Muay regular é desde 14; crianças de 10–13 dependem de confirmação da equipe. Para nove anos ou outra idade sem confirmação, diga que a equipe precisa verificar se há treino adequado; não invente turma infantil, vaga, aprovação ou idade mínima nova. Consulta normal permanece ativa; pedido explícito de humano usa o encaminhamento autorizado e seu aviso. Não reservar menor de 14 automaticamente: manter guardas da preparação e do banco. Não alterar reservas, grade, pausas humanas já existentes ou migrações.";
