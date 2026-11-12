# Atende Aí — CT Luiz Roca

Projeto de atendimento do Centro de Treinamento Luiz Roca, academia de artes marciais, com foco em contatos vindos de tráfego e agendamento de aulas experimentais.

O arquivo ativo é `prompt-atende-ai-ct-luiz-roca.txt`. Ele substitui o atendimento médico por um fluxo para novos alunos: acolhimento, identificação do participante e idade, modalidade, consulta de vagas, escolha, confirmação e reserva.

## Configuração necessária

Antes de usar em produção, cadastrar as modalidades, faixas etárias, endereço, fuso, turmas, preços, condições da aula experimental, políticas para menores, regras de alteração e orientações de participação. Conectar as ferramentas reais de consulta de disponibilidade, criação e consulta de reserva, cancelamento/remarcação e encaminhamento para a equipe.

Sem essas integrações, o prompt conduz a coleta de preferências e informa que o pedido depende de confirmação. Ele não cria um sistema de agenda por si só.

## Origem

O conteúdo de `C:\Users\Allan Nascimento\Documents\ChatGPT\atendeclin` foi copiado para `referencia-atendeclin/`, sem o histórico Git. A pasta de origem foi preservada. Esses arquivos são referência histórica e não devem ser carregados junto ao prompt ativo, pois contêm regras de outro negócio.

O script de auditoria histórico depende de outro projeto local e não valida este atendimento. A origem contém prompts e esse script, sem uma aplicação completa para executar ou publicar.

## Aplicação local

A aplicação Next.js foi posteriormente copiada de `atendeai dr juliana` para `sistema/`, sem credenciais e sem o histórico Git. As telas e a agenda foram adaptadas ao CT Luiz Roca.

Para iniciar a prévia: entre em `sistema` e execute `node scripts/previa-design-local.mjs`. Abra `http://127.0.0.1:8000/entrar` para ver o login ou `http://127.0.0.1:8000/previa-design` para o painel de testes. Os cadastros locais persistem no navegador; não há envio ao WhatsApp, cobrança ou criação de credenciais.

Nesta máquina, `sistema/node_modules` é um vínculo com as dependências já instaladas na aplicação de origem. O inicializador usa Webpack para suportar esse vínculo. Em outra máquina, instale as dependências do próprio checkout antes de executar.

A agenda autenticada tem backend PostgreSQL próprio para aulas e reservas, com migração aditiva. A ligação da agenda de aulas ao agente do WhatsApp ainda precisa ser implementada; o prompt solicita confirmação pela equipe. Campanhas, fluxos executáveis e planos ainda dependem de operação integrada; a prévia permite avaliar seus cadastros locais.

## Publicação no EasyPanel

Use contexto de build na raiz do repositório, Dockerfile `Dockerfile` e porta interna `3000`. O Dockerfile da raiz copia a aplicação de `sistema/` para `/app`; o Dockerfile interno continua disponível para builds cujo contexto seja a própria pasta `sistema/`.

Cadastre as credenciais somente nas variáveis de ambiente do serviço. Preencha `APP_URL` e `AUTH_ORIGIN` com a URL HTTPS pública do CT, sem barra final. `EVOLUTION_API_URL` deve conter somente a URL base, sem sintaxe Markdown. O login real exige provisionamento do administrador; a prévia local não é disponibilizada em produção.
