# Conversas e galeria de veículos

Correção restrita ao fluxo de veículos: o efeito de rolagem da conversa não retorna mais o resultado de scrollIntoView como limpeza de efeito React. A falha foi reproduzida no CRM publicado e a mesma conversa abriu após o ajuste, com histórico e anexos. Evidência local: /tmp/crm-conversa-corrigida.png.

A preparação de mídia deixou de limitar cada veículo a duas fotos. Usa até dez anexos por resposta, com continuação para os restantes e deduplicação pela URL. Considera como entregues apenas mensagens enviadas ou URLs registradas como enviadas individualmente. Cada anexo do Instagram recebe confirmação local após sucesso da API. Falhas e pendências não esgotam a galeria.

A resposta sobre fotos passa a ser determinada pela galeria real, sem afirmar envio completo com base apenas na saída do modelo. A frase “Só tem essas fotos?” resolve o veículo da oportunidade quando o planejador omite os IDs. Pedidos explícitos para reenviar permitem repetir imagens. Fotos antigas já enviadas continuam no histórico, sem alteração retroativa.

Validação: 270 testes passaram; compilação backend/frontend e TypeScript sem erros. Não foram enviadas mensagens de teste a clientes reais.

## Confirmação natural e reenvio

Eventos de 02/11 às 19:23 e 19:25 mostravam respostas apenas em texto, com media vazio. O reconhecedor de mídia não aceitava “Gostaria sim” nem interpretava “Não chegou” como reenvio contextual. Agora aceita confirmações naturais após oferta de fotos, resolve o veículo mais recente da conversa e prepara novamente anexos quando o cliente informa não recebimento. Recusas explícitas bloqueiam a seleção de anexos. Promessas de envio sem anexos são substituídas por uma pergunta de identificação do veículo.

Validação: 277 testes passaram; teste com Gemini real preparou três fotos do HB20 para “Gostaria sim” e três para “Não chegou”, sem escrita no banco ou mensagens reais.

## Reenvio por sentido e veículo explícito (03/11)

O planejador agora retorna intenção de mídia (send/resend/more/none). “Cadê as fotos?” é não recebimento; “enviasse novamente” é reenvio contextual, mesmo sem repetir a palavra foto. O veículo citado no turno atual prevalece sobre a seleção anterior. A última seleção de mídias é mantida no chat para continuidade entre turnos, com releitura da disponibilidade antes de preparar anexos.

Validação: 285 testes passaram. Gemini real, em base isolada, preparou três fotos do HB20 para “Cadê as fotos?” e nove fotos da Ferrari para “Gostaria que enviasse novamente da Ferrari”, sem pergunta redundante, sem mensagens reais e sem alteração do banco.
