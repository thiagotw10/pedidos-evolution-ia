# Fluxo de IA — Performance & Escapamentos

## Mudanças

- Plano por mensagem: identifica orçamento, mídia, exploração, dados da empresa, dúvida técnica, pedido de pessoa e agendamento. Pedidos comerciais/técnicos misturados com mídia vão ao atendimento gerativo para não descartar parte da pergunta. Fotos e catálogo simples usam busca baseada em registros nos dois canais.
- O plano orienta a responder primeiro, fazer uma pergunta útil por vez, aproveitar campos conhecidos, evitar elogios automáticos e não confirmar agenda/encaminhamento sem evidência. Reconhecimento é por regras e não cobre toda formulação possível; o modelo continua responsável pela conversa livre.
- `automotiveProfiles` + `activeAutomotiveProfile` em customers e chats preservam o contexto anterior em `legacy`, sem migração destrutiva. Outro carro tem contexto/projeto próprio; retorno explícito ao modelo/ano recupera o projeto. Correção explícita de ano atualiza o projeto em vez de gerar outro.
- Mensagens novas registram `automotiveProfileId`. A geração recebe até 15 mensagens do perfil ativo dentre as últimas 60; mensagens antigas sem marcação pertencem ao perfil legado. Respostas humanas novas também recebem a marcação. O histórico completo continua no espelho da conversa; o histórico anterior à implantação não pode ser reclassificado com certeza.
- Projetos novos têm ID determinístico por loja, canal, contato e perfil; perfis adicionais não usam fallback de busca por telefone para substituir outro projeto. A abertura da conversa na caixa de entrada prioriza a ficha do projeto ativo.
- A exploração de uma referência de outro modelo não muda o carro do contato. Desejo de instalar downpipe/remap não é interpretado como preparação já instalada. Anos inválidos como `991` não são tratados como ano do carro.
- Catálogo permite ficha estruturada `automotiveSpecs`: marca, modelo, geração/chassi, motor, ano inicial/final, material, configuração, situação e revisão pela equipe. Validação dos campos ocorre nos servidores local e publicado. Não há preenchimento automático de informações desconhecidas.
- Busca suporta vocabulário das fichas além dos modelos conhecidos. Geração, motor e marca estruturados têm precedência sobre descrições antigas conflitantes; intervalos de ano são respeitados quando registrados. Referência semelhante/revisada não é confirmação de aplicação no veículo do cliente.
- Seleção e mídias já vistas ficam em `automotiveCatalogs/{perfil}` (mapa no documento do contato), com leitura da antiga memória Instagram apenas no perfil legado.

## Operação

Em **Projetos & Referências → Editar → Ficha técnica da referência**, cadastrar somente dados reais de cada projeto. O catálogo antigo permanece utilizável pelo nome/descrição. Melhor precisão depende do preenchimento/revisão das fichas pela oficina.

As memórias continuam separadas entre Instagram e WhatsApp: não foi implementada identificação comum entre canais. A separação por carro atua dentro de cada contato/canal e loja.

## Validação

`npm --prefix functions run build`

`node --test functions/test/*.cjs`

`npx tsc --noEmit`

`npm run build`

Cenários incluem dois carros para o mesmo contato nos dois canais, retomada do primeiro projeto, exploração de Porsche sem alterar o carro ativo, alteração de geração, correção de ano, preparação desejada vs. instalada, referências com título genérico, informações técnicas conflitantes, recorte por ano e ficha ativa da caixa de entrada. O harness legado de teste das solicitações públicas passou a escolher a rota específica, em vez de sobrescrevê-la a cada rota POST registrada.

Não são enviados posts ou mensagens a clientes nos testes automatizados. Não há promessa de preço, estoque, agenda, potência, prazo ou garantia sem dados aprovados.
