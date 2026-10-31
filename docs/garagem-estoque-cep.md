# Garagem, estoque de kits e coleta de endereço

Disponível somente no segmento `AUTOMOTIVE_PARTS`. Um box atende um carro por vez. O estoque desta versão é de kits/peças prontas por aplicação, em unidades inteiras; não há cálculo de tubos por metragem.

## Ativação pela oficina

Em **Garagem & Estoque**:

1. Cadastrar cada box real e bloquear posições indisponíveis.
2. Cadastrar kits/peças, contagem física, marca/modelo/anos/versão exatos e duração real de instalação. Aprovar individualmente a aplicação para agendamento automático quando validada tecnicamente. O catálogo de referências não vira estoque automaticamente.
3. Definir abertura/fechamento, dias de atendimento, intervalo entre serviços, antecedência mínima e horizonte de agendamento. Ativar consultas e confirmação automática quando os dados estiverem revisados.
4. Atualizar a entrada de cada carro e a liberação do box no painel. Não existem sensores de ocupação nem conexão com ERP neste módulo; a IA consulta os registros mantidos pela equipe.

Nenhum box, quantidade, aprovação técnica ou horário foi gravado automaticamente na conta da Flow Garage. A operação começa inativa; a coleta de endereço por CEP não depende da ativação da garagem.

## Reserva e estoque

- Cada instalação reserva **1 unidade** do kit/peça escolhido. Não há lista de materiais com vários SKUs por instalação nesta versão; cadastrar o conjunto como um kit completo.
- Saldo livre = físico − reservado. Reservar não dá baixa no físico. Dar entrada para instalação consome a unidade e retira a reserva; chamadas repetidas não consomem novamente.
- Cancelar antes do consumo devolve o saldo reservado. Cancelar após consumo não devolve material automaticamente ao estoque; a equipe precisa contar e ajustar se houver devolução real.
- Estados: reservado, aguardando material, em instalação, pronto aguardando liberação, box liberado, cancelado. Pronto não libera capacidade sozinho. Instalação atrasada ou aguardando material no box bloqueia novas ofertas até atualização da operação.
- Os horários incluem duração mais intervalo de preparação/limpeza. Há uma janela diária comum para os dias selecionados, em `America/Recife`; não há escala de mecânicos, intervalos de almoço ou calendário de feriados por data nesta versão. Boxes podem ser bloqueados e reservas existentes precisam de tratamento pela equipe.
- IA oferece opções, coleta nome/telefone, pede consentimento e só confirma após transação de banco que revalida regras, aplicação, material e box. Ofertas expiram em 15 minutos. Cancelamentos e remarcações de reservas confirmadas são tratados pela equipe no painel.
- Reserva pela equipe também verifica material e capacidade; a validação da aplicação fica a cargo do operador nesse formulário.
- O cliente pode consultar estoque sem reservar. O saldo consultado não é promessa de separação até a confirmação da reserva.
- Datas até 90 dias, até 20 boxes, 200 kits e 200 registros por dia; limites explícitos, sem exclusão automática de histórico.

## Coleta de endereço

- Consulta HTTPS real ao ViaCEP, CEP de oito dígitos, timeout e distinção entre inválido, inexistente e indisponibilidade do serviço.
- Retorna rua/bairro/cidade/UF disponíveis e pede confirmação. CEP geral pede rua. Depois coleta número (ou sem número), complemento (ou ausência), destinatário e contato. Telefone WhatsApp é reutilizado quando conhecido; Instagram pede número explícito.
- Exige confirmação do endereço completo antes de marcá-lo como confirmado. Guarda fonte e data da consulta. Endereço confirmado é registrado na conversa e na ficha do projeto, quando existir.
- Não determina valor do frete, cobertura de transportadora nem prazo de entrega; isso continua sujeito à cotação. CPF/documentos fiscais não são solicitados sem uma exigência operacional cadastrada.
- Para áudio, a ferramenta operacional usa o pedido transcrito e consulta os dados reais. A confirmação final de endereço/reserva pede SIM por texto; a ferramenta de geração não pode efetivar compromissos a partir de uma transcrição livre.

## Persistência e isolamento

`automotiveOperations/{storeId}` mantém regras, boxes, kits e ocupações. Subcoleções `calendar/{dia}`, `sessions/{hashContatoPerfil}` e `events/{id}` guardam agenda, etapa de coleta/ofertas por contato/projeto e auditoria. As regras Firestore impedem acesso direto de clientes a esse namespace. Rotas `/api/garage/*` verificam autenticação Firebase, titularidade e segmento.

Reserva e alteração de etapa usam transação no documento operacional e calendário do dia; a contenção no documento de estoque protege contra reservas simultâneas, inclusive em datas diferentes. O cliente confirma apenas a opção armazenada na sessão. Contato com IA pausada ou mudança de perfil bloqueia a confirmação automática.

Painel consulta a cada 15 segundos quando visível e atualiza imediatamente após ações; o chatbot lê o banco na consulta e novamente ao confirmar. Não dispara divulgação ou mensagens proativas para clientes quando um box é liberado.

## Validação

`npm --prefix functions run build`

`node --test functions/test/*.cjs`

`npx tsc --noEmit`

`npm run build`

Testes incluem CEP inexistente/serviço indisponível, endereço completo e confirmação, CEP geral, estoque reservado, concorrência de box e última peça, aplicação/duração, bloqueio, oferta expirada, tomada humana, confirmação explícita, consumo único e liberação real. A consulta externa foi verificada com o CEP público de exemplo `01001000` (Praça da Sé), sem dados de clientes.

Prévia visual e ações de interface usam dados fictícios isolados, sem reservas nem mensagens a clientes de produção.
