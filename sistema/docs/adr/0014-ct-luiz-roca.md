# ADR: Adaptação para o CT Luiz Roca

Data: 11/11/2026. Escopo: checkout do Atende Aí para academia de artes marciais.

A grade médica não representa aulas em grupo. Foram criadas as tabelas aditivas `atendeia_aulas` e `atendeia_aulas_reservas`, preservando o histórico herdado. A migração `0015_adorable_shape` não modifica tabelas antigas. A grade é cadastrada por aula/data, sem recorrência automática, com modalidade, turma, professor, capacidade e faixa etária. A reserva bloqueia a aula na transação, valida lotação e duplicidade, exige responsável para menor e registra auditoria sem dados pessoais. Cancelamento usa trava de atualização e conserva o registro.

As actions `carregarAgendaAulas`, `cadastrarAula`, `confirmarAula` e `cancelarAula` exigem sessão de gerente ou superior. O dashboard e o menu usam essa agenda. A montagem de configuração do agente desativa a agenda médica. A ferramenta de aulas ainda não está conectada ao agente do WhatsApp; reservas reais são feitas pela equipe no painel. O prompt nunca confirma por texto livre.

Todos os menus podem ser avaliados em `/previa-design`, disponível somente em desenvolvimento com `ATENDEIA_PREVIA_LOCAL=true`. O armazenamento de teste é independente, validado e explícito; não substitui o PostgreSQL de produção e não é importado automaticamente. Campanhas, follow-ups, mensagens, equipe e planos locais são cadastros de teste sem disparos, credenciais ou cobranças. O login local mostra a identidade do CT e dá acesso explícito à prévia, sem simular autenticação.

O modelo de chatbot inclui o prompt oficial solicitado. Chatbots existentes no servidor não são sobrescritos. Modalidades, valores, endereço, regras e horários oficiais precisam ser cadastrados pelo CT. Integrações e credenciais não foram copiadas da instalação de origem.
