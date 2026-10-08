# Piloto automotivo

## Ativação

1. Use uma conta própria do estabelecimento, autenticada pelo Firebase. O UID é o ID da loja, conforme o cadastro atual.
2. Em Configurações, selecione **Performance & Escapamentos** e salve. Nenhuma conta é migrada automaticamente.
3. Cadastre nome, descrição e WhatsApp internacional da loja. Não publique dados da Flow Garage sem validar com o responsável.
4. Cadastre referências reais no catálogo com foto, família de veículo e configuração na descrição. A vitrine automotiva não exibe preços; preço zero não significa produto gratuito.
5. Compartilhe o link público já disponível nas configurações. O formulário grava uma solicitação antes de oferecer a continuação no WhatsApp.
6. Em Projetos & Orçamentos, acompanhe e atualize a etapa e os campos manuais.

## Escopo

Vitrine responsiva por segmento, seleção de referências, formulário de veículo, protocolo idempotente, limite por telefone/IP e hora, autorização de contato, painel autenticado por proprietário e orientação de atendimento técnico no fluxo compartilhado de WhatsApp/simulador.

Os registros estão em `automotive_projects`, acessíveis somente pelas novas APIs autenticadas. As regras excluem essa coleção e `automotive_rate_limits` da permissão genérica; acesso de clientes Firestore é negado. As regras antigas de outras coleções continuam permissivas e exigem uma revisão separada antes de operação comercial com dados sensíveis.

As etapas do painel são registros manuais; não atestam pagamento, compatibilidade nem geram mensagens automáticas. Somente o formulário público cria projetos nesta fase; o chat não cria projetos automaticamente.

## Ainda não incluído

Biblioteca de vídeos/áudios, upload de anexos do comprador, propostas públicas versionadas, estoque técnico, integração de frete/ERP/pagamento e notificações de produção. Não foram criados projetos, preços ou promessas de compatibilidade fictícios.

## Publicação e validação

Publicar em conjunto Hosting, Functions e regras Firestore. Não publicar somente o frontend. Validar em ambiente de teste com duas contas: submissão pública, entrada no painel correto, bloqueio da segunda conta, atualização de etapas e continuação no WhatsApp. O servidor local legado não possui a rota geral de vitrine pública; para validar ponta a ponta use a configuração de Hosting/Functions em ambiente de teste.

`npm run build`, `npx tsc --noEmit`, `npm run build:functions` e `node --test functions/test/automotive.cjs`.

Configurar política TTL para `automotive_rate_limits.expiresAt` para limpeza dos contadores expirados. O limite aplicado pela API usa janelas de uma hora independentemente da limpeza. A proteção de volume inicial não substitui App Check/WAF para exposição de alto tráfego.
