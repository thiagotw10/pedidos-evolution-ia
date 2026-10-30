# Afiliados & Achadinhos

Segmento `AFFILIATES`. Usar uma conta própria para o Achado da Isa: não converter a Flow Garage nem reconectar o Instagram de testes dela.

## Implementado

- Opção no cadastro e nas configurações de segmento, navegação própria (conteúdo, achadinhos, conversas e Instagram).
- Catálogo manual com link de afiliado, descrição, preço de referência opcional, imagem, URL direta do vídeo e confirmação de autorização da mídia. Produtos podem ser pausados.
- Rascunhos com legenda editável, modelo baseado nos dados cadastrados, palavra-chave e vínculo inequívoco com produto.
- Preparar container de Reel, conferir processamento e publicar explicitamente pelo login direto do Instagram. Nenhum agendamento ou geração de vídeo é anunciado nesta versão.
- Ativar/pausar resposta privada por Reel publicado pela plataforma; nunca ativa automaticamente ao publicar.
- Webhooks assinados persistidos no inbox durável existente. Comentários só são processados para contas do segmento AFFILIATES. Resposta privada usa `recipient.comment_id`, uma tentativa por comentário, até sete dias. Timeout ambíguo não provoca reenvio automático.
- Continuidade do produto no Direct quando a pessoa responde; o contexto de um comentário não abre artificialmente a janela de mensagens de 24h. Pausa humana bloqueia automação.
- Respostas do novo nicho consultam apenas produtos ativos da conta; não inventam preço atual, cupons, entrega ou disponibilidade. Nesta versão o atendimento é determinístico para localizar os links e esclarecer limites, sem geração livre de recomendações.
- Dados em `affiliateWorkspaces/{uid}/products` e `/posts`, somente acessíveis pelo servidor. Endpoints verificam token Firebase, titularidade e segmento. Tokens Meta continuam na coleção privada existente.

## Dependências externas e limitações

- Criar a conta do Achado da Isa, selecionar o novo segmento e conectar seu Instagram profissional.
- Aplicativo Meta precisa disponibilizar as permissões `instagram_business_content_publish` e `instagram_business_manage_comments` para a conta, além das permissões de mensagens atuais. Somente AFFILIATES pede escopos extras e assinatura de comentários. Contas de terceiros podem exigir análise/aprovação da Meta. O cadastro grava a confirmação dos escopos concedidos retornada por `me/permissions`.
- Shopee ainda não conectada: verificar a opção Abrir API no Portal do Afiliado e a documentação/esquema liberados para a conta antes de implementar importação e ranking de produtos. Nenhuma coleta por raspagem, atualização de preços, conversão de links nem busca de mais vendidos está ativa.
- Vídeos precisam ter URL HTTPS direta e pública e autorização para republicação. Não há download de vídeos de vendedores, edição de vídeo, criação de capa, upload de arquivo ou agendamento automático nesta etapa.
- Publicação e comentário dependem de validação real após conexão da conta da Isa. Testes locais usam provedores simulados; nenhum post, DM ou comentário de teste foi enviado em produção.
- Se a resposta de `media_publish` for ambígua, o post fica em `needs_review`; conferir o Instagram antes de criar outra publicação. Se um processo parar entre a reserva e a confirmação, `preparing`/`publishing`/`sending` pode exigir reconciliação manual; não há retry cego que possa duplicar conteúdo.
- Catálogo e publicações listam no máximo 300 registros nesta versão.

## Validação

`npx tsc --noEmit`

`npm --prefix functions run build`

`node --test functions/test/affiliate.test.cjs functions/test/instagram.test.cjs functions/test/groundedInstagram.test.cjs functions/test/inbox.test.cjs functions/test/chatFeatures.test.cjs`

A suíte verifica isolamento entre contas e segmentos, permissões de publicação, direitos da mídia, pausa humana, duplicidade de comentários, falhas ambíguas e continuidade do produto, além das regressões do atendimento WhatsApp/Instagram e catálogo automotivo.
