# Auditoria do fluxo de revendas — 02/11/2026

Escopo: revisão do código atual e testes existentes para o segmento VEHICLES. Sem alterações em produção, envios a clientes, reservas ou propostas de teste.

## Conclusão

Há infraestrutura compartilhada de canais e uma vitrine específica, mas o fluxo comercial ainda não é um CRM próprio para revendas. A prontidão do segmento de performance/escapamento (AUTOMOTIVE_PARTS) não se estende automaticamente a VEHICLES.

## Disponível no código

- Vitrine responsiva com estoque cadastrado, busca, fotos, seleção de veículos e formulário que abre o WhatsApp com uma proposta textual.
- Motor compartilhado de atendimento no WhatsApp (Evolution) e Instagram, histórico por contato/canal, ferramentas de mídias, triagem e guardrails de protocolo.
- Campanhas de comentários Instagram para VEHICLES, com vínculo a produto, interesse, Direct e resposta pública conforme configuração/permissões. Registro genérico em instagramLeads e metadados da origem na conversa.
- Caixa de entrada com acompanhamento, notificações e tomada/devolução de controle humano.
- Tela de Propostas & Reservas, com rótulos próprios de veículos sobre o modelo genérico de orders.

## Lacunas e riscos prioritários

1. **Registro tardio de oportunidade:** o caminho dedicado de CRM automático é restrito a AUTOMOTIVE_PARTS. VEHICLES registra um order quando o modelo chama registrar_pedido; não existe ficha comercial completa desde o primeiro interesse com veículo, orçamento, troca, intenção e próximo passo.
2. **Fluxo herdado de delivery:** o prompt, os argumentos de registro e a confirmação ainda incluem entrega, endereço, taxa, quantidades e retirada no balcão. A tela muda rótulos, mas continua usando estados de pedido.
3. **Notificações de etapa:** `/api/orders/:id/status` envia apenas WhatsApp, excluindo contatos ig_. A detecção de alimentação usa trechos do nome do segmento e pode tratar o identificador VEHICLES como alimentação. Precisa de roteamento pelo canal de origem e textos comerciais próprios.
4. **Financiamento e disponibilidade:** não há operação dedicada de consulta a financeira, aprovação, avaliação de troca, reserva concorrente de uma unidade ou agenda confirmada de visita/test-drive. As proteções locais mais específicas de estoque/agendamento são voltadas ao segmento AUTOMOTIVE_PARTS. Não apresentar estimativas como condições aprovadas.
5. **Ficha de estoque:** a vitrine extrai ano, quilometragem, transmissão e motor do texto. Para recomendação confiável, padronizar campos estruturados e situações disponível/reservado/vendido/indisponível.
6. **Site → CRM:** o formulário atual abre wa.me; não cria sozinho um lead persistido antes de a pessoa enviar a mensagem. O abandono desse passo não vira oportunidade registrada.
7. **Continuidade:** o VEHICLES usa histórico e memória genérica de produtos/pagamento/endereço. Falta estado comercial próprio para busca, alternativas apresentadas, veículo principal, veículo de troca e visita. Instagram e WhatsApp permanecem identidades distintas sem vinculação comprovada.
8. **Promessas na vitrine:** textos fixos de garantia/procedência, financiamento em até 60x e avaliação de troca precisam refletir condições cadastradas pela loja, em vez de pressupostos do template.
9. **Testes:** os testes compartilhados verificam canais, inbox, mídias e aquisição por segmento. Não há cobertura completa das jornadas específicas de uma revenda.

## Fluxo alvo para o primeiro piloto

Entrada por site, Direct, WhatsApp ou comentário → oportunidade criada → veículo/faixa de interesse → opções reais de estoque → troca/pagamento como interesse comercial → visita solicitada → confirmação real da equipe/agenda → negociação → vendido ou perdido com motivo.

Registrar a origem e o histórico sem duplicar oportunidades em cada mensagem. Manter o interesse do cliente separado de um carro de troca ou de um amigo. Uma intenção de visita não equivale a visita agendada; uma proposta não reserva o veículo e não representa crédito aprovado.

## Ordem de implantação

1. Oportunidade e funil próprios de revendas, reaproveitando a caixa de entrada e as conexões existentes.
2. Estoque estruturado, recuperação do contexto comercial e ferramentas específicas para a IA.
3. Visitas/propostas com validação, notificações no canal correto e condições configuráveis por loja.
4. Captura do formulário do site com consentimento e encaminhamento para atendimento.
5. Homologação com conta de teste autorizada nos dois canais: texto, áudio, mídias, comentário, alternativas, troca, financiamento, ausência de dados, veículo vendido, pausa humana e retomada.

Critério de liberação: executar essas jornadas de ponta a ponta e verificar oportunidade/etapa, mensagens recebidas, mídia entregue, ausência de afirmações sem fonte e isolamento por loja. Testes unitários compartilhados, isoladamente, não comprovam isso.
