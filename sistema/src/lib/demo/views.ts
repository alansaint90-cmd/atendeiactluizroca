// Estes módulos ainda não possuem operação integrada. Não apresentar dados fictícios.
export const demoViews: Record<string, () => string> = {
  campaigns: () => `<article class="panel"><h1>Campanhas</h1><p>Nenhuma campanha de demonstração. Para programar um envio individual, use Agendamentos.</p></article>`,
  team: () => `<article class="panel"><h1>Equipe</h1><p>A gestão individual de usuários está em homologação. Nenhum atendente fictício é apresentado como membro da equipe.</p></article>`,
  plans: () => `<article class="panel"><h1>Minha assinatura</h1><p>A cobrança de assinaturas ainda não está integrada.</p></article>`,
};
