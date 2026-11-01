# Central de conteúdo do Instagram

A tela Instagram oferece Publicações e Resultados em todos os oito segmentos. O módulo legado de afiliados permanece disponível.

## Autorizações

A conexão atual do chatbot não muda. Os botões Autorizar publicação e Autorizar métricas solicitam, respectivamente, `instagram_business_content_publish` e `instagram_business_manage_insights`, além das permissões existentes. O aplicativo Meta precisa disponibilizar essas permissões. Contas externas exigem os requisitos de acesso avançado e análise da Meta. A renovação preserva os escopos anteriormente concedidos.

Não se deve ativar a IA ou publicar conteúdo real durante a validação sem uma ação explícita do responsável. As credenciais ficam somente em instagramConnections, no servidor.

## Publicações

- Fotos JPEG, Reels MP4 e carrosséis de 2 a 10 fotos. Upload de JPEG até 8 MB ou MP4 até 100 MB; URLs públicas também são aceitas. A Meta valida codecs, dimensões e duração. Mídias carregadas ficam acessíveis por URL para download pela Meta, com criação restrita ao dono e sem sobrescrita.
- Legenda até 2.200 caracteres, título interno, contexto, objetivo, produto próprio ativo e palavras-chave.
- Rascunhos não são publicados. Publicar agora ou Agendar é a autorização explícita do responsável.
- Agendamento entre 1 minuto e 180 dias. O navegador mostra seu fuso; o backend armazena UTC. Preparação pode começar 10 minutos antes. A publicação nunca começa antes do horário; processamento e fila podem atrasar a entrega.
- `instagramPublicationsRunner` executa a cada minuto. Jobs têm lease transacional. Preparação, processamento e envio são etapas separadas. Falha ambígua no envio ou lease abandonado em `publishing` termina em `needs_review`, sem reenvio automático.
- Troca de conta, autorização expirada ou revogada e produto indisponível impedem o envio. Cancelamento é possível antes do envio, exceto durante a curta etapa de preparação. Após falha, salvar novamente cria um rascunho e exige nova autorização de envio.
- Publicação concluída cadastra contexto de captação **desativado**, sem ativar IA, captação global ou respostas. O responsável ativa na seção de comentários. Se houver falha ao salvar contexto, configure-o manualmente.

## Métricas e atribuição

Atualização explícita consulta as últimas 25 publicações e métricas disponíveis por mídia. Curtidas e comentários vêm dos campos básicos; visualizações, alcance, salvos e compartilhamentos dependem de Insights. Cards da conta usam 28 dias; métricas individuais são acumuladas. Métrica não suportada/recusada permanece null e aparece como “—”, nunca zero inventado. Atualização tem bloqueio temporário por empresa; snapshots pertencem à conta conectada.

Resultados do CRM usam o primeiro contexto de publicação conhecido no contato atual, até 1.000 conversas e 1.000 projetos. Conversas são contatos com origem identificada, não o total de DMs. Para performance, conta projetos, orçamentos e vendas conforme os estágios já usados no CRM. Receita é valor de orçamento em estágios Aprovado/Em execução/Enviado/Concluído; não é pagamento confirmado. Moedas são separadas. Outros segmentos mostram conversas; não se inventa uma integração de vendas que ainda não existe. Compras Shopee e gastos de anúncios não estão incluídos.

## Operação e validação

Coleções server-only: instagramPublications, instagramWorkspaces. Índices: storeId + updatedAt desc; status + nextRunAt asc. APIs autenticadas exigem UID igual à empresa. Firestore e Storage Rules devem ser publicadas junto do código.

`npm --prefix functions run build`, `node --test functions/test/*.test.cjs`, `npx tsc --noEmit`, `npm run build`.

Deploy: `npx firebase deploy --only functions:api,functions:instagramPublicationsRunner,firestore:rules,firestore:indexes,storage,hosting`.

## Resumo na tela Início

Quando há conexão Instagram, o Início mostra alcance e visualizações do snapshot de 28 dias, total de conversas e não lidas daquela conta, status da IA e publicações recentes. No celular mostra somente o último conteúdo; no web mostra até três. Sem conta conectada, o bloco não aparece. Métricas ausentes continuam “—”; a tela orienta renovação/autorização quando necessário e exibe a data da consulta.

`GET /api/instagram/studio/summary` exige a mesma autorização de dono, faz somente duas leituras internas e nunca consulta nem grava na Meta. Só retorna snapshots do accountId atual e campos públicos selecionados, sem credenciais. O resumo recarrega a cada minuto enquanto visível; as métricas da Meta continuam sendo atualizadas na central. Contagens de conversas aproveitam o listener já existente no Início e filtram o accountId. Não equivalem às conversas atribuídas a posts do funil de vendas.

Atalhos usam `instagramSection=results` ou `compose` para abrir a aba correta da central, com rolagem até a seção e respeito à preferência de movimento reduzido. O resumo não ativa a IA nem muda permissões. Essa extensão requer somente deploy de `functions:api,hosting`, sem novas regras ou índices.
