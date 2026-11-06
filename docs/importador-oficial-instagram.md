# Importação oficial do Instagram para catálogo

Disponível pelo botão Importar Instagram nos catálogos de Veículos e Performance/Escapamentos. Usa a conta profissional conectada e sua autorização existente; não consulta a página pública nem exige colar links de perfis terceiros. O importador antigo por link foi preservado como alternativa separada.

Fluxo: listar posts próprios e Reels com paginação, abrir publicação, selecionar fotos e até um vídeo, revisar título/categoria/descrição e confirmar. Capas de Reels podem ser importadas como foto. As sugestões da IA usam somente a legenda e ficam editáveis. A publicação original não é alterada.

A confirmação copia as mídias selecionadas para o Storage da conta e cria um produto novo. Não sobrescreve produtos existentes. Detecta duplicatas por conta/publicação e por shortcode do importador antigo. Se um arquivo falhar, não cria cadastro parcial. Confirmação de conta é refeita antes de salvar. Concorrência é protegida por lease e criação atômica de ID determinístico.

Veículos: preço e disponibilidade definidos na revisão; indisponível por padrão até o usuário marcar a oferta. Performance: referência de projeto, preço zero para orçamento posterior, sem inferir compatibilidade ou estoque de peças. Nenhuma importação publica post, ativa captação ou manda mensagem.

Limites: até 20 arquivos selecionados, no máximo um vídeo; fotos JPEG/PNG/WebP de até 8 MB cada; vídeo MP4/MOV de até 40 MB. URLs só são aceitas a partir da leitura autenticada da API e em CDNs Meta autorizadas. Seleção expira em 15 minutos. Credenciais não vão para o navegador. Cache privado fica em automotiveOperations, excluído de acesso genérico pelo Firestore.

Validação: 301 testes passaram, incluindo autenticação, mídia de outra conta, troca de conta durante cópia, concorrência, duplicação legada, falha parcial e preservação dos nichos. A consulta real à API oficial da conta de testes listou publicações e acessou um Reel. Nenhum produto aleatório foi importado durante essa validação.

Conferência final: o fluxo real de listagem e prévia retornou quatro publicações da conexão de testes, com duas mídias na prévia de um Reel (vídeo e capa). Uma importação foi simulada em memória com a mesma rota, sem escrita real no banco ou Storage. No navegador, a sessão estava na conta de performance ben101000@hotmail.com, sem Instagram conectado; o novo modal mostrou corretamente a instrução de conexão, sem modificar seu catálogo.
