# Origem e regiões dos leads do Instagram

A central Instagram oferece a aba **Origem dos leads**, acessível também pelo resumo da página inicial. Mostra um contato por conta conectada, primeira origem identificada, publicação, etapa atual do CRM e região informada. Filtros por período de entrada, publicação, etapa, país, estado e busca. Atualização a cada 30 segundos com a página visível; a edição de região suspende essa atualização.

## Integridade dos dados

A região pode vir de uma declaração explícita no atendimento, de município/UF retornados pelo CEP após confirmação do cliente ou de confirmação manual na plataforma. Cidades ambíguas permanecem desconhecidas. Não usamos IP, DDD, idioma ou localização do post para localizar pessoas. Não armazenamos nem mostramos coordenadas residenciais: os pontos representam municípios, estados ou países. No exterior, a cidade pode ser informada, mas o ponto é aproximado por país.

Os registros anteriores sem data inicial permanecem sem data conhecida e só entram em todo o histórico. As métricas de alcance e visualizações pertencem ao post completo, não às regiões. Fechamento corresponde à etapa do CRM e não comprova pagamento. Comentários com interesse comercial são considerados mesmo quando o primeiro envio de DM falha; comentários ignorados não viram leads. Uma declaração de post patrocinado não comprova atribuição a um clique pago.

O painel consulta até 1.000 conversas, 2.000 projetos e 1.000 eventos comerciais por conta, sinalizando amostra limitada. Dados e operações exigem autenticação do proprietário. A troca de conta conectada não mistura os contatos históricos de outra conta. A API não consulta a Meta a cada atualização, usando os snapshots existentes das métricas.

## Bases geográficas

- Municípios e estados: [municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros), licença MIT copiada em `public/maps/municipios-LICENSE.txt`. Snapshot de 1/11/2026, 5.571 municípios e 27 UFs. SHA256 CSV municípios: `22bd03d004361329f69ddfa3f6c99cd53012aa53972a172e10b141288ad0b1fe`; estados: `395c7b797b85592d71c686a0b537ba05349dee36c19b26a4b0d89494ff71448a`.
- Países: [Natural Earth, escala 1:110m](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), domínio público. Snapshot de 1/11/2026, SHA256 `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f`. A base simplificada contém 174 países/territórios com código utilizável; alguns microestados não constam. O seletor e a resolução internacional se limitam a essa cobertura.

Os polígonos são servidos localmente, sem tiles externos ou permissão de geolocalização do navegador. Coordenadas enviadas pelo cliente da API são ignoradas e resolvidas novamente no servidor pela base canônica.

## Validação

Testes automatizados cobrem isolamento de conta e proprietário, origem comercial, deduplicação, dados privados excluídos do DTO, CEP não confirmado, municípios ambíguos, atualização concorrente e confirmação manual. Revisão visual em desktop e celulares de 390 e 320 px com dados de teste locais; nenhum contato real é criado ou alterado nessa revisão.
