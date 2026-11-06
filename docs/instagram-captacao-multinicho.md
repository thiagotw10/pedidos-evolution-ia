# Captação Instagram por segmento

A configuração fica em **Conexão Instagram → Captação por comentários** para os oito segmentos cadastrados. O Direct precisa estar autorizado e ativo; a captação é um controle adicional, desativado por padrão. Publicar o código não ativa contas nem reprocessa comentários antigos.

## Fluxo

- OAuth solicita `instagram_business_manage_comments` para todos os segmentos. Contas antigas sem essa permissão devem renovar a autorização. Publicação de conteúdo continua sendo escopo exclusivo de afiliados.
- Webhooks assinados são persistidos em `instagramEvents`, deduplicados por conta/comentário e roteados pela empresa dona da conta. Novos segmentos usam `business_comment`; eventos automotivos existentes continuam compatíveis.
- A publicação pode ter produto do catálogo da própria empresa, objetivo, contexto, gatilho e palavras-chave. O gatilho por palavra ainda passa pela classificação de interesse da IA. Recusa, spam e elogios isolados não autorizam abordagem.
- Nenhum contexto de campanha é ativado por herança ao trocar o Instagram. A API exibe configuração pausada e sem vínculos se a conta mudou.
- Produto ativo, configurações, conta, horário e atendimento humano são revalidados antes do envio. O catálogo de referências automotivas não é estoque de peças nem prova de vaga.
- Cada contato recebe no máximo uma abordagem a cada 24 horas; a franquia por hora é configurável entre 1 e 100. A resposta privada usa o identificador do comentário e não abre a janela normal de DM.
- A confirmação pública só vem depois de entrega privada confirmada. Rejeições certas da Meta são `failed`; timeouts ambíguos são `delivery_unknown`, sem reenvio automático. Falhas de sincronização do CRM nunca reenviam a DM.

## Contexto e objetivos

Os demais nichos usam aberturas com nomes verificados do catálogo e perguntas apropriadas ao segmento/objetivo. A IA classifica o interesse, mas não pode inventar preço, link ou disponibilidade na abertura. Afiliados só enviam o link do produto selecionado, com aviso de comissão. O contexto da publicação acompanha o chat para o próximo turno no Direct, que consulta o cadastro atual.

Os fluxos automotivos mantêm a classificação e o CRM técnico. Outros segmentos não criam projetos de escapamentos. Reels já automatizados no espaço de afiliados mantêm suas regras até serem explicitamente vinculados na nova configuração; essa vinculação passa a usar o motor comum para novos comentários.

## Diagnóstico

A API consulta os últimos 50 eventos de comentários da empresa, exibe apenas os da conta Instagram atual e junta o resultado do envio. Inclui comentários ignorados, motivo, horário, texto, confirmação pública e erro seguro de entrega. A contagem é desta amostra; não representa vendas nem respostas do cliente. Eventos expirados pelo TTL deixam de aparecer. Não há replay automático ou botão de reenvio de falhas ambíguas.

Índice necessário: `instagramEvents` com `storeId ASC`, `kind ASC`, `receivedAt DESC` (definido em `firestore.indexes.json`). Dados e tokens continuam protegidos por acesso de proprietário no backend; a resposta de diagnóstico contém apenas campos selecionados.

## Verificação

`npm --prefix functions run build`

`node --test functions/test/*.test.cjs`

`npx tsc --noEmit`

`npm run build`

Os testes usam serviços simulados e não enviam mensagens reais. O teste operacional requer um novo comentário de uma conta distinta, em uma publicação e captação habilitadas. Contas externas ao aplicativo ainda dependem das permissões e da liberação da Meta; esta entrega não substitui App Review.

## Resposta pública por publicação

Na aba Captação, cada publicação possui o campo opcional **Resposta pública neste post**, com até 300 caracteres. O servidor valida o tamanho e publica esse texto literalmente; o campo não é uma instrução para geração por IA. Deixar vazio mantém o padrão do segmento. As configurações anteriores continuam válidas.

Para achadinhos, quando a DM inclui o link do produto vinculado, o padrão é: “Te mandei o link no Direct! 💌 Confira também as solicitações de mensagem.” Sem link enviado, a confirmação permanece genérica. Performance mantém a confirmação sobre o projeto. A personalização respeita a opção geral de responder no comentário e só é enviada depois da confirmação do Direct. Não há reenvio retroativo dos comentários já processados.
