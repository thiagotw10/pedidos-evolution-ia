# Continuidade da publicação na conversa do Instagram

A captação preserva legenda (até 2200 caracteres), comentário original, campanha, objetivo, link e produto de referência. A DM de veículos recebe esse contexto em cada geração, independentemente dos últimos 16 turnos. O contexto só é usado quando a conta de origem corresponde à conexão atual. Não associa um histórico de outra conta reconectada.

Publicações sem vínculo manual podem ser associadas a um veículo por correspondência textual única no catálogo. Correspondências ambíguas permanecem explícitas e não elegem um carro arbitrariamente. O primeiro Direct pode mencionar o produto identificado. Produto removido fica marcado como removido; veículos reservados, vendidos ou indisponíveis não são apresentados como disponíveis. Cadastro atual de preço e estoque prevalece sobre a legenda, que pode estar desatualizada.

A referência ao anúncio não obriga a conversa a permanecer naquele veículo: nomes citados no turno atual e mudanças do histórico continuam prevalecendo. O envio de mídia usa o assunto e a intenção do turno: uma pergunta de preço não vira envio automático de fotos. Anexos só são preparados quando solicitados ou aceitos no contexto apropriado.

O CRM mostra “Anúncio de origem” como detalhe recolhido da conversa, com comentário e link quando disponíveis. O campo apresenta a origem histórica, não uma comprovação atual de preço.

Esta implementação trata contexto textual; não analisa automaticamente fotos nem assiste ao vídeo do post. A IA recebe explicitamente essa limitação para não inventar observações visuais.

Validação: 289 testes passaram. Gemini real, em base isolada, identificou o HB20 sem repetir o nome do carro na pergunta, usou o preço atual de R$ 55.000 em vez dos R$ 40.000 da legenda histórica e preparou três fotos somente no pedido posterior. Nenhuma mensagem de teste foi enviada a clientes e nenhum cadastro real foi modificado.
