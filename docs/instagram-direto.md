# Instagram Direct sem ManyChat

## Estado e limites

O código usa Instagram API com Instagram Login (`graph.instagram.com`), não tokens de Página do Facebook. Conta Business/Creator necessária. Texto, imagens e vídeos podem sair diretamente pelo canal. Áudio/imagens/vídeos recebidos em URLs da CDN Meta são enviados ao mesmo motor de IA; mídia acima de 15 MiB não é baixada. O atendimento humano por texto e mídia com URL HTTPS usa a mesma conexão; áudio gravado no CRM ainda exige hospedagem e está explicitamente indisponível para Instagram.

A implementação local não significa que uma conta esteja conectada. A autorização, permissões, publicação do aplicativo e um teste real de Direct são necessários antes da migração.

## Configurar o aplicativo Meta

1. Em https://developers.facebook.com/apps/, crie um aplicativo para gerenciar mensagens do Instagram. No fluxo de criação atual, escolha o caso de uso de mensagens/conteúdo do Instagram; os rótulos podem variar conforme a conta.
2. Configure **Instagram API com Instagram Login**, com `instagram_business_basic` e `instagram_business_manage_messages`.
3. Cadastre o redirect OAuth exato: `https://iapedido.web.app/api/instagram/callback`.
4. Copie **Instagram App ID** e **Instagram App Secret** da configuração de Instagram (não confundir com credenciais de Facebook Login). Configure no backend; nunca em variáveis `VITE_*`, no documento público da loja ou no chat.
5. Gere um token aleatório de verificação (por exemplo `openssl rand -hex 32`) e configure `INSTAGRAM_VERIFY_TOKEN`.
6. Depois da publicação do backend, configure o callback `https://iapedido.web.app/api/instagram/webhook` e o mesmo token de verificação, assinando `messages` no objeto Instagram. A autorização também inscreve a conta em `me/subscribed_apps`.
7. Para desenvolvimento, configure e aceite os papéis/testadores necessários. Para atender usuários públicos, conclua as permissões e requisitos de acesso indicados pela Meta.

Variáveis no `.env` local e em `functions/.env` para o Firebase:

```
INSTAGRAM_APP_ID=<Instagram App ID>
INSTAGRAM_APP_SECRET=<Instagram App Secret>
INSTAGRAM_VERIFY_TOKEN=<token aleatório próprio>
INSTAGRAM_PUBLIC_URL=https://iapedido.web.app
INSTAGRAM_GRAPH_VERSION=v26.0
```

A URL pública deve ser controlada pelo projeto e igual à cadastrada na Meta. No desenvolvimento local com HTTPS/túnel, use a URL de teste e cadastre também seu callback na Meta. O servidor local processa a fila imediatamente; em produção os triggers Firestore fazem isso independentemente da requisição HTTP. A versão deve ser uma suportada pelo aplicativo Meta.

## Publicação

```
npm run build:functions
node --test functions/test/instagram.test.cjs
npx tsc --noEmit
npm run build
npx firebase deploy --only functions:api,functions:instagramInbox,functions:instagramTokenRefresh,firestore:rules,hosting
```

Publicar as regras é obrigatório: `instagramConnections`, `instagramAccounts`, `instagramOauthStates`, `instagramEvents`, `instagramLocks` e `instagramSystem` ficam fora da árvore pública e bloqueadas a clientes. OAuth e gerenciamento exigem Firebase ID token do dono (UID igual ao estabelecimento).

Os endpoints antigos que recebiam JSON ManyChat sem assinatura foram substituídos pelo webhook assinado. **Não publique o corte antes de coordenar a migração**, pois o fluxo antigo deixará de receber respostas. Não migre nem reutilize `manychatApiKey` ou `instagramAccessToken` do documento público. Reconecte pela nova tela; credenciais antigas devem ser revogadas pelo dono quando o corte for concluído.

## Migrar o atendimento

1. Acesse **Conexão Instagram**, autorize a conta profissional. Ela fica conectada com IA pausada.
2. Pause os fluxos e a resposta padrão do ManyChat para esta conta.
3. Ative **IA no Direct**. Envie texto e, depois, imagem/áudio de outra conta autorizada para teste. Confirme resposta, catálogo, histórico/CRM e horários de recebimento/envio. Refaça o teste com o aplicativo liberado ao público.
4. Teste **Assumir Conversa** no CRM e uma resposta humana. A IA não deve interromper o atendimento pausado. Não há detecção automática de atendimento humano feito fora do CRM.
5. Remova a conexão no ManyChat somente após o teste. Se falhar, pause a integração direta antes de reativar os fluxos anteriores.

IDs de assinantes ManyChat não são IDs de destinatários Instagram. Contatos antigos precisam enviar uma nova DM; não há migração nem união automática com o histórico do WhatsApp. A origem de novos projetos é `instagram_ai`/canal `instagram` (ou tráfego pago quando houver atribuição).

## Operação

- O webhook valida `X-Hub-Signature-256` sobre os bytes originais, roteia pela conta destinatária e persiste todos os itens válidos antes de responder à Meta. Sem fallback para uma loja fixa.
- IDs estáveis eliminam reentregas já persistidas. O trigger tem retry, trava por conversa e salva o plano/posição de envio para continuar após falhas transitórias. Erros permanentes são exibidos, sem registrar sucesso de envio.
- Tokens são renovados diariamente quando faltam menos de 15 dias. Uma falha pede reconexão; a tela mostra validade e último erro. Configurar TTL de `expiresAt` em `instagramEvents` e limpeza periódica de estados OAuth é recomendado para retenção; não é pré-requisito do fluxo.
- A IA respeita pausa humana, horário de atendimento e reserva de crédito do backend de produção. Mensagens antigas na fila são descartadas antes de ultrapassar a janela de resposta. Envio humano exige mensagem recebida há menos de 24h.
- Em falha de cobrança, a fila registra `billing_required` sem consumir IA. A disponibilidade de assinatura/créditos usa a mesma função do WhatsApp.
- Atendimento fora de horário pode enviar o texto configurado; não há limitação de frequência adicional neste canal.
- Não há garantia de envio exatamente uma vez se o processo cair depois de a Meta aceitar uma mensagem e antes de salvar o resultado. Falha antes de salvar o plano de IA também pode repetir a geração/reserva; monitore eventos com tentativas múltiplas.
- Não há disparos de campanha nem notificações de status de pedido automáticas no Instagram nesta entrega; IDs `ig_` são bloqueados no caminho de notificação WhatsApp.

## Referências

- Meta: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- Coleção oficial: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api

## Configuração desta instalação

- App Meta: iaPedido Atendimento (`1905534780824690`). Instagram App ID: `1841705580354400`. São identificadores públicos; a chave secreta permanece nos arquivos de ambiente ignorados pelo Git.
- Conta de teste escolhida pelo dono: `@iapedido`, com o atendimento da FLOW GARAGE EXHAUST.
- Política de privacidade: `/privacidade.html`. Solicitações de dados: `contato@iapedido.com`; instruções na âncora `#exclusao`.
- O controle “Seguir o horário da IA da loja” na Conexão Instagram permite atendimento 24h neste canal ao ser desmarcado antes da ativação. Não altera a agenda do WhatsApp.
- Runtime das funções atualizado para Node.js 22; Node.js 20 tem desativação de deploy anunciada para 30/10/2026 pelo Firebase.

## Migração concluída

O @iapedido foi autorizado e vinculado à FLOW GARAGE EXHAUST. A IA foi ativada para atendimento 24h apenas no Instagram, com autorização explícita do dono para o teste. A configuração de horário do WhatsApp foi preservada. Uma DM real (“Olá”) foi recebida e a resposta do consultor Pedro da Flow Garage foi enviada pela API direta e conferida no CRM.

Após o teste e confirmação específica do dono, a conexão foi removida definitivamente do ManyChat. A confirmação mostrava 0 contatos. O resultado foi verificado na tela de Instagram do ManyChat, que passou a apresentar somente o botão “Conectar”.

Validação: 15 testes automatizados do módulo Instagram, TypeScript sem erros e build do frontend. As regras privadas, backend, fila Firestore, renovação de tokens e frontend foram publicados no Firebase. O aplicativo Meta foi publicado e as URLs de privacidade e exclusão foram configuradas. O teste real desta migração validou texto; envio de mídia exige URLs compatíveis com a Meta e não foi validado com uma DM real de mídia nesta etapa.

## Formatação de respostas no Direct

O envio usa um orçamento conservador de 900 bytes UTF-8 por bloco. A divisão preserva grupos de emojis e acentos e prioriza parágrafos, linhas completas (incluindo listas), frases e espaços. Somente sequências individuais maiores que o orçamento precisam de corte forçado. Não há truncamento de conteúdo; espaços e linhas vazias entre blocos são normalizados. O mesmo divisor é usado pelo chatbot e pelo envio humano do CRM.

O prompt específico do Instagram orienta respostas mais concisas, geralmente com 2 a 4 frases, 1 ou 2 parágrafos e uma pergunta por vez. O limite é uma orientação de estilo para a IA, não um corte rígido da resposta. O formato do WhatsApp não foi alterado. Os testes do módulo passaram a cobrir 24 casos, incluindo mensagens em português, listas, URLs, emojis compostos e o envio de respostas longas pela fila.

## Catálogo e informações verificadas no Direct

Pedidos de projetos, alternativas, fotos, vídeos, site, endereço, horário e telefone passam por um resolvedor baseado nos produtos ativos e no cadastro atual da loja, antes da geração livre. O catálogo é consultado novamente a cada mensagem. A memória `customerMemory.instagramCatalog` mantém IDs oferecidos, seleção atual, busca e URLs de mídia já preparadas; “outros” evita repetir referências e “mais fotos” avança no conjunto cadastrado. Pedidos explícitos de reenvio permitem repetir a mídia. Eventos não são apresentados como projetos de escapamento.

A busca não substitui uma geração ausente por outra: por exemplo, 991 não encontra 992. Referências em desenvolvimento são identificadas. Sem mídia do tipo solicitado, a resposta informa a ausência em vez de enviar uma foto como se fosse vídeo. O link usa o website cadastrado ou a página pública do catálogo. Não são necessários CEP, orçamento ou dados completos do veículo para explorar referências.

O prompt geral também recebeu regras de veracidade, consulta ao cadastro e atendimento sem qualificação repetitiva. A consulta de parceiros não usa mais a lista de exemplo quando não há parceiros ativos ou quando há falha. Isso reduz fontes de afirmações indevidas; respostas livres da IA continuam exigindo acompanhamento. Os sete testes de `groundedInstagram.test.cjs` cobrem seleção, alternativas, mídia, fatos e ausência de aplicação, além dos 24 testes do transporte. A sequência também foi simulada localmente com os registros atuais da Flow Garage, sem envio de DMs.

## Ordem das respostas com mídia

A fila envia todos os blocos do texto de apresentação antes das fotos e vídeos. Essa ordem fica persistida no plano do evento; em falhas transitórias, a retomada continua no primeiro bloco pendente sem reenviar o texto já confirmado. Eventos que já tinham um plano salvo antes da alteração conservam a ordem anterior. A suíte do transporte passou a ter 25 testes, incluindo texto longo antes de foto e vídeo e a retomada de um anexo após falha.

## Caixa de entrada da plataforma

A área **Conversas** acompanha WhatsApp e Instagram em tempo real, sem depender de qualificação ou criação de um projeto no CRM. Permite busca, filtro por canal/não lidas, leitura de histórico com paginação, exibição de fotos/vídeos/áudios já sincronizados e resposta de texto no canal de origem. Os estados de envio distinguem pendente, enviado e falha; enviado significa aceitação pelo provedor, não confirmação de leitura do cliente. Mensagens antigas sem status são identificadas como histórico.

**Assumir conversa** pausa a IA sem prazo, no contato e canal selecionados. **Devolver à IA** libera respostas para novas mensagens; não dispara resposta retroativa por conta própria. O envio manual pausa antes de chamar o provedor. A geração automática revalida o controle antes do envio, inclusive durante lotes; uma chamada que já foi aceita pelo provedor pode chegar após o clique. A pausa no CRM também foi ajustada para permanecer até devolução explícita.

O trigger `inboxMessages` sincroniza metadados e solicita Web Push para cada nova mensagem de cliente, com link `/?tab=inbox&chat=...`. Não notifica respostas do bot e ignora importação retroativa e mensagens antigas. Usa marca transacional para não notificar novamente o mesmo registro em reentregas do evento; a marca é gravada antes do push, portanto falha do serviço/dispositivo pode resultar em notificação não entregue, sem afetar o histórico. Notificações dependem de permissão, suporte do aparelho, conectividade e entrega pelo navegador. No iPhone, usar o PWA adicionado à Tela de Início. O service worker passa a abrir o contato solicitado mesmo quando uma janela já está aberta.

A inscrição de dispositivos exige autenticação do dono. Conversas são legíveis no Firestore somente pelo UID da loja; alterações e envios passam pelo backend autenticado. Assinaturas Web Push ficam privadas no servidor.

Entradas do Instagram ficam registradas antes dos gates de pausa/ativação da IA. Entradas atuais do WhatsApp ficam registradas antes de horário, cobrança e geração. Fotos e áudios baixados do WhatsApp usam Storage em vez de embutir o arquivo no documento do Firestore. A disponibilidade de mídia histórica depende do registro e da validade da URL de origem. Não há importação retroativa de todo o histórico nativo, nem união automática de identidades entre canais. A integração atual ignora ecos de saída do Instagram; respostas externas pelo aplicativo nativo do Instagram não são uma fonte garantida para esta caixa de entrada. Para espelhar o atendimento humano, responder pela plataforma.

Validação desta entrega: 44 testes locais cobrindo transporte, catálogo, notificações, controle humano, leitura concorrente e envio autenticado nos dois canais, além de TypeScript e build do frontend. Os testes de envio usam provedores simulados, sem enviar mensagens reais a clientes.

## Paridade do chat de Conversas e CRM

Conversas agora abre o próprio componente de atendimento de Projetos & Orçamentos (`AutomotiveProjects` em modo de contato), em vez de manter um segundo chat com recursos diferentes. A resolução autenticada `/api/inbox/:chatId/project` reutiliza a ficha existente; para contatos sem ficha, cria um registro estável de Novo contato com os dados já conhecidos. O contato fica separado por canal, sem unir pessoas por nome.

As duas entradas compartilham ficha/editoração, proposta com prévia e revisão, texto, anexos de imagem/vídeo/áudio, legenda, gravação/cancelamento de voz, tradução de texto, prévia de tradução e dublagem internacional. Fotos têm limite de 8 MB e demais arquivos 20 MB; gravações no navegador têm até 3 minutos. O gravador negocia MIME compatível com o navegador, encerra o microfone ao cancelar/sair e informa falhas. Fotos e áudios são hospedados no Storage; áudios passam por FFmpeg/AAC-M4A para envio direto à Meta. O histórico renderiza vídeos e todas as mídias do registro. As respostas manuais mantêm a pausa até retomada explícita.

A tradução do texto foi endurecida após o teste real ter gerado uma legenda promocional indevida: usa resposta estruturada, instrução de tradução fiel e validação contra expansão, placeholders novos e alteração de números/links. Quando falha, o envio solicitado não continua com uma falsa tradução. A dublagem também não envia o áudio original silenciosamente se a tradução/síntese falhar. Isso reduz erros, mas transcrição e tradução por IA ainda podem exigir revisão humana, especialmente em nomes próprios.

Validação: 53 testes locais, incluindo conversão real de áudio, envio de mídia/voz em ambos os canais com provedores simulados, idioma explícito e falhas de tradução. TypeScript e build passaram. Com autorização do dono para o último contato do Instagram, foram testados pela interface: tradução/prévia e envio de texto, envio de PNG pelo seletor nativo, transcrição/dublagem do áudio em inglês e envio AAC/M4A aceito pela Meta. O histórico recebeu as confirmações e uma resposta real de cliente durante o atendimento humano. A legenda indevida do primeiro teste foi explicitamente corrigida no contato; a nova tradução foi validada em prévia sem reenviar a imagem. A ficha e a prévia de proposta foram abertas sem enviar proposta nem alterar valores. WhatsApp foi coberto por testes automatizados; não houve destinatário autorizado para um novo envio real nesse canal. O teste de voz real usou arquivo sintético e não capturou o microfone do aparelho.
