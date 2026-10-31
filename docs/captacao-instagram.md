# Captação automotiva por comentários do Instagram

## Funcionamento

Em Conexão Instagram, a oficina configura Captação por comentários, seleciona todas as publicações ou vincula publicações recentes a campanhas, define palavras-chave opcionais e um limite próprio por hora. Configuração e resultados ficam no namespace privado `automotiveOperations/{store}/instagram/acquisition` e `instagramLeads`, acessíveis pela API autenticada do proprietário e somente para o nicho automotivo.

O webhook assinado diferencia comentários automotivos da automação de links de afiliados. Para comentário elegível de uma conta autorizada, a IA classifica interesse comercial e redige uma mensagem de qualificação. Ela recebe o comentário e o contexto da publicação como dados, não como instruções. Não promete aplicação, preço, estoque, prazo ou reserva. Elogios isolados, emojis, spam, recusa e reclamações não iniciam a abordagem de vendas. Não há moderação ou exclusão automática de comentários.

A primeira mensagem privada usa `recipient.comment_id`. Somente após a confirmação de entrega pela API é enviada uma resposta pública avisando do Direct. O cliente precisa responder para abrir a janela normal de mensagens e continuar o chatbot existente. Comentários e respostas públicas aparecem com identificação no histórico; o sincronizador da caixa de entrada não converte comentário público em `lastInboundAt` do Direct.

A primeira captação e a mais recente ficam no chat. A origem inclui publicação, comentário, legenda, link, campanha e horário. A qualificação é sincronizada com o CRM depois do Direct confirmado e reaproveitada quando o cliente responde. O carro mostrado na publicação não é tratado como carro do cliente. Campanha paga é uma declaração da oficina ao vincular publicação; não se presume que todos os comentários do post vieram do anúncio. A referência ADS de um Direct é salva quando a Meta fornece `ad_id`, sem inventar nome de campanha ou conjunto de anúncios. Tráfego orgânico não é classificado como `paid_traffic`.

## Proteções e limites

- Automação desativada inicialmente; requer Direct ativo, permissão de comentários concedida e assinatura de `comments` na conta e no app Meta.
- Renovação OAuth solicita `instagram_business_manage_comments` para o nicho automotivo. A conexão existente não ganha essa permissão silenciosamente. O botão Verificar permissão apenas confere permissões já concedidas e atualiza a assinatura da conta.
- Uma tentativa de abordagem por contato a cada 24 horas; um Direct recente não bloqueia uma nova solicitação expressa no comentário. Tomada humana e horário configurado são respeitados.
- Orçamento próprio por hora, deduplicação de comentário e trava compartilhada com o Direct. Créditos são conferidos antes da redação.
- Revalidação antes do envio. Timeout ambíguo fica como entrega não confirmada e não é reenviado automaticamente. Uma interrupção no estado Enviando exige revisão. Falha de CRM ou resposta pública não repete o Direct.
- Não há disparo em massa, leitura de comentários de terceiros, raspagem ou recuperação retroativa de comentários antigos. A automação processa eventos novos entregues pelo webhook.
- A API com Instagram Login não oferece acesso geral a anúncios. Posts impulsionados só são cobertos quando seus comentários chegam como eventos da publicação. Anúncios exclusivos/dark posts podem exigir integração com Facebook Login/Marketing API, permissões e validação separadas. Não há criação de anúncios, consulta de gasto nem cálculo de ROAS.
- A lista carrega até 100 publicações recentes e mostra até 50 captações recentes; não representa relatório completo de conversões.

## Validação

Testes usam Meta, IA e CRM simulados: assinatura, isolamento entre nichos/contas, ordem Direct → comentário, interesse, janela privada, tomada humana, limite, deduplicação, falhas ambíguas, origem e autenticação. Testes de redação real usam somente exemplos fictícios; não enviam mensagens nem publicam comentários.

A verificação de autorização exige os escopos efetivamente retornados no OAuth. Ler mídia/comentários públicos NÃO comprova a permissão de gerenciamento. Tokens antigos sem os escopos registrados exigem renovação. Não usa a rota de permissões do Facebook Login. IDs de Instagram não são tratados como telefone para disparar eventos de conversão CAPI; a origem é mantida no CRM sem inventar uma identidade telefônica.

A origem de anúncios também pode chegar em um evento `messaging_referral` separado da mensagem. Esses eventos são armazenados em `instagramReferrals` e aplicados à próxima mensagem (até 7 dias), ou a um chat já existente. Um evento de referência sozinho não cria chat, não abre janela de Direct, não dispara IA e não envia abordagem. O campo foi conferido como Assinado no painel Meta. A classificação ignora interesse em software/outros nichos, relevante porque a conta atual de testes é @iapedido e suas publicações divulgam o software. A conta ainda não foi trocada por um perfil próprio da Flow Garage.

## Diagnóstico de 31/10/2026

Comentário de teste publicado às 06:20:56 UTC foi localizado pela API de mídia, mas não havia evento correspondente no banco nem entrega HTTP ao webhook. O teste fictício enviado pelo painel Meta chegou com sucesso. Em Permissões e recursos, `instagram_business_manage_comments` ainda aparecia como Adicionar; foi incluída no app. A validação anterior havia confundido leitura pública com autorização de gerenciamento e foi corrigida para exigir escopos de OAuth. Renovar a mesma conta preserva ativação e regra 24h do Direct. A autorização de comentários precisa ser concluída pela conta antes de considerar a integração validada com comentário real. Não foi reenviado o comentário antigo nem publicada resposta manual.

### Interesse explícito e revisão de classificação

Pedidos explícitos de preço/orçamento de escape, escapamento, downpipe ou peças relacionadas têm uma verificação determinística de interesse comercial. Erro na marca (ex.: “porshe”) e legenda de software não anulam uma solicitação automotiva explícita. Recusa de contato, reclamação, spam e venda de terceiros não acionam esse recurso. Se o classificador recusar indevidamente ou a geração falhar nesse caso inequívoco, a mensagem de qualificação usa uma pergunta segura sobre modelo/ano, sem preço ou promessa técnica.

Uma revisão administrativa pode criar um evento privado `automotive_comment_review` com `targetEventId` e `storeId`. A revisão só reabre classificação ignorada por `no_commercial_interest`, sem início de envio, da mesma oficina. Reutiliza o evento, a trava e os IDs de mensagens originais. A revisão possui ID estável e não reenvia mensagens com entrega já tentada. Nenhuma API pública de reenvio foi adicionada.
