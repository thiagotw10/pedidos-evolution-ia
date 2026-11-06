# Revendas — fluxo exclusivo de VEHICLES

## Isolamento

A entrada da IA seleciona `dealershipReply` apenas com `establishment.segment === 'VEHICLES'`. O fluxo de performance/escapamentos continua em AUTOMOTIVE_PARTS, sem migração ou alteração de seus projetos/agenda/consultas internas. Os demais nichos mantêm o caminho existente. As oportunidades ficam em `vehicleWorkspaces/{loja}/leads`, com API autenticada que deriva a loja do token e recusa todos os outros segmentos. Regras específicas restringem a leitura ao proprietário e a escrita ao servidor.

## Operação

- O primeiro Direct/WhatsApp ou comentário com interesse já registra uma oportunidade. Comentários preservam publicação, campanha e origem. Canais continuam com identidades separadas, sem unificação automática de pessoas.
- A ficha reúne veículos de interesse, investimento total, entrada, veículo de troca, pagamento, preferência de visita, próxima ação e notas privadas. Notas internas e motivo de perda não são enviados ao planejador da IA.
- Etapas: Novo contato → Qualificação → Visita solicitada → Visita confirmada → Visitou → Negociação → Vendido/Perdido. IA só avança qualificação e solicitação; confirmação, negociação, venda e perda são da equipe. A visita confirmada exige data/hora futura e perda exige motivo. Versão evita sobrescrever atualizações concorrentes.
- Estoque estruturado: marca, modelo, versão, ano, km, combustível, câmbio, motor, cor e situação. Reservado/vendido/indisponível saem da oferta de mídias e vitrine. Situação vazia preserva registros antigos disponíveis. Reservas são registradas pela equipe no estoque; não há reserva automática por proposta, nem integração bancária/aprovação de crédito.
- A IA usa o catálogo e a ficha atuais, não o contexto de escapamentos. Mídias só são preparadas quando pedidas ou quando o cliente aceita uma oferta anterior. URLs/IDs são limitados aos itens reais disponíveis, conferidos novamente antes de preparar anexos.
- O formulário público exige consentimento, registra o interesse antes de abrir o WhatsApp e tem limite por loja/origem/hora e chave de submissão. O número é informado pelo visitante, não prova de identidade entre canais. Não há disparo automático só pelo preenchimento.
- A ficha abre conversa com texto, mídia, áudio gravado/anexado, tradução de texto, leitura, assumir/devolver IA. Envio humano pausa a IA antes da rede. Áudio gravado é enviado no idioma original; o seletor de tradução vale para texto.
- Mudanças confirmadas de visita/negociação/venda enfileiram avisos no canal de origem, espelhados no histórico. Janela encerrada, atendimento humano ou etapa superada bloqueiam. Falha ambígua não é reenviada automaticamente; a situação aparece no cartão da oportunidade.
- Importação opcional de propostas anteriores, sem apagar registros originais e sem disparar avisos. O endpoint genérico de status de pedidos fica bloqueado apenas para VEHICLES, para evitar mensagens de delivery.

## Simulador

Para VEHICLES, a interface chama `/api/vehicles/simulator` com autenticação e sessão própria. É a MESMA função comercial utilizada pelos canais. Um adaptador redireciona todas as escritas de conversa e CRM para `vehicleWorkspaces/{loja}/simulations/{sessao}` e permite somente ler loja/estoque reais. Reiniciar cria nova sessão; não apaga conversas reais. Seleção WhatsApp/Instagram simula contextos separados. Limite diário de dez mensagens, com consumo de IA/assinatura normal. Os outros nichos continuam no simulador existente.

Simular não prova entrega dos provedores, permissões, conexão ativa, recebimento de webhook, notificações no celular ou janela real do Instagram. Esses pontos precisam de homologação de canal quando houver conta conectada e contatos autorizados.

## Validação desta entrega

- 266 testes locais passando, incluindo os 255 existentes e novos casos de isolamento por segmento/loja/canal, estado do estoque, visita, crédito, idempotência, concorrência e simulador sem escritas reais.
- Oito turnos com Gemini real e catálogo público da conta de teste, em base em memória, cobrindo ambos os contextos de canal: preço sob consulta, fotos, troca, entrada, financiamento, visita e estado do atendimento. Nenhuma mensagem real enviada e nenhuma escrita real no CRM nesses testes.
- Revisão visual com dados fictícios no mobile (320/390px) e desktop (1440px), incluindo ficha de oportunidade.
- Conta indicada: thiago10ben10@gmail.com, loja BXrP44dMI9PCCq9u68F4g2xmsUd2, segmento VEHICLES. Instagram não conectado no momento da inspeção; não mover a integração da Flow Garage de performance para essa conta.

### Resultado da homologação publicada

A API, interface, gatilho de avisos e regras foram publicados. A tela de oportunidades foi aberta na conta indicada e carregou as etapas sem erros. O simulador publicado chegou à validação de faturamento e foi bloqueado por créditos/assinatura indisponíveis; plano e saldo não foram alterados. Assim, o teste interativo dessa conta não chegou à geração. A lógica foi homologada separadamente com o provedor real em memória (oito turnos de texto e um áudio sintético), sem envios a contatos ou gravações em oportunidades reais. O áudio preparou duas imagens cadastradas.

A consulta da conta também indicou WhatsApp offline e Instagram não conectado. Conectar os canais e ajustar horários de atendimento continuam sendo pré-requisitos para o piloto real. Bloqueios de aprovação de crédito, reserva, confirmação, cancelamento e remarcação sem ação efetiva da equipe permanecem no motor específico da revenda.
