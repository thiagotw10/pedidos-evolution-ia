# Zionic × iaPedido: oportunidades de produto

Data: 01/11/2026. Referência pública: https://zionic.app/.

## Escopo e confiança

Foi inspecionada a interface pública carregada no Chrome, incluindo demonstrações de automações, agentes, campanhas, distribuição, pipeline, tarefas e Ads Insights. Esses exemplos demonstram a apresentação comercial do produto; não comprovam o funcionamento do backend nem resultados reais de clientes. Não foi criada conta nem enviada mensagem, campanha ou formulário.

REA foi utilizado conforme a skill Reverse Engineer Anything. A observação CDP não estava disponível em http://127.0.0.1:9222 (endpoint_unreachable). Também foi analisado estaticamente o arquivo público https://zionic.app/assets/DWgv6OKb.js: 22.417.459 bytes, SHA-256 e08feaf4b8d313940072e2756a510669f33fa2a90afe43f929bf4fb006aed9eb. O parser retornou cobertura parcial, uma falha de análise e zero módulos reconstruídos. Não é evidência de ausência de funcionalidades nem de erro do site. Não se inferiu execução nem arquitetura interna a partir desse resultado.

Evidência REA da análise retida: ev_37e11fdc70d9b85cc39f7351db6b480542bf2704a62fe630ca3542dec91236d3. Visão resumida: ev_b429d1df7f87a054b6a7e44e1762f37b615f8f1e61bab1db1018b8636dc374ad.

A comparação do iaPedido considera o código presente no workspace, com busca delimitada em inbox.ts, instagramAcquisition.ts, instagramStudio.ts, automotive.ts, automotiveOperations.ts, internalConsultation.ts, metaCapi.ts, index.ts e telas relacionadas. Ausência em buscas delimitadas foi tratada como funcionalidade não localizada, não como prova de inexistência em todo o projeto.

## O que já existe e deve ser aproveitado

- Atendimento em WhatsApp e Instagram, comentários com Direct e confirmação pública, catálogo contextual, controle manual da conversa e espelhamento das mensagens.
- Captação por publicação, produto, objetivo e palavras-chave; diagnósticos de envio e motivos de descarte.
- CRM de projetos automotivos, etapas, orçamentos, atribuição de origem e integração CAPI.
- Garagem com boxes e reservas, kits, estoque, CEP e consultas internas com retorno ao cliente.
- Campanhas com execução agendada; ainda não se identificou no fluxo examinado um editor geral de jornadas com condições e esperas por evento.
- Central de conteúdo, agendamento e métricas do Instagram, e resumo condicional no Início mobile/web.
- Segmentação para oito nichos e configuração do atendimento.

## Oportunidades priorizadas

| Prioridade | Referência apresentada no Zionic | Aplicação no iaPedido | Base atual e trabalho necessário |
|---|---|---|---|
| 1 | Campanhas com espera, resposta e ramificação | Recuperar orçamento parado; continuar somente enquanto o projeto estiver aberto e parar quando houver resposta, recusa, venda ou tomada humana | Aproveitar projetos, mensagens e agendadores; criar um motor durável de jornadas por contato, regras por canal, idempotência e histórico de cada decisão |
| 1 | Transferência entre canais com contexto | Continuar no WhatsApp o projeto iniciado no Instagram sem perguntar tudo de novo | Criar identidade unificada e vínculo confirmado com código/link; não associar pessoas por nome ou foto. Preservar veículo ativo, referências, orçamento e origem |
| 1 | Tarefas, prioridades e filas | Uma fila de ações: orçamento para revisar, equipe ainda não respondeu, cliente aguardando instalação, conversa sem responsável | Reaproveitar consultas internas, chats e garagem; criar tarefas vinculadas, responsável, prazo e escalonamento |
| 2 | Fluxos visuais de automação | Jornadas prontas de orçamento, instalação, entrega e pós-venda que o dono consegue visualizar e ajustar | Construir primeiro modelos e executor confiável; o editor visual vem sobre esse mesmo motor, com simulação e logs |
| 2 | Distribuição de leads | Encaminhar vendas à equipe comercial e dúvidas técnicas ao Pedro; manter o mesmo responsável para o contato | Exige contas de equipe, papéis e autorização por empresa. Rotas atuais do inbox usam o UID do dono como empresa; não basta adicionar um campo de vendedor na interface |
| 2 | Ads Insights e links rastreáveis | Identificar criativo que gera orçamento e venda e comparar custo por lead e por projeto fechado | Há atribuição e CAPI; integrar Marketing API para custos e campanhas. Distinguir valores de propostas aprovadas de pagamentos recebidos antes de chamar um indicador de receita ou ROAS |
| 2 | Agentes com conhecimento e ferramentas específicas | Especialistas internos de vendas, operação e pós-venda, mantendo uma conversa e memória coordenadas | Reutilizar ferramentas existentes, delimitar permissões e exigir fatos de catálogo/estoque/agenda. Exibir origem das informações e motivo de escalonamento |
| 3 | CRM visual para vários negócios | Funis configuráveis para novos nichos, com campos, tarefas e automações por etapa | Generalizar a experiência de projetos sem apagar as particularidades da oficina |
| 3 | Live Chat e páginas de captação | Atender também no site da loja e criar páginas específicas por campanha/projeto | Aproveitar vitrine e catálogo públicos e o mesmo atendimento; mapear origem e consentimento do contato |
| 3 | Várias conexões por empresa | Um cliente administrar mais de um Instagram ou número com equipe e regras próprias | Evolução do modelo atual, vinculado a uma conexão Instagram por empresa. Isolar credenciais, agenda, origem e roteamento por conta |

## Primeiro fluxo recomendado para a Flow Garage

1. Interesse em publicação de projeto → identificar o veículo real e a intenção do cliente.
2. Consultar catálogo, kit, instalação e prazo nas fontes cadastradas.
3. Gerar ou encaminhar orçamento e registrar a próxima ação.
4. Se faltar informação técnica, abrir consulta interna com prazo e responsável; retomar somente com resposta factual.
5. Se o cliente parar após receber o orçamento, executar recuperação configurada no canal permitido, sem mensagens duplicadas.
6. Quando houver resposta, recusa, fechamento ou atendimento humano, cancelar as ações pendentes correspondentes.
7. Associar a venda ao conteúdo de origem e registrar pagamento separadamente da aprovação do orçamento.

## Decisão de produto

O maior diferencial está em concluir o atendimento da oficina com informações reais. A referência do Zionic ajuda principalmente na orquestração: estados claros, tarefas, responsável, acompanhamento de cada jornada e retorno comercial por conteúdo.

Não priorizar um construtor geral de landing pages, uma vitrine extensa de modelos de IA ou uma nova coleção de canais antes de fechar o circuito interesse → orçamento → acompanhamento → instalação/entrega → pós-venda. O módulo genérico pode ser expandido depois, preservando essa especialização da Flow Garage.

## Entrega paralela concluída nesta análise

O resumo do Instagram no Início foi publicado em https://iapedido.web.app/?tab=home. Conferido em produção com @promoisashopee: status da IA pausada, métricas salvas da conta, conversas daquele Instagram e conteúdo recente. No celular a apresentação é compacta; no web mostra até três publicações. Nenhuma IA foi ativada nem conteúdo foi publicado no Instagram durante a validação.
