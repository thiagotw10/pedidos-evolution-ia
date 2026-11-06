# Preenchimento de veículos por fotos

Exclusivo para VEHICLES no formulário de novo veículo e edição. Após enviar fotos, o botão “Analisar fotos com IA” consulta Gemini 2.5 Flash e apresenta sugestões com foto de origem, evidência e identificação de hipótese visual. O usuário escolhe o que aplicar ao formulário. Campos existentes, preço e situação de estoque não são sobrescritos; nenhum produto é salvo automaticamente.

Limites: até seis fotos (capa e primeiras da galeria), JPEG/PNG/WebP de até 8 MB cada e 24 MB no total. O endpoint exige Firebase ID token, deriva a conta do token e valida que as imagens pertencem ao diretório de produtos dessa conta no Storage. Intervalo mínimo de um minuto entre análises. Não permite URLs arbitrárias nem acesso a imagens de outra conta.

Ano, quilometragem, combustível, câmbio e motor exigem inscrição legível com transcrição literal correspondente; inferências mesmo marcadas como observadas são descartadas. Valores apenas estimados nesses campos são descartados. Marca/modelo/versão podem aparecer como hipótese para revisão. Não extrai placas, documentos ou dados pessoais. Descrição limitada ao visível. A análise não substitui inspeção técnica nem comprova histórico do veículo.

Testes: 274 testes passaram. Gemini real identificou, em seis fotos do veículo de teste, título, categoria, descrição, marca, modelo e cor, mantendo os demais campos vazios. Nenhum cadastro foi alterado durante esse teste.
