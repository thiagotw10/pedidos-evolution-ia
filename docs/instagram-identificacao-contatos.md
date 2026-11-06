# Identificação de contatos Instagram

A identificação é obtida pelo User Profile API oficial, usando o ID do remetente e o token da conta conectada à própria loja. Nome de perfil e username ficam em campos separados. Nomes personalizados já cadastrados são preservados.

O processamento de DM atualiza o perfil antes da geração da resposta, inclusive quando o atendimento está com humano. O cache é de 24 horas para perfis com username e uma hora para resultados indisponíveis. Uma falha de consulta não impede o atendimento. A gravação revalida o vínculo da conta em transação.

A caixa de entrada exibe e permite pesquisar o username. Os cabeçalhos de conversas de performance e veículos mostram identificação e link para o perfil. A lista solicita uma atualização limitada dos contatos antigos ao abrir. O endpoint exige Firebase Auth e igualdade do proprietário com o estabelecimento.

Validação: build de frontend/functions, TypeScript e 119 testes de identificação, Instagram, captação e inbox passaram. Em 04/11/2026 foram recuperados 17 perfis de contatos existentes da Flow Garage; um perfil não retornou identificação. Não foram enviadas mensagens.
