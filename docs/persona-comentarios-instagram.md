# Persona pública e captação no Instagram

O recurso é configurado por conta em Instagram > Captação, com os controles “Persona descolada nos comentários”, “Responder também no comentário” e “Incluir novas publicações automaticamente”. O último inclui posts criados nativamente no Instagram sem cadastrar cada publicação. Exclusões por post são preservadas. O recurso de persona é opt-in e não ativa contas globalmente. Automações antigas de Reels de afiliados mantêm suas próprias regras.

Elogios/reação positiva: resposta pública contextual curta, com humor leve, sem DM, sem criar chat, lead ou janela de atendimento. Spam/recusa: ignorado. Reclamação: sinalizada na atividade para revisão humana, sem piada e sem abordagem automática. Interesse comercial: continua no gerador comercial existente; a confirmação pública só sai depois de uma DM confirmada, com variações informais quando a persona está ativa. Resposta pública personalizada de campanha continua tendo prioridade após a DM.

A persona pública não é adicionada ao prompt do Direct. Preço, estoque, compatibilidade, reservas e fechamento continuam seguindo o atendimento e as informações reais de cada nicho. Não há promessa de desconto ou venda em resposta a mero elogio.

Segurança e entrega: permissões reais de comentários, horário configurado, atendimento humano, conta conectada e exclusões continuam sendo verificados. Limite público por hora usa a mesma quantidade configurada de novos contatos, mas contador separado. Status public_sending/public_sent/public_delivery_unknown são terminais para evitar repetição após envio ambíguo. A atividade mostra comentários respondidos e respostas públicas, separadamente de Directs. Nenhuma publicação retroativa ou resposta a comentários antigos é disparada pela implantação.

Validação: 283 testes passaram (backend, regressões dos nichos e campo de preço). Casos novos verificam elogio sem DM/CRM/janela, resposta idempotente, pausa durante geração, reclamação, entrega ambígua e preservação do texto de venda no Direct. Cinco exemplos passaram com Gemini real em ambiente isolado, sem mensagens reais ou escrita no banco.
