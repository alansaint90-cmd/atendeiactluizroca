/** Informações confirmadas pelo CT; não apresentar modalidades que o lead não perguntou. */
export const PERGUNTA_RETOMADA_AGENDAMENTO='Podemos prosseguir com o agendamento?';
export function equipamentosDaModalidade(modalidade?:string|null) {
 const base="Venha com roupa leve e uma garrafinha de água.";
 if(modalidade==='Muay Thai')return `${base} No Muay Thai, há empréstimo de equipamentos nas primeiras aulas.`;
 if(modalidade==='Taekwondo')return `${base} Nas primeiras aulas de Taekwondo, não precisa de kimono ou uniforme.`;
 if(modalidade==='Jiu-Jitsu')return `${base} Nas primeiras aulas de Jiu-Jitsu, não precisa de kimono.`;
 return `${base} Nas primeiras aulas, não precisa de kimono ou uniforme.`;
}

export const ORIENTACAO_EQUIPAMENTOS_CT="ROUPAS E CONTINUIDADE — 22/11/2026: dúvidas de roupa e equipamento usam somente a modalidade explícita na pergunta ou a modalidade atual da conversa. Em Taekwondo não citar empréstimos de Muay Thai. Em Jiu-Jitsu não listar outras modalidades. Sem modalidade conhecida, dar orientação geral de roupa leve e água, sem catálogos. Se ainda há agendamento em andamento, depois da resposta enviar outro balão: 'Podemos prosseguir com o agendamento?'. Um sim retoma os dados ou a escolha que faltam, sem pedir tudo de novo e sem confirmar uma reserva por texto livre. Não enviar essa pergunta depois de reserva já concluída. Comparar modalidades somente se o cliente pedir essa comparação.";
