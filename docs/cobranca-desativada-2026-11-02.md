# Cobrança por planos e créditos desativada

A pedido do responsável pela plataforma, o acesso aos atendimentos e simuladores deixou de depender de saldo, período de teste ou assinatura em todos os segmentos. O débito de créditos foi interrompido. Os registros financeiros e os webhooks de pagamentos anteriores foram preservados. Novas cobranças de plataforma por PIX retornam HTTP 410.

A interface de contratação e a tabela pública de planos foram retiradas. A cobrança própria dos estabelecimentos aos clientes (orçamentos, produtos e PIX comercial) não foi alterada. Segurança, controle humano, horários e limites operacionais dos canais permanecem ativos.

Diagnóstico: o evento de Direct da conta de teste de Veículos foi encontrado em instagramEvents com status ignored e reason billing_required. Nenhum conteúdo ou credencial foi exposto. Eventos já ignorados não são reenviados automaticamente; uma nova mensagem inicia o atendimento com a política atual.

Validação: 267 testes existentes passaram; o novo teste platformAccess também passou. Builds do frontend e backend e TypeScript concluíram sem erros.
