# Gateway comum do atendimento

WhatsApp, Instagram Direct e simulador usam `prepareAiGateway` para segurança do texto, triagem do Jev e seleção do modelo antes de reservar créditos ou gerar a resposta. Não se repetem essas consultas dentro do motor compartilhado. Os eventos do Instagram guardam a decisão para aproveitar as tentativas de entrega, sem gerar ou cobrar de novo quando o plano de envio já existe.

A política usa DeepSeek Flash para conversas comuns quando configurado; mídia, consultas operacionais, contexto pessoal de endereço e alta complexidade seguem para Gemini 3.1 Flash-Lite. O simulador aplica a mesma política e simula pedidos de equipe sem enviar notificações reais. WhatsApp e Instagram pausam a IA e avisam a equipe quando o atendimento precisa de uma pessoa. A confirmação não promete tempo de resposta.

## Saída

Respostas generativas passam por regras locais e uma revisão semântica de classificação pelo Jev. A revisão recebe contexto limitado e fatos atuais do cadastro, produtos, orçamento do projeto ativo e resultados operacionais. Histórico é contexto de conversa e não comprova estoque, preço, compatibilidade ou reserva. O revisor só aprova ou classifica o problema: não escreve correções nem executa ferramentas.

As regras locais tratam confusão entre endereço do cliente e da empresa, afirmações de reserva/estoque/prazo sem suporte, preços sem orçamento autorizado, links fora do cadastro e indícios de vazamento. Os valores de referências automotivas não se tornam preços aprovados: considera-se o orçamento do projeto ativo no estado comercial adequado e pertencente à mesma empresa e contato.

Operações reais usam o texto exato do resultado da ferramenta, com validação local. Navegação do catálogo e respostas de afiliados usam dados cadastrados e validação local; não se atribui a essas respostas um modelo conversacional. Comentários passam pela segurança comum, mantendo a classificação comercial específica em Gemini 2.5 Flash e os controles atuais de elegibilidade e entrega. A resposta pública configurada pelo proprietário permanece literal e só é enviada após a DM confirmada.

Quando uma resposta é substituída, mídias e localização associadas são retiradas. A resposta substituída é a que fica no histórico enviado ao cliente; referências bloqueadas não são marcadas como mostradas. A validação de saída não desfaz operações válidas já executadas: consentimento, estoque e capacidade continuam protegidos nas transações operacionais.

## Falhas e rastreabilidade

Se o Jev ficar indisponível, mantêm-se as regras locais e a rota de contingência. O registro distingue `local_degraded` de aprovação pelo Jev. Essa contingência não oferece revisão semântica completa. Áudio/imagem continuam com o processamento multimodal; o filtro de entrada analisa o texto disponível, não interpreta diretamente conteúdo binário.

Mensagens compartilhadas registram `aiGateway`: canal, rota, modelo selecionado, modelo efetivamente usado (incluindo fallback), origem da segurança/triagem, revisor, motivo e se houve correção. Respostas por regras e operações têm `actualModel: null`. Os metadados não incluem chaves de API. Modelos auxiliares de tradução, voz e classificação não são o modelo conversacional registrado.

## Verificação

Testes cobrem paridade entre canais, uma triagem por tentativa, bloqueio antes de cobrança/geração, contexto pessoal, preço, prazo, estoque e reserva, indisponibilidade do revisor, evidência de operação real, pausas e confirmação única de encaminhamento humano no Instagram. Um teste remoto com mensagens fictícias confirmou a triagem do Jev e a rejeição de uma promessa de instalação sem agenda. Nenhuma mensagem de teste foi enviada a clientes.

### Aceitação de horário informado pela equipe

Um retorno interno enviado não é uma reserva na agenda. Quando a última resposta da IA é uma oferta de horário da equipe e o cliente responde afirmativamente, o resolvedor operacional preserva essa oferta e cria uma única consulta de confirmação final, vinculada à consulta/versão original. A resposta ao cliente reconhece o horário escolhido sem solicitar outra data nem afirmar que a reserva já existe. O fluxo valida entrega, janela de 24 horas, veículo e projeto; uma pergunta posterior invalida a associação de um “sim” com a oferta antiga. O conteúdo da proposta é mantido na consulta para a equipe concluir o atendimento. Não há reenvio retroativo de mensagens.

A continuidade também reconhece uma pergunta posterior de confirmação que repita a mesma data e hora da oferta oficial. A mensagem gerada não se torna fonte de disponibilidade: a fonte continua sendo a consulta interna entregue. Para recuperar o antigo ciclo “Qual consulta você quer fazer”, exige-se no histórico uma resposta afirmativa ao pedido de confirmação com a mesma data/hora. Perguntas de outros assuntos ou horários diferentes não autorizam aceitação. “Instalação” sozinho é uma solicitação operacional válida; uma ferramenta sem resultado encaminha a consulta com o contexto atual, em vez de repetir um menu genérico. Promessas geradas de reservar após um SIM também passam pela proteção local, mesmo com o revisor remoto indisponível.

### Andamento do projeto e retirada

Perguntas sobre o andamento do próprio carro são resolvidas antes do catálogo, lendo `automotive_projects` pelo projeto ativo e validando estabelecimento e contato de origem. A resposta informa a etapa atual, `serviceUpdate` (informação pública) e `completionForecast` (previsão registrada pela oficina). Notas internas e prazo genérico do orçamento não são usados como previsão real. Sem previsão, a resposta declara essa ausência.

A ficha oferece os campos públicos e a etapa explícita `Pronto para retirada`, distinta de `Concluído` e `Enviado`. Há ações de recebimento, liberação de retirada e entrega no quadro. Novas reservas da garagem guardam o projeto de origem; os eventos reais `installing`, `ready` e `completed` sincronizam o projeto correspondente, com validação de loja e contato.

O gatilho `automotiveProjectProgress` envia avisos de início, mudança da previsão e liberação de retirada, apenas em novas transições. Não retroage sobre projetos já na etapa. Cada evento é adquirido uma única vez, espelhado na conversa e protegido contra reenvio em falha ambígua. Mudanças posteriores, atendimento humano, falta de conversa ou janela encerrada impedem o envio. A janela encerrada do Instagram gera aviso interno para a equipe, sem tentar contornar o canal. Movimentação de etapa deve representar um fato da oficina; reconhecimento automático por câmera ainda não é a fonte desses eventos.

### Cobrança de memória não é transferência

A urgência isolada e reclamações de baixa confiança não pausam a IA. Pedidos explícitos de atendimento humano continuam prioritários; inferências de pedido humano exigem confiança mínima de 85%, e reclamação com urgência exige 90%. Perguntas de continuidade (“já não conversei com você?”, “não lembra de mim?”) permanecem com a IA, salvo pedido explícito de pessoa. A decisão `handoff` fica registrada com motivo; pausas novas recebem `aiPausedReason=gateway_handoff`, evitando conservar um motivo manual antigo.

Saudações e cobranças de memória com um projeto próprio vinculado retomam o estado real desse projeto antes da geração e do catálogo. Não reiniciam orçamento ou reserva. Contatos novos e projetos sem vínculo comprovado mantêm o fluxo normal, sem exposição de dados.

### Conversa de catálogo e referências para terceiros

O estado de catálogo guarda o destinatário das referências (`audience`) e a oferta pendente (`pendingAction`/`pendingPrompt`). “Pode mandar” aceita a oferta imediatamente anterior; uma pergunta de outro assunto invalida esse consentimento. Se todas as referências já foram mostradas, oferece reenvio para compartilhar, sem prometer projetos inexistentes. A aceitação envia um conjunto curto de mídias reais e não reinicia a qualificação.

O tópico pode ser recuperado das mensagens do próprio cliente, inclusive de conversas anteriores à mudança. Veículo do amigo e referência de catálogo não substituem o veículo, o objetivo nem o projeto do cliente. A declaração explícita de outro carro próprio continua permitindo criar um perfil separado. O gerador recebe a etapa e os campos públicos do projeto real, acima dos resumos históricos, junto ao tópico de catálogo. O envio de catálogo não força uma pergunta de modelo/ano/versão.

### Protocolo de ferramentas e áudio

Nomes de ferramentas, pseudochamadas em colchetes e estruturas internas nunca são texto de atendimento. A resposta do provedor é verificada antes de qualquer execução. Se houver vazamento, ocorre uma única regeneração com o conteúdo original (inclusive áudio/imagem) e as declarações nativas de ferramentas. Só as chamadas estruturadas retornadas pelo provedor seguem para os executores existentes; texto não é interpretado como comando. Falha, repetição do vazamento ou promessa de mídia sem chamada válida bloqueiam essa tentativa.

O guardrail local também impede vazamento depois da execução/formatação e promessas de mídia sem anexos preparados, independentemente da disponibilidade do Jev. A auditoria registra `toolProtocolRepair` e o modelo efetivamente usado. Entradas multimodais não usam o fallback exclusivamente textual do DeepSeek, que descartaria o áudio/imagem. Foi verificada uma recuperação real de chamada nativa no Gemini 2.5 Flash com áudio sintético em português, sem executar envios.
