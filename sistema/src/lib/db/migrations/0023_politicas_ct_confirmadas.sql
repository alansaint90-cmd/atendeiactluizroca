WITH atualizadas AS (
 UPDATE atendeia_aulas SET professor=CASE WHEN professor='Equipe ZMT' THEN 'André Prado · ZMT' ELSE professor END,
 idade_minima=CASE WHEN modalidade='Muay Thai' AND turma='Geral' AND idade_minima=18 THEN 14 ELSE idade_minima END,
 updated_at=clock_timestamp(),modified_by='00000000-0000-4000-8000-000000000001'
 WHERE is_deleted=false AND (modalidade IN ('Muay Thai','Jiu-Jitsu') AND professor='Equipe ZMT' OR modalidade='Muay Thai' AND turma='Geral' AND idade_minima=18)
 RETURNING id)
 INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
 SELECT 'politicas_ct_grade_atualizada','aula',id,'["professor","idade_minima"]'::jsonb,'00000000-0000-4000-8000-000000000001' FROM atualizadas;
--> statement-breakpoint
WITH atualizados AS (
 UPDATE atendeia_chatbots b SET configuration=jsonb_set(jsonb_set(configuration,'{context}',to_jsonb(coalesce(configuration->>'context','') || E'\n\n' || 'BASE DE CONHECIMENTO DO CT LUÍS ROCA — informações gerais confirmadas em 16/11/2026:
- Avaliação física: está incluída em todos os planos.
- Formas de pagamento: cartão de débito, cartão de crédito, Pix ou dinheiro. Não informar parcelamento, descontos ou condições não cadastradas.
- Matrícula e anuidade: não há taxa de matrícula nem de anuidade. O valor do plano é o valor final, sem essas cobranças adicionais.
- Diária avulsa: R$ 35,00. Esse é o valor da diária, não o preço da aula experimental gratuita.
- Convênios: aceitamos Gympass/Wellhub e TotalPass no plano P2. Não inventar outras categorias ou regras de acesso.
- Estacionamento: disponível para os alunos.
- Link oficial para chegar ao CT: https://share.google/qpVSBDuPHiAysYIvy. Use exatamente este link; não gere busca por endereço nem use links antigos do histórico.
- Localização: R. Maria dos Réis Silva, 16 — Buraquinho, Loteamento Miragem, Lauro de Freitas — BA, CEP 42709-430. No mesmo prédio da academia Alpha Fitness Vilas 2 (Miragem), próximo aos colégios Sartre COC e Adventista.
Responda somente à dúvida feita, com mensagens curtas. Preserve a recepção da Luísa e a apresentação de apenas duas opções de aula por vez. Para horários, idades e reservas, use a agenda vigente e a ferramenta; a grade vigente determina os horários e as políticas confirmadas abaixo determinam as regras de atendimento. Não afirmar “tenho vaga” a partir de uma FAQ. Não há turma exclusivamente feminina; as turmas são mistas e respeitosas. Esta atualização não modifica mensalidades, aulas nem reservas.

CT_POLITICAS_20261119 — BASE OFICIAL CONFIRMADA EM 19/11/2026:
- feminina: Não temos turma exclusivamente feminina. As mulheres treinam nas turmas mistas, com respeito, profissionalismo e acompanhamento do professor.
- iniciantes: Pode começar, sim! Iniciantes entram nas turmas regulares, com exercícios e orientações voltados ao seu nível.
- competicao: Preparamos para competições nas três modalidades: Taekwondo, Muay Thai e Jiu-Jitsu. Os professores orientam esse treinamento.
- tamanho: As turmas costumam ter entre 10 e 30 alunos. O acompanhamento é coletivo, com as instruções e a orientação do professor.
- desconto: O desconto já está incluído no valor. Depois da experimental, você pode conversar presencialmente com a equipe para avaliar uma condição melhor para o seu caso.
- frequencia: Você se matricula em uma turma e frequenta as aulas dela. Uma vez ou outra, pode participar de outra turma da mesma modalidade, inclusive para repor uma falta.
- modalidades: A mensalidade cobre uma modalidade. Para combinar mais de uma, converse presencialmente com a equipe sobre as condições.
- experimental: A aula experimental é gratuita nas três modalidades! Cada pessoa pode fazer uma única experimental, para treinar e tirar suas dúvidas com a equipe.
- equipamentos: Venha com roupa leve e uma garrafinha de água; nas primeiras aulas não precisa de kimono ou uniforme. No Muay Thai, há empréstimo de equipamentos no início.
- documentos: Para a matrícula, leve o RG e preencha a ficha. Menores também precisam da autorização do responsável.
- idadeMuay: O Muay Thai atende adolescentes e adultos; a turma regular recebe a partir de 14 anos. Para crianças de 10 a 13, a equipe confirma antes a possibilidade de treino adaptado.
- idadeJiu: O Jiu-Jitsu infantil começa aos 10 anos, e também temos turmas para adultos. A indicação do horário considera a idade do participante.
- idadeTae: Temos Taekwondo a partir de 3 anos, com turmas infantis por idade. Para os pequenos de 3 anos, a equipe indica a turma adequada.
- adaptacao: A aula é adaptada ao seu ritmo. O professor avalia sua condição e orienta os exercícios de acordo com as suas necessidades.
- valor: O valor inclui acompanhamento e experiência dos professores, além da flexibilidade para treinar. Depois da experimental, podemos conversar presencialmente sobre as condições.
- reposicao: Pode repor, sim, sem prazo definido, em aulas da mesma modalidade. Você também pode participar ocasionalmente de outra turma dessa modalidade.
- cancelamento: Para cancelar a matrícula, é necessário aviso prévio de 30 dias. Você pode solicitar o cancelamento à equipe pelo WhatsApp.
- professorTae: O responsável pelo CT e professor de Taekwondo é Luís Roca.
- professorLutas: O professor de Muay Thai e de Jiu-Jitsu é André Prado, da equipe ZMT.
- chegada: Chegue 10 minutos antes da aula, com roupa leve e uma garrafinha de água.
- duracao: Cada aula dura uma hora.
- responsaveis: Os pais podem acompanhar a aula infantil, mas não precisam permanecer no CT. Se saírem, devem voltar no horário do término, uma hora após o início.
- alterarExperimental: Para remarcar ou cancelar sua experimental, é só solicitar pelo WhatsApp. A equipe confere sua reserva e ajuda com a alteração.
- horarioHumano: Não temos horário fixo de atendimento humano no WhatsApp. Se você quiser falar com a equipe, posso encaminhar seu nome e número para que continuem o atendimento.
As informações acima prevalecem sobre trechos antigos que diziam experimental paga/desconhecida, turma feminina pendente, professores sem nome, equipamentos ou documentos indefinidos. Não oferecer novo desconto nem nova experimental gratuita por modalidade. Uma experimental é por pessoa, preservando agendamentos de familiares distintos. A limitação por pessoa usa o cadastro conhecido; não inventar CPF ou pedir RG pelo chatbot para agendar. Cancelamento da matrícula não significa cancelar uma reserva de experimental. Pedido efetivo de remarcação ou cancelamento é encaminhado ao atendimento humano, sem afirmar que a alteração já foi feita. Não criar atendimento presencial ou transferência por texto livre: usar as ferramentas autorizadas. Para Muay Thai abaixo de 14 anos, encaminhar a avaliação à equipe antes de reservar; não dizer que a modalidade não existe. Não interpretar 60 anos como limite máximo oficial: adultos iniciantes são bem-vindos e o professor avalia a adaptação. Não anunciar horários de resposta humana nem promessa de atendimento imediato. Não há garantia de desconto presencial. A grade e o relógio atuais determinam a próxima aula, nunca a data antiga de uma mensagem.')), '{transferHuman}','true'::jsonb),
 version=version+1,updated_at=clock_timestamp(),modified_by='00000000-0000-4000-8000-000000000001'
 WHERE b.is_deleted=false AND (b.identifier ~* '(lu[ií]s|luiz)[[:space:]]+roca' OR coalesce(b.configuration->>'context','') ~* '(lu[ií]s|luiz)[[:space:]]+roca' OR EXISTS(SELECT 1 FROM atendeia_channels c WHERE c.chatbot_id=b.id AND c.instance_name='ctluizroca' AND c.is_deleted=false))
 AND coalesce(b.configuration->>'context','') NOT LIKE '%CT_POLITICAS_20261119%'
 RETURNING id)
 INSERT INTO atendeia_audit_logs(action,entity_type,entity_id,changed_fields,modified_by)
 SELECT 'politicas_ct_base_atualizada','chatbot',id,'["configuration.context","configuration.transferHuman"]'::jsonb,'00000000-0000-4000-8000-000000000001' FROM atualizados;
