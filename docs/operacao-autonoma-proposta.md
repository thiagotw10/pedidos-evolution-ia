# Evolução: operação autônoma da oficina

## Objetivo

O painel passa a refletir as decisões e os acontecimentos coletados por agentes. Atualizar manualmente o painel deixa de ser o caminho obrigatório. O atendimento identifica o projeto, consulta fontes operacionais, resolve pendências internamente e retoma a conversa com o cliente no canal de origem.

A central de consultas internas está implementada: lacunas de configuração, aplicação ou estoque geram uma solicitação na plataforma. A equipe responde e uma fila durável retoma o cliente no canal original. A integração com câmeras continua pendente. O co-piloto WhatsApp existente reconhece mensagens enviadas pelo dono a si mesmo; ele não é um canal de consulta assíncrona ao responsável.

## Fontes e decisões

- Agenda/reservas: banco operacional existente, com verificação transacional para capacidade e material.
- Ocupação física: observação por zona de box em uma câmera, quando uma fonte de imagem autorizada estiver disponível. Guardar horário, confiança e origem da observação. Box vazio não comprova material disponível, aplicação correta ou vaga futura suficiente para o serviço.
- Estoque: entradas, separação/consumo registrados pela operação, integração de estoque ou confirmação interna quando o saldo estiver incerto. Uma imagem geral da oficina não comprova disponibilidade de um kit por veículo.
- Duração, aplicação e preço: dados aprovados pela oficina e histórico revisado; orçamento fora dessas regras gera uma consulta interna em vez de um compromisso inventado.
- Conflito entre fonte visual e reserva/atendimento em andamento: abrir pendência interna, mantendo os compromissos existentes até reconciliação.

## Agente de coordenação e consulta interna

1. Cliente solicita orçamento/instalação. O agente salva veículo/projeto, objetivo, contato e preferências.
2. Consulta estoque, regras técnicas e agenda. Reutiliza informação confirmada e ainda válida.
3. Se houver lacuna, abre solicitação interna durável com ID, contato/projeto/canal de origem, pergunta específica, intervalo de tempo/box/kit envolvidos, prazo de validade e estado pendente.
4. Envia a pergunta apenas ao responsável/canal previamente cadastrado e autorizado. A conversa interna nunca é enviada ao cliente, nem respostas de clientes são aceitas como confirmação de funcionário.
5. Vincula a resposta à solicitação correta. Um “sim” só vale quando existe uma única pergunta inequívoca naquele contexto; múltiplas pendências pedem identificação.
6. Registra a informação com origem, autor e horário e volta a conferir capacidade/material, porque outra reserva pode ter ocorrido durante a espera.
7. Retoma automaticamente a conversa original do cliente. Confirma compromisso somente após as regras e a transação existentes aprovarem a reserva.
8. Se não houver resposta ou a informação expirar, informa a pendência com honestidade e mantém a consulta aberta para a equipe. Respeita tomada humana e as condições do canal de mensagens.

## Visão computacional

Integração posterior depende de identificar as câmeras/acesso por rede e mapear a área de cada box. Começar por presença/ausência de veículo na zona, sem identificação de pessoas. Exigir observações consistentes antes de mudar ocupação, tratar câmera indisponível como dado desconhecido e preservar bloqueios/manutenção/reservas. Calibrar com imagens reais antes de permitir alteração operacional automática.

## Pendências antes da implementação do próximo conector

- Canal definido: Pedro responde na plataforma, no menu Consultas internas.
- Respostas internas exigem autenticação da conta proprietária e identificação da consulta/rodada.
- Câmeras na rede confirmadas; marca/modelo e forma de acesso ainda pendentes.
- Critérios aprovados para preço, aplicação e duração continuam necessários; autonomia executa e consulta essas regras.

Não foram disparadas consultas reais ao Pedro nem foi acessada qualquer câmera nesta revisão.

## Central implementada

Menu **Consultas internas**, exclusivo do nicho automotivo. Respostas autenticadas do proprietário geram um retorno factual, sem acrescentar preço, prazo ou reserva. Fatos públicos e anotações internas são campos separados. Há deduplicação por contato, projeto, veículo, motivo e data; rodadas anteriores ficam no histórico. Notificações usam o push da plataforma quando o dispositivo está inscrito.

A fila revalida projeto, veículo, tomada humana e janela do Instagram. Envios sem confirmação ficam para revisão e não são repetidos automaticamente; interrupção durante envio pode deixar estado “Enviando”, também para revisão. Não há reenvio manual automático nem promessa de entrega sem confirmação do provedor. O espelho da conversa guarda a mensagem e seu estado de entrega.

O retorno interno não altera estoque nem reserva box. A confirmação transacional continua exigindo cadastro operacional real. Preço/assuntos técnicos fora das consultas operacionais ainda seguem o fluxo de atendimento existente. Não há conector visual ativo, inferência de estoque por câmera ou atualização física autônoma neste incremento. Pedro responderá dentro da plataforma; as câmeras existem na rede e falta identificar equipamento e acesso, sem enviar senhas. Testes usam dados fictícios e emissores simulados.

### Redação da retomada

A orientação pública da equipe passa por uma redação da IA antes de criar a fila de envio. Ela é tratada como orientação interna, e não copiada após uma introdução fixa. O modelo recebe apenas pergunta, veículo, resultado e orientação; anotações privadas não são incluídas. Datas relativas permanecem relativas, e disponibilidade não equivale a reserva. Se a geração falhar ou retornar texto vazio/inválido, a consulta continua pendente sem enviar o texto bruto. A transação revalida a rodada e o contexto depois da geração. Teste real com dados fictícios confirmou o exemplo de vaga somente na próxima segunda às 9h, sem disparo para cliente.
