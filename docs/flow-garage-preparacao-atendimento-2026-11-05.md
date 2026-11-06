# Preparação do atendimento da Flow Garage — 05/11/2026

## Amostra e estado

Leitura de 36 conversas Instagram, até 25 mensagens recentes por conversa (151 mensagens ao todo). Inclui histórico de testes anteriores; os achados são qualitativos, não uma taxa de conversão. IA conectada e desativada durante a revisão. Textos brutos foram processados em arquivo temporário privado, fora do repositório, removido após a análise. Nenhum contato recebeu mensagem de teste.

## O que os clientes procuram

- Preço de catback/escape visto em publicação, frequentemente sem nome do produto no texto.
- Configuração para carro específico, com ano, geração e preparação existentes.
- Ronco mais intenso ou discreto, com dúvidas sobre downpipe, remap e abafadores.
- Vídeo da aplicação exata; comparação com configuração de um carro anterior.
- Origem de fabricação, instalação, localização e envio para outra cidade.
- Continuidade de pedido/retirada e conversa com mais de um veículo.
- Elogios e interações sociais sem intenção imediata de orçamento.
- Atendimento em inglês.

## Lacunas prioritárias do cadastro

O catálogo consultado contém apenas dois exemplos de alimentação, excluídos do atendimento de performance. Não há produto de escapamento ativo utilizável como fonte confirmada. Não foram criados produtos nem preços a partir de mensagens de clientes.

Priorizar famílias de produto (catback, downpipe/coletor, X-pipe, ponteiras), com variantes/aplicações validadas e vínculo aos projetos publicados. Preencher: marca/modelo/geração/motor/anos; material e configuração; controle das válvulas; origem de fabricação; preço e o que inclui; instalação/frete separados; condições de prazo/garantia; fotos e vídeo identificados por aplicação. “Não cadastrado” não significa “nunca produzido”.

O prompt anterior continha condições gerais sobre materiais, soldagem, garantia, prazo, pagamento e acionamento das válvulas. Sua aplicabilidade atual não foi comprovada pela amostra. Foram retiradas das promessas do atendimento e devem ser validadas por produto/aplicação. O texto anterior é preservado em backup privado antes da atualização.

## Ajustes

Diretrizes revisadas específicas da loja: reaproveitar dados recebidos; reconhecer correções e segundo veículo; distinguir catálogo, carro do cliente e conteúdo compartilhado; responder a dúvida antes de qualificar; uma pergunta útil por turno; não prometer orçamento/ação sem ferramenta; responder em inglês quando apropriado; não transformar elogios em formulário. Sem personificação do atendente humano.

A configuração `aiDmReadinessVersion: 1`, habilitada somente nesta loja, remove a dica de áudio acrescentada automaticamente e aplica proteção de elogios e de fabricação não confirmada. O guard de fabricação exige `automotiveBusinessFacts.manufacturingVerified`; não é preenchido automaticamente. Confirmar a origem não valida prazo, preço ou garantia.

Também corrigidos: perguntas técnicas/reputação não abrem listagem de catálogo; contexto de post compartilhado consulta a conexão mesmo sem aquisição por comentário. Demais nichos não recebem o prompt da Flow Garage.

## Validação

65 testes de regressão e TypeScript passaram. Oito turnos sintéticos com IA real passaram nas verificações de ausência de preços inventados, mídia inexistente, protocolo de ferramenta exposto e dica automática de áudio; a conversa preservou os dados já informados. Simulação isolada usa a função real de atendimento com banco em memória, empresa e cenários fictícios, e bloqueia destinos de envio. Somente APIs de IA são permitidas; não usa a amostra privada de DMs. O teste inicial com contexto da loja foi rejeitado pela revisão automática e não foi executado com acesso externo; a alternativa remove esses dados.

Cenários: orçamento com veículo/preparação já informados, mudança de preferência, gerações distintas, fabricação/prazo/garantia, inglês, elogio e preço de publicação não identificada. Relatório de respostas sintéticas em arquivo temporário. IA do Instagram permanece desativada; catálogo precisa ser alimentado e as condições comerciais confirmadas antes de ativar.
